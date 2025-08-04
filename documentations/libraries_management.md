# 📚 Gestion des Librairies Locales

## Vue d'ensemble

Ce système permet d'avoir des librairies JavaScript en local tout en s'assurant d'avoir toujours les dernières versions disponibles.

## 🎯 Librairies Gérées

- **GSAP** (GreenSock Animation Platform) - Animation
- **Tone.js** - Audio/Synthèse/Musique

## 📂 Structure

```
src/js/
├── gsap.min.js           # GSAP Animation Library
├── gsap.min.js.version   # Info version GSAP
├── tone.min.js           # Tone.js Audio Library
├── tone.min.js.version   # Info version Tone.js
└── ...                   # Autres librairies
```

## 🚀 Scripts Disponibles

### 1. Mise à jour automatique (Recommandé)
```bash
npm run update:libs
# ou directement:
./scripts_utils/get_latest_libs.sh
```

**Fonctionnalités :**
- ✅ Récupère automatiquement la VRAIE dernière version depuis NPM
- ✅ Télécharge depuis les CDN officiels
- ✅ Sauvegarde automatique avant mise à jour
- ✅ Vérification d'intégrité des fichiers
- ✅ Rollback automatique en cas d'échec
- ✅ Fichiers `.version` avec métadonnées

### 2. Mise à jour basique
```bash
npm run update:libs:basic
# ou directement:
./scripts_utils/update_libraries.sh
```

**Fonctionnalités :**
- ✅ Versions fixes prédéfinies
- ✅ Plus rapide et fiable
- ✅ Sauvegarde et rollback

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

1. **Modifier `get_latest_libs.sh`** :
```bash
# Ajouter dans le script:
echo -e "${BLUE}🆕 === Ma Nouvelle Lib === ${NC}"
if download_lib_version "nom-package-npm" "ma-lib.min.js" "https://unpkg.com/nom-package-npm@VERSION/dist/ma-lib.min.js"; then
    ((success_count++))
fi
```

2. **Modifier `update_libraries.sh`** pour la version de fallback

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
```

### Fichier corrompu
Les scripts font automatiquement un rollback, mais vous pouvez restaurer manuellement :
```bash
cp src/js/gsap.min.js.backup src/js/gsap.min.js
```

### Permissions d'exécution
```bash
chmod +x scripts_utils/*.sh
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
