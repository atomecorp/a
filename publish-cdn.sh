#!/bin/bash

# 🚀 SQUIRREL CDN PUBLISHER
# Script pour publier automatiquement les mises à jour

echo "🐿️ Squirrel.js CDN Publisher"
echo "=========================="

# Configuration
VERSION=$(node -p "require('./package.json').version")
CDN_BUCKET="your-cdn-bucket"
CDN_URL="https://cdn.yourdomain.com"

echo "📦 Version: $VERSION"

# 1. Build du CDN
echo "🔨 Building CDN bundle..."
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

# 4. Upload vers CDN (exemple avec AWS S3)
echo "☁️ Uploading to CDN..."

# Upload version spécifique
aws s3 cp dist/squirrel.js s3://$CDN_BUCKET/squirrel@$VERSION.js --content-type "application/javascript"
aws s3 cp dist/squirrel.min.js s3://$CDN_BUCKET/squirrel@$VERSION.min.js --content-type "application/javascript"

# Upload version latest
aws s3 cp dist/squirrel.js s3://$CDN_BUCKET/squirrel.js --content-type "application/javascript"
aws s3 cp dist/squirrel.min.js s3://$CDN_BUCKET/squirrel.min.js --content-type "application/javascript"

# 5. Mise à jour du README avec les nouvelles URLs
echo "📝 Updating documentation..."
cat > CDN-README.md << EOF
# 🐿️ Squirrel.js CDN

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

### Version spécifique
\`\`\`html
<script src="$CDN_URL/squirrel@$VERSION.js"></script>
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

## 📊 Statistiques
- Taille normale: $(du -h dist/squirrel.js | cut -f1)
- Taille minifiée: $(du -h dist/squirrel.min.js | cut -f1)
- Dernière mise à jour: $(date)

EOF

echo "✅ Publication terminée!"
echo "🌐 URLs disponibles:"
echo "   Normal: $CDN_URL/squirrel.js"
echo "   Minifié: $CDN_URL/squirrel.min.js" 
echo "   Version: $CDN_URL/squirrel@$VERSION.js"
echo ""
echo "📖 Documentation mise à jour dans CDN-README.md"
