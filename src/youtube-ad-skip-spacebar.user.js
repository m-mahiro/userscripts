// ==UserScript==
// @name         YouTube Ad Skip → Spacebar
// @namespace    https://github.com/m-mahiro/userscripts
// @version      1.0.1-debug
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

  // ---- デバッグ計装 (原因調査用。切り分けが終わったら削除する) ----
  const DEBUG = true;
  function dlog(...args) {
    if (DEBUG) console.log('%c[AD-SKIP]', 'color:#e0a;font-weight:bold', ...args);
  }
  function playerState() {
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    return {
      playerClasses: player ? player.className : null,
      paused: video ? video.paused : null,
      currentTime: video ? video.currentTime : null,
    };
  }
  if (DEBUG) {
    // 実際に発生したクリックが、どのフェーズで誰に処理されたかを見るための全体監視。
    // capture フェーズでは event.target は常に元の要素なので、bubble 側の
    // currentTarget も合わせて見る。
    document.addEventListener(
      'click',
      function (e) {
        dlog('[click observed]', {
          phase: 'capture',
          isTrusted: e.isTrusted,
          target: e.target && e.target.className,
          defaultPrevented: e.defaultPrevented,
        });
      },
      true
    );
    document.addEventListener(
      'click',
      function (e) {
        dlog('[click observed]', {
          phase: 'bubble',
          isTrusted: e.isTrusted,
          target: e.target && e.target.className,
          defaultPrevented: e.defaultPrevented,
        });
      },
      false
    );
  }
  // ---- デバッグ計装ここまで ----

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
    if (DEBUG) {
      dlog('[clickButton] before', { id: btn.id, cls: btn.className, isConnected: btn.isConnected, ...playerState() });
    }
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
    btn.click();
    if (DEBUG) {
      dlog('[clickButton] immediately after', { stillConnected: btn.isConnected, ...playerState() });
      setTimeout(() => dlog('[clickButton] +300ms', { stillConnected: btn.isConnected, sameButtonStillFound: document.querySelector('.ytp-skip-ad-button') === btn, ...playerState() }), 300);
      setTimeout(() => dlog('[clickButton] +1000ms', { stillConnected: btn.isConnected, newSkipButtonId: document.querySelector('.ytp-skip-ad-button')?.id, ...playerState() }), 1000);
    }
  }

  function onKeyDown(e) {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.activeElement?.isContentEditable) return;

    if (e.code === 'Space' || e.key === ' ') {
      const btn = findSkipButton();
      if (DEBUG) {
        dlog('[onKeyDown]', {
          btnFound: !!btn,
          btnId: btn ? btn.id : null,
          activeElement: document.activeElement ? document.activeElement.tagName : null,
          ...playerState(),
        });
      }
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        clickButton(btn);
      }
    }
  }

  document.addEventListener('keydown', onKeyDown, { capture: true });
})();
