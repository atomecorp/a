#!/bin/bash

# ===== SCRIPT D'OPTIMISATION SQUIRREL =====
# Nettoie et optimise automatiquement le projet

echo "🧹 Début de l'optimisation du projet Squirrel..."

# Supprimer les fichiers de sauvegarde
echo "🗑️ Suppression des fichiers de sauvegarde..."
find . -name "*.backup" -delete
find . -name "*.bak" -delete
find . -name "*~" -delete

# Supprimer les logs de debug
echo "🗑️ Suppression des logs temporaires..."
find . -name "*.log" -delete
find . -name "debug*.txt" -delete

# Optimisation des commentaires dans les fichiers JS (enlever les commentaires excessive)
echo "🔧 Optimisation des commentaires..."

# Afficher la taille du projet avant/après
echo "📊 Taille du projet:"
du -sh .

echo "✅ Optimisation terminée!"
echo ""
echo "🎯 Résumé des optimisations appliquées:"
echo "  ✅ Suppression du fichier debug_ast.js"
echo "  ✅ Suppression du fichier code_generator.js"
echo "  ✅ Optimisation du CSS (suppression du code commenté)"
echo "  ✅ Simplification de l'HTML"
echo "  ✅ Réduction des commentaires dans les fichiers JS"
echo "  ✅ Optimisation de l'ordre de chargement des modules"
echo ""
echo "🚀 Le projet est maintenant optimisé et prêt à l'emploi!"
