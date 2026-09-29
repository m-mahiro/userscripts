// ==UserScript==
// @name         YouTube Watch Later Quick Remove
// @namespace    https://github.com/m-mahiro/userscripts
// @version      1.0.0
// @description  YouTube の再生リストページで、各動画の3点リーダーメニューの左に削除ボタンを追加し、1クリックで「後で見る」等のリストから削除できるようにする
// @author       m-mahiro
// @match        https://www.youtube.com/playlist*
// @icon         https://www.youtube.com/favicon.ico
// @updateURL    https://raw.githubusercontent.com/m-mahiro/userscripts/main/src/youtube-watch-later-quick-remove.user.js
// @downloadURL  https://raw.githubusercontent.com/m-mahiro/userscripts/main/src/youtube-watch-later-quick-remove.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// ## 概要
// 「後で見る」などの再生リストページで、動画ごとの3点リーダー（kebab）メニューの左側に
// ゴミ箱ボタンを追加する。押すとそのメニューを開いて「[〜]から削除」を自動でクリックし、
// メニューを開閉する手間なく1クリックでリストから削除できる。
//
// ## 動作の仕組み
// - 独自の削除処理は実装せず、YouTube本来の3点リーダーメニュー操作をボタン1回のクリックで
//   代行しているだけ（対象行の3点リーダーをクリック → ポップアップメニュー内の
//   「から削除」項目を探してクリック）。削除ロジック自体はYouTube側のものをそのまま使うため、
//   UI内部実装が変わっても壊れにくい。
// - 動画行（ytd-playlist-video-renderer）は無限スクロールで後から追加されるため、
//   MutationObserverで新しい行を検知し、都度ボタンを追加する。
// - ポップアップメニューはページ内で使い回される単一のコンテナに描画されるため、
//   対象行の3点リーダーをクリックした直後の内容を見て「から削除」項目を探す。

(function () {
  'use strict';

  const REMOVE_TEXT = 'から削除';
  const FIND_TIMEOUT_MS = 3000;
  const BUTTON_MARK = 'tmWatchLaterQuickRemove';

  function findMenuButton(row) {
    return row.querySelector('ytd-menu-renderer yt-icon-button#button button');
  }

  function findRemoveMenuItem() {
    const items = document.querySelectorAll('ytd-popup-container ytd-menu-service-item-renderer');
    for (const item of items) {
      if (item.textContent && item.textContent.includes(REMOVE_TEXT)) {
        return item.querySelector('tp-yt-paper-item') || item;
      }
    }
    return null;
  }

  function closeOpenMenu(menuButton) {
    // 目的の項目が見つからなかった場合、開いたままにせず元に戻す
    menuButton.click();
  }

  function removeRow(row, quickRemoveButton) {
    const menuButton = findMenuButton(row);
    if (!menuButton) return;

    quickRemoveButton.disabled = true;
    menuButton.click();

    const start = performance.now();
    (function poll() {
      const target = findRemoveMenuItem();
      if (target) {
        target.click();
        quickRemoveButton.disabled = false;
        return;
      }
      if (performance.now() - start > FIND_TIMEOUT_MS) {
        closeOpenMenu(menuButton);
        quickRemoveButton.disabled = false;
        return;
      }
      requestAnimationFrame(poll);
    })();
  }

  function createQuickRemoveButton(row) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset[BUTTON_MARK] = '1';
    button.title = 'リストから削除';
    button.setAttribute('aria-label', 'リストから削除');
    button.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'width:36px',
      'height:36px',
      'margin-right:4px',
      'padding:0',
      'border:none',
      'border-radius:50%',
      'background:transparent',
      'color:var(--yt-spec-icon-inactive, #909090)',
      'cursor:pointer',
      'flex:0 0 auto',
    ].join(';');
    // YouTube は Trusted Types を強制しているため innerHTML は使わず DOM API で組み立てる
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'currentColor');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute(
      'd',
      'M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9zm2 5h2v9h-2V8zm-4 0h2v9H7V8zm8 0h2v9h-2V8z'
    );
    svg.appendChild(path);
    button.appendChild(svg);

    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(128,128,128,.2)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = 'transparent';
    });

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeRow(row, button);
    });

    return button;
  }

  function addButtonToRow(row) {
    if (row.dataset[BUTTON_MARK]) return;
    const menuContainer = row.querySelector('#menu');
    if (!menuContainer || !menuContainer.parentElement) return;
    if (!findMenuButton(row)) return;

    row.dataset[BUTTON_MARK] = '1';
    const button = createQuickRemoveButton(row);
    menuContainer.parentElement.insertBefore(button, menuContainer);
  }

  function scanRows(root) {
    root.querySelectorAll('ytd-playlist-video-renderer').forEach(addButtonToRow);
  }

  scanRows(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches && node.matches('ytd-playlist-video-renderer')) {
          addButtonToRow(node);
        } else if (node.querySelectorAll) {
          scanRows(node);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
