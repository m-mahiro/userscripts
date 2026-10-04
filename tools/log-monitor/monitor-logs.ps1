# ユーザースクリプトの実行ログを無人で巡回し、問題があれば claude -p に調査・自動修正させる。
# Windows タスクスケジューラから1日1回呼ばれる想定。
# 実際の調査手順・修正方針・Slack通知の文面は tools/log-monitor/monitor-logs-prompt.md に書いてあり、
# ここでは claude の起動、結果の受け取り、デスクトップ通知、実行記録の保存だけを行う。

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

$promptPath = Join-Path $repoRoot 'tools\log-monitor\monitor-logs-prompt.md'
$prompt = Get-Content -Raw -Encoding utf8 $promptPath

$runLogDir = Join-Path $repoRoot 'logs\monitor'
if (-not (Test-Path $runLogDir)) { New-Item -ItemType Directory -Path $runLogDir -Force | Out-Null }
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$rawOutPath = Join-Path $runLogDir "run_$stamp.json"

$allowedTools = @(
  'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'mcp__claude_ai_Slack__slack_send_message'
) -join ','

try {
  $resultJson = & claude -p $prompt `
    --allowedTools $allowedTools `
    --permission-mode bypassPermissions `
    --output-format json 2>&1
} catch {
  $msg = "monitor-logs.ps1: claude -p の起動自体に失敗しました: $_"
  Add-Content -Path (Join-Path $runLogDir 'errors.log') -Value "$(Get-Date -Format o) $msg"
  # claude 自体が起動できないのは重大なので、原因不明でもデスクトップ通知は出す
  $msg | Out-File -Encoding utf8 (Join-Path $runLogDir "run_${stamp}_launch_failed.txt")
  $resultJson = $null
}

if ($resultJson) {
  $resultJson | Out-File -Encoding utf8 $rawOutPath
}

$statusLine = 'STATUS: UNKNOWN (claude -p 起動失敗、または結果の解析に失敗)'
$summary = ''

if ($resultJson) {
  try {
    $parsed = $resultJson | ConvertFrom-Json
    $resultText = $parsed.result
    $lines = $resultText -split "`r?`n"
    $statusLine = $lines[0]
    $summary = ($lines | Select-Object -Skip 1) -join "`n"
  } catch {
    $summary = "claude -p の出力(JSON)の解析に失敗しました。生の出力: $rawOutPath を確認してください。"
  }
}

function Show-DesktopToast($title, $message) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $texts = $template.GetElementsByTagName('text')
    $texts.Item(0).AppendChild($template.CreateTextNode($title)) | Out-Null
    $texts.Item(1).AppendChild($template.CreateTextNode($message)) | Out-Null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('userscripts log monitor').Show($toast)
  } catch {
    # トースト表示に失敗しても、ログ巡回自体の失敗にはしない
    Add-Content -Path (Join-Path $runLogDir 'errors.log') -Value "$(Get-Date -Format o) toast failed: $_"
  }
}

switch -Wildcard ($statusLine) {
  'STATUS: ALL_CLEAR*' {
    # 正常時は静かに終える。デスクトップ通知・Slackともに出さない(Slackはプロンプト側で送らない判断)。
  }
  'STATUS: PROBLEM_FOUND*' {
    Show-DesktopToast 'userscripts: ログ監視で問題を検出' $summary
  }
  default {
    Show-DesktopToast 'userscripts: ログ監視が異常終了' 'claude -p の実行または結果の解析に失敗しました。logs\monitor\errors.log を確認してください。'
  }
}

$recordPath = Join-Path $runLogDir ((Get-Date -Format 'yyyy-MM-dd') + '_wrapper.log')
Add-Content -Path $recordPath -Value "$(Get-Date -Format o) status=$statusLine raw=$rawOutPath"
