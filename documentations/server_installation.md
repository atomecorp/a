# Installation Serveur (Standalone)

Ce guide explique comment installer et lancer le serveur **Atome** sur une machine Linux (Debian/Ubuntu recommandé) ou macOS, sans l'interface graphique (Tauri).

## Prérequis

* **Git** installé (`sudo apt install git` ou `brew install git`)
* **Accès Internet** (pour télécharger Node.js, PostgreSQL, et les librairies)
* *(Optionnel)* Un nom de domaine pointant vers le serveur pour le HTTPS (ex: `atome.one`)

## Installation Rapide

Exécutez simplement ces commandes :

```bash
# 1. Récupérer le code
git clone https://github.com/atomecorp/a
cd a

# 2. Lancer le script d'installation automatisé
# Ce script va :
# - Installer Node.js et les dépendances
# - Installer et configurer PostgreSQL (création user/db)
# - Télécharger les librairies frontend (Tone.js, Leaflet, etc.)
# - Proposer de configurer le HTTPS (Let's Encrypt)
./install_server.sh
```

## Lancement du Serveur

Une fois l'installation terminée, lancez le serveur avec :

```bash
./run_server.sh
```

Le serveur sera accessible sur :

* **HTTP** : `http://votre-ip:3001`
* **HTTPS** : `https://votre-domaine:3001` (si configuré)

## Détails techniques

### Ce que fait `install_server.sh`

* Vérifie et installe les dépendances système (psql, etc.).
* Configure automatiquement la base de données `squirrel` avec l'utilisateur `postgres`.
* Appelle `install_update_all_libraries.sh` pour récupérer les assets JS/CSS.
* Détecte si vous êtes sur Linux pour proposer la génération de certificats SSL via Certbot.

### Ce que fait `run_server.sh`

* Charge les variables d'environnement (`.env`).
* Détecte les certificats SSL (Production ou Auto-signés).
* Lance le serveur Fastify (`server/server.js`).

## Mise à jour

Pour mettre à jour le serveur plus tard :

```bash
git pull
./install_server.sh
```
