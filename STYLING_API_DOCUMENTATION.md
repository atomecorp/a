# 🎨 Documentation - Nouvelle API de Styling Avancé pour Sliders

## Vue d'ensemble

La nouvelle API de styling pour les composants Slider offre un contrôle granulaire sur l'apparence de chaque partie du slider. Cette API remplace progressivement l'ancienne API `colors` tout en maintenant une compatibilité complète.

## Structure de l'API

### 🎯 grip (Styles du curseur/thumb)
Contrôle l'apparence du curseur déplaçable du slider.

```javascript
grip: {
    width: 24,                    // Largeur du curseur (null = utilise thumbSize)
    height: 24,                   // Hauteur du curseur (null = utilise thumbSize)
    backgroundColor: '#2196f3',   // Couleur de fond
    border: '3px solid #ffffff', // Bordure
    borderRadius: '50%',         // Rayon des coins (50% = cercle parfait)
    boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)', // Ombre
    cursor: 'pointer',           // Curseur de la souris
    transition: 'transform 0.2s ease-out' // Animations
}
```

### 🏠 support (Styles du conteneur)
Contrôle l'apparence du conteneur principal du slider.

```javascript
support: {
    backgroundColor: '#ffffff',   // Couleur de fond
    border: '1px solid rgba(0,0,0,0.04)', // Bordure
    borderRadius: '12px',        // Rayon des coins
    boxShadow: '0 8px 32px rgba(0,0,0,0.12)', // Ombre
    padding: '15px'              // Espacement intérieur
}
```

### 🛤️ rail (Styles de la track)
Contrôle l'apparence de la piste sur laquelle glisse le curseur.

```javascript
rail: {
    backgroundColor: '#e0e0e0',  // Couleur de fond de la track
    borderRadius: '3px',         // Rayon des coins
    height: null,                // Hauteur (null = utilise trackHeight)
    width: null                  // Largeur (null = utilise trackWidth)
}
```

### 📊 progress (Styles de la barre de progression)
Contrôle l'apparence de la barre qui indique la progression/valeur.

```javascript
progress: {
    backgroundColor: '#2196f3',  // Couleur de fond
    borderRadius: '3px',         // Rayon des coins
    boxShadow: '0 2px 4px rgba(33, 150, 243, 0.3)', // Ombre
    transition: 'width 0.2s ease-out' // Animations
}
```

## Exemples d'utilisation

### 1. Slider moderne avec thumb carré

```javascript
const modernSlider = new Slider({
    attach: '#container',
    value: 75,
    width: 400,
    
    grip: {
        width: 28,
        height: 28,
        backgroundColor: '#e74c3c',
        border: '3px solid #ffffff',
        borderRadius: '8px',  // Coins arrondis au lieu d'un cercle
        boxShadow: '0 6px 20px rgba(231, 76, 60, 0.4)',
        cursor: 'grab'
    },
    
    support: {
        backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: 'none',
        borderRadius: '20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
        padding: '20px'
    },
    
    rail: {
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: '6px',
        height: 12
    },
    
    progress: {
        backgroundColor: 'linear-gradient(90deg, #ff6b6b, #feca57)',
        borderRadius: '6px',
        boxShadow: '0 4px 15px rgba(255, 107, 107, 0.4)'
    }
});
```

### 2. Slider glassmorphism

```javascript
const glassSlider = new Slider({
    attach: '#container',
    value: 40,
    
    grip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: '50%',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2), inset 0 2px 4px rgba(255, 255, 255, 0.3)'
    },
    
    support: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '20px',
        boxShadow: 'inset 0 2px 4px rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        padding: '18px'
    },
    
    rail: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: '4px'
    },
    
    progress: {
        backgroundColor: 'rgba(102, 126, 234, 0.8)',
        borderRadius: '4px',
        boxShadow: '0 0 20px rgba(102, 126, 234, 0.4)'
    }
});
```

### 3. Slider vertical avec style néon

