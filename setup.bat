@echo off
setlocal

REM Vérifier si un nom d'application a été fourni
if "%~1"=="" (
  echo Erreur: Veuillez fournir un nom d'application.
  echo Usage: setup.bat nom_application
  exit /b 1
)

set APP_NAME=%1

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