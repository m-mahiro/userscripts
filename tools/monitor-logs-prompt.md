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

## 手順

1. `git status` を確認し、現在のブランチが `debug/ad-skip-click-instrumentation` でなければ
   `git checkout debug/ad-skip-click-instrumentation` する（このブランチ以外では絶対に作業しない）。
2. `tools/.monitor-state.json` を読む（無ければ `{}` として扱う）。
   形は `{"lastProcessedTs": <epoch ms>}`。
3. `logs/youtube-ad-skip-spacebar/*.jsonl` を読み、`ts > lastProcessedTs` の行だけを対象にする。
   対象が0件なら「異常なし」として手順7に進む。
4. 対象レコードの中から、問題を示すものを探す。
   - `survey` で `answer` が `stopped` または `not-skipped`
   - `ad-end` で `endedBy` が `other` のものが目立って多い、または明らかに不自然なパターン
   - その他、ログの中に一見して異常な値（エラーらしき文字列、想定外の type の多発等）
   見つかった問題ごとに、同じ `session` のレコードを前後にたどって、何が起きたかを再構成する。
5. 原因をかなり高い確信を持って特定でき、かつ `src/youtube-ad-skip-spacebar.user.js`（または
   `tools/` 配下の関連ファイル）の変更で直せると判断した場合に限り、修正を行う。
   - 修正は最小限にする。関係のない整理・リファクタはしない。
   - `@version` を上げる。
   - `node --check src/youtube-ad-skip-spacebar.user.js` で構文を確認する。
   - 自信が持てない場合は、**絶対にコードを変更しない**。報告だけに留める。
     （原因候補が複数あって絞り込めない、再現パターンが1件しかなく偶然の可能性がある、等は
     「自信が持てない」に該当する。）
6. 修正した場合は、**次の形式で**コミットする。
   - コミットメッセージの先頭は `ai-auto-fix: ` で始める。
   - 本文に次を含める:
     - このコミットが、1日1回の無人スケジュール実行によって、**ユーザーの確認なしに自動的に
       適用されたものであること**を明記する。
     - 検出した問題（該当ログの type・件数・具体的な値）。
     - 原因の推定（根拠にしたログの記述を添える）。
     - 行った修正の内容。
   - `git commit` の末尾には、通常のアトリビューション行（`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 等、
     このリポジトリでの通常の規約）も付ける。
   - **`git push` は絶対にしない。`main` へのマージ・切り替えも絶対にしない。**
     コミットは `debug/ad-skip-click-instrumentation` に積むだけ。
7. `tools/.monitor-state.json` を、処理した中で最大の `ts`（対象が0件なら変更不要）で上書きする。
8. `logs/monitor/<今日の日付 YYYY-MM-DD>.md` に、今回の実行記録を書く（無ければ新規作成、同日に
   複数回実行された場合は追記）。内容: 実行時刻、対象件数、見つけた問題、取った行動（修正した/
   報告のみ/異常なし）、コミットした場合はコミットハッシュ。
9. 問題が見つかった場合（修正した・報告のみ、いずれも含む）は、Slackチャンネル `C0C635QQW85`
   （`mcp__claude_ai_Slack__slack_send_message` を使う）に日本語で要約を送る。内容は、
   何が起きたか・自動修正したかどうか（した場合はコミットハッシュ）・ユーザーに確認してほしい
   ことがあれば何か、を簡潔に。**異常なしの場合はSlackに何も送らない。**

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
