# 🎚️ Documentation Complète - Sliders Squirrel Framework

## Table des Matières
1. [Introduction](#introduction)
2. [Types de Sliders](#types-de-sliders)
3. [Configuration de Base](#configuration-de-base)
4. [Nouvelle API de Styling](#nouvelle-api-de-styling)
5. [API Legacy (Compatibilité)](#api-legacy-compatibilité)
6. [Variations de Couleurs](#variations-de-couleurs)
7. [Animations et Transitions](#animations-et-transitions)
8. [Événements et Callbacks](#événements-et-callbacks)
9. [Méthodes Publiques](#méthodes-publiques)
10. [Exemples Pratiques](#exemples-pratiques)
11. [Thèmes Prédéfinis](#thèmes-prédéfinis)
12. [Sliders Circulaires](#sliders-circulaires)
13. [Bonnes Pratiques](#bonnes-pratiques)

---

## Introduction

Le composant Slider du Squirrel Framework offre une solution complète pour créer des curseurs interactifs avec un contrôle total sur l'apparence et le comportement. Il supporte trois types principaux : horizontal, vertical et circulaire.

### Importation

```javascript
import Slider from '../a/components/Slider.js';
```

---

## Types de Sliders

### 1. Slider Horizontal
```javascript
const horizontalSlider = new Slider({
    attach: 'body',
    type: 'horizontal',
    x: 50,
    y: 100,
    width: 400,
    height: 60,
    value: 50
});
```

### 2. Slider Vertical
```javascript
const verticalSlider = new Slider({
    attach: 'body',
    type: 'vertical',
    x: 500,
    y: 100,
    width: 80,
    height: 300,
    value: 70
});
```

### 3. Slider Circulaire
```javascript
const circularSlider = new Slider({
    attach: 'body',
    type: 'circular',
    x: 700,
    y: 100,
    value: 45,
    circular: {
        radius: 60,
        strokeWidth: 12,
        startAngle: -135,
        endAngle: 135
    }
});
```

---

## Configuration de Base

### Propriétés Principales

| Propriété | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `attach` | string | 'body' | Sélecteur CSS pour l'élément parent |
| `id` | string | auto-généré | Identifiant unique du slider |
| `type` | string | 'horizontal' | Type : 'horizontal', 'vertical', 'circular' |
| `x` | number | 20 | Position X en pixels |
| `y` | number | 20 | Position Y en pixels |
| `width` | number | 300 | Largeur du conteneur |
| `height` | number | 60 | Hauteur du conteneur |
| `trackWidth` | number | 300 | Largeur de la piste |
| `trackHeight` | number | 8 | Hauteur de la piste |
| `thumbSize` | number | 24 | Taille du curseur (si grip.width/height non définis) |
| `min` | number | 0 | Valeur minimale |
| `max` | number | 100 | Valeur maximale |
| `step` | number | 1 | Pas d'incrémentation |
| `value` | number | 50 | Valeur initiale |

---

## Nouvelle API de Styling

### 🎯 grip - Styles du Curseur

Le curseur est l'élément interactif que l'utilisateur déplace.

```javascript
grip: {
    width: 28,                    // Largeur personnalisée
    height: 28,                   // Hauteur personnalisée
    backgroundColor: '#e74c3c',   // Couleur de fond
    border: '3px solid #ffffff', // Bordure
    borderRadius: '8px',         // Rayon des coins (50% = cercle)
    boxShadow: '0 6px 20px rgba(231, 76, 60, 0.4)', // Ombre
    cursor: 'grab',              // Curseur de la souris
    transition: 'transform 0.2s ease-out' // Animations CSS
}
```

#### Propriétés Disponibles
- `width`, `height` - Dimensions (null = utilise thumbSize)
- `backgroundColor` - Couleur de fond (accepte gradients)
- `border` - Style de bordure
- `borderRadius` - Rayon des coins
- `boxShadow` - Ombre portée (multiple ombres supportées)
- `cursor` - Style du curseur ('grab', 'pointer', 'move', etc.)
- `transition` - Transitions CSS

### 🏠 support - Styles du Conteneur

Le conteneur englobe tout le slider.

```javascript
support: {
    backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '20px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
    padding: '20px'
}
```

#### Propriétés Disponibles
- `backgroundColor` - Couleur de fond (gradients supportés)
- `border` - Style de bordure
- `borderRadius` - Rayon des coins
- `boxShadow` - Ombre portée
- `padding` - Espacement intérieur

### 🛤️ rail - Styles de la Piste

La piste est le chemin sur lequel glisse le curseur.

```javascript
rail: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: '6px',
    height: 12,    // Override de trackHeight
    width: null    // null = utilise trackWidth
}
```

#### Propriétés Disponibles
- `backgroundColor` - Couleur de fond
- `borderRadius` - Rayon des coins
- `height` - Hauteur (override trackHeight si défini)
- `width` - Largeur (override trackWidth si défini)

### 📊 progress - Styles de la Progression

La barre de progression indique la valeur actuelle.

```javascript
progress: {
    backgroundColor: 'linear-gradient(90deg, #ff6b6b, #feca57)',
    borderRadius: '6px',
    boxShadow: '0 4px 15px rgba(255, 107, 107, 0.4)',
    transition: 'width 0.2s ease-out'
}
```

#### Propriétés Disponibles
- `backgroundColor` - Couleur de fond (gradients supportés)
- `borderRadius` - Rayon des coins
- `boxShadow` - Ombre portée
- `transition` - Transitions CSS

---

## API Legacy (Compatibilité)

L'ancienne API `colors` est encore supportée et automatiquement convertie :

```javascript
colors: {
    container: '#ffffff',  // → support.backgroundColor
    track: '#e0e0e0',     // → rail.backgroundColor
    progress: '#2196f3',  // → progress.backgroundColor
    thumb: '#2196f3'      // → grip.backgroundColor
}
```

### Migration Automatique

```javascript
// Ancien code
const slider = new Slider({
    colors: {
        container: '#f8f9fa',
        track: '#dee2e6',
        progress: '#007bff',
        thumb: '#0056b3'
    }
});

// Équivalent avec la nouvelle API
const slider = new Slider({
    support: { backgroundColor: '#f8f9fa' },
    rail: { backgroundColor: '#dee2e6' },
    progress: { backgroundColor: '#007bff' },
    grip: { backgroundColor: '#0056b3' }
});
```

### API Hybride

Vous pouvez mélanger ancienne et nouvelle API :

```javascript
const hybridSlider = new Slider({
    // Base avec l'ancienne API
    colors: {
        container: '#fff',
        track: '#ddd',
        progress: '#28a745',
        thumb: '#155724'
    },
    
    // Override avec la nouvelle API
    grip: {
        borderRadius: '4px',  // Thumb carré au lieu de rond
        border: '3px solid #ffffff',
        boxShadow: '0 8px 20px rgba(21, 87, 36, 0.4)'
    },
    
    support: {
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)',
        borderRadius: '15px'
    }
});
```

---

## Variations de Couleurs

Le système de variation permet des changements de couleur automatiques basés sur la valeur.

### Configuration Simple

```javascript
variation: [
    { color: '#4caf50', position: { x: '0%' } },   // Vert à 0%
    { color: '#ff9800', position: { x: '70%' } },  // Orange à 70%
    { color: '#f44336', position: { x: '100%' } }  // Rouge à 100%
]
```

### Exemple : Thermomètre

```javascript
const tempSlider = new Slider({
    attach: 'body',
    value: 22,
    min: -10,
    max: 40,
    variation: [
        { color: '#2196f3', position: { x: '0%' } },   // Bleu (froid)
        { color: '#4caf50', position: { x: '40%' } },  // Vert (tempéré)
        { color: '#ff9800', position: { x: '70%' } },  // Orange (chaud)
        { color: '#f44336', position: { x: '100%' } }  // Rouge (très chaud)
    ],
    callbacks: {
        onChange: (value) => {
            if (value < 15) console.log('🥶 Il fait froid!');
            else if (value > 28) console.log('🔥 Il fait chaud!');
            else console.log('😊 Température agréable');
        }
    }
});
```

### Interpolation Automatique

Le système interpole automatiquement entre les couleurs définies. Si aucune variation n'est spécifiée, une variation rouge-vert par défaut est appliquée.

---

## Animations et Transitions

### Configuration des Animations

```javascript
animations: {
    enabled: true,           // Activer/désactiver les animations
    duration: 0.2,          // Durée en secondes
    easing: 'ease-out'      // Fonction d'easing CSS
}
```

### Easings Disponibles

- `ease` - Transition standard
- `ease-in` - Accélération progressive
- `ease-out` - Décélération progressive
- `ease-in-out` - Accélération puis décélération
- `linear` - Vitesse constante
- `cubic-bezier(0.4, 0.0, 0.2, 1)` - Fonction personnalisée

### Animations Personnalisées

```javascript
const animatedSlider = new Slider({
    attach: 'body',
    animations: {
        enabled: true,
        duration: 0.3,
        easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)'
    },
    grip: {
        transition: 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), box-shadow 0.3s ease-out'
    },
    progress: {
        transition: 'width 0.3s ease-out, background-color 0.2s ease-in-out'
    }
});
```

---

## Événements et Callbacks

### Callbacks Disponibles

```javascript
callbacks: {
    onChange: (value) => {
        // Appelé à chaque changement de valeur
        console.log(`Nouvelle valeur: ${value}`);
    },
    
    onStart: (value) => {
        // Appelé au début du drag
        console.log(`Début du glissement: ${value}`);
    },
    
    onEnd: (value) => {
        // Appelé à la fin du drag
        console.log(`Fin du glissement: ${value}`);
    },
    
    onDrag: (value) => {
        // Appelé pendant le drag (plus fréquent qu'onChange)
        console.log(`En cours de glissement: ${value}`);
    }
}
```

### Exemple Avancé avec Feedback

```javascript
const volumeSlider = new Slider({
    attach: '#audio-controls',
    value: 50,
    callbacks: {
        onChange: (value) => {
            // Mettre à jour l'interface
            document.getElementById('volume-display').textContent = `${value}%`;
            
            // Changer l'icône selon le volume
            const icon = document.getElementById('volume-icon');
            if (value === 0) icon.className = 'icon-volume-off';
            else if (value < 30) icon.className = 'icon-volume-low';
            else if (value < 70) icon.className = 'icon-volume-medium';
            else icon.className = 'icon-volume-high';
        },
        
        onStart: () => {
            // Ajouter une classe CSS pour le feedback visuel
            document.body.classList.add('adjusting-volume');
        },
        
        onEnd: (value) => {
            // Retirer la classe et sauvegarder la préférence
            document.body.classList.remove('adjusting-volume');
            localStorage.setItem('user-volume', value);
            
            // Effet de vibration sur mobile
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }
    }
});
```

---

## Méthodes Publiques

### Méthodes de Valeur

```javascript
const slider = new Slider({ attach: 'body' });

// Définir une valeur
slider.setValue(75);

// Obtenir la valeur actuelle
const currentValue = slider.getValue();
// ou
const value = slider.getCurrentValue();
```

### Méthodes de Styling Dynamique

```javascript
// Modifier le style du curseur
slider.setGripStyle({
    backgroundColor: '#e74c3c',
    borderRadius: '0',
    width: 30,
    height: 30,
    boxShadow: '0 8px 25px rgba(231, 76, 60, 0.6)'
});

// Modifier le style du conteneur
slider.setSupportStyle({
    backgroundColor: '#2c3e50',
    borderRadius: '30px',
    padding: '25px'
});

// Modifier le style de la piste
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

### Méthodes de Configuration

```javascript
// Mettre à jour la configuration
slider.setConfig({
    min: 0,
    max: 200,
    step: 5,
    animations: {
        duration: 0.5,
        easing: 'ease-in-out'
    }
});

// Détruire le slider
slider.destroy();
```

---

## Exemples Pratiques

### 1. Slider de Volume Audio

```javascript
const audioVolumeSlider = new Slider({
    attach: '#audio-player',
    id: 'audio_volume',
    type: 'horizontal',
    width: 200,
    height: 40,
    value: 75,
    min: 0,
    max: 100,
    
    grip: {
        width: 20,
        height: 20,
        backgroundColor: '#ff6b6b',
        borderRadius: '50%',
        border: '2px solid #ffffff',
        boxShadow: '0 4px 12px rgba(255, 107, 107, 0.4)'
    },
    
    support: {
        backgroundColor: '#f8f9fa',
        borderRadius: '10px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        padding: '10px'
    },
    
    rail: {
        backgroundColor: '#dee2e6',
        borderRadius: '2px',
        height: 4
    },
    
    progress: {
        backgroundColor: '#ff6b6b',
        borderRadius: '2px'
    },
    
    callbacks: {
        onChange: (value) => {
            // Contrôler le volume audio
            const audio = document.getElementById('audio-player');
            if (audio) {
                audio.volume = value / 100;
            }
        }
    }
});
```

### 2. Slider de Luminosité avec Variation

```javascript
const brightnessSlider = new Slider({
    attach: '#display-controls',
    id: 'brightness_control',
    type: 'vertical',
    width: 60,
    height: 200,
    value: 80,
    
    grip: {
        width: 24,
        height: 16,
        backgroundColor: '#ffd700',
        borderRadius: '8px',
        border: '2px solid #ffffff',
        boxShadow: '0 0 15px rgba(255, 215, 0, 0.6)'
    },
    
    support: {
        backgroundColor: '#2c3e50',
        borderRadius: '15px',
        padding: '15px'
    },
    
    rail: {
        backgroundColor: '#34495e',
        borderRadius: '4px',
        width: 8
    },
    
    variation: [
        { color: '#34495e', position: { x: '0%' } },   // Sombre
        { color: '#f39c12', position: { x: '50%' } },  // Orange
        { color: '#ffd700', position: { x: '100%' } }  // Jaune vif
    ],
    
    callbacks: {
        onChange: (value) => {
            // Ajuster la luminosité de l'écran
            document.body.style.filter = `brightness(${value}%)`;
        }
    }
});
```

### 3. Slider de Température Circulaire

```javascript
const tempCircularSlider = new Slider({
    attach: '#thermostat',
    id: 'thermostat_control',
    type: 'circular',
    x: 100,
    y: 100,
    value: 22,
    min: 10,
    max: 35,
    step: 0.5,
    
    circular: {
        radius: 80,
        strokeWidth: 16,
        startAngle: -140,
        endAngle: 140
    },
    
    colors: {
        container: '#ffffff',
        track: '#ecf0f1',
        progress: '#3498db',
        thumb: '#2980b9'
    },
    
    variation: [
        { color: '#3498db', position: { x: '0%' } },   // Bleu (froid)
        { color: '#2ecc71', position: { x: '30%' } },  // Vert (confortable)
        { color: '#f39c12', position: { x: '70%' } },  // Orange (chaud)
        { color: '#e74c3c', position: { x: '100%' } }  // Rouge (très chaud)
    ],
    
    callbacks: {
        onChange: (value) => {
            // Mettre à jour l'affichage de température
            document.getElementById('temp-display').textContent = `${value}°C`;
            
            // Envoyer la commande au thermostat
            fetch('/api/thermostat', {
                method: 'POST',
                body: JSON.stringify({ temperature: value }),
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
});
```

---

## Thèmes Prédéfinis

### Thème Material (Défaut)

```javascript
const materialSlider = new Slider({
    attach: 'body',
    theme: 'material'  // Ombres douces, animations fluides
});
```

### Thème Flat

```javascript
const flatSlider = new Slider({
    attach: 'body',
    theme: 'flat',  // Sans ombres, design minimaliste
    colors: {
        container: '#34495e',
        track: '#7f8c8d',
        progress: '#e74c3c',
        thumb: '#c0392b'
    }
});
```

### Thème Personnalisé

```javascript
const customSlider = new Slider({
    attach: 'body',
    theme: 'custom',
    
    support: {
        backgroundColor: 'linear-gradient(145deg, #667eea, #764ba2)',
        borderRadius: '25px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)'
    },
    
    grip: {
        backgroundColor: '#ffffff',
        borderRadius: '50%',
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.2)'
    }
});
```

---

## Sliders Circulaires

### Configuration Circulaire

```javascript
circular: {
    radius: 60,        // Rayon du cercle en pixels
    strokeWidth: 12,   // Épaisseur de la ligne
    startAngle: -135,  // Angle de début en degrés
    endAngle: 135      // Angle de fin en degrés
}
```

### Exemples d'Angles

```javascript
// Demi-cercle supérieur
circular: { startAngle: -180, endAngle: 0 }

// Demi-cercle inférieur
circular: { startAngle: 0, endAngle: 180 }

// Trois-quarts de cercle
circular: { startAngle: -135, endAngle: 135 }

// Cercle complet
circular: { startAngle: 0, endAngle: 360 }
```

### Slider Circulaire de Volume

```javascript
const circularVolumeSlider = new Slider({
    attach: '#audio-controls',
    type: 'circular',
    value: 65,
    
    circular: {
        radius: 50,
        strokeWidth: 10,
        startAngle: -135,
        endAngle: 135
    },
    
    colors: {
        container: '#ffffff',
        track: '#e3f2fd',
        progress: '#2196f3',
        thumb: '#1976d2'
    },
    
    variation: [
        { color: '#4caf50', position: { x: '0%' } },   // Vert (silencieux)
        { color: '#ff9800', position: { x: '70%' } },  // Orange (moyen)
        { color: '#f44336', position: { x: '100%' } }  // Rouge (fort)
    ],
    
    callbacks: {
        onChange: (value) => {
            if (value > 80) {
                console.log('⚠️ Volume élevé!');
            }
        }
    }
});
```

---

## Bonnes Pratiques

### 1. Performance

```javascript
// ✅ Bon : Limiter les callbacks onDrag pour les opérations coûteuses
const slider = new Slider({
    attach: 'body',
    callbacks: {
        onChange: (value) => {
            // Opération légère à chaque changement
            document.getElementById('display').textContent = value;
        },
        
        onEnd: (value) => {
            // Opération coûteuse seulement à la fin
            updateServerValue(value);
        }
    }
});

// ❌ Éviter : Opérations coûteuses dans onDrag
```

### 2. Accessibilité

```javascript
// ✅ Support clavier automatique
const accessibleSlider = new Slider({
    attach: 'body',
    // Le slider supporte automatiquement :
    // - Flèches gauche/droite ou haut/bas
    // - Home/End pour min/max
    // - Tab pour la navigation
});

// Ajouter des labels ARIA
const container = document.getElementById('slider-container');
container.setAttribute('role', 'slider');
container.setAttribute('aria-label', 'Volume control');
container.setAttribute('aria-valuemin', '0');
container.setAttribute('aria-valuemax', '100');
```

### 3. Responsive Design

```javascript
// ✅ Adapter les dimensions selon l'écran
const responsiveSlider = new Slider({
    attach: 'body',
    width: window.innerWidth < 768 ? 250 : 400,
    height: window.innerWidth < 768 ? 50 : 60,
    
    grip: {
        width: window.innerWidth < 768 ? 20 : 24,
        height: window.innerWidth < 768 ? 20 : 24
    }
});

// Réécouter les changements de taille
window.addEventListener('resize', () => {
    // Recréer ou ajuster le slider si nécessaire
});
```

### 4. Validation des Valeurs

```javascript
const validatedSlider = new Slider({
    attach: 'body',
    min: 0,
    max: 100,
    step: 5,
    
    callbacks: {
        onChange: (value) => {
            // ✅ Validation et contraintes
            if (value < 10) {
                console.warn('Valeur très faible');
            }
            
            // Arrondir si nécessaire
            const roundedValue = Math.round(value / 5) * 5;
            if (roundedValue !== value) {
                slider.setValue(roundedValue);
            }
        }
    }
});
```

### 5. Gestion des Erreurs

```javascript
try {
    const slider = new Slider({
        attach: '#non-existent-element',  // Élément qui n'existe pas
        value: 50
    });
} catch (error) {
    console.error('Erreur lors de la création du slider:', error);
    // Fallback ou message d'erreur
}
```

---

## Styles CSS Additionnels

### Styles pour Focus et Hover

```css
/* Améliorer l'accessibilité */
.slider-thumb:focus {
    outline: 2px solid #2196f3;
    outline-offset: 2px;
}

/* Effet de survol */
.slider-container:hover .slider-thumb {
    transform: scale(1.1);
}

/* Styles pour mobile */
@media (max-width: 768px) {
    .slider-thumb {
        width: 32px !important;
        height: 32px !important;
        /* Curseur plus grand pour le tactile */
    }
}
```

### Animations Personnalisées

```css
/* Animation de ripple */
@keyframes ripple {
    to {
        transform: translate(-50%, -50%) scale(4);
        opacity: 0;
    }
}

/* Effet de pulsation */
@keyframes pulse {
    0%, 100% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.05);
    }
}
```

---

Cette documentation couvre tous les aspects des sliders Squirrel Framework. Pour des questions spécifiques ou des cas d'usage avancés, consultez les exemples pratiques ou créez des tests personnalisés.
