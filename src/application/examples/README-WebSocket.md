# 🔌 Exemple WebSocket avec Fastify et Squirrel

Cet exemple démontre comment utiliser WebSocket avec le serveur Fastify sur le port 3001 en utilisant les APIs Squirrel pour l'interface utilisateur.

## 🚀 Démarrage rapide

### 1. Démarrer le serveur Fastify

```bash
cd /Users/jean-ericgodard/RubymineProjects/a
npm run server
```

Ou utilisez le script direct :
```bash
./run_fastify.sh
```

### 2. Ouvrir l'exemple WebSocket

Ouvrez votre navigateur et allez à :
```
http://localhost:3001/application/examples/ws.html
```

## 🎯 Fonctionnalités

### Health Check
- **Bouton "Vérifier l'état du serveur"** : Teste la route `/health` du serveur Fastify
- Affiche les informations du serveur (version, uptime, etc.)
- Indique si le serveur est opérationnel

### WebSocket Communication
- **Connexion/Déconnexion** : Boutons pour gérer la connexion WebSocket
- **Envoi de messages** : Interface pour envoyer des messages au serveur
- **Logs en temps réel** : Affichage de tous les messages échangés
- **Messages structurés** : Support JSON pour les messages

### Démonstration Interactive
- **Box animée** : Élément cliquable avec animation CSS
- **Synchronisation WebSocket** : Les animations sont synchronisées via WebSocket
- **Animation automatique** : Séquence d'animations programmées

## 🔧 APIs Squirrel utilisées

L'exemple utilise intensivement les APIs Squirrel :

```javascript
// Création d'éléments avec style et événements
const element = $('div', {
  css: {
    backgroundColor: '#007bff',
    padding: '20px',
    borderRadius: '8px'
  },
  text: 'Contenu',
  onclick: handleClick,
  parent: container
});
```

## 📡 Endpoints WebSocket disponibles

### `/ws` - WebSocket principal
- Messages de bienvenue automatiques
- Echo des messages avec enrichissement
- Gestion des erreurs et déconnexions

### `/ws/events` - Événements temps réel
- Événements périodiques toutes les 5 secondes
- Données de monitoring du serveur

## 🎮 Structure de l'exemple

```
ws.js - Application principale
├── Health Check Section
│   ├── Bouton de test
│   └── Affichage des résultats
├── WebSocket Section
│   ├── Contrôles de connexion
│   ├── Interface de messagerie
│   └── Logs des messages
└── Démonstration Interactive
    ├── Box animée
    └── Animation automatique
```

## 🛠 Messages WebSocket supportés

### Messages envoyés au serveur :

```javascript
// Message simple
{
  type: 'message',
  content: 'Votre message',
  timestamp: '2025-06-16T...',
  from: 'client'
}

// Animation
{
  type: 'animation',
  action: 'box_click',
  position: 200,
  timestamp: '2025-06-16T...'
}
```

### Messages reçus du serveur :

```javascript
// Bienvenue
{
  type: 'welcome',
  message: 'Connexion WebSocket établie...',
  timestamp: '2025-06-16T...'
}

// Echo
{
  type: 'echo',
  original: { /* message original */ },
  timestamp: '2025-06-16T...',
  server: 'Fastify v5'
}
```

## 🎨 Styles et animations

L'exemple utilise :
- **CSS Grid et Flexbox** pour la mise en page
- **Transitions CSS** pour les animations fluides
- **Responsive design** pour différentes tailles d'écran
- **Thème moderne** avec des couleurs cohérentes

## 🔍 Debugging

- Ouvrez les DevTools pour voir les logs console
- La section "Logs des messages" affiche tous les échanges WebSocket
- Le Health Check indique l'état de connexion au serveur

## 📝 Personnalisation

Vous pouvez facilement :
- Modifier les couleurs et styles CSS
- Ajouter de nouveaux types de messages
- Créer des animations personnalisées
- Étendre les fonctionnalités WebSocket

## 🚨 Résolution de problèmes

### Le serveur ne répond pas
1. Vérifiez que le serveur Fastify est démarré
2. Confirmez que le port 3001 est libre
3. Testez manuellement : `curl http://localhost:3001/health`

### WebSocket ne se connecte pas
1. Vérifiez que le Health Check fonctionne
2. Confirmez l'URL WebSocket : `ws://localhost:3001/ws`
3. Vérifiez les logs du serveur pour les erreurs

### L'interface ne s'affiche pas
1. Vérifiez que `squirrel.js` est chargé
2. Ouvrez les DevTools pour voir les erreurs JavaScript
3. Confirmez que vous accédez via HTTP (pas file://)
