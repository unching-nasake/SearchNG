"use strict";

const browserAPI = typeof chrome !== "undefined" ? chrome : browser;
const storageAPI = (browserAPI.storage &&
  (browserAPI.storage.sync || browserAPI.storage.local)) || {
  get: (d, cb) => cb(d),
  set: (d, cb) => cb && cb(),
};

if (typeof chrome === "undefined") {
  window.chrome = browserAPI;
}

// MV3とMV2の互換性維持（Action API）
// MV3: chrome.action, MV2: chrome.browserAction
const actionAPI =
  typeof chrome.action !== "undefined" ? chrome.action : chrome.browserAction;

// コンテキストメニューの作成
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ngw4b_captureText",
    title:
      chrome.i18n.getMessage("Name") +
      " - " +
      chrome.i18n.getMessage("ContextMenuLabel"),
    contexts: ["selection"],
  });
});

// コンテキストメニューがクリックされたときの処理
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "ngw4b_captureText" && info.selectionText) {
    handleSelectedText(info.selectionText, tab);
  }
});

// 選択テキストの処理
function handleSelectedText(selectedText, tab) {
  // content.jsの関数を呼び出す
  chrome.tabs.sendMessage(
    tab.id,
    {
      action: "executeFunction",
      selectionText: selectedText,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        // エラーハンドリング（content.jsが読み込まれていない場合など）
        console.error("Message failed:", chrome.runtime.lastError);
        return;
      }
      console.log(response?.status);
    }
  );
}

// アイコンの状態更新
// 画像切り替えはエラーが発生しやすいため、バッジでステータスを表示する
function updateBadgeState(isEnabled, tabId = null, count = 0) {
  if (isEnabled) {
    // 有効時: カウントを表示（0なら非表示）
    const badgeText = count > 0 ? String(count) : "";
    const color = "#d9534f"; // 赤色

    if (tabId) {
      // MV2のコールバック形式APIとの互換性を保つため、.catch()は使用しない
      // 必要であればコールバックでエラーチェックを行う
      actionAPI.setBadgeText({ text: badgeText, tabId: tabId }, () => {
        if (chrome.runtime.lastError) {
          /* ignore */
        }
      });
      if (count > 0)
        actionAPI.setBadgeBackgroundColor(
          { color: color, tabId: tabId },
          () => {
            if (chrome.runtime.lastError) {
              /* ignore */
            }
          }
        );
    } else {
      // tabId指定なし
    }
  } else {
    // 無効時: "OFF" を表示し、グレーにする
    const badgeText = "OFF";
    const color = "#999999"; // グレー

    if (tabId) {
      actionAPI.setBadgeText({ text: badgeText, tabId: tabId }, () => {
        if (chrome.runtime.lastError) {
          /* ignore */
        }
      });
      actionAPI.setBadgeBackgroundColor({ color: color, tabId: tabId }, () => {
        if (chrome.runtime.lastError) {
          /* ignore */
        }
      });
    }
  }
}

// 起動時・インストール時
chrome.runtime.onStartup.addListener(initStatus);
chrome.runtime.onInstalled.addListener(initStatus);

function initStatus() {
  // デフォルト設定値の定義
  const DEFAULT_SETTINGS = {
    ngw4b_status: true,
    ngw4b_nglist: "",
    enabled_bing: true,
    enabled_google: true,
    bing_main: true,
    bing_video: true,
    bing_image: true,
    bing_shop: true,
    bing_news: true,
    google_main: true,
    google_video: true,
    google_image: true,
    google_shop: true,
    google_news: true,
    google_shorts: true,
  };

  storageAPI.get(null, (items) => {
    // エラーチェック
    if (chrome.runtime.lastError) {
      console.error("Failed to get storage:", chrome.runtime.lastError);
      return;
    }

    const newSettings = {};
    let needsUpdate = false;

    // 未設定の項目にデフォルト値を適用
    for (const key in DEFAULT_SETTINGS) {
      if (items[key] === undefined) {
        newSettings[key] = DEFAULT_SETTINGS[key];
        needsUpdate = true;
      }
    }

    // 更新が必要な場合のみ保存
    if (needsUpdate) {
      storageAPI.set(newSettings, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Failed to initialize settings:",
            chrome.runtime.lastError
          );
        } else {
          console.log("Settings initialized:", newSettings);
        }
      });
    }
  });
}

// ストレージ変更監視（ステータス変更時）
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.ngw4b_status) {
    const isEnabled = changes.ngw4b_status.newValue !== false;

    // すべてのタブのバッジを更新
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        // カウントは保持していないため、無効化時は即OFF、有効化時は一旦クリア（または0）
        // 正確にはcontent.jsから再送してもらうのがベストだが、ここでは簡易的に処理
        if (!isEnabled) {
          updateBadgeState(false, tab.id);
        } else {
          // 有効化直後はカウントが分からないので一旦空にする
          // ページリロードやスクロールで更新されるのを待つ
          actionAPI.setBadgeText({ text: "", tabId: tab.id }, () => {
            if (chrome.runtime.lastError) {
              /* ignore */
            }
          });
        }
      });
    });
  }
});

// content.jsからのメッセージリスナー（バッジ更新用）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateBadge") {
    const count = request.count || 0;
    const tabId = sender.tab?.id;

    if (tabId) {
      storageAPI.get("ngw4b_status", (items) => {
        const isEnabled = items.ngw4b_status !== false;
        updateBadgeState(isEnabled, tabId, count);
      });
    }
  }
  return true;
});

// タブ切り替え時
chrome.tabs.onActivated.addListener((activeInfo) => {
  // バッジはタブごとに保持されるため、特別なリセットは不要だが
  // ステータス無効時のOFF表示を確実にするならここで再設定も可
  storageAPI.get("ngw4b_status", (items) => {
    const isEnabled = items.ngw4b_status !== false;
    if (!isEnabled) {
      updateBadgeState(false, activeInfo.tabId);
    }
    // 有効時は既存のバッジが残っているはず
  });
});

// ページ遷移時
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    actionAPI.setBadgeText({ text: "", tabId: tabId }, () => {
      if (chrome.runtime.lastError) {
        /* ignore */
      }
    });

    storageAPI.get("ngw4b_status", (items) => {
      const isEnabled = items.ngw4b_status !== false;
      if (!isEnabled) {
        updateBadgeState(false, tabId);
      }
    });
  }
});
