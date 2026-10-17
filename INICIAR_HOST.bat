@echo off
title HostShift Launcher
cd /d "%~dp0\hostshift"

echo ====================================================
echo             Iniciando HostShift Desktop...
echo ====================================================
echo.

npm run tauri dev
pause
