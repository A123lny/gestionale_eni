Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Installa dipendenze se mancanti
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists("node_modules") Then
    WshShell.Run "cmd /c npm install", 0, True
End If

' Avvia il print server in background (0 = nascosto)
WshShell.Run "node server.js", 0, False
