' log-server.js をウィンドウなしで起動する。ログオン時の自動起動(スタートアップ)から呼ばれる想定。
' すでに起動済みならポート衝突で node が終了するだけなので、二重起動しても害はない。
' 標準出力/エラーは logs\log-server.out に残る。
Dim shell, fso, toolsDir, rootDir
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
toolsDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(toolsDir)
shell.CurrentDirectory = rootDir
If Not fso.FolderExists(rootDir & "\logs") Then fso.CreateFolder rootDir & "\logs"
shell.Run "cmd /c node tools\log-server.js >> logs\log-server.out 2>&1", 0, False
