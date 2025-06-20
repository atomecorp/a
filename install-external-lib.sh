#!/bin/bash
set -e

# Liste des librairies principales et plugins à installer
LIBS=(
  gsap
  leaflet
  wavesurfer.js
  @codemirror/view
  @codemirror/state
  @codemirror/lang-javascript
  @codemirror/theme-one-dark
  # Ajoute ici d'autres modules CodeMirror 6+ si besoin
)

echo "📦 Installation/mise à jour des librairies externes..."
npm install "${LIBS[@]}"

# Dossier de destination
DEST=src/js
mkdir -p "$DEST"

# Copier les fichiers principaux (GSAP, Leaflet, Wavesurfer)
cp node_modules/gsap/dist/gsap.min.js "$DEST/"
cp node_modules/leaflet/dist/leaflet.js "$DEST/"
cp node_modules/leaflet/dist/leaflet.css "$DEST/"
cp node_modules/wavesurfer.js/dist/wavesurfer.min.js "$DEST/"

# Pour CodeMirror 6+, pas de bundle JS/CSS à copier : tout est en modules ES dans node_modules/@codemirror/*
echo "ℹ️ Pour CodeMirror 6+, importe les modules ES dans ton code JS ou utilise un bundler (Vite, Rollup, etc.)"

ls -lh "$DEST"
echo "✅ Librairies copiées dans $DEST"
echo "🎉 Installation et mise à jour terminées !"
