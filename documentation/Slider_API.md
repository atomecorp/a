# Complete Slider Documentation - Squirrel Framework

## Table of Contents

1. [Introduction](#introduction)
2. [Installation and Import](#installation-and-import)
3. [Basic Configuration](#basic-configuration)
4. [Advanced Styling API](#advanced-styling-api)
5. [Slider Types](#slider-types)
6. [Public Methods](#public-methods)
7. [Events and Callbacks](#events-and-callbacks)
8. [Practical Examples](#practical-examples)
9. [Compatibility and Migration](#compatibility-and-migration)
10. [Best Practices](#best-practices)

---

## Introduction

The Squirrel Framework Slider component offers a complete solution for creating customizable slider controls. It supports three main types: horizontal, vertical, and circular, with an advanced styling API providing granular control over all visual elements.

### Key Features

- ✨ **Advanced Styling** : Granular API to customize every part of the slider
- 🔄 **Backward Compatibility** : Support for legacy `colors` API
- 📱 **Multi-Platform** : Works on desktop and mobile
- 🎨 **Predefined Themes** : Material Design and other styles
- ⚡ **Performance** : Smooth and optimized animations
- 🎯 **Accessibility** : Support for keyboard interactions and screen readers

---


---

## Basic Configuration

### Essential Parameters

```javascript
const slider = new Slider({
    // === PLACEMENT ===
    attach: 'body',                    // Sélecteur CSS ou élément DOM
    id: 'my-slider',                   // ID unique (généré automatiquement si omis)
    x: 20,                             // Position X
    y: 20,                             // Position Y
    
    // === DIMENSIONS ===
    width: 300,                        // Largeur du conteneur
    height: 60,                        // Hauteur du conteneur
    trackWidth: 300,                   // Largeur de la track
    trackHeight: 8,                    // Hauteur de la track
    thumbSize: 24,                     // Taille du thumb (remplacée par grip.width/height si défini)
    
    // === VALEURS ===
    min: 0,                            // Valeur minimum
    max: 100,                          // Valeur maximum
    step: 1,                           // Pas d'incrémentation
    value: 50,                         // Valeur initiale
    
    // === TYPE ===
    type: 'horizontal'                 // 'horizontal', 'vertical', 'circular'
});
```

---

## API de Styling Avancé

L'API de styling avancée divise le slider en quatre parties configurables indépendamment :

### 1. Grip (Thumb/Curseur) 🎯

Contrôle l'apparence du curseur mobile :

```javascript
grip: {
    width: 24,                         // Largeur personnalisée (remplace thumbSize)
    height: 24,                        // Hauteur personnalisée (remplace thumbSize)
    backgroundColor: '#2196f3',        // Couleur de fond
    border: '3px solid #ffffff',       // Bordure
    borderRadius: '50%',               // Arrondi des coins
    boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)', // Ombre
    cursor: 'pointer',                 // Curseur au survol
    transition: 'all 0.2s ease-out'   // Transitions CSS
}
```

### 2. Support (Conteneur) 📦

Contrôle l'apparence du conteneur principal :

```javascript
support: {
    backgroundColor: '#ffffff',        // Couleur de fond
    border: '1px solid rgba(0,0,0,0.04)', // Bordure
    borderRadius: '12px',              // Arrondi des coins
    boxShadow: '0 8px 32px rgba(0,0,0,0.12)', // Ombre
    padding: '15px'                    // Espacement interne
}
```

### 3. Rail (Track) 🛤️

Contrôle l'apparence de la piste de déplacement :

```javascript
rail: {
    backgroundColor: '#e0e0e0',        // Couleur de fond
    borderRadius: '3px',               // Arrondi des coins
    height: 8,                         // Hauteur (remplace trackHeight si défini)
    width: 300                         // Largeur (remplace trackWidth si défini)
}
```

### 4. Progress (Barre de Progression) ⚡

Contrôle l'apparence de la partie remplie :

```javascript
progress: {
    backgroundColor: '#2196f3',        // Couleur de fond
    borderRadius: '3px',               // Arrondi des coins
    boxShadow: '0 2px 4px rgba(33, 150, 243, 0.3)', // Ombre
    transition: 'width 0.2s ease-out' // Transitions CSS
}
```

### Exemple Complet de Styling

```javascript
const modernSlider = new Slider({
    attach: '#container',
    width: 400,
    height: 80,
    min: 0,
    max: 100,
    value: 75,
    
    // Styling moderne avec glassmorphisme
    support: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '20px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        padding: '20px',
        backdropFilter: 'blur(10px)'
    },
    
    rail: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: '10px',
        height: 6
    },
    
    progress: {
        backgroundColor: 'linear-gradient(45deg, #ff6b6b, #4ecdc4)',
        borderRadius: '10px',
        boxShadow: '0 0 20px rgba(255, 107, 107, 0.5)'
    },
    
    grip: {
        width: 28,
        height: 28,
        backgroundColor: '#ffffff',
        border: 'none',
        borderRadius: '50%',
        boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15), 0 0 0 4px rgba(255, 255, 255, 0.1)'
    }
});
```

---

## Types de Sliders

### 1. Slider Horizontal 📏

```javascript
const horizontalSlider = new Slider({
    type: 'horizontal',
    width: 300,
    height: 60,
    trackWidth: 250,
    trackHeight: 8
});
```

### 2. Slider Vertical 📐

```javascript
const verticalSlider = new Slider({
    type: 'vertical',
    width: 60,
    height: 300,
    trackWidth: 8,
    trackHeight: 250
});
```

### 3. Slider Circulaire ⭕

```javascript
const circularSlider = new Slider({
    type: 'circular',
    circular: {
        radius: 80,            // Rayon du cercle
        strokeWidth: 8,        // Épaisseur du trait
        startAngle: 0,         // Angle de départ (degrés)
        endAngle: 270          // Angle de fin (degrés)
    }
});
```

---

## Méthodes Publiques

### Contrôle des Valeurs

```javascript
// Obtenir la valeur actuelle
const currentValue = slider.getValue();

// Définir une nouvelle valeur
slider.setValue(75);

// Obtenir les limites
const min = slider.getMin();
const max = slider.getMax();

// Modifier les limites
slider.setMin(0);
slider.setMax(200);
slider.setStep(5);
```

### Styling Dynamique

```javascript
// Modifier le style du grip
slider.setGripStyle({
    backgroundColor: '#ff4444',
    width: 30,
    height: 30
});

// Modifier le style du support
slider.setSupportStyle({
    backgroundColor: '#f0f0f0',
    borderRadius: '15px'
});

// Modifier le style du rail
slider.setRailStyle({
    backgroundColor: '#ddd',
    height: 10
});

// Modifier le style du progress
slider.setProgressStyle({
    backgroundColor: 'linear-gradient(45deg, #ff6b6b, #4ecdc4)'
});
```

### Contrôle du Composant

```javascript
// Détruire le slider
slider.destroy();

// Désactiver/Activer
slider.disable();
slider.enable();

// Masquer/Afficher
slider.hide();
slider.show();
```

---

## Événements et Callbacks

### Configuration des Callbacks

```javascript
const slider = new Slider({
    // ... autres options
    
    callbacks: {
        // Appelé à chaque changement de valeur
        onChange: function(value, slider) {
            console.log('Nouvelle valeur:', value);
        },
        
        // Appelé au début du drag
        onStart: function(value, slider) {
            console.log('Début du drag:', value);
        },
        
        // Appelé à la fin du drag
        onEnd: function(value, slider) {
            console.log('Fin du drag:', value);
        },
        
        // Appelé pendant le drag
        onDrag: function(value, slider) {
            console.log('Dragging:', value);
        }
    }
});
```

### Ajout d'Événements après Création

```javascript
// Ajouter un listener
slider.on('change', function(value) {
    console.log('Valeur changée:', value);
});

// Supprimer un listener
slider.off('change', callbackFunction);

// Déclencher un événement
slider.trigger('customEvent', data);
```

---

## Exemples Pratiques

### 1. Slider de Volume Audio 🔊

```javascript
const volumeSlider = new Slider({
    attach: '#volume-control',
    min: 0,
    max: 100,
    value: 50,
    
    support: {
        backgroundColor: '#1a1a1a',
        borderRadius: '25px',
        padding: '15px'
    },
    
    rail: {
        backgroundColor: '#333',
        borderRadius: '3px',
        height: 6
    },
    
    progress: {
        backgroundColor: '#00ff88',
        borderRadius: '3px',
        boxShadow: '0 0 10px rgba(0, 255, 136, 0.5)'
    },
    
    grip: {
        backgroundColor: '#00ff88',
        border: '2px solid #ffffff',
        borderRadius: '50%',
        width: 20,
        height: 20
    },
    
    callbacks: {
        onChange: function(value) {
            // Contrôler le volume audio
            document.getElementById('audio-player').volume = value / 100;
        }
    }
});
```

### 2. Contrôle de Température 🌡️

```javascript
const tempSlider = new Slider({
    attach: '#temperature-control',
    min: 16,
    max: 30,
    value: 22,
    step: 0.5,
    
    support: {
        backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '20px',
        padding: '20px',
        color: 'white'
    },
    
    rail: {
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: '10px',
        height: 8
    },
    
    progress: {
        backgroundColor: 'linear-gradient(90deg, #4facfe 0%, #00f2fe 100%)',
        borderRadius: '10px'
    },
    
    grip: {
        backgroundColor: '#ffffff',
        borderRadius: '50%',
        width: 24,
        height: 24,
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
    },
    
    callbacks: {
        onChange: function(value) {
            document.getElementById('temp-display').textContent = value + '°C';
        }
    }
});
```

### 3. Slider de Prix avec Formatage 💰

```javascript
const priceSlider = new Slider({
    attach: '#price-range',
    min: 0,
    max: 1000,
    value: 250,
    step: 10,
    
    support: {
        backgroundColor: '#ffffff',
        border: '2px solid #e0e0e0',
        borderRadius: '15px',
        padding: '20px'
    },
    
    rail: {
        backgroundColor: '#f5f5f5',
        borderRadius: '4px',
        height: 8
    },
    
    progress: {
        backgroundColor: '#4caf50',
        borderRadius: '4px'
    },
    
    grip: {
        backgroundColor: '#4caf50',
        border: '3px solid #ffffff',
        borderRadius: '50%',
        width: 28,
        height: 28,
        boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)'
    },
    
    callbacks: {
        onChange: function(value) {
            // Formater et afficher le prix
            const formatted = new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: 'EUR'
            }).format(value);
            
            document.getElementById('price-display').textContent = formatted;
        }
    }
});
```

### 4. Slider Vertical pour Progression 📊

```javascript
const progressSlider = new Slider({
    attach: '#progress-container',
    type: 'vertical',
    width: 60,
    height: 200,
    min: 0,
    max: 100,
    value: 0,
    
    support: {
        backgroundColor: '#f8f9fa',
        border: '1px solid #dee2e6',
        borderRadius: '30px',
        padding: '10px'
    },
    
    rail: {
        backgroundColor: '#e9ecef',
        borderRadius: '15px',
        width: 20
    },
    
    progress: {
        backgroundColor: 'linear-gradient(0deg, #28a745, #20c997)',
        borderRadius: '15px'
    },
    
    grip: {
        backgroundColor: '#ffffff',
        border: '2px solid #28a745',
        borderRadius: '50%',
        width: 30,
        height: 30
    }
});

// Animation de progression
let progress = 0;
const interval = setInterval(() => {
    progress += 2;
    progressSlider.setValue(progress);
    
    if (progress >= 100) {
        clearInterval(interval);
    }
}, 100);
```

---

## Compatibilité et Migration

### API Legacy (colors)

L'ancienne API `colors` est toujours supportée pour la compatibilité :

```javascript
// Ancienne méthode (toujours fonctionnelle)
const oldStyleSlider = new Slider({
    colors: {
        container: '#ffffff',
        track: '#e0e0e0',
        progress: '#2196f3',
        thumb: '#2196f3'
    }
});
```

### Migration vers la Nouvelle API

```javascript
// Avant (API Legacy)
const oldSlider = new Slider({
    colors: {
        container: '#ffffff',
        track: '#e0e0e0',
        progress: '#4caf50',
        thumb: '#4caf50'
    }
});

// Après (Nouvelle API)
const newSlider = new Slider({
    support: {
        backgroundColor: '#ffffff'
    },
    rail: {
        backgroundColor: '#e0e0e0'
    },
    progress: {
        backgroundColor: '#4caf50'
    },
    grip: {
        backgroundColor: '#4caf50'
    }
});
```

### Conversion Automatique

La nouvelle API convertit automatiquement les paramètres legacy :

- `colors.container` → `support.backgroundColor`
- `colors.track` → `rail.backgroundColor`
- `colors.progress` → `progress.backgroundColor`
- `colors.thumb` → `grip.backgroundColor`

---

## Meilleures Pratiques

### 1. Performance ⚡

```javascript
// Utiliser des transitions CSS plutôt que des animations JavaScript
grip: {
    transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out'
}

// Éviter les boxShadow complexes sur mobile
const isMobile = /Mobi|Android/i.test(navigator.userAgent);
grip: {
    boxShadow: isMobile ? 'none' : '0 4px 12px rgba(0,0,0,0.2)'
}
```

### 2. Accessibilité ♿

```javascript
// Ajouter des labels appropriés
const slider = new Slider({
    // ... configuration
    'aria-label': 'Contrôle de volume',
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': 50
});

// Support des interactions clavier
document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' && e.target === slider.elements.thumb) {
        slider.setValue(slider.getValue() + slider.config.step);
    }
});
```

### 3. Responsive Design 📱

```javascript
// Adaptation mobile
const createResponsiveSlider = () => {
    const isMobile = window.innerWidth < 768;
    
    return new Slider({
        width: isMobile ? 280 : 400,
        height: isMobile ? 50 : 60,
        
        grip: {
            width: isMobile ? 20 : 24,
            height: isMobile ? 20 : 24
        },
        
        support: {
            padding: isMobile ? '10px' : '15px'
        }
    });
};

// Réévaluer lors du redimensionnement
window.addEventListener('resize', () => {
    // Recréer ou ajuster le slider
});
```

### 4. Validation des Données 🔍

```javascript
const slider = new Slider({
    min: 0,
    max: 100,
    step: 1,
    
    callbacks: {
        onChange: function(value) {
            // Validation côté client
            if (value < this.config.min || value > this.config.max) {
                console.warn('Valeur hors limites:', value);
                return;
            }
            
            // Arrondir selon le step
            const rounded = Math.round(value / this.config.step) * this.config.step;
            if (rounded !== value) {
                this.setValue(rounded);
            }
        }
    }
});
```

### 5. Gestion d'Erreurs 🚨

```javascript
try {
    const slider = new Slider({
        attach: '#non-existent-element',
        // ... autres options
    });
} catch (error) {
    console.error('Erreur lors de la création du slider:', error);
    // Fallback ou gestion d'erreur appropriée
}

// Vérification d'existence avant manipulation
if (slider && slider.elements.container) {
    slider.setValue(50);
}
```

---

## Conclusion

Le composant Slider du Squirrel Framework offre une solution robuste et flexible pour tous vos besoins de contrôles de curseur. Avec sa nouvelle API de styling avancée, vous pouvez créer des interfaces utilisateur modernes et attrayantes tout en maintenant la compatibilité avec le code existant.

### Ressources Supplémentaires

- **Exemples Interactifs** : `test-styling-api.html`
- **Tests Rapides** : `test-quick-styling.html`
- **Code Source** : `src/a/components/Slider.js`

### Support et Contribution

Pour signaler des bugs ou proposer des améliorations, veuillez consulter la documentation du projet ou contribuer directement au code source.

---

*Documentation générée pour Squirrel Framework - Version avec API de Styling Avancée*
