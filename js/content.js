"use strict";

/**
 * NGW4B - Bing NG Word Blocker
 * コード構造の整理、ツールチップ修正、ニュース検索対応、画像検索レイアウト修正、最適化
 */

const NGW4B = {
  // -------------------------------------------------------------------------
  // 状態管理
  // -------------------------------------------------------------------------
  state: {
    ngList: [],
    isEnabled: true, // Global Toggle (Popup)
    isEnabledSite: true, // Site specific toggle (Options)
    siteType: "bing", // 'bing' | 'google'
    hiddenCount: 0,
    observer: null,
    debounceTimer: null,
  },

  // -------------------------------------------------------------------------
  // 初期化
  // -------------------------------------------------------------------------
  init: function () {
    // 設定の読み込み
    this.loadSettings(() => {
      // 初回フィルタリング
      if (this.state.isEnabled) {
        this.runFilter();
      }
      // UIの初期化
      NGW4B_UI.init();
    });

    // ストレージ変更監視
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "sync") {
        if (changes.ngw4b_status) {
          this.state.isEnabled = changes.ngw4b_status.newValue;
          if (this.state.isEnabled) {
            // 有効時: revealモードを解除し、フィルタを実行
            document.body.classList.remove("ngw4b_revealed");
            this.runFilter();
          } else {
            // 無効時: revealモードにしてフィルタ済み要素を一時表示
            if (this.state.debounceTimer)
              clearTimeout(this.state.debounceTimer);
            document.body.classList.add("ngw4b_revealed");
          }
        }
        if (changes.ngw4b_nglist) {
          this.state.ngList = this.parseNGList(changes.ngw4b_nglist.newValue);
          if (this.state.isEnabled) {
            this.runFilter();
          }
        }
      }
    });

    // メッセージリスナー (コンテキストメニュー & ポップアップからの問い合わせ)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "executeFunction") {
        NGW4B_UI.showContextMenu(request.selectionText);
        sendResponse({ status: "success" });
      } else if (request.action === "getBlockCount") {
        // ポップアップからのブロック件数問い合わせ
        sendResponse({ count: this.state.hiddenCount });
      }
      return true;
    });

    // MutationObserverによる監視 (パフォーマンス最適化: デバウンス付き)
    this.state.observer = new MutationObserver((mutations) => {
      if (!this.state.isEnabled) return;

      // 無駄な実行を防ぐための簡易チェック
      let shouldRun = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldRun = true;
          break;
        }
      }

      if (shouldRun) {
        if (this.state.debounceTimer) clearTimeout(this.state.debounceTimer);
        this.state.debounceTimer = setTimeout(() => {
          this.runFilter();
        }, 300); // 300msの遅延実行
      }
    });

    // 監視対象の要素特定
    const target = document.body;
    if (target) {
      this.state.observer.observe(target, { childList: true, subtree: true });
    }
  },

  loadSettings: function (callback) {
    // サイト判定
    const host = window.location.hostname;
    if (host.includes("google")) {
      this.state.siteType = "google";
    } else {
      this.state.siteType = "bing";
    }

    chrome.storage.sync.get(
      [
        "ngw4b_status",
        "ngw4b_nglist",
        "enabled_bing",
        "enabled_google",
        "bing_main",
        "bing_video",
        "bing_image",
        "bing_shop",
        "bing_news",
        "google_main",
        "google_video",
        "google_image",
        "google_shop",
        "google_news",
        "google_shorts",
      ],
      (items) => {
        // Global Status
        if (items.ngw4b_status === undefined) {
          this.state.isEnabled = true;
          chrome.storage.sync.set({ ngw4b_status: true });
        } else {
          this.state.isEnabled = items.ngw4b_status;
        }

        // Site Specific Status
        if (this.state.siteType === "bing") {
          this.state.isEnabledSite = items.enabled_bing !== false; // default true
        } else {
          this.state.isEnabledSite = items.enabled_google !== false; // default true
        }

        // Sub-options status
        this.state.bing_main = items.bing_main !== false;
        this.state.bing_video = items.bing_video !== false;
        this.state.bing_image = items.bing_image !== false;
        this.state.bing_shop = items.bing_shop !== false;
        this.state.bing_news = items.bing_news !== false;
        this.state.google_main = items.google_main !== false;
        this.state.google_video = items.google_video !== false;
        this.state.google_image = items.google_image !== false;
        this.state.google_shop = items.google_shop !== false;
        this.state.google_shop = items.google_shop !== false;
        this.state.google_news = items.google_news !== false;
        this.state.google_shorts = items.google_shorts !== false;

        if (items.ngw4b_nglist) {
          this.state.ngList = this.parseNGList(items.ngw4b_nglist);
        }

        if (callback) callback();
      }
    );
  },

  // -------------------------------------------------------------------------
  // フィルタリングロジック
  // -------------------------------------------------------------------------
  parseNGList: function (rawList) {
    if (!rawList) return [];
    return rawList.split(/\n/).filter((line) => line.trim() !== "");
  },

  runFilter: function () {
    if (!this.state.isEnabled) return;
    if (!this.state.isEnabledSite) return; // サイト別無効化チェック
    if (!this.state.ngList || this.state.ngList.length === 0) return;

    this.state.ngList.forEach((wordLine) => {
      this.processWord(wordLine);
    });

    // カウント更新
    this.state.hiddenCount = document.querySelectorAll(".ngw4b_hidden").length;

    // バックグラウンドにブロック件数を通知（アイコンバッジ更新用）
    try {
      if (chrome.runtime?.id) {
        chrome.runtime.sendMessage(
          {
            action: "updateBadge",
            count: this.state.hiddenCount,
          },
          () => {
            // エラーがあっても無視（コンテキスト無効化時など）
            if (chrome.runtime.lastError) {
            }
          }
        );
      }
    } catch (e) {
      // 拡張機能が無効化/更新された場合の対策
      // console.log("Extension context invalidated");
    }

    // 画像検索のレイアウト修正 (ウィンドウリサイズイベントを発火させて再計算を促す)
    // 動画検索もグリッドレイアウトの場合があるため追加
    if (
      window.location.href.includes("/images/") ||
      window.location.href.includes("/videos/")
    ) {
      window.dispatchEvent(new Event("resize"));
    }
  },

  processWord: function (wordLine) {
    let word = wordLine;
    const optMatch = word.match(/\[[a-z,]*\]$/);

    // オプション解析
    let isRegex = false;
    let optNoTitle = false;
    let optNoSite = false;
    let optNoDesc = false;

    if (optMatch !== null) {
      const opts = optMatch[0]
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim());
      if (opts.includes("regex")) isRegex = true;
      if (opts.includes("notitle")) optNoTitle = true;
      if (opts.includes("nosite")) optNoSite = true;
      if (opts.includes("nodesc")) optNoDesc = true;
      word = word.replace(/\[[a-z,]*\]$/, "");
    }

    const options = {
      noTitle: optNoTitle,
      noSite: optNoSite,
      noDesc: optNoDesc,
    };
    const currentURL = window.location.href;

    const pattern_img = /^https:\/\/www\.bing\.com\/images\//;
    const pattern_news = /^https:\/\/www\.bing\.com\/news\//;
    const pattern_video = /^https:\/\/www\.bing\.com\/videos\//;
    const pattern_shop = /^https:\/\/www\.bing\.com\/shop\?/;

    // ページタイプ別処理
    if (this.state.siteType === "bing") {
      if (pattern_img.test(currentURL)) {
        if (!this.state.bing_image) return;
        NGW4B_Blocker.blockImages(word, isRegex, wordLine);
      } else if (pattern_news.test(currentURL)) {
        if (!this.state.bing_news) return;
        NGW4B_Blocker.blockNews(word, isRegex, options, wordLine);
      } else if (pattern_video.test(currentURL)) {
        if (!this.state.bing_video) return;
        NGW4B_Blocker.blockVideos(word, isRegex, options, wordLine);
      } else if (pattern_shop.test(currentURL)) {
        if (!this.state.bing_shop) return;
        NGW4B_Blocker.blockShop(word, isRegex, wordLine);
      } else {
        if (!this.state.bing_main) return;
        NGW4B_Blocker.blockMain(word, isRegex, options, wordLine);
        NGW4B_Blocker.cleanupMain();
      }
    } else {
      // Google Logic
      const isVideoSearch =
        currentURL.includes("tbm=vid") || currentURL.includes("udm=7");
      const isNewsSearch =
        currentURL.includes("tbm=nws") || currentURL.includes("udm=4");
      const isImageSearch =
        currentURL.includes("tbm=isch") || currentURL.includes("udm=2");

      if (isVideoSearch) {
        if (!this.state.google_video) return;
      } else if (isNewsSearch) {
        if (!this.state.google_news) return;
      }

      NGW4B_Blocker.blockGoogle(word, isRegex, options, wordLine);
    }
  },
};

