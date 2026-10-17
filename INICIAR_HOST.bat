@echo off
title HostShift Launcher & Setup
setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo ====================================================
echo             HostShift - Comprobacion de Entorno
echo ====================================================
echo.

:: 1. Comprobar si ya existe el binario precompilado HostShift.exe
if exist "%~dp0dist_app\HostShift.exe" (
    set "EXE_PATH=%~dp0dist_app\HostShift.exe"
    goto :LaunchApp
)

if exist "%~dp0hostshift\src-tauri\target\debug\hostshift.exe" (
    set "EXE_PATH=%~dp0hostshift\src-tauri\target\debug\hostshift.exe"
    goto :LaunchApp
)

:: 2. Si no existe el binario, diagnosticar herramientas de desarrollo
echo [*] No se encontro el ejecutable compilado. Diagnosticando dependencias...
echo.

set "MISSING_DEPS=0"

:: Verificar Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [FALTA] Node.js no esta instalado en este sistema.
    set "MISSING_DEPS=1"
    set "NEED_NODE=1"
) else (
    for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] Node.js detectado (%%v)
)

:: Verificar Rust / Cargo
where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [FALTA] Rust / Cargo no esta instalado en este sistema.
    set "MISSING_DEPS=1"
    set "NEED_RUST=1"
) else (
    for /f "tokens=*" %%v in ('cargo -V 2^>nul') do echo [OK] Rust detectado (%%v)
)

:: Si falta alguna dependencia, preguntar si desea descargarla
if "!MISSING_DEPS!"=="1" (
    echo.
    echo ====================================================
    echo   Se necesitan componentes para compilar HostShift
    echo ====================================================
    echo.
    if "!NEED_NODE!"=="1" echo  - Node.js LTS (para la interfaz web)
    if "!NEED_RUST!"=="1" echo  - Rust & C++ Tools (para compilar la aplicacion nativa)
    echo.
    set /p "CHOICE=Deseas abrir la pagina para descargar los instaladores ahora? (S/N): "
    if /i "!CHOICE!"=="S" (
        if "!NEED_NODE!"=="1" (
            echo Abriendo instalador de Node.js...
            start https://nodejs.org/
        )
        if "!NEED_RUST!"=="1" (
            echo Abriendo instalador de Rust...
            start https://www.rust-lang.org/tools/install
        )
        echo.
        echo Una vez instalados, cierra esta ventana y vuelve a ejecutar INICIAR_HOST.bat.
    ) else (
        echo.
        echo [INFO] Para jugar sin instalar Node.js ni Rust:
        echo Copia el archivo 'HostShift.exe' desde la computadora principal a la carpeta 'dist_app\'.
    )
    echo.
    pause
    exit /b 1
)

:: 3. Si tiene Node.js y Rust, compilar
echo.
echo [*] Todas las herramientas estan presentes. Preparando HostShift...
cd /d "%~dp0hostshift"

if not exist "node_modules" (
    echo [*] Instalando dependencias de HostShift...
    call npm install
)

echo [*] Compilando interfaz web...
call npm run build

echo [*] Compilando backend nativo en Rust...
call cargo build --manifest-path src-tauri/Cargo.toml

if exist "%~dp0hostshift\src-tauri\target\debug\hostshift.exe" (
    if not exist "%~dp0dist_app" mkdir "%~dp0dist_app"
    copy /y "%~dp0hostshift\src-tauri\target\debug\hostshift.exe" "%~dp0dist_app\HostShift.exe" >nul
    set "EXE_PATH=%~dp0dist_app\HostShift.exe"
    goto :LaunchApp
) else (
    echo.
    echo [ERROR] Falla durante la compilacion de HostShift.
    pause
    exit /b 1
)

:LaunchApp
:: Intentar crear acceso directo en el Escritorio usando VBScript nativo (100% rapido y sin bloqueos de PowerShell)
set "DESKTOP_DIR=%USERPROFILE%\Desktop"
if exist "%DESKTOP_DIR%" (
    if not exist "%DESKTOP_DIR%\HostShift.lnk" (
        (
            echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
            echo sLinkFile = "%DESKTOP_DIR%\HostShift.lnk"
            echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
            echo oLink.TargetPath = "%EXE_PATH%"
            echo oLink.WorkingDirectory = "%~dp0"
            echo oLink.Description = "HostShift Desktop"
            echo oLink.Save
        ) > "%TEMP%\create_hs_shortcut.vbs"
        cscript //nologo "%TEMP%\create_hs_shortcut.vbs" >nul 2>nul
        del "%TEMP%\create_hs_shortcut.vbs" >nul 2>nul
    )
)

echo.
echo ====================================================
echo        Iniciando HostShift Desktop...
echo ====================================================
echo.
start "" "%EXE_PATH%"
timeout /t 2 >nul
exit /b 0
