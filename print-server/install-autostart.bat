@echo off
title Titanwash - Installa Auto-avvio

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS=%~dp0start-silent.vbs"
set "LINK=%STARTUP%\TitanwashPrintServer.lnk"

echo.
echo  Installazione auto-avvio Print Server Titanwash
echo  ================================================
echo.

:: Crea collegamento nella cartella Startup
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%LINK%'); $s.TargetPath = '%VBS%'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Titanwash Print Server'; $s.Save()"

if exist "%LINK%" (
    echo  OK! Auto-avvio installato.
    echo  Il print server partira automaticamente al prossimo avvio di Windows.
    echo.
    echo  Per rimuovere: cancella il file
    echo  %LINK%
) else (
    echo  ERRORE: impossibile creare il collegamento.
)

echo.
pause
