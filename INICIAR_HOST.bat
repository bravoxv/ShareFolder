@echo off
setlocal EnableDelayedExpansion
title HostShift - Inicializador y Verificador de Entorno

set "APP_DIR=%~dp0hostshift"

if not exist "%APP_DIR%" (
    echo ========================================================
    echo  [ERROR CRITICO]
    echo  No se encuentra la carpeta 'hostshift' en:
    echo  %APP_DIR%
    echo ========================================================
    echo.
    echo Asegurate de descomprimir o clonar el repositorio completo.
    goto :fin_pausa
)

cd /d "%APP_DIR%"

echo ========================================================
echo               HOSTSHIFT - VERIFICADOR DE ENTORNO
echo ========================================================
echo  Verificando que tu sistema cumpla todos los requisitos...
echo ========================================================
echo.

REM ---- 1. Verificar WebView2 Runtime ----
echo [1/5] Verificando Microsoft Edge WebView2 Runtime...
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-F301-4FA5-B592-83CA793222F8}" /v pv >nul 2>&1
if not errorlevel 1 goto :ok_webview
reg query "HKCU\Software\Microsoft\EdgeUpdate\Clients\{F3017226-F301-4FA5-B592-83CA793222F8}" /v pv >nul 2>&1
if not errorlevel 1 goto :ok_webview

echo [AVISO] WebView2 Runtime no se detecto en el registro.
set /p INST_WV="Deseas descargarlo e instalarlo ahora automaticamente? (S/N): "
if /i "!INST_WV!"=="S" (
    echo Descargando e instalando WebView2...
    winget install --id Microsoft.EdgeWebView2Runtime -e --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo [ERROR] No se pudo instalar WebView2 automaticamente.
        echo Por favor descargalo manualmente desde:
        echo https://developer.microsoft.com/en-us/microsoft-edge/webview2/
        goto :fin_pausa
    )
) else (
    echo Debes contar con WebView2 para ver la interfaz grafica.
    goto :fin_pausa
)

:ok_webview
echo       [OK] WebView2 Runtime detectado.
echo.

REM ---- 2. Verificar Node.js y npm ----
echo [2/5] Verificando Node.js y npm...
where node >nul 2>&1
if errorlevel 1 (
    echo [FALTA] Node.js no esta instalado o no esta en el PATH.
    set /p INST_NODE="Deseas descargar e instalar Node.js LTS ahora? (S/N): "
    if /i "!INST_NODE!"=="S" (
        echo Instalando Node.js LTS via winget...
        winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
        echo.
        echo ========================================================
        echo  Node.js instalado. Windows requiere reiniciar la terminal
        echo  para actualizar el PATH. Por favor, cierra esta ventana
        echo  y vuelve a hacer doble clic en INICIAR_HOST.bat
        echo ========================================================
        goto :fin_pausa
    ) else (
        echo Node.js es requerido. Descargalo de: https://nodejs.org/
        goto :fin_pausa
    )
)
for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo       [OK] Node.js detectado (!NODE_VER!)
echo.

REM ---- 3. Verificar Rust / Cargo ----
echo [3/5] Verificando compilador Rust y Cargo...
where cargo >nul 2>&1
if errorlevel 1 (
    echo [FALTA] Rust (cargo) no esta instalado o no esta en el PATH.
    set /p INST_RUST="Deseas descargar e instalar Rust (Rustup) ahora? (S/N): "
    if /i "!INST_RUST!"=="S" (
        echo Instalando Rust via winget...
        winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
        echo.
        echo ========================================================
        echo  Rustup instalado. Windows requiere reiniciar la terminal
        echo  para reconocer el comando cargo. Por favor, cierra esta
        echo  ventana y vuelve a hacer doble clic en INICIAR_HOST.bat
        echo ========================================================
        goto :fin_pausa
    ) else (
        echo Rust es requerido para Tauri. Descargalo de: https://rustup.rs/
        goto :fin_pausa
    )
)
for /f "tokens=*" %%v in ('cargo --version 2^>nul') do set "CARGO_VER=%%v"
echo       [OK] Rust detectado (!CARGO_VER!)
echo.

REM ---- 4. Verificar e instalar dependencias npm ----
echo [4/5] Verificando dependencias de Node (node_modules)...
if not exist "node_modules" (
    echo       Instalando paquetes npm (esto se hace solo la primera vez)...
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Fallo la instalacion de paquetes npm.
        goto :fin_pausa
    )
) else (
    echo       [OK] Dependencias instaladas.
)
echo.

REM ---- 5. Iniciar la aplicacion Tauri ----
echo [5/5] Iniciando HostShift Desktop...
echo ========================================================
echo  Si es la primera vez que compila en esta PC, Rust
echo  tardara unos minutos en preparar los binarios.
echo ========================================================
echo.

call npm run tauri dev
if errorlevel 1 (
    echo.
    echo ========================================================
    echo  [ERROR] La aplicacion se detuvo con errores.
    echo  Revisa los mensajes anteriores para ver el motivo.
    echo ========================================================
    goto :fin_pausa
)

exit /b 0

:fin_pausa
echo.
echo Presiona cualquier tecla para salir...
pause >nul
exit /b 1
