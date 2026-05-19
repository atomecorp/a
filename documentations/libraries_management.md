# 📚 Gestion des Librairies Locales

## Vue d'ensemble

Ce système permet d'avoir des librairies JavaScript en local tout en s'assurant d'avoir toujours les dernières versions disponibles.

## 🎯 Librairies Gérées

- **GSAP** (GreenSock Animation Platform) - Animation
- **Tone.js** - Audio/Synthèse/Musique
- **Leaflet** (JS + CSS) - Cartographie interactive
- **Three.js** - Rendu 3D WebGL

## 📂 Structure

```text
src/js/
├── gsap.min.js                     # GSAP Animation Library
├── gsap.min.js.version             # Info version GSAP
├── tone.min.js                     # Tone.js Audio Library
├── tone.min.js.version             # Info version Tone.js
├── leaflet.min.js                  # Leaflet JS
├── leaflet.min.js.version
├── leaflet.min.css                 # Leaflet CSS
├── leaflet.min.css.version
├── three.min.js                    # Three.js module wrapper
├── three.min.js.version
├── three.core.min.js               # Chunk requis par Three.js
├── three.core.min.js.version
└── ...                             # Autres assets éventuels
```

## 🚀 Scripts Disponibles

### 1. Mise à jour automatique (recommandé)

```bash
npm run update:libs
# ou directement
./update_all_libraries.sh --mode latest
```

**Fonctionnalités :**

- ✅ Récupère automatiquement la vraie dernière version depuis NPM
- ✅ Télécharge depuis les CDN officiels (GSAP, Tone, Leaflet, Three.js)
- ✅ Sauvegarde + rollback automatiques en cas de problème
- ✅ Génère des fichiers `.version` pour chaque asset téléchargé
- ✅ Met à jour @tauri-apps/cli et la stack Fastify (désactivables avec `--skip-tauri` / `--skip-fastify`)
- ✅ Réinstalle toutes les dépendances npm via `scripts/install_dependencies.sh`

 ℹ️ Le mode `latest` s'appuie sur `jq`. Installez-le via `brew install jq` (macOS) ou votre gestionnaire de paquets.

 ⏱️ Attendez-vous à une exécution plus longue : la réinstallation complète des dépendances peut prendre plusieurs minutes.

### 2. Mise à jour basique (sans outils serveurs)

```bash
npm run update:libs:basic
# ou directement
./update_all_libraries.sh --mode latest --skip-tauri --skip-fastify
```

**Fonctionnalités :**

- ✅ Télécharge uniquement les librairies front
- ✅ Conserve les sauvegardes/rollback et les fichiers `.version`
- ✅ Idéal quand vous ne souhaitez pas toucher au CLI Tauri ou à Fastify
> ➖ Exemple : `./update_all_libraries.sh --mode latest --skip-tauri --skip-fastify`

### 3. Mode stable (versions validées)

```bash
npm run update:libs:stable
# ou directement
./update_all_libraries.sh --mode stable
```

**Fonctionnalités :**

- ✅ Applique le set de versions épinglées et testées
- ✅ Pratique pour figer les builds de production

> ➖ `./update_all_libraries.sh --mode stable` applique le set stable complet.

## 🔧 Utilisation dans le HTML

Les librairies sont incluses directement dans `index.html` :

```html
<script src="js/gsap.min.js"></script>
<script src="js/tone.min.js"></script>
```

## ⚡ Avantages de cette approche

### ✅ **Performance**

- Pas de requêtes externes
- Chargement instantané
- Pas de dépendance réseau

### ✅ **Fiabilité**

- Fonctionne hors ligne
- Pas de CDN externe qui peut tomber
- Contrôle total des versions

### ✅ **Développement**

- Débogage plus facile
- Versions cohérentes en équipe
- Pas de surprises avec les mises à jour auto

### ✅ **Production**

- Déploiement autonome
- Pas de CORS ou problèmes de sécurité
- Cache navigateur optimal

## 📋 Vérifier les Versions Actuelles

```bash
# Voir les fichiers de version
cat src/js/*.version

# Exemple de contenu:
# package=gsap
# version=3.13.0
# download_date=Mon Aug  4 12:34:56 CEST 2025
# url=https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/gsap.min.js
```

## 🔄 Workflow Recommandé

### Développement quotidien

```bash
# Démarrer le dev
npm run dev
```

### Mise à jour hebdomadaire/mensuelle

```bash
# Mettre à jour les librairies
npm run update:libs

# Tester que tout fonctionne
npm run serve
```

### Avant un déploiement

```bash
# S'assurer d'avoir les dernières versions
npm run update:libs

# Builder le projet
npm run build:all
```

## 🛠️ Ajouter une Nouvelle Librairie

Pour ajouter une nouvelle librairie au système :

1. **Mettre à jour `update_all_libraries.sh`**

   - Dans `run_latest_updates`, utilisez `download_latest_asset` pour récupérer la librairie et créer son fichier `.version`.
   - Dans `run_stable_updates`, ajoutez l'URL épinglée correspondante si vous souhaitez proposer une version fallback.

2. **Intégrer la librairie dans le bundle si nécessaire** (ex. en l'important dans `scripts/bundle.js`).

3. **Ajouter dans `index.html`** :

```html
<script src="js/ma-lib.min.js"></script>
```

## 🚨 Dépannage

### Problème de téléchargement

```bash
# Vérifier la connectivité
curl -I https://registry.npmjs.org/gsap/latest

# Utiliser la version basique en fallback
npm run update:libs:basic
# ou ./update_all_libraries.sh --mode latest --skip-tauri --skip-fastify
```

### Fichier corrompu

Les scripts font automatiquement un rollback, mais vous pouvez restaurer manuellement :

```bash
cp src/js/gsap.min.js.backup src/js/gsap.min.js
```

### Permissions d'exécution

```bash
chmod +x update_all_libraries.sh scripts/*.sh
```

## 📈 Monitoring des Versions

Vous pouvez créer un script pour vérifier si de nouvelles versions sont disponibles :

```bash
# Vérifier sans télécharger
curl -s "https://registry.npmjs.org/gsap/latest" | grep -o '"version":"[^"]*"'
curl -s "https://registry.npmjs.org/tone/latest" | grep -o '"version":"[^"]*"'
```

## 🎯 Best Practices

1. **Testez après chaque mise à jour** - Les nouvelles versions peuvent introduire des breaking changes
2. **Gardez les `.version` files** - Ils permettent le tracking et le debug
3. **Committez les librairies** - Pour la cohérence d'équipe
4. **Mise à jour régulière** - Au moins une fois par mois
5. **Backup avant production** - Toujours tester en staging d'abord
