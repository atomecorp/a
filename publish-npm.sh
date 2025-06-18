#!/bin/bash

# 🚀 SQUIRREL NPM PUBLISHER
# Script pour publier automatiquement sur NPM

echo "🐿️ Squirrel.js NPM Publisher"
echo "============================"

# Vérifications préliminaires
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found!"
    exit 1
fi

# Configuration
VERSION=$(node -p "require('./package.json').version")
PACKAGE_NAME=$(node -p "require('./package.json').name")

echo "📦 Package: $PACKAGE_NAME"
echo "📦 Version: $VERSION"

# 1. Tests de sécurité
echo "🔒 Running security checks..."
npm audit --audit-level moderate

if [ $? -ne 0 ]; then
    echo "❌ Security vulnerabilities found!"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 2. Build complet
echo "🔨 Building all formats..."
npm run build:all

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# 3. Vérification des fichiers de distribution
echo "📋 Checking distribution files..."
REQUIRED_FILES=(
    "dist/squirrel.esm.js"
    "dist/squirrel.cjs.js"
    "dist/squirrel.umd.js"
    "dist/squirrel.min.js"
    "dist/types/index.d.ts"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Required file missing: $file"
        exit 1
    fi
    echo "✅ $file"
done

# 4. Test d'import local
echo "🧪 Testing local imports..."
node -e "
try {
    const squirrel = require('./dist/squirrel.cjs.js');
    console.log('✅ CommonJS import works');
} catch(e) {
    console.log('❌ CommonJS import failed:', e.message);
    process.exit(1);
}
"

# 5. Vérification des métadonnées NPM
echo "📊 Package info:"
npm pack --dry-run

# 6. Demande de confirmation
echo ""
echo "🚀 Ready to publish to NPM!"
echo "Version: $VERSION"
echo "Registry: $(npm config get registry)"
read -p "Proceed with publication? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Publication cancelled"
    exit 1
fi

# 7. Publication
echo "📤 Publishing to NPM..."
npm publish

if [ $? -eq 0 ]; then
    echo "✅ Successfully published $PACKAGE_NAME@$VERSION"
    echo "🔗 https://www.npmjs.com/package/$PACKAGE_NAME"
    
    # 8. Tag Git
    echo "🏷️ Creating git tag..."
    git tag "v$VERSION"
    git push origin "v$VERSION"
    
    echo "🎉 Publication complete!"
else
    echo "❌ Publication failed!"
    exit 1
fi
