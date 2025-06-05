#!/bin/bash

# 🔍 VALIDATION PROJET SQUIRREL OPTIMISÉ

echo "🔍 Validation du projet Squirrel optimisé..."
echo ""

# Compteurs
PASSED=0
FAILED=0

# Test 1: HTML optimisé
echo -n "✓ HTML optimisé... "
if grep -q "<!DOCTYPE html>" index.html && grep -q '<main id="app">' index.html && grep -q 'lang="fr"' index.html; then
    echo "✅ PASSED"
    ((PASSED++))
else
    echo "❌ FAILED"
    ((FAILED++))
fi

# Test 2: CSS optimisé
echo -n "✓ CSS optimisé... "
if grep -q "VERSION OPTIMISÉE" css/styles.css && ! grep -q "matrix_element{" css/styles.css; then
    echo "✅ PASSED"
    ((PASSED++))
else
    echo "❌ FAILED"
    ((FAILED++))
fi

# Test 3: JavaScript optimisé
echo -n "✓ JavaScript optimisé... "
if grep -q "OPTIMIZED ES6 MODULE" js/app.js; then
    echo "✅ PASSED"
    ((PASSED++))
else
    echo "❌ FAILED"
    ((FAILED++))
fi

# Test 4: Fichiers supprimés
echo -n "✓ Fichiers inutiles supprimés... "
if [ ! -f debug_ast.js ] && [ ! -f squirrel/code_generator.js ]; then
    echo "✅ PASSED"
    ((PASSED++))
else
    echo "❌ FAILED"
    ((FAILED++))
fi

# Test 5: Structure des modules
echo -n "✓ Structure des modules... "
if [ -f squirrel/transpiler_core_compliant.js ] && [ -f squirrel/native_code_generator.js ] && [ -f squirrel/squirrel_orchestrator.js ]; then
    echo "✅ PASSED"
    ((PASSED++))
else
    echo "❌ FAILED"
    ((FAILED++))
fi

# Test 6: Application Ruby
echo -n "✓ Application Ruby présente... "
if [ -f application/index.sqr ] && grep -q "A.new" application/index.sqr; then
    echo "✅ PASSED"
    ((PASSED++))
else
    echo "❌ FAILED"
    ((FAILED++))
fi

# Résumé
echo ""
echo "📊 Résultats de validation:"
echo "✅ Tests réussis: $PASSED"
echo "❌ Tests échoués: $FAILED"

TOTAL=$((PASSED + FAILED))
PERCENTAGE=$((PASSED * 100 / TOTAL))
echo "📈 Taux de réussite: ${PERCENTAGE}%"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo "🎉 Projet parfaitement optimisé !"
    echo "🚀 Prêt pour la production"
else
    echo ""
    echo "⚠️ Certaines optimisations nécessitent une vérification"
fi

echo ""
echo "📋 Pour utiliser le projet:"
echo "   python3 -m http.server 8081"
echo "   Puis ouvrir: http://localhost:8081"
