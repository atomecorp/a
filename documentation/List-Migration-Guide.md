# 🔄 Migration Guide: List Component v1 → v2 (Web Component)

## 📋 Overview

Ce guide vous aide à migrer de l'ancienne version du composant List (basée sur les classes) vers la nouvelle version Web Component.

## 🚀 Principales Différences

### Avant (v1) vs Après (v2)

| Aspect | v1 (Legacy) | v2 (Web Component) |
|--------|-------------|-------------------|
| **Architecture** | Classe traditionnelle | HTMLElement + Shadow DOM |
| **Instanciation** | `new List(config)` | `new List(config)` |
| **Attachment** | `attach: 'body'` dans config | `await list.attachTo('body')` |
| **Events** | Callbacks (`onItemClick`) | CustomEvents (`list-item-click`) |
| **Styling** | Propriétés limitées | Support CSS complet |
| **Encapsulation** | DOM global | Shadow DOM isolé |

## 🔧 Guide de Migration

### 1. Configuration de Base

#### ❌ Ancien Code (v1)
```javascript
const list = new List({
    attach: 'body',
    id: 'my_list',
    x: 50, y: 50,
    width: 300, height: 200,
    type: 'simple',
    items: [
        { id: 1, text: 'Item 1' },
        { id: 2, text: 'Item 2' }
    ],
    callbacks: {
        onItemClick: (item, id, event) => {
            console.log('Clicked:', item.text);
        }
    }
});
```

#### ✅ Nouveau Code (v2)
```javascript
const list = new List({
    id: 'my_list',
    items: [
        { id: 1, text: 'Item 1' },
        { id: 2, text: 'Item 2' }
    ],
    style: {
        position: 'absolute',
        left: '50px',
        top: '50px',
        width: '300px',
        height: '200px'
    }
});

// Events avec CustomEvents
list.addEventListener('list-item-click', (event) => {
    const { item, itemId } = event.detail;
    console.log('Clicked:', item.text);
});

// Attachement asynchrone
await list.attachTo('body');
```

### 2. Positionnement et Dimensions

#### ❌ Ancien Code
```javascript
const list = new List({
    x: 100, y: 150,
    width: 300, height: 400
});
```

#### ✅ Nouveau Code
```javascript
const list = new List({
    style: {
        position: 'absolute',
        left: '100px',
        top: '150px',
        width: '300px',
        height: '400px'
    }
});
```

### 3. Styling Avancé

#### ❌ Ancien Code
```javascript
const list = new List({
    styling: {
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        itemStyling: {
            padding: '12px',
            ':hover': {
                backgroundColor: '#e0e0e0'
            }
        }
    }
});
```

#### ✅ Nouveau Code
```javascript
const list = new List({
    style: {
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
        // Support CSS complet
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        boxShadow: [
            '0 4px 8px rgba(0,0,0,0.1)',
            '0 0 0 1px rgba(255,255,255,0.1) inset'
        ],
        backdropFilter: 'blur(10px)'
    },
    itemStyle: {
        padding: '12px'
    },
    itemHoverStyle: {
        backgroundColor: '#e0e0e0',
        transform: 'translateX(4px)'
    }
});
```

### 4. Events System

#### ❌ Ancien Code
```javascript
const list = new List({
    callbacks: {
        onItemClick: (item, id, event) => { /* ... */ },
        onSelectionChange: (selectedItems) => { /* ... */ },
        onItemHover: (item, id, event) => { /* ... */ }
    }
});
```

#### ✅ Nouveau Code
```javascript
const list = new List({/* config */});

// Event listeners modernes
list.addEventListener('list-item-click', (event) => {
    const { item, itemId, element, originalEvent } = event.detail;
    // ...
});

list.addEventListener('list-selection-change', (event) => {
    const { selectedItems, list } = event.detail;
    // ...
});

list.addEventListener('list-item-hover', (event) => {
    const { item, itemId, element } = event.detail;
    // ...
});
```

### 5. Styling par Item

#### ❌ Ancien Code
```javascript
// Pas de support direct pour styling individuel
const list = new List({
    items: [
        { id: 1, text: 'Item 1' },
        { id: 2, text: 'Item 2' }
    ]
});
```

#### ✅ Nouveau Code
```javascript
const list = new List({
    items: [
        {
            id: 1,
            text: 'Item 1',
            style: {
                fontWeight: 'bold',
                color: '#2196f3'
            },
            hoverStyle: {
                backgroundColor: '#e3f2fd'
            },
            selectedStyle: {
                backgroundColor: '#1976d2',
                color: '#ffffff'
            }
        },
        {
            id: 2,
            text: 'Item 2',
            style: {
                fontStyle: 'italic'
            }
        }
    ]
});
```

## 🎯 Nouveautés v2

### 1. Support CSS Complet
- Tous les propriétés CSS supportées
- Gradients, shadows, transforms, filters
- Support des arrays pour propriétés multiples

### 2. Shadow DOM
- Encapsulation des styles
- Pas de conflits CSS
- Performance améliorée

### 3. Architecture Moderne
- Web Components standard
- CustomElements API
- Meilleure intégration avec les frameworks modernes

### 4. Events Avancés
- Système d'événements moderne
- Données détaillées dans les events
- Meilleure séparation des préoccupations

## ⚡ Script de Migration Automatique

```javascript
// Utilitaire pour convertir automatiquement la config v1 → v2
function migrateListConfig(oldConfig) {
    const newConfig = {
        id: oldConfig.id,
        items: oldConfig.items || [],
        searchable: oldConfig.searchable,
        selectable: oldConfig.selectable,
        sortable: oldConfig.sortable
    };
    
    // Migration du positionnement
    if (oldConfig.x || oldConfig.y || oldConfig.width || oldConfig.height) {
        newConfig.style = {
            position: 'absolute',
            left: oldConfig.x ? `${oldConfig.x}px` : '0px',
            top: oldConfig.y ? `${oldConfig.y}px` : '0px',
            width: oldConfig.width ? `${oldConfig.width}px` : 'auto',
            height: oldConfig.height ? `${oldConfig.height}px` : 'auto'
        };
    }
    
    // Migration du styling
    if (oldConfig.styling) {
        newConfig.style = { ...newConfig.style, ...oldConfig.styling };
        if (oldConfig.styling.itemStyling) {
            newConfig.itemStyle = oldConfig.styling.itemStyling;
        }
    }
    
    return newConfig;
}

// Usage
const oldConfig = { /* ancienne config */ };
const newConfig = migrateListConfig(oldConfig);
const list = new List(newConfig);
```

## 🚀 Recommandations

1. **Migration Progressive**: Migrez un composant à la fois
2. **Tests**: Testez chaque liste migrée individuellement  
3. **Styling**: Profitez des nouvelles capacités CSS
4. **Events**: Remplacez tous les callbacks par des event listeners
5. **Performance**: Utilisez Shadow DOM pour l'isolation

## 📚 Ressources

- [List-API.md](./List-API.md) - Documentation complète v2
- [Examples](../src/application/examples/lists_advanced.js) - Exemples avancés
- [Test Simple](../test-list.html) - Test de base
