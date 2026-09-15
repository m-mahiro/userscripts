// ==UserScript==
// @name         お助けマン Time - シフトエクスポーター
// @namespace    https://github.com/m-mahiro/userscripts
// @version      1.3
// @description  お助けマン Time のシフト情報をテキスト/CSVで取得するボタンを追加します
// @author       m-mahiro
// @match        https://staff.otasuke-part.jp/*
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/m-mahiro/userscripts/main/src/otasukeman-shift-exporter.user.js
// @downloadURL  https://raw.githubusercontent.com/m-mahiro/userscripts/main/src/otasukeman-shift-exporter.user.js
// ==/UserScript==

// ## 概要
// お助けマン Time（https://staff.otasuke-part.jp）のシフト画面に
// 「テキストで取得」「CSVで取得」のフローティングボタンを追加する。
// ボタンを押すとモーダルにシフト情報が表示され、クリップボードにコピーできる。
//
// ## 対応ページ
// - https://staff.otasuke-part.jp/* （SPA ルーティングにも対応）
//
// ## 取得できる情報
// - 日付・曜日・店舗名・開始時刻・終了時刻・期間ステータス（確定/提出済 など）

(function () {
  'use strict';

  // -------------------------------------------------------
  // 日付（年・月）推定
  // -------------------------------------------------------
  // シフト画面には各日ブロックに日にちしか表示されず、月は表示されない。
  // ヘッダー左上の月表示（.month-selector）は、スクロール領域の上端を
  // 通過した直近の日ブロックの月を常に反映する仕様になっている。
  // これを起点（アンカー）とし、日にちの並びが減少する（＝月が変わる）
  // 箇所を検出しながら各日ブロックの年・月を推定する。
  // 年はこの表示だけでは分からないため、端末の現在日時との近さから推定する。
  function findScrollContainer(el) {
    let node = el?.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (node.scrollHeight > node.clientHeight + 5 && /(auto|scroll)/.test(style.overflowY)) {
        return node;
      }
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function getAnchor(dayGroups) {
    const monthLabelEl = document.querySelector('.month-selector > span');
    const monthMatch = monthLabelEl ? monthLabelEl.textContent.match(/\d+/) : null;

    const now = new Date();
    if (!monthMatch || dayGroups.length === 0) {
      return { index: 0, year: now.getFullYear(), month: now.getMonth() + 1 };
    }

    const anchorMonth = parseInt(monthMatch[0], 10);

    // スクロール領域の上端（y=0）を通過した直近の日ブロックを探す
    const container = findScrollContainer(dayGroups[0]);
    const containerTop = container.getBoundingClientRect().top;
    let anchorIndex = 0;
    let bestTop = -Infinity;
    dayGroups.forEach((g, i) => {
      const top = g.getBoundingClientRect().top - containerTop;
      if (top <= 0 && top > bestTop) { bestTop = top; anchorIndex = i; }
    });

    // 月表示だけでは年が分からないため、現在日時との差が半年を超えないように補正する
    let anchorYear = now.getFullYear();
    const diff = anchorMonth - (now.getMonth() + 1);
    if (diff > 6) anchorYear -= 1;
    else if (diff < -6) anchorYear += 1;

    return { index: anchorIndex, year: anchorYear, month: anchorMonth };
  }

  function computeDates(dayGroups) {
    const map = new Map();
    if (dayGroups.length === 0) return map;

    const days = dayGroups.map(g => parseInt((g.querySelector('.day')?.textContent ?? '').trim(), 10));
    const anchor = getAnchor(dayGroups);

    let year = anchor.year;
    let month = anchor.month;
    map.set(dayGroups[anchor.index], { year, month });

    for (let i = anchor.index + 1; i < dayGroups.length; i++) {
      if (days[i] < days[i - 1]) {
        month++;
        if (month > 12) { month = 1; year++; }
      }
      map.set(dayGroups[i], { year, month });
    }

    year = anchor.year;
    month = anchor.month;
    for (let i = anchor.index - 1; i >= 0; i--) {
      if (days[i] > days[i + 1]) {
        month--;
        if (month < 1) { month = 12; year--; }
      }
      map.set(dayGroups[i], { year, month });
    }

    return map;
  }

  // -------------------------------------------------------
  // シフトデータ抽出
  // -------------------------------------------------------
  function extractShifts() {
    const rows = [];

    const shiftTables = document.querySelectorAll('.shift-table');

    const allDayGroups = [];
    shiftTables.forEach(table => {
      table.querySelectorAll('.daily-shift-group').forEach(g => allDayGroups.push(g));
    });
    const dateMap = computeDates(allDayGroups);

    shiftTables.forEach(table => {
      const termBar = table.querySelector('sp-creation-term-bar');
      let termStatus = '';
      if (termBar) {
        const statusEl = termBar.querySelector('.status-container');
        if (statusEl) {
          if (statusEl.classList.contains('fixed'))          termStatus = '確定';
          else if (statusEl.classList.contains('submitted')) termStatus = '提出済';
          else termStatus = statusEl.textContent.trim();
        }
      }

      const dayGroups = table.querySelectorAll('.daily-shift-group');
      dayGroups.forEach(g => {
        const day = (g.querySelector('.day')?.textContent ?? '').trim();
        const dow = (g.querySelector('.day-of-week')?.textContent ?? '').trim();
        const dateInfo = dateMap.get(g);
        const month = dateInfo ? dateInfo.month : '';

        const shopEls = g.querySelectorAll('sp-daily-shop');
        if (shopEls.length === 0) return;

        shopEls.forEach(shopEl => {
          const shopName  = (shopEl.querySelector('.shop-name')?.textContent ?? '').trim();
          const startTime = (shopEl.querySelector('.work-start')?.textContent ?? '').trim();
          const endTime   = (shopEl.querySelector('.work-end')?.textContent ?? '').trim();

          if (!startTime) return; // 休みは除外
          rows.push({ month, day, dow, shopName, startTime, endTime, status: '勤務', termStatus });
        });
      });
    });

    return rows;
  }

  // -------------------------------------------------------
  // テキスト形式に変換
  // -------------------------------------------------------
  function toText(rows) {
    if (rows.length === 0) return '（シフトデータが見つかりませんでした）';

    const lines = ['【シフト一覧】\n'];
    let lastTermStatus = null;

    rows.forEach(r => {
      if (r.termStatus && r.termStatus !== lastTermStatus) {
        lines.push(`\n--- ${r.termStatus} ---`);
        lastTermStatus = r.termStatus;
      }
      lines.push(`${r.month}/${r.day}(${r.dow})  ${r.shopName}  ${r.startTime} ～ ${r.endTime}`);
    });

    return lines.join('\n');
  }

  // -------------------------------------------------------
  // CSV 形式に変換
  // -------------------------------------------------------
  function toCsv(rows) {
    const header = '日付,曜日,店舗名,開始,終了,状態,期間ステータス';
    const body = rows.map(r =>
      [`${r.month}/${r.day}`, r.dow, r.shopName, r.startTime, r.endTime, r.status, r.termStatus]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    return [header, ...body].join('\n');
  }

  // -------------------------------------------------------
  // モーダル UI
  // -------------------------------------------------------
  function showModal(text) {
    document.getElementById('__shift-export-modal__')?.remove();

    const overlay = document.createElement('div');
    overlay.id = '__shift-export-modal__';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:2147483647',
      'background:rgba(0,0,0,.45)',
      'display:flex;align-items:center;justify-content:center',
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
      'background:#fff;border-radius:10px',
      'padding:20px;width:560px;max-height:80vh',
      'display:flex;flex-direction:column;gap:10px',
      'box-shadow:0 8px 32px rgba(0,0,0,.3)',
      'font-family:"Helvetica Neue",Arial,sans-serif',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'シフト情報';
    title.style.cssText = 'font-size:16px;font-weight:bold;color:#333';

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.readOnly = true;
    ta.style.cssText = [
      'width:100%;flex:1;min-height:300px',
      'font-family:monospace;font-size:13px',
      'border:1px solid #ccc;border-radius:6px;padding:8px',
      'resize:vertical;box-sizing:border-box',
    ].join(';');

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

    const makeBtn = (label, bg, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = [
        `background:${bg};color:#fff;border:none`,
        'border-radius:6px;padding:8px 16px',
        'cursor:pointer;font-size:13px;font-weight:bold',
      ].join(';');
      b.onclick = fn;
      return b;
    };

    const copyBtn = makeBtn('コピー', '#4caf50', () => {
      try {
        GM_setClipboard(text);
      } catch {
        navigator.clipboard.writeText(text).catch(() => {
          ta.select();
          document.execCommand('copy');
        });
      }
      copyBtn.textContent = 'コピーしました!';
      setTimeout(() => { copyBtn.textContent = 'コピー'; }, 1500);
    });

    const closeBtn = makeBtn('閉じる', '#888', () => overlay.remove());

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    btnRow.append(copyBtn, closeBtn);
    box.append(title, ta, btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    ta.focus();
    ta.select();
  }

  // -------------------------------------------------------
  // フローティングボタン
  // -------------------------------------------------------
  function addButton() {
    if (document.getElementById('__shift-export-btn__')) return;

    const wrap = document.createElement('div');
    wrap.id = '__shift-export-btn__';
    wrap.style.cssText = [
      'position:fixed;bottom:24px;right:18px;z-index:2147483646',
      'display:flex;flex-direction:column;gap:6px;align-items:flex-end',
    ].join(';');

    const makeFloatBtn = (label, bg, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = [
        `background:${bg};color:#fff;border:none`,
        'border-radius:20px;padding:9px 16px',
        'cursor:pointer;font-size:13px;font-weight:bold',
        'box-shadow:0 3px 10px rgba(0,0,0,.25)',
        'white-space:nowrap',
      ].join(';');
      b.onclick = fn;
      return b;
    };

    wrap.appendChild(makeFloatBtn('📋 テキストで取得', '#1976d2', () => showModal(toText(extractShifts()))));
    wrap.appendChild(makeFloatBtn('📊 CSV で取得',    '#388e3c', () => showModal(toCsv(extractShifts()))));

    document.body.appendChild(wrap);
  }

  // -------------------------------------------------------
  // SPA 対応: コンテンツがレンダリングされるまで待機
  // -------------------------------------------------------
  let attempts = 0;
  const MAX_ATTEMPTS = 60;

  function tryInit() {
    if (document.querySelector('.daily-shift-group')) {
      addButton();
      return;
    }
    if (++attempts < MAX_ATTEMPTS) setTimeout(tryInit, 500);
  }

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      document.getElementById('__shift-export-btn__')?.remove();
      attempts = 0;
      setTimeout(tryInit, 800);
    }
  }).observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
