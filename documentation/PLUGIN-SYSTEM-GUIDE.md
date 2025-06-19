# 🔌 Système de Plugins Squirrel.js

## Vue d'ensemble

Le système de plugins Squirrel.js permet le chargement automatique et conditionnel des composants. Plus besoin d'importer manuellement chaque composant !

## Fonctionnalités

### ✅ **Auto-Discovery**
- Scan automatique du dossier `components/`
- Enregistrement paresseux de tous les plugins trouvés
- Chargement à la demande

### ✅ **Chargement Conditionnel**
```javascript
// Charger seulement les plugins nécessaires
await Squirrel.use(['Button', 'Slider']);

// Charger un plugin unique
await Squirrel.use('Matrix');
```

### ✅ **API Simplifiée**
```javascript
// Utilisation directe après chargement
const button = window.Button({ text: 'Mon Bouton' });

// Ou via l'API Squirrel
const slider = await Squirrel.slider({ min: 0, max: 100 });
```

## Plugins Disponibles

- **Button** - Système de boutons avancé
- **Slider** - Contrôles de type slider
- **Matrix** - Grilles et matrices interactives  
- **Module** - Éditeur de modules (type node editor)
- **Table** - Tableaux dynamiques
- **List** - Listes interactives
- **Menu** - Système de menus
- **Draggable** - Fonctionnalités drag & drop
- **Wavesurfer** - Lecteur audio avancé

## Utilisation

### Chargement Automatique (par défaut)
```javascript
// Tous les plugins sont chargés automatiquement
// Disponibles via window.PluginName
const button = window.Button({ text: 'Hello' });
```

### Chargement Conditionnel
```javascript
// Charger seulement les plugins nécessaires
await Squirrel.use(['Button', 'Slider']);

// Utilisation normale
const button = window.Button({ text: 'Hello' });
const slider = window.Slider({ min: 0, max: 100 });
```

### Chargement À la Demande
```javascript
// Charger un plugin quand nécessaire
await window.loadPlugin('Matrix');

if (window.Matrix) {
  const matrix = new window.Matrix({ rows: 3, cols: 3 });
}
```

### Utilitaires
```javascript
// Voir les plugins disponibles
window.listPlugins();

// Vérifier le statut
const status = window.Squirrel.getPluginStatus();
console.log(status);

// Fonction utilitaire pour usage conditionnel
window.usePluginIfAvailable('Matrix', (Matrix) => {
  // Code utilisant Matrix
});
```

## APIs Disponibles

### PluginManager
- `discover()` - Découverte automatique
- `load(pluginName)` - Chargement d'un plugin
- `loadAll()` - Chargement de tous les plugins
- `getStatus()` - Statut des plugins

### Squirrel API
- `use(pluginNames)` - Chargement conditionnel
- `plugin(pluginName)` - Chargement unique
- `hasPlugin(name)` - Vérification disponibilité
- `isPluginLoaded(name)` - Vérification chargement

### APIs Globales
- `window.loadPlugin(name)` - Chargement manuel
- `window.listPlugins()` - Liste et statut
- `window.usePluginIfAvailable(name, callback)` - Usage conditionnel

## Exemples

Voir `src/application/examples/plugins-demo.js` pour des exemples complets d'utilisation.

## Migration

### Avant (imports manuels)
```javascript
import('./components/button_builder.js');
import('./components/slider_builder.js');
// ...
```

### Après (système de plugins)
```javascript
// Chargement automatique ou conditionnel
await Squirrel.use(['Button', 'Slider']);
```

## Avantages

- 🚀 **Performance** - Chargement seulement des plugins nécessaires
- 🔧 **Simplicité** - Plus d'imports manuels à gérer
- 📦 **Modularité** - Plugins totalement indépendants
- 🎯 **Flexibilité** - Chargement conditionnel selon le contexte
- 🔌 **Extensibilité** - Ajout de nouveaux plugins sans modification du core
