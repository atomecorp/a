# 🖥️ Console Component API

## Vue d'ensemble

Le composant Console est un terminal JavaScript interactif qui permet de :
- Afficher tous les messages de `console.log`, `console.warn`, `console.error`, etc.
- Saisir et exécuter des commandes JavaScript
- Copier, sélectionner et gérer le contenu
- Déplacer et redimensionner la fenêtre
- Personnaliser l'apparence avec des thèmes

## Utilisation de base

```javascript
// Créer une console simple
const myConsole = Console({
  title: 'Ma Console',
  position: { x: 100, y: 100 },
  size: { width: 600, height: 400 }
});

// Afficher la console
myConsole.show();
```

## API Complète

### Création

```javascript
const console = Console({
  // === CONFIGURATION DE BASE ===
  id: 'mon-id-unique',                    // ID personnalisé (optionnel)
  title: 'Ma Console',                    // Titre de la fenêtre
  position: { x: 100, y: 100 },           // Position initiale
  size: { width: 600, height: 400 },      // Taille initiale
  attach: 'body',                         // Élément parent (sélecteur CSS)
  
  // === APPARENCE ===
  template: 'dark_theme',                 // Thème: 'dark_theme', 'light_theme', 'terminal_green', 'minimal', 'large_header'
  headerHeight: 24,                       // Hauteur du header en pixels (optionnel, dépend du template)
  headerPadding: '4px 8px',              // Padding du header (optionnel, dépend du template)
  
  // === COMPORTEMENT ===
  draggable: true,                        // Fenêtre déplaçable
  resizable: true,                        // Fenêtre redimensionnable
  interceptConsole: true,                 // Intercepter console.log, etc.
  
  // === COMMANDES PERSONNALISÉES ===
  commands: {
    'test()': () => 'Commande de test!',
    'time()': () => new Date().toLocaleString()
  },
  
  // === CALLBACKS ===
  onCommand: (command) => {
    // Handler personnalisé pour les commandes
    if (command === 'special') {
      return 'Commande spéciale exécutée!';
    }
    // Retourner undefined pour laisser l'exécution normale
  },
  
  onClose: () => {
    console.log('Console fermée');
  }
});
```

### Méthodes

```javascript
// === CONTRÔLE D'AFFICHAGE ===
console.show()                          // Afficher la console
console.hide()                          // Masquer la console
console.toggle()                        // Basculer l'affichage
console.isVisible()                     // Vérifier si visible

// === CONTENU ===
console.clear()                         // Vider la console
console.addMessage({                    // Ajouter un message
  type: 'info',                         // Type: 'log', 'error', 'warn', 'info', 'debug'
  message: 'Mon message',
  timestamp: new Date().toLocaleTimeString()
})

// === COMMANDES ===
console.addCommand('nom()', () => {     // Ajouter une commande
  return 'Résultat de la commande';
})
console.removeCommand('nom()')          // Supprimer une commande

// === HISTORIQUE ===
console.getHistory()                    // Obtenir l'historique des commandes
console.getOutput()                     // Obtenir tous les messages

// === POSITION ET TAILLE ===
console.setPosition(x, y)               // Changer la position
console.setSize(width, height)          // Changer la taille
console.center()                        // Centrer à l'écran
console.bringToFront()                  // Mettre au premier plan
console.setHeaderHeight(height)         // Changer la hauteur du header
console.setHeaderPadding(padding)       // Changer le padding du header
console.copyContent()                   // Copier tout le contenu dans le presse-papiers

// === DESTRUCTION ===
console.destroy()                       // Détruire la console
```

### Raccourcis Clavier Intégrés

Dans la console :
- **Flèche Haut/Bas** : Navigation dans l'historique des commandes
- **Tab** : Auto-complétion basique
- **Entrée** : Exécuter la commande

Raccourcis globaux (si configurés) :
- **F12** : Basculer la console principale
- **Ctrl+Shift+C** : Console de debug
- **Échap** : Fermer toutes les consoles

### Commandes par Défaut

```javascript
help()          // Afficher l'aide
clear()         // Vider la console
copy()          // Copier le contenu dans le presse-papiers (nouvelle méthode améliorée)
history()       // Afficher l'historique des commandes
version()       // Version de la console
```

### Interface de la Console

La barre de titre inclut maintenant trois boutons de contrôle :
- **📋** : Copier tout le contenu de la console dans le presse-papiers
- **🗑️** : Vider la console
- **✕** : Fermer la console

Tous les boutons ont des effets visuels au survol et s'adaptent automatiquement à la taille du header.

### Thèmes Disponibles

- **`dark_theme`** : Thème sombre type IDE (défaut) - Header 24px
- **`light_theme`** : Thème clair - Header 24px
- **`terminal_green`** : Style terminal rétro vert - Header 20px
- **`minimal`** : Console minimaliste avec header ultra-fin - Header 18px
- **`large_header`** : Console avec header plus grand pour plus de lisibilité - Header 36px

### Contrôle de la Taille du Header

```javascript
// Header personnalisé lors de la création
const console = Console({
  title: 'Ma Console',
  template: 'dark_theme',
  headerHeight: 30,           // Header de 30px
  headerPadding: '6px 10px'   // Padding personnalisé
});

// Modification dynamique après création
console.setHeaderHeight(20);           // Réduire à 20px
console.setHeaderPadding('2px 6px');   // Réduire le padding
```

### Gestionnaire de Consoles

```javascript
// Créer un gestionnaire pour plusieurs consoles
const manager = new ConsoleManager();

// Créer une console nommée
const debugConsole = manager.create('debug', {
  title: 'Debug Console',
  template: 'dark_theme'
});

// Contrôler par nom
manager.show('debug');
manager.hide('debug');
manager.hideAll();
manager.destroy('debug');
```

### Exemples d'Usage

```javascript
// Console de debug avec interception
const debugConsole = Console({
  title: 'Debug',
  template: 'dark_theme',
  interceptConsole: true
});
debugConsole.show();

// Console avec commandes personnalisées
const apiConsole = Console({
  title: 'API Console',
  template: 'light_theme',
  commands: {
    'users()': () => 'Fetching users...',
    'clear_cache()': () => { /* logic */ return 'Cache cleared'; }
  }
});

// Console style terminal
const terminalConsole = Console({
  title: 'Terminal',
  template: 'terminal_green',
  onCommand: (cmd) => {
    if (cmd.startsWith('ls')) return 'file1.js file2.js';
    if (cmd.startsWith('pwd')) return '/current/directory';
  }
});
```

## Types de Messages

Les messages peuvent avoir différents types qui affectent leur couleur :
- `log` : Couleur normale
- `error` : Rouge
- `warn` : Orange/Jaune
- `info` : Bleu
- `debug` : Violet
- `command` : Couleur personnalisée pour les commandes saisies
- `result` : Couleur personnalisée pour les résultats

## Personnalisation Avancée

Vous pouvez créer vos propres thèmes :

```javascript
Console.addTemplate('mon_theme', {
  name: 'Mon Thème',
  description: 'Mon thème personnalisé',
  css: {
    backgroundColor: '#2d2d2d',
    color: '#ffffff',
    fontFamily: 'Monaco, monospace'
  },
  headerStyle: {
    backgroundColor: '#404040',
    borderBottom: '1px solid #555'
  },
  outputStyle: {
    backgroundColor: '#2d2d2d'
  },
  inputStyle: {
    backgroundColor: '#333333',
    border: '1px solid #555'
  }
});
```
