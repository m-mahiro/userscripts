// ==UserScript==
// @name         Moodle Essay Char Counter
// @namespace    https://github.com/m-mahiro/userscripts
// @version      1.0.1
// @description  Moodle の小テスト（記述式・装飾なし）の入力欄に、入力中の文字数をリアルタイムで表示する
// @author       m-mahiro
// @match        https://*.wakayama-u.ac.jp/mod/quiz/attempt.php*
// @icon         https://moodle.org/favicon.ico
// @updateURL    https://raw.githubusercontent.com/m-mahiro/userscripts/main/src/moodle-essay-char-counter.user.js
// @downloadURL  https://raw.githubusercontent.com/m-mahiro/userscripts/main/src/moodle-essay-char-counter.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// ## 概要
// Moodle の小テスト（mod_quiz）の記述式問題（qtype_essay）のうち、回答形式が「テキスト入力（装飾なし）」の
// 入力欄の直下に、入力中の文字数をリアルタイムで表示する。
// 問題文に「300字程度」などと書かれていても、Moodle 標準では学生側に文字数が出ないため、それを補う。
//
// ## 対象
// - https://*.wakayama-u.ac.jp/mod/quiz/attempt.php* （小テストの受験画面）
//   - Moodle のホスト名は moodle2026.wakayama-u.ac.jp のように年度で変わる。@match はサブドメインを
//     ワイルドカードにし、ホスト名が moodle<数字>. で始まるときだけ動くよう本文側で絞っている
// - 入力欄は textarea.qtype_essay_plain（qtype_essay_format_plain_renderer が出力する要素）
//   - HTML エディタ（装飾あり）の問題は対象外
//   - 読み取り専用（readonly）の入力欄は対象外
//
// ## 文字数の数え方
// Moodle 本体の count_letters()（public/lib/moodlelib.php）と同じ手順で数える。
// 教員側・Moodle 側の数え方とそろえるため、Moodle のソースを参照して移植した。
// 1. strip_tags: <...> を除去する（PHP の strip_tags と同様、< のあとに空白が続かない < はタグの開始とみなす）
// 2. html_entity_decode: &amp; などの文字参照を元の文字に戻す
// 3. 空白除去: ASCII の空白（半角スペース・タブ・改行など）を除く。全角スペースは除かれず1文字として数える
// 4. 残りをコードポイント単位で数える（PHP の mb_strlen 相当。絵文字などのサロゲートペアも1文字）
// 「空白込み」の数は、手順 3 を行わない場合の文字数（改行は CRLF を 1 文字として数える）。
//
// ## 既知の差
// - PHP の strip_tags は属性値の引用符も解釈するが、ここでは < と > の入れ子だけで判定する
// - html_entity_decode(ENT_COMPAT) が変換しない &#039; などもブラウザの解釈に合わせて変換される

(function () {
  'use strict';

  // 年度ごとに変わる Moodle のホスト名（moodle2026.wakayama-u.ac.jp など）以外では何もしない
  if (!/^moodle\d*\./.test(location.hostname)) return;

  const TARGET_SELECTOR = 'textarea.qtype_essay_plain';
  const COUNTER_CLASS = 'qtype-essay-char-counter';

  // PHP の strip_tags 相当。< と > の入れ子の深さで判定する。
  // < の直後が空白・末尾のときは文字としての < とみなす（PHP と同じ）。
  function stripTags(text) {
    let depth = 0;
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '<' && !/^\s?$/.test(text[i + 1] ?? '')) {
        depth++;
      } else if (ch === '>' && depth > 0) {
        depth--;
      } else if (depth === 0) {
        out += ch;
      }
    }
    return out;
  }

  // html_entity_decode 相当。textarea の RCDATA として解釈させると、スクリプトを実行せずに文字参照だけ展開できる。
  const decoder = document.createElement('textarea');
  function decodeEntities(text) {
    if (!text.includes('&')) return text;
    decoder.innerHTML = text;
    return decoder.value;
  }

  function countCodePoints(text) {
    let n = 0;
    for (const _ of text) n++;
    return n;
  }

  // Moodle の count_letters(): タグ・空白を除いた文字数
  function countLetters(raw) {
    const decoded = decodeEntities(stripTags(raw));
    return countCodePoints(decoded.replace(/[ \t\n\v\f\r]/g, ''));
  }

  // 空白込みの文字数（改行は 1 文字に正規化する）
  function countAll(raw) {
    return countCodePoints(raw.replace(/\r\n?/g, '\n'));
  }

  function attach(textarea) {
    if (textarea.readOnly || textarea.dataset.charCounterAttached) return;
    textarea.dataset.charCounterAttached = '1';

    const counter = document.createElement('div');
    counter.className = `${COUNTER_CLASS} text-muted small text-end mt-1`;
    counter.setAttribute('aria-live', 'off');
    textarea.insertAdjacentElement('afterend', counter);

    const update = () => {
      const value = textarea.value;
      counter.textContent = `文字数: ${countLetters(value)}（空白・改行を除く）／ 空白込み: ${countAll(value)}`;
    };
    textarea.addEventListener('input', update);
    update();
  }

  function attachAll() {
    document.querySelectorAll(TARGET_SELECTOR).forEach(attach);
  }

  attachAll();
  // 問題が後から差し込まれた場合（ブロックの遅延描画など）に備える
  new MutationObserver(attachAll).observe(document.body, { childList: true, subtree: true });
})();
