// ユーザースクリプトからのログを受け取り、logs/<スクリプト名>/<日付>.jsonl に追記するローカルサーバー。
// 使い方: node tools/log-server.js  （既定ポート 17321、127.0.0.1 のみで待ち受け）
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.LOG_PORT) || 17321;
const LOG_ROOT = path.resolve(__dirname, '..', 'logs');
const ALLOWED_ORIGINS = new Set(['https://www.youtube.com', 'https://music.youtube.com']);
const MAX_BODY_BYTES = 1024 * 1024;

function localDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function corsHeaders(origin) {
  if (!ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin',
  };
}

const server = http.createServer((req, res) => {
  console.log(new Date().toISOString(), req.method, req.url, 'origin=' + req.headers.origin);
  const headers = corsHeaders(req.headers.origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  const match = /^\/log\/([a-z0-9-]+)$/.exec(req.url || '');
  if (req.method !== 'POST' || !match || !headers['Access-Control-Allow-Origin']) {
    res.writeHead(404, headers);
    res.end();
    return;
  }

  const script = match[1];
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
