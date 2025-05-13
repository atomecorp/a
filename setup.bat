@echo off
setlocal

REM Définir un nom d'application par défaut
set DEFAULT_APP_NAME=my_app

REM Vérifier si un nom d'application a été fourni
if "%~1"=="" (
  echo Aucun nom d'application fourni, utilisation du nom par défaut: %DEFAULT_APP_NAME%
  set APP_NAME=%DEFAULT_APP_NAME%
) else (
  set APP_NAME=%1
)

echo Création de l'application Tauri: %APP_NAME%

REM Utiliser create-tauri-app avec le template vanilla pour créer l'application
REM L'option --yes permet d'accepter automatiquement les valeurs par défaut
call npm create tauri-app@latest %APP_NAME% -- --template vanilla --manager npm --yes

REM Accéder au répertoire de l'application
cd %APP_NAME%

REM Lancer le développement
echo Lancement de l'application en mode développement...
call npm run tauri dev

endlocal