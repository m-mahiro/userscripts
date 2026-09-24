// ==UserScript==
// @name         YouTube Ad Skip → Spacebar
// @namespace    https://github.com/m-mahiro/userscripts
// @version      1.1.0
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
// スペースキーが押されたとき、広告のスキップボタンが表示されていれば広告をスキップする。
// スキップボタンがない状態でスペースキーを押した場合は、YouTube 本来の動作（再生/一時停止）に委ねる。
//
// ## 動作の仕組み
// - keydown イベントを capture フェーズで捕捉し、YouTube 自身のハンドラより先に処理する
// - スキップは #movie_player の内部API `cancelPlayback()` を直接呼んで行う。
//   スキップボタンへの合成クリック（dispatchEvent/.click()）は isTrusted: false になり、
//   YouTube側の本来のスキップ処理には届かず、代わりに汎用の再生/一時停止トグルにしか
//   ならないことが実機検証で確認されたため、この方式は採用していない。
// - cancelPlayback() 実行後はプレイヤーが一時停止状態になるため、続けて playVideo() で
//   再生を再開する。
// - テキストボックス等にフォーカスがある場合は何もしない
//
// ## 対応セレクタ（スキップボタンの検出用。フォールバッククリック方式でも使用）
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

  function isVisible(el) {
    if (el.offsetParent === null) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  }

  function findSkipButton() {
    for (const selector of SKIP_SELECTORS) {
      const btn = document.querySelector(selector);
      if (btn && isVisible(btn)) return btn;
    }
    return null;
  }

  // 合成クリックによるフォールバック（内部APIが使えない場合の最終手段）。
  function clickButton(btn) {
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    btn.click();
  }

  // cancelPlayback() 直後は本編の読み込み中で playVideo() が無視されることがあるため、
  // 再生状態(1)になるまで短い間隔で繰り返す。
  function resumeUntilPlaying(player) {
    const PLAYING = 1;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (player.getPlayerState() === PLAYING || tries > 20) {
        clearInterval(timer);
        return;
      }
      player.playVideo();
    }, 150);
    player.playVideo();
  }

  function skipAd(btn) {
    const player = document.querySelector('#movie_player');
    if (player && typeof player.cancelPlayback === 'function' && typeof player.playVideo === 'function') {
      player.cancelPlayback();
      resumeUntilPlaying(player);
      return;
    }
    clickButton(btn);
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
        skipAd(btn);
      }
    }
  }

  document.addEventListener('keydown', onKeyDown, { capture: true });
})();
