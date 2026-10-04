# ログ巡回タスク（無人・スケジュール実行）

あなたは `C:\Users\2006m\userscripts` を作業ディレクトリとして、1日1回スケジュール実行される。
**このセッションの間、ユーザーはPCの前にいない。** 確認を待つ質問はできない。最後まで自律的にやり切り、
判断の根拠と結果を最後にまとめて出力すること。

## 対象

`logs/youtube-ad-skip-spacebar/*.jsonl` に溜まっている、ユーザースクリプト
`src/youtube-ad-skip-spacebar.user.js` の実行ログ。各行は1レコードのJSON。

主なレコードの type:
- `survey` — ユーザーへのアンケート結果。`answer` が `ok` なら成功、`stopped`/`not-skipped` は失敗、
  `no-answer` は未回答（timeout）。
- `ad-end` — 広告終了の記録。`endedBy` が `userscript-skip`（スクリプトでスキップ成功）、
  `manual-click`（マウスで直接クリック）、`after-space-without-button`（ボタン無しでスペース押下後に終了）、
  `other`（その他、原因不明）。
- `decision` / `skip-attempt` / `timeline` / `keyup-swallowed` / `key` / `event-method` / `media-method` /
  `media-event` — 診断用の詳細ログ。`survey`/`ad-end` で異常が見つかったときに、同じ `session` の
  前後数秒を見て原因を特定するために使う。

スクリプト本体は `src/youtube-ad-skip-spacebar.user.js` にある。過去の経緯は
git log（特に `debug/ad-skip-click-instrumentation` ブランチ）で追える。

## 絶対に守るルール

- **`main` への push・マージ・チェックアウトは絶対にしない。**
- **PR をマージするのは人間だけ。** あなたは PR を作成・編集するが、マージは絶対にしない（`gh pr merge` 等も使わない）。
- `claude/` で始まるブランチ以外に push しない。作業ブランチは必ず `claude/` 接頭辞で作る。
- `tools/log-monitor/.monitor-state.json` 以外の `tools/` 配下の生成物は作らない。
- **`tm` CLI（`tm install` を含む全サブコマンド）を実行しない。** `tm install` は人間向けのコマンドで、
  実行後にGUIのダイアログが表示されるため、AIが使うべきではない。また、Tampermonkey に登録された
  実運用スクリプトの `@require file:///` を作業ディレクトリの絶対パスに書き換えるため、
  作業用の場所で実行すると実運用の拡張機能が壊れる。動作確認は `node --check` までに留める。
- 例外: デバッグ用スクリプトの Tampermonkey へのインストール・アンインストールは、`tampermonkey-mcp`
  （`mcp__tampermonkey__*`）を使ってよい。

## 手順

1. `git status` を確認する。未コミットの変更がある場合は、それを壊さない（stash せず、そのまま残す）。
   作業は `main` 以外から始め、`debug/ad-skip-click-instrumentation` を基点にする。
2. `tools/log-monitor/.monitor-state.json` を読む（無ければ `{}` として扱う）。
   形は `{"lastProcessedTs": <epoch ms>}`。
3. `logs/youtube-ad-skip-spacebar/*.jsonl` を読み、`ts > lastProcessedTs` の行だけを対象にする。
   対象が0件なら「異常なし」として手順10に進む。
4. 対象レコードの中から、問題を示すものを探す。
   - `survey` で `answer` が `stopped` または `not-skipped`
   - `ad-end` で `endedBy` が `other` のものが目立って多い、または明らかに不自然なパターン
   - その他、ログの中に一見して異常な値（エラーらしき文字列、想定外の type の多発等）
   見つかった問題ごとに、同じ `session` のレコードを前後にたどって、何が起きたかを再構成する。
5. 問題ごとに、**Issue を必ず1件立てる**（原因の確信度に関係なく、問題が見つかったら必ず作る）。
   - 既存の重複確認: `gh issue list --state open` で、同じ症状を扱う open な Issue が既にあるかを確認する。
     あれば新規 Issue は作らず、そのIssueに今回の検出内容（日時・件数・根拠ログ）をコメントで追記する。
     この場合は手順6以降で PR を作る必要はない（修正が既に進行中のPRがあればそれを更新する）。
   - Issue の本文には、検出した問題（該当ログの type・件数・具体的な値）、根拠にしたログの記述、
     原因の推定（確信度を明記する）を書く。
6. 修正方針を決める。確信度は次の2段階で扱う。
   - **かなり高い確信がある**: 最小限の修正を行い、`@version` を上げ、`node --check` で構文確認する。
   - **確信がない**: 仮説の段階でよい。仮説に基づく修正案を PR として作ってよい（人間がレビューして
     マージしない限り、コードは本番に反映されないため）。ただし、その PR の説明文で「未検証の仮説」であることを明記する。
   - 関係のない整理・リファクタはしない。
7. PR を作る場合は、次の規約に従う（修正を伴わない調査結果だけなら PR は作らず、Issue だけでよい）。
   - ブランチ名: `claude/issue-<Issue番号>-<短い英語の説明>`（例: `claude/issue-12-ad-skip-regression`）。
     `#` はブランチ名に含めない。
   - 作業ブランチは `debug/ad-skip-click-instrumentation`（または最新の作業基点）から切る。
   - コミットメッセージの先頭は `ai-auto-fix: ` で始める。
   - コミット本文には次を含める:
     - このコミットが、1日1回の無人スケジュール実行によって、**ユーザーの確認なしに自動的に
       適用されたものであること**を明記する。
     - 対象Issueの番号（`Refs #<番号>`）。
     - 原因の推定と、行った修正の内容。
   - `git commit` の末尾には `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` を付ける。
   - push は `claude/` ブランチへ行う（`git push -u origin <claude/ブランチ名>`）。
   - PR 本文の先頭に `Closes #<Issue番号>` を入れて、Issue と必ず紐付ける。
     PR のタイトルは `ai-auto-fix: <短い説明>` とする。
   - 末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)` を付ける。
8. `tools/log-monitor/.monitor-state.json` を、処理した中で最大の `ts`（対象が0件なら変更不要）で上書きする。
9. `logs/monitor/<今日の日付 YYYY-MM-DD>.md` に、今回の実行記録を書く（無ければ新規作成、同日に
   複数回実行された場合は追記）。内容: 実行時刻、対象件数、見つけた問題、作成/更新した Issue・PR の番号と URL、
   取った行動（修正PR作成/Issue追記のみ/異常なし）。
10. 問題が見つかった場合（Issue を作った・追記した、いずれも含む）は、Slackチャンネル `C0C635QQW85`
    （`mcp__claude_ai_Slack__slack_send_message` を使う）に日本語で要約を送る。内容は、
    何が起きたか・作成した Issue/PR の URL・ユーザーに確認してほしいことがあれば何か、を簡潔に。
    **異常なしの場合はSlackに何も送らない。**

## 最後の出力について

このセッションの最後の発言の **1行目** は、必ず次のいずれかだけにする（これをスクリプトが
機械的に読み取ってデスクトップ通知の要否を決める）。

```
STATUS: ALL_CLEAR
```
または
```
STATUS: PROBLEM_FOUND
```

2行目以降に、人間向けの要約（1〜5行程度）を書く。
