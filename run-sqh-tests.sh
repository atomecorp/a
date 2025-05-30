#!/bin/bash

echo "🚀 Système de tests SQH - Lanceur principal complet v4.3 (test_app)"
echo "=================================================================="

# Vérifications environnement ADAPTÉES
if [ ! -d "tests" ]; then
    echo "❌ Répertoire tests manquant dans test_app"
    echo "   Structure attendue:"
    echo "   test_app/tests/      # Tests (ce répertoire manque)"
    echo "   test_app/src/        # Sources SQH"
    echo "   Lancez d'abord le script d'installation"
    exit 1
fi

if [ ! -d "src" ]; then
    echo "❌ Répertoire src manquant dans test_app"
    echo "   Structure attendue:"
    echo "   test_app/tests/      # Tests"
    echo "   test_app/src/        # Sources SQH (ce répertoire manque)"
    exit 1
fi

if [ ! -f "tests/core/setup.js" ]; then
    echo "❌ Installation incomplète"
    echo "   Relancez le script d'installation pour réinstaller"
    exit 1
fi

# Navigation vers tests
cd "$(dirname "$0")/tests"

# Affichage informations système ADAPTÉES
echo "📍 test_app: $(cd .. && pwd)"
echo "📍 Sources: $(cd ../src && pwd)"
echo "📍 Tests: $(pwd)"
echo "🔧 Node.js: $(node --version 2>/dev/null || echo 'Non trouvé')"
echo "📦 Tests disponibles: $(find suites -name "*.test.js" 2>/dev/null | wc -l)"
echo ""

# Délégation au lanceur de tests
./launch-tests.sh "$@"
