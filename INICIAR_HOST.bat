@echo off
setlocal EnableDelayedExpansion
title HostShift - Inicializador con Diagnostico

set "SCRIPT_DIR=%~dp0"
set "LOG_FILE=%SCRIPT_DIR%hostshift_launcher.log"

REM Inicializar archivo de log con fecha y hora
echo ======================================================== > "%LOG_FILE%"
echo  HOSTSHIFT LAUNCHER DIAGNOSTIC LOG >> "%LOG_FILE%"
echo  Fecha: %DATE% - Hora: %TIME% >> "%LOG_FILE%"
echo  Carpeta script: %SCRIPT_DIR% >> "%LOG_FILE%"
echo  Usuario: %USERNAME% >> "%LOG_FILE%"
echo  SO: %OS% >> "%LOG_FILE%"
echo ======================================================== >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo ========================================================
echo           HOSTSHIFT - INICIALIZADOR Y DIAGNOSTICO
echo ========================================================
echo  Generando registro en: hostshift_launcher.log
echo ========================================================
echo.

REM ========================================================
REM  1. Localizar la carpeta raiz y el ejecutable compilado
REM ========================================================
echo [*] Buscando ejecutable autonomo compilado...
echo [*] Buscando ejecutable autonomo compilado... >> "%LOG_FILE%"

set "EXE_PATH="
if exist "%SCRIPT_DIR%bin\HostShift.exe" (
    set "EXE_PATH=%SCRIPT_DIR%bin\HostShift.exe"
) else if exist "%SCRIPT_DIR%hostshift\src-tauri\target\release\hostshift.exe" (
    set "EXE_PATH=%SCRIPT_DIR%hostshift\src-tauri\target\release\hostshift.exe"
) else if exist "%LocalAppData%\Programs\hostshift\hostshift.exe" (
    set "EXE_PATH=%LocalAppData%\Programs\hostshift\hostshift.exe"
) else if exist "%ProgramFiles%\hostshift\hostshift.exe" (
    set "EXE_PATH=%ProgramFiles%\hostshift\hostshift.exe"
) else if exist "%SCRIPT_DIR%hostshift.exe" (
    set "EXE_PATH=%SCRIPT_DIR%hostshift.exe"
) else if exist "%SCRIPT_DIR%HostShift-Instalador.exe" (
    set "EXE_PATH=%SCRIPT_DIR%HostShift-Instalador.exe"
) else if exist "%SCRIPT_DIR%hostshift\src-tauri\target\debug\hostshift.exe" (
    set "EXE_PATH=%SCRIPT_DIR%hostshift\src-tauri\target\debug\hostshift.exe"
) else if exist "%SCRIPT_DIR%..\hostshift\src-tauri\target\release\hostshift.exe" (
    set "EXE_PATH=%SCRIPT_DIR%..\hostshift\src-tauri\target\release\hostshift.exe"
)

REM ========================================================
REM  2. Si existe la version compilada oficial, ejecutarla directamente
REM ========================================================
if not defined EXE_PATH goto :modo_desarrollo
if not exist "!EXE_PATH!" goto :modo_desarrollo

echo [OK] Ejecutable empaquetado detectado:
echo      !EXE_PATH!
echo [OK] Ejecutable detectado: !EXE_PATH! >> "%LOG_FILE%"
echo.

REM Verificacion REAL y certera de WebView2 (sin anidar parentesis peligrosos)
echo [*] Verificando Microsoft Edge WebView2 Runtime...
echo [*] Verificando Microsoft Edge WebView2 Runtime... >> "%LOG_FILE%"
set "TIENE_WV="
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft EdgeWebView" >nul 2>&1
if not errorlevel 1 set "TIENE_WV=1"
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft EdgeWebView" >nul 2>&1
if not errorlevel 1 set "TIENE_WV=1"

set "PF86=%ProgramFiles(x86)%"
if exist "!PF86!\Microsoft\EdgeWebView\Application" set "TIENE_WV=1"
if exist "%ProgramFiles%\Microsoft\EdgeWebView\Application" set "TIENE_WV=1"

