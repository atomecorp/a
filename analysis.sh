#!/bin/bash

# Script pour copier les fichiers spécifiés dans le dossier analysis
# À exécuter depuis la racine du projet

echo "Navigation vers le dossier src..."
cd test_app/src

echo "Création du dossier analysis..."
rmdir rm -rf analysis
mkdir -p analysis

echo "Copie des fichiers..."

# Copie de workflow.md
if [ -f "documentations/workflow.md" ]; then
	cp "documentations/workflow.md" "analysis/"
	echo "✓ workflow.md copié"
else
	echo "✗ workflow.md non trouvé"
fi

# Copie de a.js
if [ -f "a/a.js" ]; then
	cp "a/a.js" "analysis/"
	echo "✓ a.js copié"
else
	echo "✗ a.js non trouvé"
fi

# Copie de dimension.js
if [ -f "a/particles/dimension.js" ]; then
	cp "a/particles/dimension.js" "analysis/"
	echo "✓ dimension.js copié"
else
	echo "✗ dimension.js non trouvé"
fi

# Copie de identity.js
if [ -f "a/particles/identity.js" ]; then
	cp "a/particles/identity.js" "analysis/"
	echo "✓ identity.js copié"
else
	echo "✗ identity.js non trouvé"
fi

# Copie de apis.js (a)
if [ -f "a/apis.js" ]; then
	cp "a/apis.js" "analysis/"
	echo "✓ apis.js (a) copié vers utils_a.js"
else
	echo "✗ apis.js (a) non trouvé"
fi

# Copie de index.sqh
if [ -f "application/index.sqh" ]; then
	cp "application/index.sqh" "analysis/"
	echo "✓ index.sqh copié"
else
	echo "✗ index.sqh non trouvé"
fi

# Copie de utils.js (native)
if [ -f "native/utils.js" ]; then
	cp "native/utils.js" "analysis/"
	echo "✓ utils.js (native) copié vers utils.js"
else
	echo "✗ utils.js (native) non trouvé"
fi


# Copie de squirrel_parser.js
if [ -f "squirrel/squirrel_parser.js" ]; then
	cp "squirrel/squirrel_parser.js" "analysis/"
	echo "✓ squirrel_parser.js copié"
else
	echo "✗ squirrel_parser.js non trouvé"
fi

# Copie de hyper_squirrel.js
if [ -f "squirrel/hyper_squirrel.js" ]; then
	cp "squirrel/hyper_squirrel.js" "analysis/"
	echo "✓ hyper_squirrel.js copié"
else
	echo "✗ hyper_squirrel.js non trouvé"
fi

# Copie de squirrel_runner.js
if [ -f "squirrel/squirrel_runner.js" ]; then
	cp "squirrel/squirrel_runner.js" "analysis/"
	echo "✓ squirrel_runner.js copié"
else
	echo "✗ squirrel_runner.js non trouvé"
fi

# Copie de prism-parser.js
if [ -f "squirrel/parser/prism-parser.js" ]; then
	cp "squirrel/parser/prism-parser.js" "analysis/"
	echo "✓ prism-parser.js copié"
else
	echo "✗ prism-parser.js non trouvé"
fi

echo ""
echo "Génération du fichier tree.txt..."

# Génération du tree du dossier src
if command -v tree >/dev/null 2>&1; then
	tree . > "analysis/tree.txt"
	echo "✓ tree.txt généré"
else
	echo "✗ Commande 'tree' non disponible, génération d'une alternative..."
	find . -type f | sort > "analysis/tree.txt"
	echo "✓ Liste des fichiers générée dans tree.txt"
fi

echo ""
echo "Contenu du dossier analysis :"
ls -la analysis/

echo ""
echo "Script terminé !"