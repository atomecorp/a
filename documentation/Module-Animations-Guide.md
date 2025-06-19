# 🎬 Module Web Component - Guide Animations Configurables

## 📋 Vue d'ensemble

Le Module Web Component permet maintenant un contrôle total des animations lors de la création. Vous pouvez :

- ✅ **Activer/Désactiver** toutes les animations
- ⚙️ **Configurer individuellement** chaque type d'animation
- 🎯 **Personnaliser** transformations, durées, et timings
- 🔄 **Contrôler dynamiquement** les animations en temps réel

## 🚀 Configuration de Base

### Désactiver Toutes les Animations

```javascript
const moduleStatique = new Module({
    id: 'static-module',
    name: 'Module Sans Animation',
    
    // AUCUNE animation
    animations: {
        enabled: false
    }
    
    // Styles normaux...
});
```

### Activer Toutes les Animations (par défaut)

```javascript
const moduleAnimé = new Module({
    id: 'animated-module',
    name: 'Module Animé',
    
    // Toutes les animations avec configuration par défaut
    animations: {
        enabled: true  // Valeur par défaut
    }
});
```

## ⚙️ Configuration Avancée

### Animations Partielles

```javascript
const modulePartiel = new Module({
    id: 'partial-module',
    name: 'Animations Partielles',
    
    animations: {
        enabled: true,
        duration: '0.4s',
        timing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        
        // Seulement hover module et connecteurs
        moduleHover: {
            enabled: true,  // ✅ Activé
            transform: 'scale(1.03) translateY(-3px)',
            duration: '0.4s'
        },
        
        moduleSelected: {
            enabled: false  // ❌ Désactivé
        },
        
        moduleDrag: {
            enabled: false  // ❌ Désactivé
        },
        
        connectorHover: {
            enabled: true,  // ✅ Activé
            transform: 'scale(1.4)'
        },
        
        connectorActive: {
            enabled: false  // ❌ Désactivé
        }
    }
});
```

### Animations Ultra Personnalisées

```javascript
const moduleCustom = new Module({
    id: 'custom-module',
    name: 'Animations Custom',
    
    animations: {
        enabled: true,
        duration: '0.6s',
        timing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', // Bounce effect
        
        moduleHover: {
            enabled: true,
            transform: 'scale(1.08) rotateZ(1deg) translateY(-6px)',
            duration: '0.6s',
            timing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
            boxShadow: [
                '0 20px 40px rgba(52, 152, 219, 0.3)',
                '0 10px 20px rgba(0, 0, 0, 0.2)',
                'inset 0 4px 8px rgba(255, 255, 255, 0.2)'
            ]
        },
        
        connectorHover: {
            enabled: true,
            transform: 'scale(1.8) rotateZ(360deg)',  // Rotation complète !
            duration: '0.5s',
            timing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }
    }
});
```

## 🎯 Types d'Animations Disponibles

### 1. Module Hover
Animation au survol du module
```javascript
moduleHover: {
    enabled: true,
    transform: 'scale(1.02) translateY(-2px)',
    duration: '0.3s',
    timing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: [
        '0 12px 32px rgba(0, 0, 0, 0.2)',
        'inset 0 3px 6px rgba(255, 255, 255, 0.15)'
    ]
}
```

### 2. Module Selected
Animation lors de la sélection
```javascript
moduleSelected: {
    enabled: true,
    transform: 'scale(1.05) translateZ(0)',
    duration: '0.4s',
    timing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    boxShadow: [
        '0 16px 40px rgba(52, 152, 219, 0.3)',
        'inset 0 2px 6px rgba(52, 152, 219, 0.2)'
    ]
}
```

### 3. Module Drag
Animation pendant le glisser-déposer
```javascript
moduleDrag: {
    enabled: true,
    transform: 'scale(1.08) rotateZ(2deg)',
    duration: '0.2s',
    timing: 'ease-out',
    boxShadow: [
        '0 20px 50px rgba(0, 0, 0, 0.3)',
        'inset 0 4px 8px rgba(255, 255, 255, 0.2)'
    ]
}
```

### 4. Connector Hover
Animation au survol des connecteurs
```javascript
connectorHover: {
    enabled: true,
    transform: 'scale(1.3) translateZ(0)',
    duration: '0.3s',
    timing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    boxShadow: [
        '0 6px 16px rgba(0, 0, 0, 0.3)',
        '0 0 12px rgba(255, 255, 255, 0.5)'
    ]
}
```

