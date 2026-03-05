@echo off
title Titanwash Print Server
echo.
echo  Avvio Titanwash Print Server...
echo.

cd /d "%~dp0"

:: Controlla se Node.js e installato
node --version >nul 2>&1
if errorlevel 1 (
    echo  ERRORE: Node.js non installato!
    echo  Scarica da: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Installa dipendenze se necessario
if not exist "node_modules" (
    echo  Installazione dipendenze...
    npm install
    echo.
)

:: Avvia il server
node server.js

pause
