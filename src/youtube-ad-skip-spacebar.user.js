// ==UserScript==
// @name         YouTube Ad Skip → Spacebar
// @namespace    https://github.com/m-mahiro/userscripts
// @version      1.2.0
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
//   スキップボタンへの合成クリックは isTrusted: false になり、YouTube側の本来のスキップ処理には
//   届かず、汎用の再生/一時停止トグルにしかならないことが実機検証で確認されたため。
// - cancelPlayback() 実行後はプレイヤーが一時停止状態になるため、再生状態になるまで playVideo() を再試行する。
// - テキストボックス等にフォーカスがある場合は何もしない
//
// ## 実行ログとアンケート（改良のための計測。詳細は logs/README があれば参照）
// - イベントの流れ・プレイヤー状態・pause/play の呼び出し元スタックを、ローカルの
//   tools/log-server.js (127.0.0.1:17321) に送る。サーバーが動いていなくても本機能には影響しない。
// - スキップ実行後などに画面左下へ小さなアンケートを出し、結果を同じログに記録する。

(function () {
  'use strict';

  // ============================================================
  // ログ送信
  // ============================================================
  const SCRIPT_NAME = 'youtube-ad-skip-spacebar';
  const SCRIPT_VERSION = '1.2.0';
  const LOG_URL = 'http://127.0.0.1:17321/log/' + SCRIPT_NAME;
  const SESSION_ID = Math.random().toString(36).slice(2, 8);
  const MAX_BUFFER = 1000;
  const buffer = [];

  function currentVideoId() {
    try {
      return new URL(location.href).searchParams.get('v');
    } catch {
      return null;
    }
  }

  function log(type, data) {
    buffer.push({
      ts: Date.now(),
      perf: Math.round(performance.now()),
      session: SESSION_ID,
      version: SCRIPT_VERSION,
      vid: currentVideoId(),
      type,
      ...data,
    });
    if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
  }

  // Chrome のローカルネットワーク許可ダイアログの待機中などで応答が返らない間は、次の送信を積まない
  let flushing = false;

  function flush() {
    if (flushing || !buffer.length) return;
    flushing = true;
    const batch = buffer.splice(0, buffer.length);
    fetch(LOG_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(batch) })
      .then((res) => {
        if (!res.ok) buffer.unshift(...batch);
      })
      .catch(() => buffer.unshift(...batch))
      .finally(() => {
        flushing = false;
      });
  }

  setInterval(flush, 1000);
  window.addEventListener('pagehide', () => {
    if (!buffer.length) return;
    navigator.sendBeacon(LOG_URL, new Blob([JSON.stringify(buffer.splice(0, buffer.length))], { type: 'text/plain' }));
  });

  // ============================================================
  // 状態取得の補助
  // ============================================================
  function getPlayer() {
    return document.querySelector('#movie_player');
  }

  function isAdShowing() {
    const player = getPlayer();
    return !!player && player.classList.contains('ad-showing');
  }

  function snap() {
    const player = getPlayer();
    const video = document.querySelector('video');
    let state = null;
    try {
      state = player && player.getPlayerState ? player.getPlayerState() : null;
    } catch {}
    return {
      ad: isAdShowing(),
      state,
      paused: video ? video.paused : null,
      ct: video ? Math.round(video.currentTime * 100) / 100 : null,
    };
  }

  function describe(target) {
    if (target === window) return 'window';
    if (target === document) return 'document';
    if (target && target.tagName) {
      const cls = typeof target.className === 'string' ? target.className.split(/\s+/).filter(Boolean)[0] : '';
      return target.tagName.toLowerCase() + (target.id ? '#' + target.id : '') + (cls ? '.' + cls : '');
    }
    return String(target);
  }

  function stackLines() {
    return (new Error().stack || '')
      .split('\n')
      .slice(3, 12)
      .map((s) => s.trim().slice(0, 180));
  }

  function isSpace(e) {
    return e.code === 'Space' || e.key === ' ';
  }

  let lastSpaceAt = 0;

  // ============================================================
  // 呼び出し元の記録（YouTube側が誰をいつ呼ぶかを見るための計測）
  // ============================================================
  for (const name of ['preventDefault', 'stopPropagation', 'stopImmediatePropagation']) {
    const original = Event.prototype[name];
    Event.prototype[name] = function () {
      try {
        if ((this.type === 'keydown' || this.type === 'keyup') && isSpace(this)) {
          log('event-method', {
            method: name,
            evType: this.type,
            phase: this.eventPhase,
            currentTarget: describe(this.currentTarget),
            stack: stackLines(),
          });
        }
      } catch {}
      return original.apply(this, arguments);
    };
  }

  for (const name of ['pause', 'play']) {
    const original = HTMLMediaElement.prototype[name];
    HTMLMediaElement.prototype[name] = function () {
      try {
        if (isAdShowing() || Date.now() - lastSpaceAt < 6000) {
          log('media-method', { method: name, ...snap(), stack: stackLines() });
        }
      } catch {}
      return original.apply(this, arguments);
    };
  }

  document.addEventListener(
    'pause',
    (e) => logMediaEvent(e),
    true
  );
  for (const name of ['play', 'playing', 'emptied', 'loadstart', 'waiting']) {
    document.addEventListener(name, (e) => logMediaEvent(e), true);
  }

  function logMediaEvent(e) {
    if (isAdShowing() || Date.now() - lastSpaceAt < 6000) {
      log('media-event', { evType: e.type, ...snap() });
    }
  }

  // window の capture は document より先に実行されるため、他のリスナーが触る前の状態が見える
  function keyStageLogger(stage) {
    return function (e) {
      if (!isSpace(e)) return;
      if (e.type === 'keydown') lastSpaceAt = Date.now();
      log('key', {
        stage,
        evType: e.type,
        trusted: e.isTrusted,
        defaultPrevented: e.defaultPrevented,
        repeat: e.repeat,
        target: describe(e.target),
        active: describe(document.activeElement),
        ...snap(),
      });
    };
  }

  window.addEventListener('keydown', keyStageLogger('window-capture'), true);
  window.addEventListener('keyup', keyStageLogger('window-capture'), true);
  document.addEventListener('keyup', keyStageLogger('document-capture'), true);

  // ============================================================
  // スキップボタンの検出
  // ============================================================
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
      if (btn && isVisible(btn)) return { btn, selector };
    }
    return null;
  }

  function describeButton(found) {
    const rect = found.btn.getBoundingClientRect();
    return {
      selector: found.selector,
      tag: found.btn.tagName,
      id: found.btn.id,
      cls: String(found.btn.className).slice(0, 80),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      text: (found.btn.textContent || '').trim().slice(0, 20),
    };
  }

  // ============================================================
  // スキップ処理
  // ============================================================
  let attemptCounter = 0;
  let lastSkipAttemptAt = 0;
  let lastSpaceNoButtonAt = 0;

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

  // 内部APIが使えない場合の最終手段。合成クリックは isTrusted: false のため通常は効かない。
  function clickButton(btn) {
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    btn.click();
  }

  function skipAd(found) {
    const attemptId = SESSION_ID + '-' + ++attemptCounter;
    const player = getPlayer();
    const useApi = !!player && typeof player.cancelPlayback === 'function' && typeof player.playVideo === 'function';
    lastSkipAttemptAt = Date.now();
    log('skip-attempt', { attemptId, method: useApi ? 'api' : 'click-fallback', ...describeButton(found), ...snap() });

    if (useApi) {
      player.cancelPlayback();
      resumeUntilPlaying(player);
    } else {
      clickButton(found.btn);
    }

    for (const after of [0, 100, 300, 700, 1500, 3000, 5000]) {
      setTimeout(() => log('timeline', { attemptId, after, ...snap() }), after);
    }
    setTimeout(
      () =>
        showSurvey(attemptId, '広告スキップは成功しましたか？', [
          ['ok', '成功（再生された）'],
          ['stopped', 'スキップしたが止まった'],
          ['not-skipped', 'スキップされなかった'],
        ]),
      2500
    );
  }

  function onKeyDown(e) {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.activeElement?.isContentEditable) return;
    if (!isSpace(e)) return;

    const found = findSkipButton();
    log('decision', {
      stage: 'document-capture',
      btnFound: !!found,
      ...(found ? describeButton(found) : {}),
      adElapsedMs: adStartAt ? Date.now() - adStartAt : null,
      repeat: e.repeat,
      ...snap(),
    });

    if (found) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) skipAd(found);
    } else if (isAdShowing()) {
      lastSpaceNoButtonAt = Date.now();
    }
  }

  document.addEventListener('keydown', onKeyDown, { capture: true });

  // ============================================================
  // 広告の開始/終了とスキップボタン出現タイミングの記録
  // ============================================================
  let adStartAt = null;
  let buttonSeen = false;

  setInterval(() => {
    const ad = isAdShowing();
    if (ad && adStartAt === null) {
      adStartAt = Date.now();
      buttonSeen = false;
      log('ad-start', snap());
    }
    if (ad && !buttonSeen) {
      const found = findSkipButton();
      if (found) {
        buttonSeen = true;
        log('skip-button-visible', { afterAdStartMs: Date.now() - adStartAt, ...describeButton(found) });
      }
    }
    if (!ad && adStartAt !== null) {
      const now = Date.now();
      let endedBy = 'other';
      if (now - lastSkipAttemptAt < 5000) endedBy = 'userscript-skip';
      else if (now - lastSpaceNoButtonAt < 3000) endedBy = 'after-space-without-button';
      log('ad-end', { durationMs: now - adStartAt, endedBy, buttonSeen, ...snap() });
      if (endedBy === 'after-space-without-button') {
        showSurvey(SESSION_ID + '-noBtn-' + now, 'スペース後に広告が終わりました。そのときスキップボタンは出ていましたか？', [
          ['button-was-visible', '出ていた'],
          ['button-was-not-visible', '出ていなかった'],
          ['unknown', '覚えていない'],
        ]);
      }
      adStartAt = null;
    }
  }, 250);

  // ============================================================
  // アンケート（画面左下の小さな表示。結果はログに記録される）
  // ============================================================
  let surveyEl = null;
  let surveyTimer = null;

  function closeSurvey() {
    clearTimeout(surveyTimer);
    if (surveyEl) surveyEl.remove();
    surveyEl = null;
  }

  function showSurvey(surveyId, question, choices) {
    closeSurvey();
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;left:16px;bottom:90px;z-index:2147483647;max-width:320px;padding:10px 12px;' +
      'background:rgba(20,20,20,.92);color:#fff;font:13px/1.4 sans-serif;border-radius:8px;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.5)';
    const q = document.createElement('div');
    q.textContent = question;
    q.style.marginBottom = '8px';
    box.appendChild(q);

    const answer = (value) => {
      log('survey', { surveyId, question, answer: value, ...snap() });
      closeSurvey();
    };
    for (const [value, label] of choices) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText =
        'display:block;width:100%;margin-top:4px;padding:5px 8px;background:#333;color:#fff;' +
        'border:1px solid #666;border-radius:4px;font:inherit;cursor:pointer;text-align:left';
      // フォーカスを奪うと、以後のスペースキーがこのボタンに吸われるため
      b.addEventListener('mousedown', (ev) => ev.preventDefault());
      b.addEventListener('click', () => answer(value));
      box.appendChild(b);
    }
    document.documentElement.appendChild(box);
    surveyEl = box;
    surveyTimer = setTimeout(() => answer('no-answer'), 15000);
  }
})();