### 5. Connector Active
Animation lors de la connexion
```javascript
connectorActive: {
    enabled: true,
    transform: 'scale(1.5) translateZ(0)',
    duration: '0.2s',
    timing: 'ease-out',
    boxShadow: [
        '0 8px 20px rgba(0, 0, 0, 0.4)',
        '0 0 20px rgba(255, 255, 255, 0.8)'
    ]
}
```

## 🔄 Contrôle Dynamique

### Activer/Désactiver en Temps Réel

```javascript
// Désactiver toutes les animations
module.disableAnimations();

// Réactiver toutes les animations
module.enableAnimations();

// Vérifier l'état
console.log('Animations actives:', module.config.animations.enabled);
```

### Modifier une Animation Spécifique

```javascript
// Changer l'animation hover du module
module.setAnimationConfig('moduleHover', {
    transform: 'scale(1.1) rotateZ(5deg)',
    duration: '0.5s',
    timing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    boxShadow: [
        '0 15px 30px rgba(0, 0, 0, 0.3)'
    ]
});

// Changer l'animation hover des connecteurs
module.setAnimationConfig('connectorHover', {
    transform: 'scale(2.0) rotateZ(180deg)',
    duration: '0.6s',
    timing: 'ease-in-out'
});
```

## 🎨 Exemples Pratiques

### Module Minimal (Animations Subtiles)
```javascript
const minimal = new Module({
    animations: {
        enabled: true,
        moduleHover: {
            enabled: true,
            transform: 'scale(1.01)',  // Très petite échelle
            duration: '0.2s',
            timing: 'ease'
        },
        connectorHover: {
            enabled: true,
            transform: 'scale(1.1)',  // Petite échelle
            duration: '0.2s'
        },
        moduleSelected: { enabled: false },
        moduleDrag: { enabled: false },
        connectorActive: { enabled: false }
    }
});
```

### Module Performance (Pas d'Animations)
```javascript
const performance = new Module({
    animations: {
        enabled: false  // Pour des performances maximales
    }
});
```

### Module Spectaculaire (Toutes Options)
```javascript
const spectaculaire = new Module({
    animations: {
        enabled: true,
        moduleHover: {
            enabled: true,
            transform: 'scale(1.1) rotateZ(3deg) translateY(-8px)',
            duration: '0.8s',
            timing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
        },
        connectorHover: {
            enabled: true,
            transform: 'scale(2.0) rotateZ(720deg)',  // Double rotation !
            duration: '1s'
        }
    }
});
```

## 📊 Impact Performance

| Configuration | Impact Performance | Cas d'Usage |
|---------------|-------------------|-------------|
| `enabled: false` | ⚡ Maximum | Applications critiques, mobile |
| Animations minimales | 🔋 Très bon | Applications professionnelles |
| Animations standards | ✅ Bon | Applications générales |
| Animations spectaculaires | ⚠️ Moyen | Démonstrations, créatif |

## 🛠️ API Complète

### Méthodes de Contrôle
```javascript
// Activation/Désactivation
module.enableAnimations()
module.disableAnimations()

// Configuration spécifique
module.setAnimationConfig(animationName, config)

// Lecture état
const isEnabled = module.config.animations.enabled
const hoverConfig = module.config.animations.moduleHover
```

### Propriétés d'Animation
```javascript
{
    enabled: boolean,        // Activer cette animation
    transform: string,       // Transformation CSS
    duration: string,        // Durée (ex: '0.3s')
    timing: string,         // Timing function CSS
    boxShadow: Array        // Ombres multiples (optionnel)
}
```

## 🎯 Recommandations

1. **Applications Mobiles** : `animations: { enabled: false }`
2. **Applications Métier** : Animations minimales uniquement
3. **Créatif/Demo** : Toutes animations avec personnalisations
4. **Accessibilité** : Respecter `prefers-reduced-motion`
5. **Performance** : Utiliser `transform` plutôt que `left/top`

## 🔗 Voir Aussi

- `modules_configurable.js` - Exemples complets
- `Module_Configurable.js` - Code source Web Component
- `Module-WebComponent-Guide.md` - Guide général
