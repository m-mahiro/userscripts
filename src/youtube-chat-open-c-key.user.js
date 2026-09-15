// ==UserScript==
// @name         YouTube Chat Open → C key
// @namespace    https://github.com/m-mahiro/userscripts
// @version      1.0.0
// @description  YouTube のライブ配信・アーカイブでチャット欄が閉じているとき、Cキーでチャット欄を開けるようにする
// @author       m-mahiro
// @match        https://www.youtube.com/*
// @icon         https://www.youtube.com/favicon.ico
// @updateURL    https://raw.githubusercontent.com/m-mahiro/userscripts/main/src/youtube-chat-open-c-key.user.js
// @downloadURL  https://raw.githubusercontent.com/m-mahiro/userscripts/main/src/youtube-chat-open-c-key.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// ## 概要
// C キーが押されたとき、チャット欄が閉じていれば開くボタンをクリックする。
// ライブ配信・アーカイブ（チャットリプレイ）のどちらでも動作する。
//
// ## 動作の仕組み
// - keydown イベントを capture フェーズで捕捉する
// - #show-hide-button（ytd-live-chat-frame 内の「チャットを表示」ボタンの入れ物）を探す
//   - この要素はチャットが閉じているときだけ hidden 属性が外れる（＝表示される）
//   - id ベースで判定しているため、UI の言語設定（日本語/英語など）に依存しない
// - YouTube 本来の C キー（字幕の ON/OFF）と衝突するため、チャットを開いた場合は
//   preventDefault / stopPropagation で本来の動作を止める
// - テキストボックス等にフォーカスがある場合や、修飾キー（Ctrl/Alt/Meta）併用時は何もしない

(function () {
  'use strict';

  function findShowChatButton() {
    const container = document.querySelector('#show-hide-button');
    if (!container || container.hasAttribute('hidden')) return null;
    return container.querySelector('button');
  }

  function onKeyDown(e) {
    if (e.key.toLowerCase() !== 'c') return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.activeElement?.isContentEditable) return;

    const btn = findShowChatButton();
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      btn.click();
    }
  }

  document.addEventListener('keydown', onKeyDown, { capture: true });
})();
