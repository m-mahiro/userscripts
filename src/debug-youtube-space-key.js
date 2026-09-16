// ============================================================
// YouTube スペースキー吸われ問題 デバッグ用スクリプト
// ============================================================
// 使い方:
// 1. YouTube の動画ページを開き、DevTools (F12) の Console タブを開く
// 2. このファイルの中身を丸ごとコピーしてコンソールに貼り付けて Enter
// 3. 広告が再生されている状態でスペースキーを押す
// 4. コンソールに出力されたログを確認する
//
// 見るべきポイント:
// - "[keydown listener]" ログの順番
//     → document より先に window/html/body 等で発火しているリスナーがあれば、
//       それが youtube-ad-skip-spacebar.user.js より先にイベントを処理している
// - "[preventDefault]" "[stopPropagation]" "[stopImmediatePropagation]" ログ
//     → どのスタックトレースから呼ばれているか（youtube本体のコードかどうか）が分かる
//     → stopImmediatePropagation が document 到達前の要素で呼ばれていれば、
//       document の capture リスナー（このユーザースクリプト）自体が発火しない
// - "[active element]" "[skip button]" ログ
//     → スペースキー押下時にフォーカスがどこにあるか、スキップボタンが見つかっているか

(function () {
  'use strict';

  console.log('%c[YT-SPACE-DEBUG] 診断スクリプトを開始します', 'color:#0a0;font-weight:bold');

  // ---- 1. addEventListener をパッチして keydown の登録状況を記録 ----
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const registeredKeydownListeners = [];

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (type === 'keydown' || type === 'keyup' || type === 'keypress') {
      const capture = typeof options === 'boolean' ? options : !!(options && options.capture);
      const targetDesc = describeTarget(this);
      const stack = new Error().stack;
      registeredKeydownListeners.push({ type, capture, targetDesc, stack });
      console.log(
        `%c[addEventListener] type=${type} capture=${capture} target=${targetDesc}`,
        'color:#08c',
        '\n登録元スタック:\n' + stack
      );
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  function describeTarget(target) {
    if (target === window) return 'window';
    if (target === document) return 'document';
    if (target instanceof Element) {
      const id = target.id ? `#${target.id}` : '';
      const cls = target.className && typeof target.className === 'string'
        ? `.${target.className.split(' ').filter(Boolean).join('.')}`
        : '';
      return `<${target.tagName.toLowerCase()}${id}${cls}>`;
    }
    return String(target);
  }

  // ---- 2. Event.prototype の preventDefault / stopPropagation 系をパッチ ----
  const originalPreventDefault = Event.prototype.preventDefault;
  const originalStopPropagation = Event.prototype.stopPropagation;
  const originalStopImmediatePropagation = Event.prototype.stopImmediatePropagation;

  Event.prototype.preventDefault = function () {
    if (this.type === 'keydown' && (this.code === 'Space' || this.key === ' ')) {
      console.log(
        '%c[preventDefault] called on Space keydown',
        'color:#c60;font-weight:bold',
        '\n呼び出し元スタック:\n' + new Error().stack
      );
    }
    return originalPreventDefault.call(this);
  };

  Event.prototype.stopPropagation = function () {
    if (this.type === 'keydown' && (this.code === 'Space' || this.key === ' ')) {
      console.log(
        '%c[stopPropagation] called on Space keydown',
        'color:#c60;font-weight:bold',
        '\n呼び出し元スタック:\n' + new Error().stack
      );
    }
    return originalStopPropagation.call(this);
  };

  Event.prototype.stopImmediatePropagation = function () {
    if (this.type === 'keydown' && (this.code === 'Space' || this.key === ' ')) {
      console.log(
        '%c[stopImmediatePropagation] called on Space keydown ← これが呼ばれていると後続リスナーは実行されない',
        'color:#f00;font-weight:bold',
        '\n呼び出し元スタック:\n' + new Error().stack
      );
    }
    return originalStopImmediatePropagation.call(this);
  };

  // ---- 3. window / document 両方の capture phase で実際に発火順序を確認 ----
  function logPhase(label) {
    return function (e) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      console.log(
        `%c[keydown listener] phase=${label} defaultPrevented=${e.defaultPrevented} target=${describeTarget(e.target)} activeElement=${describeTarget(document.activeElement)}`,
        'color:#06a'
      );
    };
  }

  window.addEventListener('keydown', logPhase('window-capture'), true);
  document.addEventListener('keydown', logPhase('document-capture'), true);
  document.addEventListener('keydown', logPhase('document-bubble'), false);
  window.addEventListener('keydown', logPhase('window-bubble'), false);

  // ---- 4. スペースキー押下時にスキップボタンの検出状況を確認 ----
  const SKIP_SELECTORS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '[class*="skip-ad"]',
    '[class*="skip_ad"]',
  ];

  document.addEventListener(
    'keydown',
    function (e) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      let found = null;
      for (const selector of SKIP_SELECTORS) {
        const btn = document.querySelector(selector);
        if (btn && btn.offsetParent !== null) {
          found = { selector, btn };
          break;
        }
      }
      console.log(
        '%c[skip button check]',
        'color:#080',
        found ? `見つかった: ${found.selector}` : '見つからない（広告なし or セレクタ不一致）',
        found ? found.btn : ''
      );
      console.log(
        '%c[active element]',
        'color:#080',
        describeTarget(document.activeElement),
        document.activeElement
      );
    },
    true // capture, できるだけ早い段階で状態を見る
  );

  console.log(
    '%c[YT-SPACE-DEBUG] セットアップ完了。広告再生中にスペースキーを押してログを確認してください。',
    'color:#0a0;font-weight:bold'
  );
  console.log(
    '登録済みの keydown/keyup/keypress リスナー一覧は registeredKeydownListeners 変数で後から確認できます（コンソールで直接タイプ）'
  );

  window.__ytSpaceDebugListeners = registeredKeydownListeners;
})();
