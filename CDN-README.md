# 🐿️ Squirrel.js CDN

## 📦 Version actuelle: 1.0.0

## 🚀 CDN Options

### 📦 Via NPM (unpkg) - Recommandé
```html
<!-- Dernière version -->
<script src="https://unpkg.com/squirrel-framework/dist/squirrel.min.js"></script>

<!-- Version spécifique -->
<script src="https://unpkg.com/squirrel-framework@1.0.0/dist/squirrel.min.js"></script>

<!-- Version de développement -->
<script src="https://unpkg.com/squirrel-framework/dist/squirrel.js"></script>
```

### 🔗 Via GitHub (jsDelivr)
```html
<!-- Dernière version -->
<script src="https://cdn.jsdelivr.net/gh/your-username/squirrel-framework@latest/dist/squirrel.min.js"></script>

<!-- Version spécifique -->
<script src="https://cdn.jsdelivr.net/gh/your-username/squirrel-framework@v1.0.0/dist/squirrel.min.js"></script>

<!-- Version de développement -->
<script src="https://cdn.jsdelivr.net/gh/your-username/squirrel-framework@latest/dist/squirrel.js"></script>
```

### 🌐 Via NPM (jsDelivr) - Alternative
```html
<!-- Dernière version -->
<script src="https://cdn.jsdelivr.net/npm/squirrel-framework@latest/dist/squirrel.min.js"></script>

<!-- Version spécifique -->
<script src="https://cdn.jsdelivr.net/npm/squirrel-framework@1.0.0/dist/squirrel.min.js"></script>
```

### 💡 Usage basique
```html
<script src="https://unpkg.com/squirrel-framework/dist/squirrel.min.js"></script>
<script>
  const button = Squirrel.Button({ text: 'Hello from CDN!' });
  document.body.appendChild(button);
</script>
```

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

## ⚡ Performance & Optimisations

### 📊 Tailles des fichiers
- **Version normale**: ~216K (non-minifiée)
- **Version minifiée**: ~100K (production)
- **Gzip**: ~30K (avec compression serveur)

### 🚀 Conseils d'optimisation
```html
<!-- Pour production: toujours utiliser la version minifiée -->
<script src="https://unpkg.com/squirrel-framework/dist/squirrel.min.js"></script>

<!-- Avec attributs d'optimisation -->
<script 
  src="https://unpkg.com/squirrel-framework/dist/squirrel.min.js"
  defer
  crossorigin="anonymous">
</script>
```

### 📈 Avantages de chaque CDN

| CDN | Avantages | Usage |
|-----|-----------|-------|
| **unpkg** | ✅ Automatique via NPM<br>✅ Versions garanties<br>✅ Cache global | Production recommandée |
| **jsDelivr (GitHub)** | ✅ Disponible immédiatement<br>✅ Pas besoin de NPM<br>✅ Preview branches | Développement/Beta |
| **jsDelivr (NPM)** | ✅ Double redondance<br>✅ Performance optimale | Backup/Failover |

## 📊 Statistiques
- Taille normale: 216K
- Taille minifiée: 100K
- Dernière mise à jour: Wed Jun 18 00:36:49 CEST 2025

## 💻 Exemples pratiques

### 🎯 Exemple simple
```html
<!DOCTYPE html>
<html>
<head>
  <title>Squirrel.js Demo</title>
</head>
<body>
  <div id="app"></div>
  
  <script src="https://unpkg.com/squirrel-framework/dist/squirrel.min.js"></script>
  <script>
    // Créer des composants
    const button = Squirrel.Button({ 
      text: 'Click me!',
      onclick: () => alert('Hello from Squirrel!') 
    });
    
    const slider = Squirrel.Slider({
      min: 0,
      max: 100,
      value: 50,
      onchange: (value) => console.log('Slider value:', value)
    });
    
    // Ajouter au DOM
    document.getElementById('app').appendChild(button);
    document.getElementById('app').appendChild(slider);
  </script>
</body>
</html>
```

### 🔄 Chargement conditionnel
```html
<script>
// Fallback entre CDNs
(function() {
  const cdns = [
    'https://unpkg.com/squirrel-framework/dist/squirrel.min.js',
    'https://cdn.jsdelivr.net/npm/squirrel-framework@latest/dist/squirrel.min.js',
    'https://cdn.jsdelivr.net/gh/your-username/squirrel-framework@latest/dist/squirrel.min.js'
  ];
  
  function loadScript(src, fallback) {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => console.log('Squirrel loaded from:', src);
    script.onerror = () => {
      if (fallback < cdns.length - 1) {
        loadScript(cdns[fallback + 1], fallback + 1);
      } else {
        console.error('Failed to load Squirrel.js from all CDNs');
      }
    };
    document.head.appendChild(script);
  }
  
  loadScript(cdns[0], 0);
})();
</script>
```

## 🔧 Migration depuis CDN personnel

Si vous utilisiez un CDN personnel, migrez vers les CDNs publics :

```html
<!-- Ancien -->
<script src="https://cdn.yourdomain.com/squirrel.min.js"></script>

<!-- Nouveau (recommandé) -->
<script src="https://unpkg.com/squirrel-framework/dist/squirrel.min.js"></script>
```

