#!/bin/bash

# Définir un nom d'application par défaut
DEFAULT_APP_NAME="my_app"

# Vérifier si un nom d'application a été fourni
if [ $# -eq 0 ]; then
  echo "Aucun nom d'application fourni, utilisation du nom par défaut: $DEFAULT_APP_NAME"
  APP_NAME=$DEFAULT_APP_NAME
else
  APP_NAME=$1
fi

echo "Création de l'application Tauri: $APP_NAME"

# Utiliser create-tauri-app avec le template vanilla pour créer l'application
# L'option --yes permet d'accepter automatiquement les valeurs par défaut
npm create tauri-app@latest $APP_NAME -- --template vanilla --manager npm --yes

# Accéder au répertoire de l'application
cd $APP_NAME

# Lancer le développement
echo "Lancement de l'application en mode développement..."
npm run tauri dev