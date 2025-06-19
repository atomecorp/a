# 🔧 Module Web Component - Guide Complet

Le Module Web Component est un composant sophistiqué pour la programmation visuelle avec support complet des propriétés CSS avancées, effets graphiques, animations et connecteurs typés.

## ✨ Fonctionnalités Principales

### 🎨 Styles CSS Avancés
- **Multiple Shadows**: Tableau de `boxShadow` pour effets relief 3D
- **Gradients Complexes**: Support complet des gradients multi-couches
- **Animations Fluides**: Transformations animées au survol et toucher
- **Effets Matériaux**: Simulation de métaux, cristal, holographie

### 🔌 Connecteurs Typés
- **Audio** (cercle) : Connexions audio stéréo
- **Control** (carré) : Paramètres de contrôle
- **Data** (triangle) : Flux de données
- **MIDI** (losange) : Signaux MIDI
- **Video** (hexagone) : Flux vidéo

### 🎯 Auto-Positionnement
- Attachment automatique au DOM
- Positionnement précis avec coordonnées
- Gestion automatique des collisions

## 🚀 Utilisation de Base

```javascript
// import Module from '../a/components/Module_New.js';

// Module simple
const module = new Module({
    id: 'my-module',
    name: 'Mon Module',
    attach: 'body',
    x: 100,
    y: 100,
    inputs: [
        { id: 'in1', type: 'audio', name: 'Audio In' }
    ],
    outputs: [
        { id: 'out1', type: 'audio', name: 'Audio Out' }
    ]
});
```

## 🎨 Effets Bombé Avancés

### Multiple Shadows pour Relief 3D

```javascript
const moduleWithRelief = new Module({
    containerStyle: {
        boxShadow: [
            '0 12px 28px rgba(0, 0, 0, 0.25)',        // Ombre externe
            '0 6px 14px rgba(0, 0, 0, 0.15)',         // Ombre secondaire
            'inset 0 2px 4px rgba(255, 255, 255, 0.1)', // Highlight interne
            'inset 0 -2px 4px rgba(0, 0, 0, 0.3)',      // Ombre interne
            'inset 1px 1px 2px rgba(255, 255, 255, 0.05)' // Micro relief
        ]
    }
});
```

### Gradients Multi-Couches

