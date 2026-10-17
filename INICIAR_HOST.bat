@echo off
title HostShift
cd /d "%~dp0\hostshift"

echo ====================================================
echo             Iniciando HostShift Desktop...
echo ====================================================
echo.

npm run tauri dev
pause
