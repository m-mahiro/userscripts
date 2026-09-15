// ==UserScript==
// @name         YouTube Chat Toggle → B key
// @namespace    https://github.com/m-mahiro/userscripts
// @version      1.1.0
// @description  YouTube のライブ配信・アーカイブでBキーを押すとチャット欄の表示/非表示を切り替える
// @author       m-mahiro
// @match        https://www.youtube.com/*
// @icon         https://www.youtube.com/favicon.ico
// @updateURL    https://raw.githubusercontent.com/m-mahiro/userscripts/main/src/youtube-chat-toggle-b-key.user.js
// @downloadURL  https://raw.githubusercontent.com/m-mahiro/userscripts/main/src/youtube-chat-toggle-b-key.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// ## 概要
// B キーが押されたとき、チャット欄が閉じていれば開き、開いていれば閉じる。
// ライブ配信・アーカイブ（チャットリプレイ）のどちらでも、フルスクリーン/通常表示のどちらでも動作する。
//
// ## 動作の仕組み
// - keydown イベントを capture フェーズで捕捉する
// - 開く: #show-hide-button（ytd-live-chat-frame 内の「チャットを表示」ボタンの入れ物）を探す
//   - この要素はチャットが閉じているときだけ hidden 属性が外れる（＝表示される）
// - 閉じる: チャット本体は iframe#chatframe（同一オリジンの www.youtube.com）内に描画されており、
//   その中の #close-button が閉じるボタンにあたる
// - どちらも id ベースで判定しているため、UI の言語設定（日本語/英語など）に依存しない
// - テキストボックス等にフォーカスがある場合や、修飾キー（Ctrl/Alt/Meta）併用時は何もしない

(function () {
  'use strict';

  function findOpenButton() {
    const container = document.querySelector('#show-hide-button');
    if (!container || container.hasAttribute('hidden')) return null;
    return container.querySelector('button');
  }

  function findCloseButton() {
    const iframe = document.querySelector('ytd-live-chat-frame iframe#chatframe');
    const doc = iframe?.contentDocument;
    return doc?.querySelector('#close-button button') ?? null;
  }

  function onKeyDown(e) {
    if (e.key.toLowerCase() !== 'b') return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.activeElement?.isContentEditable) return;

    const openBtn = findOpenButton();
    if (openBtn) {
      e.preventDefault();
      e.stopPropagation();
      openBtn.click();
      return;
    }

    const closeBtn = findCloseButton();
    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      closeBtn.click();
    }
  }

  document.addEventListener('keydown', onKeyDown, { capture: true });
})();
