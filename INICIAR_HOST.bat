@echo off
title HostShift Launcher
cd /d "%~dp0\hostshift"

echo ====================================================
echo             Iniciando HostShift Desktop...
echo ====================================================
echo.

:: 1. Si existe el binario compilado directo, ejecutarlo directamente (no requiere node/npm/rust)
if exist "%~dp0\hostshift\src-tauri\target\debug\hostshift.exe" (
    echo Iniciando binario de aplicacion de escritorio...
    start "" "%~dp0\hostshift\src-tauri\target\debug\hostshift.exe"
    exit /b 0
)

:: 2. Si no existe el binario compilado, verificar si Node.js y npm estan instalados
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR CRITICO]
    echo No se encontro 'npm' ni 'node' en este equipo, y no se encontro el binario compilado.
    echo Para ejecutar HostShift en modo desarrollo necesitas instalar Node.js:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 3. Verificar si existen los modulos instalados
if not exist "node_modules" (
    echo Instalando dependencias de HostShift...
    call npm install
)

echo Iniciando entorno de desarrollo de Tauri...
call npm run tauri dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] La aplicacion se cerro con codigo de error %ERRORLEVEL%.
    echo Revisa si tienes Rust instalado o ejecuta 'npm install' manualmente.
    pause
)
