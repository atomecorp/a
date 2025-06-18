# 🚀 Squirrel.js - Guide d'Utilisation Modernisé

## ✨ Nouveauté : Plus Besoin d'Attendre !

Avec la nouvelle version de Squirrel.js, **vous n'avez plus besoin d'attendre l'événement `squirrel:ready`** pour utiliser les APIs ! Le framework s'initialise immédiatement lors du chargement du script.

## 🔥 Utilisation Moderne (Recommandée)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Mon Application Squirrel</title>
</head>
<body>
    <!-- Charger Squirrel -->
    <script src="./squirrel.js"></script>
    
    <!-- Votre code peut s'exécuter immédiatement ! -->
    <script>
        // ✅ APIs disponibles immédiatement
        console.log('$ disponible:', typeof $ !== 'undefined'); // true
        
        // ✅ Définir des templates immédiatement
        define('my-button', {
            tag: 'button',
            class: 'btn',
            css: { padding: '10px', backgroundColor: '#007acc' }
        });
        
        // ✅ Pour créer des éléments DOM, utiliser whenSquirrelDOMReady
        window.whenSquirrelDOMReady(() => {
            const button = $('my-button', {
                text: 'Cliquez-moi !',
                parent: document.body,
                onclick: () => alert('Hello!')
            });
            
            // Ajouter du dragging
            makeDraggable(button);
        });
    </script>
</body>
</html>
```

## 🎯 Deux Niveaux d'Initialisation

### 1. APIs Immédiatement Disponibles
Dès que le script est chargé, ces APIs sont prêtes :
- `$()` - Création d'éléments
- `define()` - Définition de templates
- `grab()` - Sélection d'éléments
- `puts()` - Logging
- Tous les builders de composants (`Button`, `Slider`, etc.)
- Toutes les fonctions utilitaires (`makeDraggable`, etc.)

### 2. DOM Ready pour Création d'Éléments
Pour créer des éléments dans le DOM, utiliser une de ces méthodes :

```javascript
// Méthode 1 : Fonction utilitaire (recommandée)
window.whenSquirrelDOMReady(() => {
    // Créer vos éléments ici
    const element = $('div', { text: 'Hello!' });
});

// Méthode 2 : Vérification manuelle
if (window.squirrelDomReady) {
    // DOM déjà prêt
} else {
    window.addEventListener('squirrel:ready', () => {
        // DOM maintenant prêt
    });
}
```

## 🔄 Migration depuis l'Ancienne Version

### Avant (à éviter)
```javascript
window.addEventListener('squirrel:ready', () => {
    // Tout votre code ici
    define('my-element', { ... });
    const element = $('my-element', { ... });
});
```

### Après (moderne)
```javascript
// Définitions immédiatement
define('my-element', { ... });

// Création DOM quand prêt
window.whenSquirrelDOMReady(() => {
    const element = $('my-element', { ... });
});
```

## 🛡️ Rétrocompatibilité

L'événement `squirrel:ready` continue de fonctionner pour la compatibilité, mais **il n'est plus nécessaire** dans la plupart des cas.

## 🎁 Fonctions Utilitaires

### `window.whenSquirrelReady(callback)`
Exécute le callback immédiatement car les APIs sont toujours prêtes.

### `window.whenSquirrelDOMReady(callback)`
Exécute le callback quand le DOM et kickstart sont prêts.

### État Global
- `window.squirrelReady` - Toujours `true` (APIs prêtes)
- `window.squirrelDomReady` - `true` quand le DOM est initialisé

## 🚀 Avantages

1. **Code plus simple** - Plus d'événements à gérer
2. **Démarrage plus rapide** - APIs disponibles immédiatement  
3. **Meilleure UX** - Pas d'attente artificielle
4. **Code plus lisible** - Logique de définition séparée de la création
5. **Toujours compatible** - L'ancien code continue de fonctionner

## 🎯 Exemple Complet

```javascript
// === DÉFINITIONS (immédiatement) ===
define('app-header', {
    tag: 'header',
    css: { background: '#333', color: 'white', padding: '20px' }
});

define('app-button', {
    tag: 'button', 
    css: { padding: '10px', borderRadius: '5px' }
});

// === CRÉATION DOM (quand prêt) ===
window.whenSquirrelDOMReady(() => {
    const header = $('app-header', {
        text: 'Mon Application',
        parent: document.body
    });
    
    const button = $('app-button', {
        text: 'Action',
        parent: document.body,
        onclick: () => console.log('Action!')
    });
    
    makeDraggable(button);
});
```

Ce nouveau système assure une expérience développeur fluide sans compromis sur la robustesse !
