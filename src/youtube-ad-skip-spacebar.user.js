// ==UserScript==
// @name         YouTube Ad Skip → Spacebar
// @namespace    https://github.com/m-mahiro/userscripts
// @version      1.0.0
// @description  YouTube の広告スキップボタンをスペースキーで押せるようにする
// @author       m-mahiro
// @match        https://www.youtube.com/*
// @match        https://music.youtube.com/*
// @icon         https://www.youtube.com/favicon.ico
// @updateURL    https://raw.githubusercontent.com/m-mahiro/userscripts/main/src/youtube-ad-skip-spacebar.user.js
// @downloadURL  https://raw.githubusercontent.com/m-mahiro/userscripts/main/src/youtube-ad-skip-spacebar.user.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

// ## 概要
// スペースキーが押されたとき、広告のスキップボタンが表示されていればそれをクリックする。
// スキップボタンがない状態でスペースキーを押した場合は、YouTube 本来の動作（再生/一時停止）に委ねる。
//
// ## 動作の仕組み
// - keydown イベントを capture フェーズで捕捉し、YouTube 自身のハンドラより先に処理する
// - 複数のセレクタを優先順に試してスキップボタンを探す（YouTube はクラス名を頻繁に変えるため）
// - テキストボックス等にフォーカスがある場合は何もしない
//
// ## 対応セレクタ
// - .ytp-skip-ad-button        （標準）
// - .ytp-ad-skip-button        （別バリアント）
// - .ytp-ad-skip-button-modern （モダン UI）
// - [class*="skip-ad"]         （クラス名にskip-adを含む、フォールバック）

(function () {
  'use strict';

  const SKIP_SELECTORS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '[class*="skip-ad"]',
    '[class*="skip_ad"]',
  ];

  function findSkipButton() {
    for (const selector of SKIP_SELECTORS) {
      const btn = document.querySelector(selector);
      if (btn && btn.offsetParent !== null) return btn;
    }
    return null;
  }

  function clickButton(btn) {
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
    btn.click();
  }

  function onKeyDown(e) {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.activeElement?.isContentEditable) return;

    if (e.code === 'Space' || e.key === ' ') {
      const btn = findSkipButton();
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        clickButton(btn);
      }
    }
  }

  document.addEventListener('keydown', onKeyDown, { capture: true });
})();
