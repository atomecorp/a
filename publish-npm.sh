#!/bin/bash

# 🚀 SQUIRREL NPM PUBLISHER
# Script pour publier automatiquement via NPM + unpkg

echo "🐿️ Squirrel.js NPM Publisher (NPM + unpkg)"
echo "=========================================="

# Configuration
VERSION=$(node -p "require('./package.json').version")
PACKAGE_NAME=$(node -p "require('./package.json').name")
GITHUB_REPO="atomecorp/a"
NPM_URL="https://unpkg.com/$PACKAGE_NAME@$VERSION/dist"
UNPKG_LATEST="https://unpkg.com/$PACKAGE_NAME/dist"

echo "📦 Package: $PACKAGE_NAME"
echo "📊 Version: $VERSION"
echo "🌐 unpkg URL: $NPM_URL"
echo "🔗 GitHub: https://github.com/$GITHUB_REPO"

# Vérification des prérequis
echo "🔍 Checking prerequisites..."

# Vérifier si npm est installé
if ! command -v npm >/dev/null 2>&1; then
    echo "❌ npm is not installed"
    exit 1
fi

# Vérifier si l'utilisateur est connecté à npm
if ! npm whoami >/dev/null 2>&1; then
    echo "❌ Not logged into npm. Please run: npm login"
    exit 1
fi

echo "✅ npm user: $(npm whoami)"

# Vérifier la connectivité npm
echo "🔗 Checking npm registry connectivity..."
if curl -s --head "https://registry.npmjs.org" >/dev/null 2>&1; then
    echo "✅ npm registry is reachable"
else
    echo "❌ npm registry is not reachable"
    exit 1
fi

# Fonction pour nettoyer les imports manquants (réutilisée)
clean_bundle_imports() {
    local bundle_file="src/squirrel/bundle-entry.js"
    
    if [ ! -f "$bundle_file" ]; then
        echo "⚠️ bundle-entry.js not found"
        return 1
    fi
    
    echo "🧹 Cleaning missing imports from bundle-entry.js..."
    
    # Créer une sauvegarde
    cp "$bundle_file" "${bundle_file}.backup"
    
    # Créer un fichier temporaire
    temp_file=$(mktemp)
    
    # Lire ligne par ligne et vérifier les imports
    while IFS= read -r line; do
        if [[ $line =~ from.*components/.* ]]; then
            # Extraire le nom du fichier
            component=$(echo "$line" | sed 's/.*components\///g' | sed 's/\.js.*//g' | sed 's/[";].*//g')
            file_path="src/squirrel/components/${component}.js"
            
            if [ -f "$file_path" ]; then
                echo "$line" >> "$temp_file"
                echo "   ✅ Kept: $component"
            else
                echo "   ❌ Removed: $component (file not found)"
                echo "// REMOVED: $line // File not found" >> "$temp_file"
            fi
        else
            echo "$line" >> "$temp_file"
        fi
    done < "$bundle_file"
    
    # Remplacer le fichier original
    mv "$temp_file" "$bundle_file"
    
    echo "✅ Bundle-entry.js cleaned"
    echo "💾 Backup saved as ${bundle_file}.backup"
}

# 1. Vérification et nettoyage des dépendances
echo "🔍 Checking component dependencies..."
missing_files=()

