# 🔲 Matrix Web Component - Guide Complet

## Vue d'ensemble

Le composant Matrix a été entièrement converti en Web Component moderne avec support complet des propriétés CSS avancées, effets bombé sophistiqués, et animations fluides au toucher/survol.

## 🚀 Fonctionnalités Principales

### ✨ Web Component Architecture
- **Shadow DOM** : Encapsulation complète des styles
- **Custom Element** : `<squirrel-matrix>` tag personnalisé
- **Auto-attachment** : Positionnement automatique dans le DOM
- **Event System** : Callbacks avancés pour toutes les interactions

### 🎨 Effets Visuels Avancés

#### Multiple Shadows (Effets Bombé)
```javascript
boxShadow: [
    '0 8px 24px rgba(0, 0, 0, 0.12)',        // Ombre externe pour élévation
    'inset 0 2px 4px rgba(255, 255, 255, 0.8)', // Highlight interne
    'inset 0 -2px 4px rgba(0, 0, 0, 0.1)'       // Ombre interne pour profondeur
]
```

#### Animations de Taille au Toucher
```javascript
cellHoverStyle: {
    transform: 'scale(1.05) translateZ(0)',  // Croissance au survol
},
cellSelectedStyle: {
    transform: 'scale(1.08) translateZ(0)',  // Croissance sélectionnée
},
cellActiveStyle: {
    transform: 'scale(1.12) translateZ(0)',  // Pulsation au toucher
}
```

## 📋 API Complète

### Configuration

```javascript
const matrix = new Matrix({
    id: 'my-matrix',
    attach: 'body',          // Auto-attachment
    x: 100,                  // Position X (optionnel)
    y: 100,                  // Position Y (optionnel)
    
    grid: { x: 4, y: 4 },    // Dimensions de la grille
    size: { width: 400, height: 400 },
    spacing: { horizontal: 6, vertical: 6, outer: 12 },
    
    // Styles avec support CSS avancé
    containerStyle: {
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: [/* multiple shadows */],
        background: 'linear-gradient(...)'
    },
    
    cellStyle: {
        backgroundColor: '#f8f9fa',
        borderRadius: '12px',
        boxShadow: [/* effets bombé */]
    },
    
    cellHoverStyle: {
        transform: 'scale(1.05)',
        boxShadow: [/* relief au survol */]
    },
    
    cellSelectedStyle: {
        transform: 'scale(1.08)',
        boxShadow: [/* relief sélectionné */]
    },
    
    // Callbacks interactifs
    callbacks: {
        onCellClick: (cell, x, y, cellId, event) => {},
        onCellDoubleClick: (cell, x, y, cellId, event) => {},
        onCellLongClick: (cell, x, y, cellId, event) => {},
        onCellHover: (cell, x, y, cellId, event) => {},
        onCellLeave: (cell, x, y, cellId, event) => {},
        onCellTouch: (cell, x, y, cellId, event) => {},
        onSelectionChange: (selectedCells) => {},
        onMatrixResize: (width, height) => {}
    }
});
```

### Méthodes Publiques

```javascript
// Sélection des cellules
matrix.selectCell(x, y)                // Sélectionner une cellule
matrix.deselectCell(x, y)              // Désélectionner une cellule
matrix.clearSelection()                // Effacer toute la sélection
matrix.getSelectedCells()              // Récupérer les cellules sélectionnées

// Manipulation du contenu
matrix.setCellContent(x, y, content)   // Modifier le contenu d'une cellule
matrix.setCellStyle(x, y, styles)     // Appliquer des styles personnalisés

// Accès aux éléments
matrix.getCell(x, y)                   // Récupérer l'élément DOM d'une cellule

// Redimensionnement
matrix.resize(width, height)           // Redimensionner la matrice
```

### Auto-Attachment et Positionnement

```javascript
// Auto-attachment au body
const matrix = new Matrix({
    attach: 'body',
    x: 100,
    y: 200
});

// Auto-attachment à un sélecteur CSS
const matrix = new Matrix({
    attach: '#my-container',
    x: 50,
    y: 50
});

// Auto-attachment à un élément DOM
const container = document.getElementById('container');
const matrix = new Matrix({
    attach: container
});
```

## 🎨 Exemples de Styles Avancés

### Style Glassmorphism
```javascript
containerStyle: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: [
        '0 8px 32px rgba(31, 38, 135, 0.37)',
        'inset 0 2px 4px rgba(255, 255, 255, 0.5)'
    ]
}
```

