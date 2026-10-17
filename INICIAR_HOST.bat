@echo off
title HostShift Launcher
setlocal EnableDelayedExpansion

echo ====================================================
echo             Iniciando HostShift Desktop...
echo ====================================================
echo.

:: 1. Buscar si el binario ya esta listo en dist_app o en target
if exist "%~dp0\dist_app\HostShift.exe" (
    set "EXE_PATH=%~dp0\dist_app\HostShift.exe"
    goto :LaunchAndShortcut
)

if exist "%~dp0\hostshift\src-tauri\target\debug\hostshift.exe" (
    set "EXE_PATH=%~dp0\hostshift\src-tauri\target\debug\hostshift.exe"
    goto :LaunchAndShortcut
)

:: 2. Si no esta compilado, verificar si la maquina tiene Rust y Cargo
where cargo >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Compilando la aplicacion para este equipo (solo la primera vez)...
    cd /d "%~dp0\hostshift"
    where npm >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        if not exist "node_modules" (
            echo Instalando dependencias web...
            call npm install
        )
        call npm run build
    )
    call cargo build --manifest-path src-tauri/Cargo.toml
    if exist "%~dp0\hostshift\src-tauri\target\debug\hostshift.exe" (
        if not exist "%~dp0\dist_app" mkdir "%~dp0\dist_app"
        copy /y "%~dp0\hostshift\src-tauri\target\debug\hostshift.exe" "%~dp0\dist_app\HostShift.exe" >nul
        set "EXE_PATH=%~dp0\dist_app\HostShift.exe"
        goto :LaunchAndShortcut
    )
)

:: 3. Si no tiene Rust ni ejecutable compilado
echo [AVISO IMPORTANTE]
echo Este equipo no tiene el ejecutable compilado ni el compilador Rust.
echo.
echo Para abrir HostShift directamente sin compilar:
echo Descarga o copia el archivo 'dist_app\HostShift.exe' desde la maquina principal.
echo.
pause
exit /b 1

:LaunchAndShortcut
:: Crear acceso directo en el Escritorio del usuario si no existe todavia
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\HostShift.lnk"
if not exist "%SHORTCUT_PATH%" (
    echo Creando acceso directo en tu Escritorio...
    powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%EXE_PATH%'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'HostShift Desktop'; $s.Save()" >nul 2>nul
    echo Acceso directo creado en el Escritorio.
)

echo Abriendo HostShift...
start "" "%EXE_PATH%"
exit /b 0