if [ -f "src/squirrel/bundle-entry.js" ]; then
    echo "   Checking imports in bundle-entry.js..."
    
    # Extraire les imports de composants
    imports=$(grep -o "from.*components/.*\.js" src/squirrel/bundle-entry.js 2>/dev/null | sed 's/from.*components\///g' | sed 's/\.js.*//g')
    
    for component in $imports; do
        file_path="src/squirrel/components/${component}.js"
        if [ ! -f "$file_path" ]; then
            missing_files+=("$component")
            echo "   ❌ Missing: $file_path"
        else
            echo "   ✅ Found: $component"
        fi
    done
    
    if [ ${#missing_files[@]} -gt 0 ]; then
        echo ""
        echo "❌ Missing component files detected:"
        for missing in "${missing_files[@]}"; do
            echo "   - $missing.js"
        done
        echo ""
        read -p "🤔 Auto-clean missing imports? (Y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo "⏹️ Build cancelled - please fix imports manually"
            exit 1
        else
            clean_bundle_imports
        fi
    fi
fi

# 2. Build du package
echo "🔨 Building package..."

npm run build:cdn

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# 3. Vérification des fichiers requis
echo "📋 Checking required files..."

required_files=("dist/squirrel.js" "dist/squirrel.min.js" "package.json")

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Required file missing: $file"
        exit 1
    fi
    echo "   ✅ Found: $file"
done

# 4. Vérification du package.json
echo "🔍 Validating package.json..."

# Vérifier les champs requis
required_fields=("name" "version" "main" "files")
for field in "${required_fields[@]}"; do
    if ! node -p "require('./package.json').$field" >/dev/null 2>&1; then
        echo "❌ Missing field in package.json: $field"
        exit 1
    fi
done

echo "✅ package.json is valid"

# 5. Test du package localement
echo "🧪 Testing package locally..."

# npm pack pour créer un tarball de test
npm pack --dry-run >/dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Package validation failed"
    exit 1
fi

echo "✅ Package validation passed"

# 6. Vérifier si cette version existe déjà
echo "🔍 Checking if version $VERSION already exists..."

if npm view "$PACKAGE_NAME@$VERSION" version >/dev/null 2>&1; then
    echo "❌ Version $VERSION already exists on npm"
    echo "💡 Update version in package.json or run: npm version patch|minor|major"
    exit 1
fi

echo "✅ Version $VERSION is available"

# 7. Publication sur npm
echo "🚀 Publishing to npm..."

read -p "🤔 Publish $PACKAGE_NAME@$VERSION to npm? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "⏹️ Publication cancelled"
    exit 0
fi

# Publication
if npm publish; then
    echo "✅ Successfully published to npm!"
    
    # Attendre un peu qu'unpkg se mette à jour
    echo "⏳ Waiting for unpkg to update (60s)..."
    sleep 60
    
    # Tester la disponibilité sur unpkg
    echo "🧪 Testing unpkg availability..."
    if curl -s --head "$NPM_URL/squirrel.js" >/dev/null 2>&1; then
        echo "✅ unpkg CDN is ready!"
    else
        echo "⚠️ unpkg may need more time to update (try again in 5-10 minutes)"
    fi
else
    echo "❌ Failed to publish to npm"
    exit 1
fi

# 8. Tag Git (optionnel)
echo "🏷️ Creating git tag..."

if [ -d ".git" ]; then
    if ! git tag | grep -q "v$VERSION"; then
        git tag "v$VERSION"
        if git remote | grep -q origin; then
            git push origin "v$VERSION"
            echo "✅ Git tag v$VERSION created and pushed"
        else
            echo "✅ Git tag v$VERSION created (no remote to push)"
        fi
    else
        echo "ℹ️ Git tag v$VERSION already exists"
    fi
else
    echo "ℹ️ Not a git repository, skipping tag creation"
fi

# 9. Mise à jour de la documentation
echo "📝 Updating documentation..."

cat > NPM-CDN-README.md << EOF
# 🐿️ Squirrel.js CDN (via unpkg)

## 📦 Package: $PACKAGE_NAME
## 📊 Version: $VERSION

### Usage basique
\`\`\`html
<script src="$UNPKG_LATEST/squirrel.js"></script>
<script>
  const button = Button({ text: 'Hello' });
  document.body.appendChild(button);
</script>
\`\`\`

### Version minifiée (production)
\`\`\`html
<script src="$UNPKG_LATEST/squirrel.min.js"></script>
\`\`\`

### Version spécifique (recommandée pour production)
\`\`\`html
<script src="$NPM_URL/squirrel.min.js"></script>
\`\`\`

### ESM (modules)
\`\`\`html
<script type="module">
  import { Button } from '$UNPKG_LATEST/squirrel.js';
  const button = Button({ text: 'Hello' });
  document.body.appendChild(button);
</script>
\`\`\`

## 🌐 URLs disponibles
- **Latest**: $UNPKG_LATEST/squirrel.js
- **Current version**: $NPM_URL/squirrel.js
- **Minified**: $UNPKG_LATEST/squirrel.min.js

## 📊 Statistiques
- Taille normale: $(du -h dist/squirrel.js | cut -f1)
- Taille minifiée: $(du -h dist/squirrel.min.js | cut -f1)
- Package npm: https://www.npmjs.com/package/$PACKAGE_NAME
- Dernière publication: $(date)

## 🔄 Cache et versions
- unpkg met en cache pendant 1h
- Pour forcer le rafraîchissement: \`?$(date +%s)\`
- Pour la production, utilisez toujours une version spécifique

## 📦 Installation via npm
\`\`\`bash
npm install $PACKAGE_NAME
\`\`\`

## 🧩 Composants disponibles
- Button
- Slider  
- Matrix
- Table
- List
- Menu
- Draggable
- Unit
- WaveSurfer

EOF

echo "✅ Publication terminée!"
echo ""
echo "🎉 Package publié avec succès!"
echo "📦 npm: https://www.npmjs.com/package/$PACKAGE_NAME"
echo "🌐 unpkg URLs:"
echo "   Latest: $UNPKG_LATEST/squirrel.js"
echo "   Version: $NPM_URL/squirrel.js"
echo "   Minified: $UNPKG_LATEST/squirrel.min.js"
echo ""
echo "📖 Documentation mise à jour dans NPM-CDN-README.md"
echo "💡 Conseil: Testez les URLs unpkg dans quelques minutes"