```javascript
const neonVerticalSlider = new Slider({
    attach: '#container',
    type: 'vertical',
    width: 80,
    height: 300,
    value: 75,
    
    grip: {
        width: 24,
        height: 24,
        backgroundColor: '#00ff88',
        borderRadius: '50%',
        border: '2px solid #ffffff',
        boxShadow: '0 0 20px #00ff88, 0 0 40px #00ff88, 0 4px 12px rgba(0, 255, 136, 0.6)',
        cursor: 'ns-resize'
    },
    
    support: {
        backgroundColor: '#1a1a1a',
        borderRadius: '12px',
        boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.8)',
        border: '1px solid #333',
        padding: '15px'
    },
    
    rail: {
        backgroundColor: '#333',
        borderRadius: '3px'
    },
    
    progress: {
        backgroundColor: '#00ff88',
        borderRadius: '3px',
        boxShadow: '0 0 15px rgba(0, 255, 136, 0.8)'
    }
});
```

## Méthodes de mise à jour dynamique

L'API permet de modifier les styles en temps réel :

```javascript
const slider = new Slider({ attach: '#container' });

// Modifier le style du curseur
slider.setGripStyle({
    backgroundColor: '#e74c3c',
    borderRadius: '0',
    width: 30,
    height: 30
});

// Modifier le style du conteneur
slider.setSupportStyle({
    backgroundColor: '#2c3e50',
    borderRadius: '30px',
    padding: '25px'
});

// Modifier le style de la track
slider.setRailStyle({
    backgroundColor: '#34495e',
    height: 15,
    borderRadius: '8px'
});

// Modifier le style de la progression
slider.setProgressStyle({
    backgroundColor: 'linear-gradient(90deg, #9b59b6, #e74c3c)',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(155, 89, 182, 0.5)'
});
```

## Compatibilité avec l'ancienne API

L'ancienne API `colors` continue de fonctionner et est automatiquement convertie :

```javascript
// Ancienne API (toujours supportée)
const legacySlider = new Slider({
    colors: {
        container: '#f0f0f0',
        track: '#ddd',
        progress: '#007bff',
        thumb: '#0056b3'
    }
});

// Est automatiquement converti en :
// support.backgroundColor = '#f0f0f0'
// rail.backgroundColor = '#ddd'
// progress.backgroundColor = '#007bff'
// grip.backgroundColor = '#0056b3'
```

## API Hybride

Vous pouvez combiner l'ancienne et la nouvelle API :

```javascript
const hybridSlider = new Slider({
    colors: {
        container: '#fff',
        track: '#ddd',
        progress: '#28a745',
        thumb: '#155724'
    },
    
    // Ces styles vont override les colors
    grip: {
        borderRadius: '4px',
        border: '3px solid #ffffff'
    },
    
    support: {
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)'
    }
});
```

## Propriétés CSS supportées

### grip (thumb/curseur)
- `width`, `height` - Dimensions
- `backgroundColor` - Couleur de fond
- `border` - Bordure
- `borderRadius` - Rayon des coins
- `boxShadow` - Ombre
- `cursor` - Curseur de la souris
- `transition` - Animations

### support (conteneur)
- `backgroundColor` - Couleur de fond
- `border` - Bordure
- `borderRadius` - Rayon des coins
- `boxShadow` - Ombre
- `padding` - Espacement intérieur

### rail (track)
- `backgroundColor` - Couleur de fond
- `borderRadius` - Rayon des coins
- `height`, `width` - Dimensions (override trackHeight/trackWidth)

### progress (barre de progression)
- `backgroundColor` - Couleur de fond
- `borderRadius` - Rayon des coins
- `boxShadow` - Ombre
- `transition` - Animations

## Avantages de la nouvelle API

1. **Contrôle granulaire** : Chaque partie du slider peut être stylée indépendamment
2. **Flexibilité** : Support des gradients, ombres complexes, animations
3. **Simplicité** : Noms intuitifs (grip, support, rail, progress)
4. **Compatibilité** : Fonctionne avec l'ancienne API colors
5. **Mise à jour dynamique** : Méthodes pour changer les styles en temps réel
6. **Types supportés** : Horizontal, vertical et circulaire

## Migration

Pour migrer de l'ancienne API vers la nouvelle :

```javascript
// Ancien code
const oldSlider = new Slider({
    colors: {
        container: '#fff',
        track: '#ddd',
        progress: '#007bff',
        thumb: '#0056b3'
    }
});

// Nouveau code équivalent
const newSlider = new Slider({
    support: { backgroundColor: '#fff' },
    rail: { backgroundColor: '#ddd' },
    progress: { backgroundColor: '#007bff' },
    grip: { backgroundColor: '#0056b3' }
});
```

La migration peut se faire progressivement car les deux APIs sont compatibles.
