#!/bin/bash

# Vérifier si un nom d'application a été fourni
if [ $# -eq 0 ]; then
  echo "Erreur: Veuillez fournir un nom d'application."
  echo "Usage: ./setup.sh nom_application"
  exit 1
fi

APP_NAME=$1

echo "Création de l'application Tauri: $APP_NAME"

# Utiliser create-tauri-app avec le template vanilla pour créer l'application
# L'option --yes permet d'accepter automatiquement les valeurs par défaut
npm create tauri-app@latest $APP_NAME -- --template vanilla --manager npm --yes

# Accéder au répertoire de l'application
cd $APP_NAME

# Lancer le développement
echo "Lancement de l'application en mode développement..."
npm run tauri dev