```javascript
const moduleWithGradients = new Module({
    containerStyle: {
        background: `
            radial-gradient(ellipse at top left, #4a3419 0%, #3d2817 30%),
            linear-gradient(145deg, rgba(212, 175, 55, 0.15) 0%, rgba(255, 223, 128, 0.08) 20%),
            conic-gradient(from 45deg at 30% 70%, rgba(255, 223, 128, 0.03) 0deg, transparent 90deg)
        `
    }
});
```

## 🎬 Animations Sophistiquées

### Changements de Taille au Toucher

```javascript
const animatedModule = new Module({
    containerStyle: {
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    },
    moduleHoverStyle: {
        transform: 'scale(1.06) translateY(-4px) rotateZ(0.5deg) translateZ(0)'
    },
    connectorConfig: {
        hoverStyle: {
            transform: 'scale(1.6) translateZ(0)', // Agrandissement dramatique
            boxShadow: [
                '0 6px 16px rgba(0, 0, 0, 0.3)',
                '0 0 12px rgba(255, 255, 255, 0.5)'
            ]
        }
    }
});
```

## 🔌 Configuration des Connecteurs

### Connecteurs Typés avec Styles Personnalisés

```javascript
const advancedModule = new Module({
    inputs: [
        { id: 'audio_left', type: 'audio', name: 'Left Channel' },
        { id: 'gain_control', type: 'control', name: 'Gain' },
        { id: 'midi_in', type: 'midi', name: 'MIDI In' }
    ],
    
    connectorConfig: {
        size: 16,
        spacing: 'auto',
        baseStyle: {
            borderRadius: '50%',
            border: '2px solid #ffffff',
            cursor: 'crosshair',
            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            boxShadow: [
                '0 3px 8px rgba(0, 0, 0, 0.2)',
                'inset 0 1px 2px rgba(255, 255, 255, 0.3)',
                'inset 0 -1px 2px rgba(0, 0, 0, 0.3)'
            ]
        },
        
        // Styles par type de connecteur
        typeStyles: {
            audio: {
                backgroundColor: '#e74c3c',
                borderColor: '#c0392b'
            },
            control: {
                backgroundColor: '#3498db',
                borderColor: '#2980b9'
            },
            midi: {
                backgroundColor: '#9b59b6',
                borderColor: '#8e44ad'
            }
        }
    }
});
```

## 💎 Exemples Matériaux Premium

### Module Or Luxueux

```javascript
const goldModule = new Module({
    id: 'luxury-gold',
    name: 'Gold Audio Master',
    containerStyle: {
        backgroundColor: '#2c1810',
        border: '3px solid #d4af37',
        borderRadius: '20px',
        boxShadow: [
            '0 25px 60px rgba(212, 175, 55, 0.4)',
            '0 15px 35px rgba(0, 0, 0, 0.6)',
            'inset 0 4px 12px rgba(255, 223, 128, 0.6)',
            'inset 0 -4px 12px rgba(139, 69, 19, 0.5)',
            'inset 2px 2px 6px rgba(255, 255, 255, 0.3)',
            'inset -2px -2px 6px rgba(0, 0, 0, 0.4)'
        ],
        background: `
            radial-gradient(ellipse at top left, #4a3419 0%, #2c1810 70%),
            linear-gradient(145deg, rgba(212, 175, 55, 0.15) 0%, rgba(255, 223, 128, 0.08) 20%)
        `
    },
    headerStyle: {
        color: '#ffd700',
        textShadow: '0 0 12px rgba(255, 215, 0, 0.8)',
        fontSize: '16px',
        fontWeight: '700'
    }
});
```

### Module Cristal

```javascript
const crystalModule = new Module({
    id: 'crystal-ice',
    name: 'Crystal Processor',
    containerStyle: {
        backgroundColor: '#f8f9fa',
        border: '3px solid #e9ecef',
        borderRadius: '20px',
        boxShadow: [
            '0 20px 50px rgba(52, 152, 219, 0.3)',
            '0 10px 25px rgba(0, 0, 0, 0.1)',
            'inset 0 3px 8px rgba(255, 255, 255, 0.8)',
            'inset 0 -3px 8px rgba(52, 152, 219, 0.2)',
            'inset 1px 1px 4px rgba(255, 255, 255, 0.9)',
            'inset -1px -1px 4px rgba(52, 152, 219, 0.3)'
        ],
        background: `
            radial-gradient(ellipse at center, rgba(255, 255, 255, 0.9) 0%, rgba(248, 249, 250, 0.8) 70%),
            linear-gradient(45deg, rgba(52, 152, 219, 0.1) 0%, rgba(116, 185, 255, 0.05) 50%)
        `
    }
});
```

## 🎮 Interactions Avancées

### Événements Disponibles
- `moduleClick` : Clic simple
- `moduleDoubleClick` : Double-clic
- `moduleMouseEnter` : Survol
- `moduleMouseLeave` : Fin de survol
- `moduleSelect` : Sélection
- `moduleDeselect` : Désélection
- `moduleDragStart` : Début de glisser
- `moduleDragEnd` : Fin de glisser
- `connectorClick` : Clic sur connecteur
- `connectionStart` : Début de connexion
- `connectionEnd` : Fin de connexion

### Gestion des Événements

```javascript
module.addEventListener('moduleClick', (event) => {
    console.log('Module cliqué:', event.detail);
});

module.addEventListener('connectionStart', (event) => {
    console.log('Connexion démarrée:', event.detail);
});
```

## 🔧 API Complète

### Constructeur

```javascript
new Module({
    id: 'string',              // Identifiant unique
    name: 'string',            // Nom affiché
    attach: 'body' | 'string', // Auto-attachment
    x: number,                 // Position X
    y: number,                 // Position Y
    width: number,             // Largeur
    height: number,            // Hauteur
    inputs: Array,             // Connecteurs d'entrée
    outputs: Array,            // Connecteurs de sortie
    containerStyle: Object,    // Style du container
    headerStyle: Object,       // Style du header
    contentStyle: Object,      // Style du contenu
    connectorConfig: Object    // Configuration des connecteurs
})
```

### Méthodes Principales

```javascript
// Positionnement
module.setPosition(x, y)
module.getPosition()

// Sélection
module.select()
module.deselect()
module.isSelected()

// Connexions
module.addConnection(targetModule, outputId, inputId)
module.removeConnection(connectionId)
module.getConnections()

// Style dynamique
module.updateStyle(styleObject)
module.addHoverEffect(effectObject)
module.removeHoverEffect()

// Connecteurs
module.addInput(inputConfig)
module.addOutput(outputConfig)
module.removeConnector(connectorId)
```

## 📊 Exemples Complets

Consultez les fichiers d'exemples :
- `modules_advanced.js` : Exemples avec connecteurs typés
- `modules_bombe.js` : Effets relief ultra-premium

## 🎯 Bonnes Pratiques

1. **Utilisez des IDs uniques** pour éviter les conflits
2. **Groupez les styles similaires** pour la cohérence
3. **Limitez le nombre de shadows** (max 8-10) pour les performances
4. **Utilisez les transitions** pour des animations fluides
5. **Testez sur différents navigateurs** pour la compatibilité

## 🚀 Performance

- **Shadow DOM** pour l'encapsulation et les performances
- **Transitions CSS** optimisées pour le GPU
- **Event delegation** pour la gestion d'événements
- **Lazy loading** des connecteurs complexes

Le Module Web Component offre une solution complète pour créer des interfaces de programmation visuelle sophistiquées avec des effets visuels de qualité professionnelle.
