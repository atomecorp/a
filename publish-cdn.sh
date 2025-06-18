#!/bin/bash

# 🚀 SQUIRREL CDN PUBLISHER
# Script pour publier automatiquement via GitHub + jsDelivr

echo "🐿️ Squirrel.js CDN Publisher (GitHub + jsDelivr)"
echo "==============================================="

# Fonction pour vérifier la disponibilité d'un domaine
check_domain() {
    local domain=$1
    echo "🔍 Checking domain: $domain"
    
    # Méthode 1: avec dig (plus précis)
    if command -v dig >/dev/null 2>&1; then
        echo "   Using dig..."
        
        # Test A record
        a_record=$(dig +short A $domain 2>/dev/null)
        # Test AAAA record (IPv6)
        aaaa_record=$(dig +short AAAA $domain 2>/dev/null)
        # Test CNAME
        cname_record=$(dig +short CNAME $domain 2>/dev/null)
        
        if [ -z "$a_record" ] && [ -z "$aaaa_record" ] && [ -z "$cname_record" ]; then
            echo "   ✅ $domain appears to be available (no DNS records)"
            return 0
        else
            echo "   ❌ $domain is registered:"
            [ ! -z "$a_record" ] && echo "      A: $a_record"
            [ ! -z "$aaaa_record" ] && echo "      AAAA: $aaaa_record"
            [ ! -z "$cname_record" ] && echo "      CNAME: $cname_record"
            return 1
        fi
        
    # Méthode 2: avec nslookup (fallback)
    elif command -v nslookup >/dev/null 2>&1; then
        echo "   Using nslookup..."
        
        if nslookup $domain >/dev/null 2>&1; then
            ip=$(nslookup $domain 2>/dev/null | grep -A1 "Name:" | tail -1 | awk '{print $2}')
            echo "   ❌ $domain is registered (IP: $ip)"
            return 1
        else
            echo "   ✅ $domain appears to be available"
            return 0
        fi
        
    # Méthode 3: avec curl (test HTTP)
    elif command -v curl >/dev/null 2>&1; then
        echo "   Using curl (HTTP test)..."
        
        if curl -s --connect-timeout 5 --head "http://$domain" >/dev/null 2>&1; then
            echo "   ❌ $domain responds to HTTP requests"
            return 1
        else
            echo "   ✅ $domain does not respond (might be available)"
            return 0
        fi
        
    else
        echo "   ⚠️ No domain checking tools available (dig/nslookup/curl)"
        echo "   💡 Manual check: https://whois.net/whois/$domain"
        return 2
    fi
}

# Fonction pour vérifier avec whois (si disponible)
check_whois() {
    local domain=$1
    if command -v whois >/dev/null 2>&1; then
        echo "🔍 WHOIS check for $domain..."
        whois_result=$(whois $domain 2>/dev/null)
        
        if echo "$whois_result" | grep -qi "no match\|not found\|no entries found"; then
            echo "   ✅ WHOIS: Domain appears available"
            return 0
        else
            echo "   ❌ WHOIS: Domain is registered"
            # Afficher les dates importantes
            echo "$whois_result" | grep -i "creation\|expir" | head -2
            return 1
        fi
    fi
}

