@echo off
title Servidor de Prueba Compartido
echo [INFO] Iniciando servicio compartido...
echo [INFO] Directorio: %~dp0
echo [INFO] Simulando proceso en segundo plano (presione Ctrl+C para detener o espere)...
timeout /t 5 /nobreak > nul
echo [SUCCESS] Tareas completadas en el servidor compartido.
