// ユーザースクリプトからのログを受け取り、logs/<スクリプト名>/<日付>.jsonl に追記するローカルサーバー。
// 使い方: node tools/log-server.js  （既定ポート 17321、127.0.0.1 のみで待ち受け）
//
// - 受け付けるのは POST /log/<スクリプト名>。<スクリプト名> は src/<スクリプト名>.user.js が存在するものだけ。
// - アクセス元(Origin)は、そのスクリプトの @match から決める。他のサイトからの書き込みは拒否する。
// - スクリプトを追加しても、このサーバーの変更は不要（再起動も不要）。
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.LOG_PORT) || 17321;
const ROOT = path.resolve(__dirname, '..');
const LOG_ROOT = path.join(ROOT, 'logs');
const SRC_DIR = path.join(ROOT, 'src');
const MAX_BODY_BYTES = 1024 * 1024;

function localDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "https://*.example.com/*" のような @match を、Origin("https://a.example.com") と照合できる正規表現にする
function matchPatternToOriginRegex(pattern) {
  const m = /^(\*|https?):\/\/(\*|\*\.[^/*]+|[^/*]+)(?::\d+)?\//.exec(pattern);
  if (!m) return null;
  const scheme = m[1] === '*' ? 'https?' : m[1];
  const host = m[2] === '*' ? '[^/]+' : m[2].startsWith('*.') ? '(?:[^/]+\\.)?' + escapeRegex(m[2].slice(2)) : escapeRegex(m[2]);
  return new RegExp(`^${scheme}://${host}(?::\\d+)?$`);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function allowedOriginRegexes(script) {
  let source;
  try {
    source = fs.readFileSync(path.join(SRC_DIR, `${script}.user.js`), 'utf8');
  } catch {
    return null;
  }
  return [...source.matchAll(/^\/\/\s*@(?:match|include)\s+(\S+)/gm)].map((m) => matchPatternToOriginRegex(m[1])).filter(Boolean);
}

function corsHeaders(origin, regexes) {
  if (!origin || !regexes || !regexes.some((re) => re.test(origin))) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin',
  };
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  console.log(new Date().toISOString(), req.method, req.url, 'origin=' + origin);

  const match = /^\/log\/([a-z0-9-]+)$/.exec(req.url || '');
  const script = match && match[1];
  const headers = script ? corsHeaders(origin, allowedOriginRegexes(script)) : null;

  if (!headers || (req.method !== 'POST' && req.method !== 'OPTIONS')) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      res.writeHead(413, headers);
      res.end();
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    let records;
    try {
      records = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(records)) records = [records];
    } catch {
      res.writeHead(400, headers);
      res.end();
      return;
    }
    const dir = path.join(LOG_ROOT, script);
    fs.mkdirSync(dir, { recursive: true });
    const lines = records.map((r) => JSON.stringify(r) + '\n').join('');
    fs.appendFile(path.join(dir, `${localDate(Date.now())}.jsonl`), lines, (err) => {
      res.writeHead(err ? 500 : 204, headers);
      res.end();
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`log-server listening on http://127.0.0.1:${PORT}  ->  ${LOG_ROOT}`);
});