if defined TIENE_WV (
    echo [OK] WebView2 Runtime detectado correctamente.
    echo [OK] WebView2 detectado. >> "%LOG_FILE%"
) else (
    echo [AVISO] No se detecto Microsoft Edge WebView2 Runtime.
    echo [AVISO] WebView2 no detectado en el sistema >> "%LOG_FILE%"
    echo HostShift requiere WebView2 para mostrar la interfaz grafica.
    set /p INST_WV="Deseas descargarlo e instalarlo automaticamente ahora? [S/N]: "
    if /i "!INST_WV!"=="S" (
        echo Instalando WebView2 via winget...
        echo [*] Ejecutando winget install WebView2... >> "%LOG_FILE%"
        winget install --id Microsoft.EdgeWebView2Runtime -e --accept-source-agreements --accept-package-agreements >> "%LOG_FILE%" 2>&1
    ) else (
        echo [ERROR] Instalacion de WebView2 cancelada por el usuario. >> "%LOG_FILE%"
        goto :fin_pausa
    )
)

echo [*] Lanzando proceso HostShift...
echo [*] Lanzando proceso: "!EXE_PATH!" >> "%LOG_FILE%"
start "" "!EXE_PATH!"
echo [EXITO] Proceso iniciado correctamente. >> "%LOG_FILE%"
ping -n 2 127.0.0.1 >nul
exit /b 0

REM ========================================================
REM  3. Modo Desarrollo (Fallback si no hay version compilada)
REM ========================================================
:modo_desarrollo
echo.
echo ========================================================
echo  No se encontro version compilada directa.
echo  Iniciando comprobacion de dependencias para modo dev...
echo ========================================================
echo [*] Entrando en modo desarrollo (fallback)... >> "%LOG_FILE%"
echo.

set "APP_DIR=%SCRIPT_DIR%hostshift"
if not exist "%APP_DIR%" (
    if exist "%SCRIPT_DIR%..\hostshift" (
        set "APP_DIR=%SCRIPT_DIR%..\hostshift"
    ) else (
        echo [ERROR] No se encuentra la carpeta 'hostshift'.
        echo [ERROR] No se encuentra la carpeta 'hostshift' en: %APP_DIR% >> "%LOG_FILE%"
        goto :fin_pausa
    )
)

cd /d "%APP_DIR%"
echo [*] Directorio de trabajo: %APP_DIR% >> "%LOG_FILE%"

REM Validar Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [FALTA] Node.js no esta instalado.
    echo [FALTA] Node.js no detectado >> "%LOG_FILE%"
    echo Descargalo de: https://nodejs.org/
    goto :fin_pausa
)
for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] Node.js detectado: %%v >> "%LOG_FILE%"

REM Validar Cargo / Rust (sin parentesis sueltos dentro del bloque)
where cargo >nul 2>&1
if errorlevel 1 (
    echo [FALTA] Rust - cargo no esta instalado.
    echo [FALTA] Rust - cargo no detectado >> "%LOG_FILE%"
    echo Descargalo de: https://rustup.rs/
    goto :fin_pausa
)
for /f "tokens=*" %%v in ('cargo --version 2^>nul') do echo [OK] Rust detectado: %%v >> "%LOG_FILE%"

if not exist "node_modules" (
    echo Instalando paquetes npm...
    echo [*] Ejecutando npm install... >> "%LOG_FILE%"
    call npm install >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        echo [ERROR] Fallo al instalar dependencias npm >> "%LOG_FILE%"
        goto :fin_pausa
    )
)

echo Iniciando HostShift en modo desarrollo...
echo [*] Ejecutando npm run tauri dev... >> "%LOG_FILE%"
call npm run tauri dev >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo [ERROR] npm run tauri dev termino con error >> "%LOG_FILE%"
    goto :fin_pausa
)
exit /b 0

:fin_pausa
echo.
echo ========================================================
echo  Para mas detalles revisa el archivo de diagnostico:
echo  %LOG_FILE%
echo ========================================================
echo.
echo Presiona cualquier tecla para cerrar esta ventana...
pause >nul
exit /b 1
