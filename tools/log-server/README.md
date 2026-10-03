# log-server/

ユーザースクリプトからの実行ログを受け取り、`logs/<スクリプト名>/<日付>.jsonl` に追記するローカルHTTPサーバー。

## ファイル

- `log-server.js` — サーバー本体。`node tools/log-server/log-server.js` で起動（既定ポート17321、`127.0.0.1`のみ待ち受け）。新しいユーザースクリプトを追加してもこのファイルの変更・再起動は不要（送信元の許可は各スクリプトの `@match` から自動判定する）。
- `start-log-server.vbs` — `log-server.js` をコンソールウィンドウなしで起動するランチャー。Windowsログオン時の自動起動（スタートアップフォルダのショートカット）から呼ばれる想定。

## 自動起動の仕組み

`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\userscripts-log-server.lnk` というショートカットが `wscript.exe start-log-server.vbs` を実行する。このショートカットはリポジトリ外（OSのスタートアップフォルダ）にあるため、`log-server/` の場所を変えたときはショートカットの参照先も合わせて更新する必要がある。

動作確認: `netstat` やブラウザの開発者ツールで `http://127.0.0.1:17321` への接続有無を見るか、`Get-NetTCPConnection -LocalPort 17321` で確認できる。
