# tools/

ユーザースクリプト本体（`src/`）を開発・運用するための補助ツール置き場。
機能ごとにディレクトリを分けている。詳細は各ディレクトリの README を参照。

- [`log-server/`](log-server/README.md) — ユーザースクリプトの実行ログをローカルに受け取って保存するサーバー。ログオン時に自動起動する。
- [`log-monitor/`](log-monitor/README.md) — `log-server/` が溜めたログを無人で定期巡回し、問題があれば `claude -p` に自動修正させる仕組み。
