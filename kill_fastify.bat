@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Port sur lequel tourne Fastify
set "FASTIFY_PORT=3031"

REM Flag pour savoir si on a tué quelque chose
set "FOUND=0"

REM Parcours des lignes netstat pour le port en LISTENING
for /f "tokens=5" %%P in (
  'netstat -ano ^| findstr ":%FASTIFY_PORT% " ^| findstr LISTENING'
) do (
  set "FOUND=1"
  echo Arrêt du serveur Fastify sur le port %FASTIFY_PORT% (PID=%%P)…
  taskkill /PID %%P /F >nul 2>&1
)

if "!FOUND!"=="0" (
  echo Aucun process n'écoute sur le port %FASTIFY_PORT%.
)

endlocal