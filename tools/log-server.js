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

// "https://*.example.com/*" のような @match を、Origin("https://a.example.com") と照合できる正規表現にする。
// パス部分は見ない(Originにパスは含まれないため)。マッチしない pattern (正規表現化できない特殊な形式)は null を返し、
// 呼び出し側の filter(Boolean) で単純に無視される。
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

// src/<script>.user.js が存在しない script に対しては null を返す。これが「未知のスクリプト名は404」の根拠になる。
function allowedOriginRegexes(script) {
  let source;
  try {
    source = fs.readFileSync(path.join(SRC_DIR, `${script}.user.js`), 'utf8');
  } catch {
    return null;
  }
  return [...source.matchAll(/^\/\/\s*@(?:match|include)\s+(\S+)/gm)].map((m) => matchPatternToOriginRegex(m[1])).filter(Boolean);
}

// 許可できないリクエストは null を返す。呼び出し側はこれを「404にする」判定に使う
// (ヘッダを付けて拒否するとOriginの存在を教えてしまうため、素っ気なく404にする)。
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

  // URL形式・スクリプトの実在・Origin の3つをまとめて検証する。どれか1つでも通らなければ headers が null になり、
  // 下のガード節でまとめて404にする(ブラウザの preflight にも素っ気なく404を返すだけでよい)。
  const match = /^\/log\/([a-z0-9-]+)$/.exec(req.url || '');
  const script = match && match[1];
  const headers = script ? corsHeaders(origin, allowedOriginRegexes(script)) : null;

  if (!headers || (req.method !== 'POST' && req.method !== 'OPTIONS')) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (req.method === 'OPTIONS') {
    // CORS preflight。実データは持たないので、許可ヘッダだけ返して終わる。
    res.writeHead(204, headers);
    res.end();
    return;
  }

  // ここから先は POST の本体(ログ本体)を受け取る処理。チャンク到着のたびにサイズを見て、
  // 上限(1MB)を超えたら即座に打ち切る(メモリに溜め込みすぎない・巨大な誤送信を弾く)。
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
      // 1件のオブジェクトでも配列でも受け付ける(ユーザースクリプト側がバッファして複数件まとめて送るため)。
      records = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(records)) records = [records];
    } catch {
      res.writeHead(400, headers);
      res.end();
      return;
    }
    // 日付ごとにファイルを分けるのは、1ファイルが無限に太らないようにするため。
    // ファイル名は「保存した時点のサーバー日時」で決まる(レコード自体の ts は見ない)。
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
