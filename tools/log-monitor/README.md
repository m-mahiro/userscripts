# log-monitor/

`log-server/` が溜めたログを1日1回、無人で `claude -p` に読ませて診断・自動修正させる仕組み。

## ファイル

- `monitor-logs.ps1` — Windowsタスクスケジューラから呼ばれるエントリーポイント。`claude -p` を起動し、結果を受け取ってデスクトップ通知・実行記録の保存を行う。実際の調査手順・修正方針は持たず、起動と後処理だけを担当する。
- `monitor-logs-prompt.md` — `claude -p` に渡す指示書本体。ログの読み方、問題とみなす条件、修正の確信度の基準、コミット規約（`ai-auto-fix:` プレフィックス、`main`へのpush/マージ禁止）、Slack通知の要否などを定義している。
- `.monitor-state.json`（gitignore対象） — 前回処理したログの最終タイムスタンプを覚えておく状態ファイル。マシン固有の実行状態なのでコミットしない。

## 実行タイミング

Windowsタスクスケジューラのタスク `userscripts-log-monitor` が毎日14:00に `monitor-logs.ps1` を実行する（`Get-ScheduledTask -TaskName userscripts-log-monitor` で確認可能）。タスクの実行ファイルパスはリポジトリ外（タスクスケジューラ本体）に登録されているため、`log-monitor/` の場所を変えたときはタスクの `Action` も合わせて更新する必要がある。

## 安全策

- `debug/ad-skip-click-instrumentation` ブランチ以外では作業しない。
- `main` への push・マージは絶対に行わない。
- 修正は「かなり高い確信」が持てる場合のみ。自信が持てない場合はコードを変更せず報告のみ。
- 問題が見つかった場合のみ、デスクトップ通知とSlack（`#userscripts-log-watch`）に通知する。異常なしの場合は静かに終わる。