### Style Gaming/Cyberpunk
```javascript
containerStyle: {
    backgroundColor: '#0a0a0a',
    border: '2px solid #00ff41',
    boxShadow: [
        '0 0 30px rgba(0, 255, 65, 0.5)',
        'inset 0 2px 4px rgba(0, 255, 65, 0.3)'
    ],
    background: `
        linear-gradient(145deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%),
        repeating-linear-gradient(90deg, transparent, rgba(0, 255, 65, 0.03) 2px)
    `
}
```

### Style Material Design
```javascript
containerStyle: {
    backgroundColor: '#ffffff',
    borderRadius: '24px',
    boxShadow: [
        '0 16px 40px rgba(0, 0, 0, 0.12)',
        '0 8px 24px rgba(0, 0, 0, 0.08)',
        'inset 0 1px 0 rgba(255, 255, 255, 0.9)'
    ]
}
```

## 🎭 Effets Spéciaux

### Shimmer Effect
```javascript
onCellClick: (cell) => {
    const shimmer = document.createElement('div');
    shimmer.style.cssText = `
        position: absolute;
        top: 0; left: -100%; width: 100%; height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.8), transparent);
        animation: shimmerEffect 0.8s ease-out;
        pointer-events: none;
    `;
    cell.appendChild(shimmer);
    setTimeout(() => shimmer.remove(), 800);
}
```

### Ripple Effect
```javascript
onCellClick: (cell, x, y, cellId, event) => {
    const ripple = document.createElement('div');
    const rect = cell.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    ripple.style.cssText = `
        position: absolute;
        width: ${size}px; height: ${size}px;
        left: ${x}px; top: ${y}px;
        background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 70%);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s ease-out;
        pointer-events: none;
    `;
    
    cell.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
}
```

### Particle Explosion
```javascript
onCellClick: (cell) => {
    for (let i = 0; i < 6; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
            position: absolute;
            width: 4px; height: 4px;
            background: radial-gradient(circle, #ffd700, #d4af37);
            border-radius: 50%;
            top: 50%; left: 50%;
            animation: particleExplosion 1s ease-out forwards;
            --angle: ${i * 60}deg;
        `;
        cell.appendChild(particle);
        setTimeout(() => particle.remove(), 1000);
    }
}
```

## 📱 Support Mobile et Accessibilité

### Touch Events
- **touchstart** : Animation d'activation
- **touchend** : Retour à l'état normal
- **Vibration API** : Retour haptique sur mobile

### Keyboard Support
- **Enter/Space** : Activation des cellules
- **Tab navigation** : Navigation au clavier
- **Focus indicators** : Indicateurs visuels d'accessibilité

### Responsive Design
```css
@media (max-width: 768px) {
    .matrix-container {
        font-size: 12px;
    }
    .matrix-grid {
        gap: 2px;
        padding: 8px;
    }
}
```

## 🔧 Migration depuis l'Ancienne Version

### Avant (Ancienne Matrix)
```javascript
const matrix = new Matrix({
    id: 'my-matrix',
    attach: 'body',
    grid: { x: 3, y: 3 },
    position: { x: 100, y: 100 },
    size: { width: '300px', height: '300px' },
    callbacks: {
        onClick: (cell, x, y) => {}
    }
});
```

### Après (Nouvelle Matrix Web Component)
```javascript
const matrix = new Matrix({
    id: 'my-matrix',
    attach: 'body',
    x: 100,  // position.x devient x
    y: 100,  // position.y devient y
    grid: { x: 3, y: 3 },
    size: { width: 300, height: 300 },  // Valeurs numériques
    callbacks: {
        onCellClick: (cell, x, y, cellId, event) => {}  // onClick devient onCellClick
    }
});
```

## 🎯 Exemples Complets

Voir les fichiers de démonstration :
- `matrices_advanced.js` : Exemples Glassmorphism, Gaming, Material Design
- `matrices_bombe.js` : Effets bombé ultra-premium
- `matrices_validation.js` : Tests de validation complets

## 🚀 Performance

- **Shadow DOM** : Isolation et optimisation des styles
- **Transform optimizations** : Utilisation de `translateZ(0)` pour l'accélération GPU
- **Reduced motion** : Respect des préférences d'accessibilité
- **Will-change hints** : Optimisation des animations

## 📚 Ressources

- [Web Components Standard](https://developer.mozilla.org/en-US/docs/Web/Web_Components)
- [CSS Transform Performance](https://developer.mozilla.org/en-US/docs/Web/CSS/transform)
- [Touch Events API](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events)
- [Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