# Fonction pour diagnostiquer et trouver la liste statique
find_static_component_list() {
    echo "🔍 Searching for static component lists..."
    
    # 1. Chercher dans les fichiers de build/config
    echo "   Checking build configuration files..."
    find . -name "*.js" -o -name "*.json" -o -name "*.config.*" | grep -E "(webpack|rollup|build|config)" | while read file; do
        if grep -q "WaveSurfer\|components.*\[\|export.*{" "$file" 2>/dev/null; then
            echo "   🎯 Found potential list in: $file"
            grep -n "WaveSurfer\|components.*\[\|export.*{" "$file" 2>/dev/null | head -5
            echo ""
        fi
    done
    
    # 2. Chercher dans src/squirrel/
    echo "   Checking src/squirrel/ files..."
    find src/squirrel/ -name "*.js" -type f | while read file; do
        if grep -q "WaveSurfer\|components.*\[\|export.*{.*Button.*Slider" "$file" 2>/dev/null; then
            echo "   🎯 Found potential list in: $file"
            grep -n -A5 -B5 "WaveSurfer\|components.*\[\|export.*{.*Button" "$file" 2>/dev/null
            echo ""
        fi
    done
    
    # 3. Chercher dans package.json scripts
    echo "   Checking package.json scripts..."
    if [ -f "package.json" ]; then
        echo "   📝 Build scripts found:"
        node -p "Object.keys(require('./package.json').scripts || {}).filter(s => s.includes('build')).map(s => s + ': ' + require('./package.json').scripts[s]).join('\n')" 2>/dev/null
        echo ""
    fi
    
    # 4. Chercher les références à WaveSurfer dans tout le projet
    echo "   Searching for WaveSurfer references..."
    grep -r "WaveSurfer" . --include="*.js" --include="*.json" --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null | head -10
    echo ""
    
    # 5. Lister les fichiers de composants réellement présents
    echo "   📁 Actual component files present:"
    if [ -d "src/squirrel/components" ]; then
        ls -la src/squirrel/components/*.js 2>/dev/null | awk '{print "      " $9}' | sed 's|src/squirrel/components/||g'
    else
        echo "      ⚠️ No components directory found"
    fi
    echo ""
}

# Fonction pour nettoyer les imports manquants
clean_bundle_imports() {
    local bundle_file="cdn_npm_maker/bundle-entry.js"
    
    if [ ! -f "$bundle_file" ]; then
        echo "⚠️ bundle-entry.js not found"
        return 1
    fi
    
    echo "🧹 Cleaning missing imports from bundle-entry.js..."
    
    # D'abord, diagnostiquer le problème
    find_static_component_list
    
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
                # Ajouter un commentaire à la place
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

# Vérification des domaines candidats
echo "🔍 Checking domain availability..."
domains=("hyper-squirrel.com" "hypersquirrel.com" "squirrel-js.com" "squirreljs.com" "hyper-squirrel.org" "squirrel-lib.com")

for domain in "${domains[@]}"; do
    check_domain $domain
    
    # Vérification WHOIS supplémentaire si disponible
    if [ $? -eq 0 ]; then
        check_whois $domain
    fi
    
    echo ""
done

# Recommandations
echo "💡 Recommendations:"
echo "   1. Check manually: https://whois.net"
echo "   2. Verify with registrar before purchasing"
echo "   3. Consider .org, .net alternatives"
echo ""

# Configuration
VERSION=$(node -p "require('./package.json').version")
GITHUB_REPO="atomecorp/a"  # ✅ Votre vrai repo GitHub
CDN_URL="https://cdn.jsdelivr.net/gh/$GITHUB_REPO@main/dist"

echo "📦 Version: $VERSION"
echo "🌐 CDN URL: $CDN_URL"

# Vérification de connectivité GitHub
echo "🔗 Checking GitHub connectivity..."
if curl -s --head "https://api.github.com" >/dev/null 2>&1; then
    echo "✅ GitHub is reachable"
else
    echo "❌ GitHub is not reachable"
    exit 1
fi

# 1. Build du CDN
echo "🔨 Building CDN bundle..."

# Vérification des fichiers requis avant build
echo "🔍 Checking component dependencies..."
missing_files=()

# Vérifier si bundle-entry.js existe et lister les imports
if [ -f "cdn_npm_maker/bundle-entry.js" ]; then
    echo "   Checking imports in bundle-entry.js..."
    
    # Extraire les imports de composants
    imports=$(grep -o "from.*components/.*\.js" cdn_npm_maker/bundle-entry.js 2>/dev/null | sed 's/from.*components\///g' | sed 's/\.js.*//g')
    
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
        echo "💡 Solutions:"
        echo "   1. Auto-clean imports: Clean missing imports automatically"
        echo "   2. Create missing files: touch src/squirrel/components/${missing_files[0]}.js"
        echo "   3. Manual edit: Edit bundle-entry.js manually"
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
else
    echo "⚠️ bundle-entry.js not found"
fi

npm run build:cdn

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# 2. Vérification des fichiers
if [ ! -f "dist/squirrel.js" ]; then
    echo "❌ squirrel.js not found!"
    exit 1
fi

if [ ! -f "dist/squirrel.min.js" ]; then
    echo "❌ squirrel.min.js not found!"
    exit 1
fi

# 3. Tests automatiques (optionnel)
echo "🧪 Running tests..."
# node test/cdn-test.js

# 4. Publication sur GitHub
echo "🚀 Publishing to GitHub..."

# Vérifier si on est dans un repo git
if [ ! -d ".git" ]; then
    echo "❌ Not a git repository. Initializing..."
    git init
    git remote add origin "https://github.com/$GITHUB_REPO.git"
fi

# Vérifier les changements
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Changes detected, committing..."
    
    # Ajouter les fichiers essentiels
    git add dist/squirrel.js dist/squirrel.min.js
    git add package.json
    git add src/
    
    # Commit avec version
    git commit -m "🚀 Release v$VERSION - CDN update
    
    - Updated squirrel.js bundle
    - Updated squirrel.min.js minified version
    - Ready for jsDelivr CDN"
    
    # Push vers GitHub
    echo "⬆️ Pushing to GitHub..."
    if git push origin main; then
        echo "✅ Successfully pushed to GitHub"
        
        # Attendre un peu que jsDelivr se mette à jour
        echo "⏳ Waiting for jsDelivr to update (30s)..."
        sleep 30
        
        # Tester la disponibilité sur jsDelivr
        echo "🧪 Testing jsDelivr availability..."
        if curl -s --head "$CDN_URL/squirrel.js" >/dev/null 2>&1; then
            echo "✅ jsDelivr CDN is ready!"
        else
            echo "⚠️ jsDelivr may need more time to update (try again in 5-10 minutes)"
        fi
    else
        echo "❌ Failed to push to GitHub"
        exit 1
    fi
else
    echo "ℹ️ No changes to commit"
fi

# 5. Créer un tag pour la version (optionnel mais recommandé)
echo "🏷️ Creating version tag..."
if ! git tag | grep -q "v$VERSION"; then
    git tag "v$VERSION"
    git push origin "v$VERSION"
    echo "✅ Tag v$VERSION created"
    
    # URL avec tag spécifique (plus stable)
    TAGGED_CDN_URL="https://cdn.jsdelivr.net/gh/$GITHUB_REPO@v$VERSION/dist"
    echo "🎯 Tagged CDN URL: $TAGGED_CDN_URL"
else
    echo "ℹ️ Tag v$VERSION already exists"
fi

# 5. Mise à jour du README avec les nouvelles URLs jsDelivr
echo "📝 Updating documentation..."
cat > CDN-README.md << EOF
# 🐿️ Squirrel.js CDN (via jsDelivr)

## 📦 Version actuelle: $VERSION

### Usage basique
\`\`\`html
<script src="$CDN_URL/squirrel.js"></script>
<script>
  const button = Button({ text: 'Hello' });
  document.body.appendChild(button);
</script>
\`\`\`

### Version minifiée (production)
\`\`\`html
<script src="$CDN_URL/squirrel.min.js"></script>
\`\`\`

### Version spécifique (recommandée pour production)
\`\`\`html
<script src="https://cdn.jsdelivr.net/gh/$GITHUB_REPO@v$VERSION/dist/squirrel.min.js"></script>
\`\`\`

### Latest version (toujours la dernière)
\`\`\`html
<script src="https://cdn.jsdelivr.net/gh/$GITHUB_REPO@latest/dist/squirrel.min.js"></script>
\`\`\`

## 🌐 URLs disponibles
- **Main branch**: $CDN_URL/squirrel.js
- **Current version**: https://cdn.jsdelivr.net/gh/$GITHUB_REPO@v$VERSION/dist/squirrel.js
- **Latest release**: https://cdn.jsdelivr.net/gh/$GITHUB_REPO@latest/dist/squirrel.js

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

## 📊 Statistiques
- Taille normale: $(du -h dist/squirrel.js | cut -f1)
- Taille minifiée: $(du -h dist/squirrel.min.js | cut -f1)
- Dernière mise à jour: $(date)

## 🔄 Cache et versions
- jsDelivr met en cache pendant 12h
- Pour forcer le rafraîchissement: ajoutez \`?v=$(date +%s)\`
- Pour la production, utilisez toujours une version taggée

EOF

echo "✅ Publication terminée!"

# 🧹 Nettoyage des fichiers temporaires
if [ -f "cdn_npm_maker/bundle-entry.js.backup" ]; then
    rm "cdn_npm_maker/bundle-entry.js.backup"
    echo "🧹 Backup temporaire supprimé"
fi

echo "🌐 URLs jsDelivr disponibles:"
echo "   Normal: $CDN_URL/squirrel.js"
echo "   Minifié: $CDN_URL/squirrel.min.js"
echo "   Version: https://cdn.jsdelivr.net/gh/$GITHUB_REPO@v$VERSION/dist/squirrel.js"
echo ""
echo "📖 Documentation mise à jour dans CDN-README.md"
echo "💡 Conseil: Mettez à jour vos HTML pour utiliser les nouvelles URLs jsDelivr"
