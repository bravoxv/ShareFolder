@echo off
setlocal EnableDelayedExpansion
title HostShift - Inicializador

REM ========================================================
REM  1. Localizar la carpeta raiz y el ejecutable
REM ========================================================
set "SCRIPT_DIR=%~dp0"

REM Buscar si esta en la misma carpeta o en subcarpetas anidadas
set "EXE_PATH="
if exist "%SCRIPT_DIR%hostshift\src-tauri\target\release\hostshift.exe" (
    set "EXE_PATH=%SCRIPT_DIR%hostshift\src-tauri\target\release\hostshift.exe"
) else if exist "%SCRIPT_DIR%hostshift.exe" (
    set "EXE_PATH=%SCRIPT_DIR%hostshift.exe"
) else if exist "%SCRIPT_DIR%bin\HostShift.exe" (
    set "EXE_PATH=%SCRIPT_DIR%bin\HostShift.exe"
) else if exist "%SCRIPT_DIR%..\hostshift\src-tauri\target\release\hostshift.exe" (
    set "EXE_PATH=%SCRIPT_DIR%..\hostshift\src-tauri\target\release\hostshift.exe"
)

REM ========================================================
REM  2. Si existe la version compilada oficial, ejecutarla directamente
REM     (NO requiere Node.js, npm, Rust ni C++ Build Tools)
REM ========================================================
if defined EXE_PATH (
    if exist "!EXE_PATH!" (
        echo ========================================================
        echo               INICIANDO HOSTSHIFT DESKTOP
        echo ========================================================
        echo  Ejecutable empaquetado detectado:
        echo  !EXE_PATH!
        echo ========================================================
        echo.
        
        REM Verificar que WebView2 este instalado (viene por defecto en Windows 10/11)
        reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-F301-4FA5-B592-83CA793222F8}" /v pv >nul 2>&1
        if errorlevel 1 (
            reg query "HKCU\Software\Microsoft\EdgeUpdate\Clients\{F3017226-F301-4FA5-B592-83CA793222F8}" /v pv >nul 2>&1
            if errorlevel 1 (
                echo [AVISO] Microsoft Edge WebView2 Runtime no se detecto.
                echo HostShift requiere WebView2 para mostrar la interfaz grafica.
                set /p INST_WV="Deseas descargarlo e instalarlo automaticamente ahora? (S/N): "
                if /i "!INST_WV!"=="S" (
                    echo Instalando WebView2 via winget...
                    winget install --id Microsoft.EdgeWebView2Runtime -e --accept-source-agreements --accept-package-agreements
                )
            )
        )
        
        start "" "!EXE_PATH!"
        exit /b 0
    )
)

REM ========================================================
REM  3. Modo Desarrollo (Fallback si no hay version compilada)
REM ========================================================
echo ========================================================
echo  No se encontro version compilada directa.
echo  Iniciando comprobacion de dependencias para modo dev...
echo ========================================================
echo.

set "APP_DIR=%SCRIPT_DIR%hostshift"
if not exist "%APP_DIR%" (
    if exist "%SCRIPT_DIR%..\hostshift" (
        set "APP_DIR=%SCRIPT_DIR%..\hostshift"
    ) else (
        echo [ERROR] No se encuentra la carpeta 'hostshift'.
        echo Asegurate de descomprimir el ZIP completo sin mover este archivo.
        goto :fin_pausa
    )
)

cd /d "%APP_DIR%"

where node >nul 2>&1
if errorlevel 1 (
    echo [FALTA] Node.js no esta instalado.
    echo Descargalo de: https://nodejs.org/
    goto :fin_pausa
)

where cargo >nul 2>&1
if errorlevel 1 (
    echo [FALTA] Rust (cargo) no esta instalado.
    echo Descargalo de: https://rustup.rs/
    goto :fin_pausa
)

if not exist "node_modules" (
    echo Instalando paquetes npm...
    call npm install
    if errorlevel 1 goto :fin_pausa
)

echo Iniciando HostShift en modo desarrollo...
call npm run tauri dev
if errorlevel 1 goto :fin_pausa
exit /b 0

:fin_pausa
echo.
echo Presiona cualquier tecla para cerrar esta ventana...
pause >nul
exit /b 1
