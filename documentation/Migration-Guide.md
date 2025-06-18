# 🚀 Guide de Migration Squirrel.js - Fini l'Attente !

## 🎉 Nouveauté : Plus Besoin d'Attendre `squirrel:ready` !

Avec la nouvelle version de Squirrel.js, vous pouvez utiliser les APIs **immédiatement** après le chargement du script. Fini les attentes inutiles !

## ⚡ Migration Rapide

### ❌ Ancien Code (à éviter)
```javascript
window.addEventListener('squirrel:ready', () => {
    // Tout votre code était ici
    define('my-button', { tag: 'button', class: 'btn' });
    const button = $('my-button', { text: 'Hello!' });
    makeDraggable(button);
});
```

### ✅ Nouveau Code (moderne)
```javascript
// 🚀 APIs disponibles IMMÉDIATEMENT
define('my-button', { tag: 'button', class: 'btn' });

// 🏠 Pour créer des éléments DOM, utiliser whenSquirrelDOMReady
window.whenSquirrelDOMReady(() => {
    const button = $('my-button', { text: 'Hello!' });
    makeDraggable(button);
});
```

## 🎯 APIs Disponibles Immédiatement

Dès que le script `squirrel.js` est chargé, ces APIs sont prêtes :

- ✅ `$()` - Création d'éléments
- ✅ `define()` - Définition de templates  
- ✅ `grab()` - Sélection d'éléments
- ✅ `puts()` - Logging
- ✅ `makeDraggable()` - Drag & drop
- ✅ `Button()`, `Slider()`, `Matrix()`, etc. - Tous les composants
- ✅ Toutes les fonctions utilitaires

## 🏠 Deux Niveaux de Prêt

### 1. APIs Prêtes (Immédiat)
```javascript
// ✅ Fonctionne immédiatement
console.log('$ disponible:', typeof $ !== 'undefined'); // true
define('mon-template', { tag: 'div', class: 'ma-classe' });
```

### 2. DOM Prêt (Quand nécessaire)
```javascript
// ✅ Pour créer des éléments dans le DOM
window.whenSquirrelDOMReady(() => {
    const element = $('mon-template', { text: 'Hello!' });
});
```

## 🔄 Rétrocompatibilité

L'ancien événement `squirrel:ready` continue de fonctionner :

```javascript
// ✅ Fonctionne toujours (mais pas nécessaire)
window.addEventListener('squirrel:ready', () => {
    console.log('Prêt !');
});
```

## 🎯 Exemples Pratiques

### Créer un Bouton Moderne
```javascript
// Définir le template immédiatement
define('super-button', {
    tag: 'button',
    css: {
        backgroundColor: '#007bff',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '6px'
    }
});

// Créer quand le DOM est prêt
window.whenSquirrelDOMReady(() => {
    const button = $('super-button', {
        text: 'Cliquez-moi !',
        onclick: () => alert('Hello!')
    });
});
```

### Créer une Matrix Interactive
```javascript
// Configuration immédiate
const matrixConfig = {
    grid: { x: 4, y: 4 },
    states: {
        hover: { backgroundColor: '#e9ecef' },
        selected: { backgroundColor: '#007bff', color: 'white' }
    }
};

// Création quand prêt
window.whenSquirrelDOMReady(() => {
    const matrix = Matrix(matrixConfig);
});
```

### Slider avec Callback
```javascript
// Pas d'attente nécessaire !
window.whenSquirrelDOMReady(() => {
    const slider = Slider({
        min: 0,
        max: 100,
        value: 50,
        onChange: (value) => console.log(`Valeur: ${value}`)
    });
});
```

## 🛠️ Fonctions Utilitaires

### `window.whenSquirrelReady(callback)`
Exécute immédiatement (APIs toujours prêtes)

### `window.whenSquirrelDOMReady(callback)`  
Exécute quand DOM et kickstart sont prêts

### Vérifications d'État
```javascript
console.log('APIs prêtes:', window.squirrelReady); // true
console.log('DOM prêt:', window.squirrelDomReady); // true/false
```

## 🎁 Avantages

1. **Code plus simple** - Plus d'événements à gérer
2. **Démarrage instantané** - APIs disponibles immédiatement
3. **Meilleure UX** - Pas d'attente artificielle
4. **Code plus lisible** - Séparation définition/création
5. **100% compatible** - L'ancien code continue de fonctionner

## 🚀 Commencez Maintenant !

Remplacez simplement :
```javascript
window.addEventListener('squirrel:ready', () => { /* code */ });
```

Par :
```javascript
// Définitions immédiatement
// ...

// Création DOM quand prêt
window.whenSquirrelDOMReady(() => { /* code */ });
```

**C'est tout !** Votre code sera plus rapide et plus moderne ! 🎉
