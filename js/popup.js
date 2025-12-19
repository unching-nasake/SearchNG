"use strict";

document.addEventListener("DOMContentLoaded", () => {
  initializeToggleSwitch();
  initializeOptionsButton();
  updateBlockCount();
});

// ポップアップが開かれたときにブロック件数を取得して表示
function updateBlockCount() {
  const blockCountElem = document.getElementById("blockCount");
  if (!blockCountElem) return;

  // 現在のアクティブタブを取得
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      blockCountElem.textContent = `0 ${chrome.i18n.getMessage(
        "Popup_BlockedCount"
      )}`;
      return;
    }

    const tabId = tabs[0].id;

    // content.jsにブロック件数を問い合わせ
    chrome.tabs.sendMessage(tabId, { action: "getBlockCount" }, (response) => {
      if (chrome.runtime.lastError) {
        // content.jsが読み込まれていない場合（対象外のページなど）
        blockCountElem.textContent = `0 ${chrome.i18n.getMessage(
          "Popup_BlockedCount"
        )}`;
        return;
      }
      const count = response?.count || 0;
      blockCountElem.textContent = `${count} ${chrome.i18n.getMessage(
        "Popup_BlockedCount"
      )}`;
    });
  });
}

// トグルスイッチとステータス表示の初期化
function initializeToggleSwitch() {
  chrome.storage.sync.get("ngw4b_status", function (items) {
    let status = items.ngw4b_status;
    if (status === undefined) {
      status = true;
      chrome.storage.sync.set({ ngw4b_status: status });
    }

    const toggleSwitch = document.getElementById("toggleSwitch");
    const statusText = document.getElementById("statusText");

    const updateStatusText = (enabled) => {
      const message = chrome.i18n.getMessage(
        enabled ? "PopupStatusEnabled" : "PopupStatusDisabled"
      );
      statusText.textContent = message;
      statusText.className = enabled ? "status-enabled" : "status-disabled";
    };

    // 初期状態を設定
    toggleSwitch.checked = status;
    updateStatusText(status);

    // 変更リスナーを追加
    toggleSwitch.addEventListener("change", function () {
      const newStatus = this.checked;
      updateStatusText(newStatus);
      chrome.storage.sync.set({ ngw4b_status: newStatus }, () => {
        // 設定保存後、少し待ってから状態更新を試みる（フォールバック）
        // 主にコンテンツスクリプトからのメッセージで更新されるが、念のため
        setTimeout(updateBlockCount, 500);
      });
    });
  });
}

// コンテンツスクリプトからの通知を受け取る
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateBadge") {
    // ブロック件数が更新されたら表示に反映
    const blockCountElem = document.getElementById("blockCount");
    if (blockCountElem && request.count !== undefined) {
      blockCountElem.textContent = `${request.count} ${chrome.i18n.getMessage(
        "Popup_BlockedCount"
      )}`;
    }
  }
});

// オプションボタンの初期化
function initializeOptionsButton() {
  const optBtn = document.getElementById("optBtn");
  if (optBtn) {
    optBtn.textContent = chrome.i18n.getMessage("PopupOptBtn");
    optBtn.onclick = (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    };
  }
}