// -------------------------------------------------------------------------
// UI管理 (トグルバー、ツールチップ、コンテキストメニュー)
// -------------------------------------------------------------------------
const NGW4B_UI = {
  tooltipElem: null,
  currentTarget: null,

  init: function () {
    this.injectStyles();
    this.createTooltip();
  },

  injectStyles: function () {
    if (document.getElementById("ngw4b_style_main")) return;
    const style = document.createElement("style");
    style.id = "ngw4b_style_main";
    // 視認性向上のためのCSS修正 (outline, box-shadow)
    style.textContent = `
      body:not(.ngw4b_revealed) .ngw4b_hidden {
        display: none !important;
      }
      .ngw4b_revealed .ngw4b_hidden {
        opacity: 0.8 !important; /* 視認性向上 */
        position: relative;
        cursor: help;
        min-height: 20px;
      }
      /* 枠線と背景色を::afterで実装して前面に表示 */
      /* ただし、子孫に.ngw4b_hiddenがある場合は表示しない（巻き込み防止） */
      .ngw4b_revealed .ngw4b_hidden::after {
        content: "";
        position: absolute;
        inset: 0; /* top/left/right/bottom: 0 */
        border: 2px dashed #ff0000;
        background-color: rgba(255, 0, 0, 0.05);
        z-index: 2147483640;
        pointer-events: none;
      }
      /* 子孫に.ngw4b_hiddenがある要素は枠線を非表示 */
      .ngw4b_revealed .ngw4b_hidden:has(.ngw4b_hidden)::after {
        display: none;
      }
      /* ラベル */
      .ngw4b_revealed .ngw4b_hidden::before {
        content: "${chrome.i18n.getMessage("ToggleBar_Filtered")}";
        position: absolute;
        top: 0;
        left: 0;
        background: #ff0000;
        color: white;
        font-size: 10px;
        padding: 2px 4px;
        z-index: 2147483641; /* 枠線より上に */
        pointer-events: none;
      }
      /* 子孫に.ngw4b_hiddenがある要素はラベルも非表示 */
      .ngw4b_revealed .ngw4b_hidden:has(.ngw4b_hidden)::before {
        display: none;
      }

      /* Tooltip */
      #ngw4b_tooltip {
        position: absolute; /* ドキュメントに対する絶対配置 */
        background: #333;
        color: #fff;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 2147483647;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        pointer-events: auto;
        display: none;
        max-width: 300px;
        line-height: 1.4;
      }
      #ngw4b_tooltip .ngw4b_word {
        font-weight: bold;
        color: #ff9999;
        margin-bottom: 5px;
        display: block;
        word-break: break-all;
      }
      #ngw4b_tooltip .ngw4b_btn_area {
        text-align: right;
        margin-top: 5px;
      }
      #ngw4b_tooltip button {
        background: #d9534f;
        border: none;
        color: white;
        padding: 4px 10px;
        border-radius: 2px;
        cursor: pointer;
        font-size: 11px;
      }
      #ngw4b_tooltip button:hover {
        background: #c9302c;
      }
    `;
    document.head.appendChild(style);
  },

  createTooltip: function () {
    if (this.tooltipElem) return;
    this.tooltipElem = document.createElement("div");
    this.tooltipElem.id = "ngw4b_tooltip";
    document.body.appendChild(this.tooltipElem);

    // マウスオーバー監視
    document.addEventListener("mouseover", (e) => {
      if (!document.body.classList.contains("ngw4b_revealed")) return;
      const target = e.target.closest(".ngw4b_hidden");
      if (target) {
        const word = target.getAttribute("data-ngw4b-word");
        if (word) {
          this.showTooltip(e, word, target);
        }
      }
    });

    // マウスアウト監視
    document.addEventListener("mouseout", (e) => {
      const related = e.relatedTarget;
      // ツールチップへ移動、またはツールチップ内での移動、またはターゲット内での移動は無視
      if (
        related &&
        (related.closest("#ngw4b_tooltip") || related.closest(".ngw4b_hidden"))
      )
        return;
      this.hideTooltip();
    });

    // ツールチップ自体からの離脱
    this.tooltipElem.addEventListener("mouseleave", () => {
      this.hideTooltip();
    });
  },

  showTooltip: function (e, wordStr, targetElem) {
    if (!chrome.runtime?.id) return;
    this.currentTarget = targetElem;

    try {
      const words = wordStr.split(",").filter((w) => w);

      const renderInitial = () => {
        const deleteBtnText =
          chrome.i18n.getMessage("Tooltip_Delete") || "Delete";
        const wordDisplay = words.map((w) => this.escapeHtml(w)).join(", ");

        this.tooltipElem.textContent = "";

        const spanWord = document.createElement("span");
        spanWord.className = "ngw4b_word";
        spanWord.textContent = "NG: " + words.join(", ");
        this.tooltipElem.appendChild(spanWord);

        const divBtnArea = document.createElement("div");
        divBtnArea.className = "ngw4b_btn_area";

        const btnDelete = document.createElement("button");
        btnDelete.id = "ngw4b_delete_btn";
        btnDelete.textContent = deleteBtnText;
        divBtnArea.appendChild(btnDelete);

        this.tooltipElem.appendChild(divBtnArea);

        const btn = btnDelete;
        btn.onclick = () => {
          if (words.length > 1) {
            renderSelection();
          } else {
            const deleteConfirmText =
              chrome.i18n.getMessage("Tooltip_ConfirmDelete") ||
              "Are you sure you want to delete '%s'?";
            if (confirm(deleteConfirmText.replace("%s", words[0]))) {
              this.deleteNGWord(words[0]);
            }
          }
        };
      };

      const renderSelection = () => {
        const cancelText =
          chrome.i18n.getMessage("ContextMenu_PopupWindow_No") || "Cancel";
        this.tooltipElem.textContent = "";

        const divWrapper = document.createElement("div");
        divWrapper.style.display = "flex";
        divWrapper.style.flexDirection = "column";
        divWrapper.style.gap = "5px";
        divWrapper.style.marginBottom = "5px";

        words.forEach((w) => {
          const btnDel = document.createElement("button");
          btnDel.className = "ngw4b_del_item";
          btnDel.setAttribute("data-word", w);
          btnDel.style.textAlign = "left";
          btnDel.style.background = "#555";
          btnDel.style.border = "1px solid #777";
          btnDel.textContent = `${deleteLabel}: ${w}`;
          divWrapper.appendChild(btnDel);
        });

        this.tooltipElem.appendChild(divWrapper);

        const divBtnArea = document.createElement("div");
        divBtnArea.className = "ngw4b_btn_area";
        const btnCancel = document.createElement("button");
        btnCancel.id = "ngw4b_cancel_btn";
        btnCancel.textContent = cancelText;
        divBtnArea.appendChild(btnCancel);
        this.tooltipElem.appendChild(divBtnArea);

        this.tooltipElem.querySelectorAll(".ngw4b_del_item").forEach((b) => {
          b.onclick = (evt) => {
            const w = evt.target.getAttribute("data-word");
            const deleteConfirmText =
              chrome.i18n.getMessage("Tooltip_ConfirmDelete") ||
              "Are you sure you want to delete '%s'?";
            if (confirm(deleteConfirmText.replace("%s", w))) {
              this.deleteNGWord(w);
            }
          };
        });
        this.tooltipElem.querySelector("#ngw4b_cancel_btn").onclick = () => {
          renderInitial();
        };
      };

      renderInitial();
      this.tooltipElem.style.display = "block";

      // 位置計算
      let rect = targetElem.getBoundingClientRect();

      // rectが0x0の場合（display: contentsなど）、子要素から包含矩形を計算する
      if (rect.width === 0 && rect.height === 0) {
        let top = Infinity,
          left = Infinity,
          right = -Infinity,
          bottom = -Infinity;
        let found = false;
        // すべての子孫要素をチェックするのはコストがかかるが、カード1つ分なら許容範囲と想定
        const children = targetElem.querySelectorAll("*");
        children.forEach((child) => {
          const r = child.getBoundingClientRect();
          // 視覚的に意味のある要素のみ対象 (サイズがあるもの)
          if (r.width > 0 && r.height > 0) {
            found = true;
            if (r.top < top) top = r.top;
            if (r.left < left) left = r.left;
            if (r.right > right) right = r.right;
            if (r.bottom > bottom) bottom = r.bottom;
          }
        });

        if (found) {
          // 擬似的なClientRectオブジェクトを作成
          rect = {
            top: top,
            left: left,
            right: right,
            bottom: bottom,
            width: right - left,
            height: bottom - top,
          };
        }
      }

      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      let x, y;

      // rectが有効かチェック（幅・高さが有効な値であれば要素基準を採用）
      // マウスオーバーが発生している時点で画面内にあるとみなす
      const isValidRect = rect.width > 0 && rect.height > 0;

      if (isValidRect) {
        // 要素基準: ラベルのすぐ下に表示
        // ラベル(top:0, left:0)の高さ分(約20-25px)を空けて表示
        x = rect.left + scrollX + 0;
        y = rect.top + scrollY + 25;
      } else {
        // フォールバック: マウスカーソル基準
        // ただし、一度計算した位置をキャッシュして固定する（再ホバー時に同じ位置）
        const cachedX = targetElem.getAttribute("data-ngw4b-tipx");
        const cachedY = targetElem.getAttribute("data-ngw4b-tipy");

        if (cachedX && cachedY) {
          // キャッシュがあれば再利用（固定）
          x = parseFloat(cachedX);
          y = parseFloat(cachedY);
        } else {
          // 初回は現在のマウス位置を使用してキャッシュ
          x = (e.pageX !== undefined ? e.pageX : e.clientX + scrollX) + 10;
          y = (e.pageY !== undefined ? e.pageY : e.clientY + scrollY) + 10;
          targetElem.setAttribute("data-ngw4b-tipx", x);
          targetElem.setAttribute("data-ngw4b-tipy", y);
        }
      }

      // 右端からはみ出さないように調整
      const tipRect = this.tooltipElem.getBoundingClientRect();
      const docWidth = document.documentElement.clientWidth;

      if (x + tipRect.width > docWidth) {
        x = docWidth - tipRect.width - 10;
      }

      this.tooltipElem.style.left = x + "px";
      this.tooltipElem.style.top = y + "px";
    } catch (e) {
      // 拡張機能コンテキスト無効時のエラーを無視
    }
  },

  hideTooltip: function () {
    if (this.tooltipElem) this.tooltipElem.style.display = "none";
  },

  escapeHtml: function (text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  deleteNGWord: function (wordToDelete) {
    chrome.storage.sync.get("ngw4b_nglist", (items) => {
      if (items.ngw4b_nglist) {
        const list = items.ngw4b_nglist.split(/\n/);
        const newList = list.filter((line) => line.trim() !== wordToDelete);
        chrome.storage.sync.set({ ngw4b_nglist: newList.join("\n") }, () => {
          if (typeof NGW4B !== "undefined" && NGW4B.state) {
            NGW4B.state.ngList = NGW4B.parseNGList(newList.join("\n"));
          }

          const hiddenElems = document.querySelectorAll(".ngw4b_hidden");
          let recountStart = false;

          hiddenElems.forEach((elem) => {
            const attr = elem.getAttribute("data-ngw4b-word") || "";
            let words = attr.split(",").filter((w) => w);

            if (words.includes(wordToDelete)) {
              words = words.filter((w) => w !== wordToDelete);
              if (words.length === 0) {
                elem.classList.remove("ngw4b_hidden");
                elem.removeAttribute("data-ngw4b-word");
                elem.removeAttribute("data-ngw4b-tipx");
                elem.removeAttribute("data-ngw4b-tipy");
              } else {
                elem.setAttribute("data-ngw4b-word", words.join(","));
              }
              recountStart = true;
            }
          });

          if (recountStart && typeof NGW4B !== "undefined") {
            NGW4B.state.hiddenCount =
              document.querySelectorAll(".ngw4b_hidden").length;
            try {
              chrome.runtime.sendMessage(
                { action: "updateBadge", count: NGW4B.state.hiddenCount },
                () => {
                  if (chrome.runtime.lastError) {
                  }
                }
              );
            } catch (e) {}
          }

          // Tooltip update
          if (
            this.tooltipElem &&
            this.tooltipElem.style.display !== "none" &&
            this.currentTarget
          ) {
            const currentAttr =
              this.currentTarget.getAttribute("data-ngw4b-word");
            if (!currentAttr) {
              this.hideTooltip();
            } else {
              // Re-render tooltip with remaining words
              // Pass a dummy event since we don't need position update if already open
              this.showTooltip({}, currentAttr, this.currentTarget);
            }
          } else {
            this.hideTooltip();
          }
        });
      }
    });
  },

  showContextMenu: function (selectionText) {
    // コンテキストメニュー用モーダルの表示 (以前の実装をそのまま利用・整理)
    selectionText = selectionText.trim();

    let modal = document.getElementById("ngw4b_modal");
    if (modal) modal.remove();

    modal = document.createElement("dialog");
    modal.id = "ngw4b_modal";

    const strings = {
      title: chrome.i18n.getMessage("Name"),
      message: chrome.i18n.getMessage("ContextMenu_PopupWindow_Message"),
      add: chrome.i18n.getMessage("ContextMenu_PopupWindow_Yes") || "Add",
      cancel: chrome.i18n.getMessage("ContextMenu_PopupWindow_No") || "Cancel",
      optNoTitle: chrome.i18n.getMessage("Option_NoTitle"),
      optNoSite: chrome.i18n.getMessage("Option_NoSite"),
      optNoDesc: chrome.i18n.getMessage("Option_NoDesc"),
      optRegex: chrome.i18n.getMessage("ContextMenu_PopupWindow_CheckboxRegex"),
    };

    const styleElem = document.createElement("style");
    styleElem.textContent = `
            #ngw4b_modal { border: 1px solid #ccc; border-radius: 8px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); font-family: sans-serif; min-width: 350px; }
            #ngw4b_modal::backdrop { background: rgba(0,0,0,0.5); }
            .ngw4b_modal_content h3 { margin-top: 0; color: #333; }
            #ngw4b_input { width: 100%; padding: 8px; margin: 10px 0; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
            .ngw4b_options { display: flex; flex-direction: column; gap: 5px; margin-bottom: 20px; }
            .ngw4b_options label { font-size: 13px; cursor: pointer; }
            .ngw4b_actions { display: flex; justify-content: flex-end; gap: 10px; }
            .ngw4b_actions button { padding: 6px 12px; border-radius: 4px; border: none; cursor: pointer; }
            #ngw4b_btn_cancel { background: #f0f0f0; color: #333; }
            #ngw4b_btn_add { background: #0078d4; color: white; }
            #ngw4b_btn_add:hover { background: #0063b1; }
    `;

    const contentDiv = document.createElement("div");
    contentDiv.className = "ngw4b_modal_content";

    const h3 = document.createElement("h3");
    h3.textContent = strings.title;
    contentDiv.appendChild(h3);

    const p = document.createElement("p");
    p.textContent = strings.message;
    contentDiv.appendChild(p);

    const input = document.createElement("input");
    input.type = "text";
    input.id = "ngw4b_input";
    input.value = selectionText;
    contentDiv.appendChild(input);

    const optionsDiv = document.createElement("div");
    optionsDiv.className = "ngw4b_options";

    const createCheckbox = (id, labelText, value) => {
      const label = document.createElement("label");
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.id = id;
      chk.value = value;
      label.appendChild(chk);
      label.appendChild(document.createTextNode(" " + labelText));
      return label;
    };

    optionsDiv.appendChild(
      createCheckbox("ngw4b_chk_notitle", strings.optNoTitle, "notitle")
    );
    optionsDiv.appendChild(
      createCheckbox("ngw4b_chk_nosite", strings.optNoSite, "nosite")
    );
    optionsDiv.appendChild(
      createCheckbox("ngw4b_chk_nodesc", strings.optNoDesc, "nodesc")
    );
    optionsDiv.appendChild(
      createCheckbox("ngw4b_chk_regex", strings.optRegex, "regex")
    );
    contentDiv.appendChild(optionsDiv);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "ngw4b_actions";

    const btnCancel = document.createElement("button");
    btnCancel.id = "ngw4b_btn_cancel";
    btnCancel.textContent = strings.cancel;
    actionsDiv.appendChild(btnCancel);

    const btnAdd = document.createElement("button");
    btnAdd.id = "ngw4b_btn_add";
    btnAdd.textContent = strings.add;
    actionsDiv.appendChild(btnAdd);

    contentDiv.appendChild(actionsDiv);

    modal.textContent = "";
    modal.appendChild(styleElem);
    modal.appendChild(contentDiv);

    document.body.appendChild(modal);
    modal.showModal();

    const chks = {
      notitle: modal.querySelector("#ngw4b_chk_notitle"),
      nosite: modal.querySelector("#ngw4b_chk_nosite"),
      nodesc: modal.querySelector("#ngw4b_chk_nodesc"),
      regex: modal.querySelector("#ngw4b_chk_regex"),
    };

    btnCancel.onclick = () => {
      modal.close();
      modal.remove();
    };
    btnAdd.onclick = () => {
      let val = input.value.trim();
      if (!val) return;
      let opts = [];
      if (chks.notitle.checked) opts.push("notitle");
      if (chks.nosite.checked) opts.push("nosite");
      if (chks.nodesc.checked) opts.push("nodesc");
      if (chks.regex.checked) opts.push("regex");
      if (opts.length > 0) val += `[${opts.join(",")}]`;

      chrome.storage.sync.get("ngw4b_nglist", (items) => {
        if (chrome.runtime.lastError) {
          console.error("Storage Get Error:", chrome.runtime.lastError);
          alert("Error loading settings: " + chrome.runtime.lastError.message);
          return;
        }

        let list = items.ngw4b_nglist || "";
        if (list) list += "\n";
        list += val;
        list = [...new Set(list.split("\n"))].join("\n");

        chrome.storage.sync.set({ ngw4b_nglist: list }, () => {
          if (chrome.runtime.lastError) {
            console.error("Storage Set Error:", chrome.runtime.lastError);
            alert("Error saving settings: " + chrome.runtime.lastError.message);
            return;
          }

          // 修正: 拡張機能が無効、またはサイト別設定が無効の場合は即時反映を行わない
          // ただし、除外結果表示中(ngw4b_revealed)の場合は、既存項目へのタグ付けのため反映を試みる
          if (
            (NGW4B.state.isEnabled && NGW4B.state.isEnabledSite) ||
            document.body.classList.contains("ngw4b_revealed")
          ) {
            NGW4B.processWord(val); // 即座に反映
          }
          modal.close();
          modal.remove();
        });
      });
    };
  },
};

// -------------------------------------------------------------------------
// ブロッカーロジック (検索、画像、ニュース、ショッピング)
// -------------------------------------------------------------------------
const NGW4B_Blocker = {
  // 共通: 要素を隠す処理
  hideElement: function (element, originalWord) {
    if (element.closest("header, nav, #gb, #searchform, .appbar")) return;
    if (element.classList.contains("YjPgVd")) return;

    if (!element.classList.contains("ngw4b_hidden")) {
      element.classList.add("ngw4b_hidden");
      element.setAttribute("data-ngw4b-word", originalWord);
    } else {
      const current = element.getAttribute("data-ngw4b-word") || "";
      const words = current.split(",").filter((w) => w);
      if (!words.includes(originalWord)) {
        words.push(originalWord);
        element.setAttribute("data-ngw4b-word", words.join(","));
      }
    }
  },

  blockMain: function (word, isRegex, options, originalWord) {
    const { noTitle, noSite, noDesc } = options;

    if (isRegex) {
      const regexPattern = new RegExp(word, "i");
      // ドキュメント全体ではなく、ターゲット候補のコンテナのみをループする (大幅な高速化)
      const targets = document.querySelectorAll(
        "li.b_algo, li.b_top, div.b_top, div.slide, div.na_card_wrp, div.mmlp, div.dg_u, div.mc_fgvc_u, li.b_ans, div.b_ans"
      );

      targets.forEach((target) => {
        // 既に隠されている要素はスキップ
        if (target.classList.contains("ngw4b_hidden")) return;

        // コンテナ内の評価対象要素を取得 (範囲限定)
        const elems = target.querySelectorAll("h2, p, a, div, span, cite");

        for (const elem of elems) {
          if (this.checkContextMatch(elem, regexPattern, options)) {
            this.hideElement(target, originalWord);
            break; // 1つでもマッチすればこのカードは非表示確定
          }
        }
      });
    } else {
      // XPath構築
      const wordL = word.toLowerCase();
      // XPath 1.0 小文字変換ハック
      const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const lower = "abcdefghijklmnopqrstuvwxyz";
      const translate = `translate(text(), '${upper}', '${lower}')`;
      const contains = `contains(${translate}, '${wordL}')`;

      // 簡易実装: クエリーが複雑になるため、主要なターゲット毎に処理
      // タイトル
      if (!noTitle) {
        this.xpathHide(
          `//li[contains(@class,'b_algo') or contains(@class,'b_top') or contains(@class,'b_ans')]//h2//a[${contains}]`,
          originalWord
        );
        this.xpathHide(
          `//li[contains(@class,'b_algo') or contains(@class,'b_top') or contains(@class,'b_ans')]//h2//a[contains(translate(@aria-label,'${upper}','${lower}'), '${wordL}')]`,
          originalWord
        );
        // div.b_ans内のタイトル (h2の場合が多い)
        this.xpathHide(
          `//div[contains(@class,'b_ans')]//h2[${contains}]`,
          originalWord
        );
      }
      // サイト
      if (!noSite) {
        this.xpathHide(
          `//li[contains(@class,'b_algo') or contains(@class,'b_top') or contains(@class,'b_ans')]//cite[${contains}]`,
          originalWord
        );
        this.xpathHide(
          `//li[contains(@class,'b_algo') or contains(@class,'b_top') or contains(@class,'b_ans')]//div[contains(@class,'b_attribution')][${contains}]`,
          originalWord
        );
        this.xpathHide(
          `//div[contains(@class,'b_ans')]//cite[${contains}]`,
          originalWord
        );
      }
      // 説明
      if (!noDesc) {
        this.xpathHide(
          `//li[contains(@class,'b_algo') or contains(@class,'b_top') or contains(@class,'b_ans')]//div[contains(@class,'b_caption')]//p[${contains}]`,
          originalWord
        );
        this.xpathHide(
          `//li[contains(@class,'b_algo') or contains(@class,'b_top') or contains(@class,'b_ans')]//p[not(contains(@class,'na_t'))][${contains}]`,
          originalWord
        );
        this.xpathHide(
          `//div[contains(@class,'b_ans')]//div[contains(@class,'b_caption')]//p[${contains}]`,
          originalWord
        );
      }
    }
  },

  checkContextMatch: function (elem, regex, options) {
    // テキストマッチチェック
    let textMatch = false;
    // 子テキストノードの確認(直接のテキスト)
    for (const node of elem.childNodes) {
      if (node.nodeType === 3 && regex.test(node.nodeValue)) {
        textMatch = true;
        break;
      }
    }
    // 属性チェック
    if (!textMatch) {
      if (
        elem.getAttribute("data-title") &&
        regex.test(elem.getAttribute("data-title"))
      )
        textMatch = true;
      if (
        elem.getAttribute("data-displayname") &&
        regex.test(elem.getAttribute("data-displayname"))
      )
        textMatch = true;
      if (
        elem.tagName === "A" &&
        elem.getAttribute("aria-label") &&
        regex.test(elem.getAttribute("aria-label"))
      )
        textMatch = true;
    }

    if (!textMatch) return false;

    // 文脈判定 (簡易)
    const tagName = elem.tagName;
    const cl = elem.classList;

    let isTitle = false;
    let isSite = false;
    let isDesc = false;

    if (
      tagName === "H2" ||
      elem.closest("h2") ||
      (tagName === "A" && (elem.closest("h2") || cl.contains("b_title")))
    )
      isTitle = true;
    if (
      tagName === "CITE" ||
      cl.contains("b_attribution") ||
      elem.getAttribute("data-displayname")
    )
      isSite = true;
    if (tagName === "P" || cl.contains("b_caption") || cl.contains("b_snippet"))
      isDesc = true;

    // 未分類の場合はタイトル/説明の両方として扱うか、デフォルトでtrueにするか
    if (!isTitle && !isSite && !isDesc) {
      // aria-labelつきAタグはタイトル扱い
      if (tagName === "A" && elem.getAttribute("aria-label")) isTitle = true;
      // それ以外は説明扱い
      else isDesc = true;
    }

    if (options.noTitle && isTitle) return false;
    if (options.noSite && isSite) return false;
    if (options.noDesc && isDesc) return false;

    return true;
  },

  findTarget: function (elem) {
    // 親コンテナを探す
    // ビデオなどは mmlp, dg_u, slide
    // 通常検索は li.b_algo, li.b_top, div.b_top, div.na_card_wrp, li.b_ans, div.b_ans
    const target = elem.closest(
      "li.b_algo, li.b_top, div.b_top, div.slide, div.na_card_wrp, div.mmlp, div.dg_u, div.mc_fgvc_u, li.b_ans, div.b_ans"
    );
    // if (target && (target.classList.contains("b_ans") || target.closest(".b_ans"))) return null;
    return target;
  },

  xpathHide: function (xpath, originalWord) {
    const res = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    for (let i = 0; i < res.snapshotLength; i++) {
      const node = res.snapshotItem(i);
      const target = this.findTarget(node);
      if (target) this.hideElement(target, originalWord);
    }
  },

  cleanupMain: function () {
    // 空のスライドなどを隠す
    const res = document.evaluate(
      `//div[starts-with(@class,'slide')][not(*)]`,
      document,
      null,
      XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    for (let i = 0; i < res.snapshotLength; i++) {
      this.hideElement(res.snapshotItem(i), "cleaned");
    }
  },

  blockImages: function (word, isRegex, originalWord) {
    // 画像検索は隙間をなくすため li を隠す
    // セレクタ: iframe.richr > ... ではない、通常の検索結果は .isv などのクラスを持つ

    let targets = [];
    if (isRegex) {
      const regex = new RegExp(word, "i");
      document.querySelectorAll("a[aria-label], .iusc").forEach((elem) => {
        const label = elem.getAttribute("aria-label") || elem.getAttribute("m"); // m has meta?
        // iuscは通常メタデータJSONを含むm属性を持つ
        let matched = false;
        if (label && regex.test(label)) matched = true;
        if (matched) {
          const target = elem.closest("li");
          if (target) targets.push(target);
        }
      });
    } else {
      const wordL = word.toLowerCase();
      const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const lower = "abcdefghijklmnopqrstuvwxyz";
      // aria-labelを持つaタグを含むli
      const xpath = `//li[.//a[contains(translate(@aria-label,'${upper}','${lower}'), '${wordL}')]]`;
      const res = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      for (let i = 0; i < res.snapshotLength; i++)
        targets.push(res.snapshotItem(i));
    }

    targets.forEach((t) => this.hideElement(t, originalWord));
  },

  blockNews: function (word, isRegex, options, originalWord) {
    const { noTitle, noSite, noDesc } = options;

    // ニュースは div.news-card がメインだが、垂直検索(news/search)では li.b_algo が使われることもある。
    // 既存のメイン検索ロジックを流用しつつ、ニュース固有のカードも対象にする。

    // regexの場合
    if (isRegex) {
      // まずは汎用的なカード
      const regex = new RegExp(word, "i");
      const candidates = document.querySelectorAll(
        ".news-card, li.b_algo, div.verp, div.news-item"
      );

      candidates.forEach((card) => {
        // 既に隠されている場合はスキップ (重複チェック)
        if (card.classList.contains("ngw4b_hidden")) return;

        let matched = false;
        // Title
        if (!noTitle) {
          const title =
            card.getAttribute("data-title") ||
            card.querySelector("a.title, h2")?.textContent;
          if (title && regex.test(title)) matched = true;
        }
        // Site
        if (!noSite && !matched) {
          const site =
            card.getAttribute("data-author") ||
            card.querySelector(".source, cite, .b_attribution")?.textContent;
          if (site && regex.test(site)) matched = true;
        }
        // Desc
        if (!noDesc && !matched) {
          const desc = card.querySelector(
            ".snippet, .b_caption p, .b_snippet"
          )?.textContent;
          if (desc && regex.test(desc)) matched = true;
        }

        if (matched) this.hideElement(card, originalWord);
      });
    } else {
      // 通常文字列検索
      // NGW4B_Blocker.blockMain を再利用してしまうのが手っ取り早いが、optionsの扱いがここ独自の場合は調整が必要。
      // ここでは blockMain と似たロジックを News 向けに走らせる。

      // とりあえず blockMain を呼んでみる (Mainロジックは強力なので)
      this.blockMain(word, isRegex, options, originalWord);

      // 加えて news-card 専用の簡易チェック (blockMainで漏れる場合のため)
      document.querySelectorAll(".news-card").forEach((card) => {
        if (card.classList.contains("ngw4b_hidden")) return;
        if (card.textContent.toLowerCase().includes(word.toLowerCase())) {
          this.hideElement(card, originalWord);
        }
      });
    }
  },

  blockShop: function (word, isRegex, originalWord) {
    // ショップ検索 (li.br-item)
    if (isRegex) {
      const regex = new RegExp(word, "i");
      document.querySelectorAll("li.br-item").forEach((item) => {
        if (regex.test(item.textContent)) this.hideElement(item, originalWord);
      });
    } else {
      const wordL = word.toLowerCase();
      document.querySelectorAll("li.br-item").forEach((item) => {
        if (item.textContent.toLowerCase().includes(wordL))
          this.hideElement(item, originalWord);
      });
    }
  },

  blockVideos: function (word, isRegex, options, originalWord) {
    const { noTitle, noSite } = options;

    // ユーザー指定のカスタムロジック
    // ターゲット: div.mmlp, div.mc_fgvc_u, div.slide (ユーザー要望の拡張)
    // タイトル: .mc_vtvc_title (title属性)
    // メタ/サイト: .mc_vtvc_meta_row (子孫要素)
    // 要望: "動画タイトルやサイト名・チャンネル名を検査して、引っかかったものはサムネごと消して、スペースを詰めて表示してほしい"

    const candidates = document.querySelectorAll(
      "div.mmlp, div.mc_fgvc_u, div.slide"
    );

    candidates.forEach((card) => {
      if (card.classList.contains("ngw4b_hidden")) return;

      let matched = false;
      const regex = isRegex ? new RegExp(word, "i") : null;
      const wordL = isRegex ? null : word.toLowerCase();

      const check = (text) => {
        if (!text) return false;
        return isRegex ? regex.test(text) : text.toLowerCase().includes(wordL);
      };

      // 1. mc_vtvc_title の title属性
      if (!noTitle) {
        const titleElem = card.querySelector(".mc_vtvc_title");
        if (titleElem) {
          const titleVal = titleElem.getAttribute("title");
          if (check(titleVal)) matched = true;
        }
      }

      // 2. mc_vtvc_meta_row の子孫要素
      if (!noSite && !matched) {
        const metaRow = card.querySelector(".mc_vtvc_meta_row");
        if (metaRow) {
          // テキスト全体、あるいは画像のaltなどを対象にする
          // "子孫要素の属性値やテキスト" とのことなので、textContent + 代表的な属性をチェック
          if (check(metaRow.textContent)) matched = true;
          // 必要であれば属性チェックも追加(img altなど)
        }
      }

      if (matched) {
        this.hideElement(card, originalWord);
      }
    });

    // 既存の汎用ロジック (mmlp以外のレイアウト用 - div.dg_uなど)
    const otherSelector = "div.dg_u:not(.mmlp)";
    document.querySelectorAll(otherSelector).forEach((item) => {
      if (item.classList.contains("ngw4b_hidden")) return;
      // ... (既存ロジック: 簡易実装) ...
      const regex = isRegex ? new RegExp(word, "i") : null;
      const wordL = isRegex ? null : word.toLowerCase();
      const text = item.textContent;
      const check = (val) =>
        isRegex ? regex.test(val) : val.toLowerCase().includes(wordL);

      if (check(text)) this.hideElement(item, originalWord);
    });
  },

  blockGoogle: function (word, isRegex, options, originalWord) {
    // Google用ロジック (メイン/動画/ニュース/画像 統合)
    const { noTitle, noSite, noDesc } = options;
    const currentURL = window.location.href;

    const regex = isRegex ? new RegExp(word, "i") : null;
    const wordL = isRegex ? null : word.toLowerCase();
    const check = (text) =>
      text && (isRegex ? regex.test(text) : text.toLowerCase().includes(wordL));

    // news.google.com 専用処理
    if (currentURL.includes("news.google.com")) {
      this.blockGoogleNews(check, noTitle, noSite, noDesc, originalWord);
      return;
    }

    // ショート動画 (通常検索等に混ざる場合も含むためここで処理)
    if (
      typeof NGW4B !== "undefined" &&
      NGW4B.state &&
      NGW4B.state.google_shorts
    ) {
      this.blockGoogleShorts(check, noTitle, noSite, noDesc, originalWord);
    }

    // 動画検索判定 (&tbm=vid または &udm=7)
    const isVideoSearch =
      currentURL.includes("tbm=vid") || currentURL.includes("udm=7");

    // ニュース検索判定 (&tbm=nws または &udm=4)
    const isNewsSearch =
      currentURL.includes("tbm=nws") || currentURL.includes("udm=4");

    // 画像検索判定 (&tbm=isch または &udm=2)
    const isImageSearch =
      currentURL.includes("tbm=isch") || currentURL.includes("udm=2");

    // ショッピング検索判定 (&tbm=shop または &udm=28)
    const isShopSearch =
      currentURL.includes("tbm=shop") || currentURL.includes("udm=28");

    // 1. メイン検索 & 一般的なカード (div.g)
    // 動画含む (div.MjjYud は div.g をラップすることが多い、div.video-voyager も)
    // ニュース (div.SoaBEf or g-card or div.n0jPhd)

    // ショッピング検索時は専用ロジックに任せ、汎用div.gロジックは誤爆(YjPgVd等のコンテナ非表示)を防ぐためスキップ
    if (NGW4B.state.google_main && !isShopSearch) {
      const candidates = document.querySelectorAll(
        "div.g, div.SoaBEf, g-card, div.n0jPhd, div.MjjYud > div"
      );

      candidates.forEach((card) => {
        if (card.classList.contains("ngw4b_hidden")) return;
        if (card.closest(".ngw4b_hidden")) return; // 親が隠れていればスキップ

        // ニュース系カードの場合は checkCardText を利用して包括的にチェック
        if (card.matches("div.SoaBEf, g-card, div.n0jPhd")) {
          // メイン検索結果に混じるニュース枠は google_news オプションではなく google_main で制御すべきか？
          // ここではユーザーの意図として、メイン検索結果全体を google_main で制御し、
          // ニュース専用タブや専用枠は google_news で制御すると解釈するのが自然。
          // ただし "Top Stories" などは google_news の設定を見るべきかもしれない。
          // 今回の仕様では明確な分離が指示されていないため、div.g の流れで google_main に含める。
          // もし厳密に分けるならここで分岐が必要。
          this.checkCardText(
            card,
            check,
            noTitle,
            noSite,
            noDesc,
            originalWord
          );
          return;
        }

        let matched = false;

        // タイトル (h3)
        if (!noTitle) {
          const title = card.querySelector("h3")?.textContent;
          if (check(title)) matched = true;
        }

        // サイト (cite, .TbwUpd, .VuuXrf)
        if (!noSite && !matched) {
          const site = card.querySelector(
            "cite, .TbwUpd, .VuuXrf"
          )?.textContent;
          if (check(site)) matched = true;
        }

        // 説明 (span.st, .VwiC3b, div[data-sncf])
        if (!noDesc && !matched) {
          const desc = card.querySelector(
            ".VwiC3b, span.st, .yXK7lf"
          )?.textContent;
          if (check(desc)) matched = true;
        }

        if (matched) {
          this.hideElement(card, originalWord);
        }
      });
    }

    // 動画検索の追加セレクタ
    if (isVideoSearch) {
      this.blockGoogleVideos(check, noTitle, noSite, noDesc, originalWord);
    }

    // ニュース検索の追加セレクタ
    if (isNewsSearch) {
      this.blockGoogleNewsTab(check, noTitle, noSite, noDesc, originalWord);
    }

    // 画像検索の追加セレクタ
    if (isImageSearch) {
      if (NGW4B.state.google_image) {
        this.blockGoogleImages(check, noTitle, noSite, noDesc, originalWord);
      }
    }

    // ショッピング検索の追加セレクタ (tbm=shop または udm=28)
    const actualIsShopSearch =
      currentURL.includes("tbm=shop") || currentURL.includes("udm=28");
    if (actualIsShopSearch) {
      if (NGW4B.state.google_shop) {
        this.blockGoogleShopping(check, noTitle, noSite, noDesc, originalWord);
      }
    }
  },

  // Google画像検索用の追加ブロック処理
  blockGoogleImages: function (check, noTitle, noSite, noDesc, originalWord) {
    // ユーザー指定:
    // カード: div[jsname="dTDiAc"]
    // タイトル: div.toI8Rb.OSrXXb
    // サイト名: div.Xxy7Vb 子孫 span

    const candidates = document.querySelectorAll('div[jsname="dTDiAc"]');

    candidates.forEach((card) => {
      if (card.classList.contains("ngw4b_hidden")) return;
      if (card.closest(".ngw4b_hidden")) return;

      let matched = false;

      // タイトル検査
      if (!noTitle) {
        const titleElem = card.querySelector("div.toI8Rb.OSrXXb");
        if (titleElem && check(titleElem.textContent)) {
          matched = true;
        }
      }

      // サイト名検査
      if (!noSite && !matched) {
        // div.Xxy7Vb の子孫 span
        const siteDiv = card.querySelector("div.Xxy7Vb");
        if (siteDiv) {
          const siteSpans = siteDiv.querySelectorAll("span");
          for (const span of siteSpans) {
            if (check(span.textContent)) {
              matched = true;
              break;
            }
          }
        }
      }

      if (matched) {
        this.hideElement(card, originalWord);
      }
    });
  },

  // Googleショッピング用の追加ブロック処理
  blockGoogleShopping: function (check, noTitle, noSite, noDesc, originalWord) {
    // 商品カードの非表示対象:
    // - tbm=shop: div[jsname="dQK82e"], div.Ez5pwe
    // - udm=28: div.wOPJ9c
    // これより上のコンテナは消さない。

    const candidates = document.querySelectorAll(
      'div[jsname="dQK82e"], div.wOPJ9c'
    );

    candidates.forEach((card) => {
      // 既に非表示ならスキップ
      if (card.classList.contains("ngw4b_hidden")) return;
      // 親が非表示ならスキップ（これは本来Ez5pweが最上位なら不要だが念のため）
      if (card.closest(".ngw4b_hidden")) return;

      let matched = false;

      // 1. JK3kIe クラスの div の title 属性をチェック（ユーザー指定）
      if (!noTitle) {
        const jk3kIeElem = card.querySelector("div.JK3kIe");
        if (jk3kIeElem) {
          const titleAttr = jk3kIeElem.getAttribute("title");
          if (titleAttr && check(titleAttr)) matched = true;
        }
      }

      // 2. WJMUdc クラスの span をチェック（ユーザー指定）
      if (!noSite && !matched) {
        const wjmudcElem = card.querySelector("span.WJMUdc");
        if (wjmudcElem && check(wjmudcElem.textContent)) matched = true;
      }

      // 3. accessible text (aria-label) をチェック
      // "Title. 現在の価格: ￥Price. Site." のような形式を想定
      if (!matched) {
        const ariaElem = card.querySelector("div.njFjte, div[aria-label]");
        if (ariaElem) {
          const label = ariaElem.getAttribute("aria-label");
          if (label) {
            const splitKey = "現在の価格";
            let titlePart = label;
            let otherPart = "";

            if (label.includes(splitKey)) {
              const parts = label.split(splitKey);
              titlePart = parts[0];
              otherPart = parts.slice(1).join(splitKey);
            }

            // Title Inspection
            if (!noTitle) {
              if (check(titlePart)) matched = true;
            }

            // Site/Other Inspection
            if (!noSite && !matched) {
              if (check(otherPart)) matched = true;
            }
          }
        }
      }

      // 4. フォールバック: 内部のテキストノードから特定クラスを探す
      if (!matched) {
        // タイトルっぽい要素 (h3, .tAxDx)
        if (!noTitle) {
          const titleElem = card.querySelector("h3, .tAxDx, .C7Lkve");
          if (titleElem && check(titleElem.textContent)) matched = true;
        }
        // サイト名っぽい要素 (a3Hn7, .IuHnof)
        if (!noSite && !matched) {
          const siteElem = card.querySelector(".aULzUe, .IuHnof, .a3Hn7");
          if (siteElem && check(siteElem.textContent)) matched = true;
        }
      }

      if (matched) {
        this.hideElement(card, originalWord);
      }
    });
  },

  // Google動画検索用の追加ブロック処理
  blockGoogleVideos: function (check, noTitle, noSite, noDesc, originalWord) {
    // 動画検索結果のコンテナ: より厳密なセレクタを使用
    // div.g は汎用的すぎるため、動画固有の構造を優先
    const videoCards = document.querySelectorAll(
      "div.g:has(video-voyager), div.g:has([data-vid]), video-voyager, div[data-vid]"
    );

    videoCards.forEach((card) => {
      // 既に非表示の場合はスキップ
      if (card.classList.contains("ngw4b_hidden")) return;
      if (card.closest(".ngw4b_hidden")) return; // 親が隠れていればスキップ
      // ヘッダー/ナビ内はスキップ（二重チェック）
      if (card.closest("header, nav, #gb, #searchform")) return;

      let matched = false;

      // タイトル検査
      if (!noTitle) {
        // h3タグまたはaria-label属性
        const titleElem = card.querySelector("h3");
        if (titleElem && check(titleElem.textContent)) {
          matched = true;
        }
        // aria-labelを持つリンク
        if (!matched) {
          const ariaLink = card.querySelector("a[aria-label]");
          if (ariaLink && check(ariaLink.getAttribute("aria-label"))) {
            matched = true;
          }
        }
        // title属性
        if (!matched) {
          const titleAttr = card.querySelector("[title]");
          if (titleAttr && check(titleAttr.getAttribute("title"))) {
            matched = true;
          }
        }
      }

      // チャンネル名/サイト名検査
      if (!noSite && !matched) {
        // チャンネル名セレクタ（YouTube等）- 拡張版
        const channelSelectors = [
          "cite",
          ".NbKaIc", // YouTubeチャンネル名
          ".TbwUpd",
          ".VuuXrf",
          "span[role='text']",
          "[data-channel-name]",
          ".gqF9Jc", // 追加: 動画検索でのサイト名
          ".fG8Fp", // 追加: 別レイアウト
          "a[ping] cite", // 追加: リンク内のcite
          ".dXiKIc", // 追加: 別パターン
          ".LEwnzc .f4hh3d", // 追加: 最新パターン
        ];
        for (const selector of channelSelectors) {
          const elems = card.querySelectorAll(selector);
          for (const elem of elems) {
            const text =
              elem.textContent || elem.getAttribute("data-channel-name");
            if (text && check(text)) {
              matched = true;
              break;
            }
          }
          if (matched) break;
        }

        // フォールバック: 具体的なセレクタで見つからない場合、カード内のテキスト全体をチェック
        if (!matched) {
          // ただし、タイトル部分（h3）を除外してサイト/チャンネル名っぽい部分をチェック
          // 完璧な分離は困難なため、カード全体のテキストでフォールバック
          const allText = card.innerText || card.textContent;
          if (allText && check(allText)) {
            matched = true;
          }
        }
      }

      // 説明文検査
      if (!noDesc && !matched) {
        const descSelectors = [
          ".VwiC3b", // 説明文
          ".yXK7lf",
          ".Uroaid",
          ".ITZIwc",
        ];
        for (const selector of descSelectors) {
          const elem = card.querySelector(selector);
          if (elem && check(elem.textContent)) {
            matched = true;
            break;
          }
        }
      }

      if (matched) {
        this.hideElement(card, originalWord);
      }
    });
  },

  // Google検索内ニュースタブ用の追加ブロック処理
  blockGoogleNewsTab: function (check, noTitle, noSite, noDesc, originalWord) {
    // ニュースカード: div.SoaBEf, g-card, div.WlydOe, div.n0jPhd
    const newsCards = document.querySelectorAll(
      "div.SoaBEf, g-card, div.WlydOe, article, div.n0jPhd"
    );

    newsCards.forEach((card) => {
      if (card.classList.contains("ngw4b_hidden")) return;
      if (card.closest(".ngw4b_hidden")) return; // 親要素が既に非表示

      this.checkCardText(card, check, noTitle, noSite, noDesc, originalWord);
    });
  },

  // Googleショート動画用の追加ブロック処理
  blockGoogleShorts: function (check, noTitle, noSite, noDesc, originalWord) {
    // ショート動画枠: div.MjjYud がカードコンテナとして扱われることが多い
    // タイトル: span.Yt787
    // チャンネル名: span.jSLaVc
    // サイト名: span.E51IV (チャンネルと同義と思われる)

    // 他の要素を巻き込まないよう、これらのクラスを持つ要素を内包する MjjYud を探す
    const candidates = document.querySelectorAll("div.MjjYud:has(span.Yt787)");

    candidates.forEach((card) => {
      if (card.classList.contains("ngw4b_hidden")) return;

      let matched = false;

      // タイトル (span.Yt787)
      if (!noTitle) {
        const titleElem = card.querySelector("span.Yt787");
        if (titleElem && check(titleElem.textContent)) matched = true;
      }

      // チャンネル名 (span.jSLaVc) / サイト名 (span.E51IV)
      if (!noSite && !matched) {
        const channelElem = card.querySelector("span.jSLaVc");
        const siteElem = card.querySelector("span.E51IV");

        if (channelElem && check(channelElem.textContent)) matched = true;
        if (siteElem && check(siteElem.textContent)) matched = true;
      }

      // 説明文相当のものがショート動画にあるか不明だが、念の為テキスト全体チェックは避ける(誤爆防止)
      // 必要なら実装追加するが、現状はタイトルとチャンネル名で十分と判断

      if (matched) {
        this.hideElement(card, originalWord);
      }
    });
  },

  // news.google.com 専用ブロック処理
  blockGoogleNews: function (check, noTitle, noSite, noDesc, originalWord) {
    const newsCards = document.querySelectorAll(
      "article, c-wiz[data-n-tid], div[data-n-tid]"
    );

    newsCards.forEach((card) => {
      if (card.classList.contains("ngw4b_hidden")) return;
      // 入れ子のカードを除外するため、親がすでにhiddenならスキップ
      if (card.closest(".ngw4b_hidden")) return;

      this.checkCardText(card, check, noTitle, noSite, noDesc, originalWord);
    });
  },

  // 汎用テキストチェック関数 (クラス非依存版)
  // DOMツリーを走査し、タイトル/サイト以外のテキストを説明文として扱う
  checkCardText: function (card, check, noTitle, noSite, noDesc, originalWord) {
    const walker = document.createTreeWalker(
      card,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue.trim();
      if (!text) continue;

      const parent = node.parentElement;

      // 既に非表示の要素内、またはスクリプト/スタイルタグ内は無視
      if (
        parent.closest(".ngw4b_hidden") ||
        parent.tagName === "SCRIPT" ||
        parent.tagName === "STYLE" ||
        parent.tagName === "NOSCRIPT"
      )
        continue;

      // コンテキスト判定
      // タイトル: h系, role=heading, aria-level
      const isTitle = parent.closest(
        "h3, h4, h2, [role='heading'], [aria-level]"
      );

      // サイト/時間: cite, time, 日付関連属性, ソース関連領域
      // Google Newsでは time タグや cite タグが使われることが多い
      const isSite = parent.closest("cite, time");

      let matched = false;

      if (isTitle) {
        if (!noTitle && check(text)) matched = true;
      } else if (isSite) {
        if (!noSite && check(text)) matched = true;
      } else {
        // タイトルでもサイト情報でもない -> 説明文とみなす
        if (!noDesc && check(text)) matched = true;
      }

      if (matched) {
        // ユーザー要望: ニュース検索では zP82e カードごと消去
        const target = card.closest(".zP82e") || card;
        this.hideElement(target, originalWord);
        return; // カード自体を隠したのでループ終了
      }
    }
  },
};

// 起動
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => NGW4B.init());
} else {
  NGW4B.init();
}
