@echo off
setlocal EnableExtensions
title HostShift

REM ---- Configuracion: ajusta el nombre del .exe si tu app se llama distinto ----
set "APP_DIR=%~dp0hostshift"
set "EXE_REL=src-tauri\target\release\hostshift.exe"

if not exist "%APP_DIR%" (
    echo [ERROR] No se encuentra la carpeta: %APP_DIR%
    goto :fin_error
)
cd /d "%APP_DIR%"

REM ---- 1) Si ya hay version compilada, abrirla directamente ----
if exist "%EXE_REL%" (
    echo Abriendo HostShift...
    start "" "%EXE_REL%"
    exit /b 0
)

echo ====================================================
echo  No hay version compilada. Modo desarrollo.
echo  La primera vez puede tardar varios minutos.
echo ====================================================
echo.

REM ---- 2) Verificar que esten instaladas las dependencias ----
where node >nul 2>&1
if errorlevel 1 ( set "FALTA=Node.js LTS - https://nodejs.org" & goto :falta )

where npm >nul 2>&1
if errorlevel 1 ( set "FALTA=npm - viene con Node.js" & goto :falta )

where cargo >nul 2>&1
if errorlevel 1 ( set "FALTA=Rust - https://rustup.rs" & goto :falta )

REM ---- 3) Instalar paquetes de npm la primera vez ----
if not exist "node_modules" (
    echo Instalando dependencias de npm...
    call npm install
    if errorlevel 1 goto :error
)

REM ---- 4) Iniciar la app ----
echo Iniciando HostShift Desktop...
call npm run tauri dev
if errorlevel 1 goto :error
exit /b 0

:falta
echo.
echo [FALTA] Necesitas instalar: %FALTA%
echo En Windows tambien hace falta "Microsoft C++ Build Tools" y WebView2.
echo Guia: https://tauri.app/start/prerequisites/
goto :fin_error

:error
echo.
echo [ERROR] Algo fallo. Revisa los mensajes de arriba.

:fin_error
echo.
pause
exit /b 1
