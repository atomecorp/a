# 🧹 Script de suppression des console.log

## Description
Script shell qui supprime automatiquement les console.log de test et debug tout en préservant les logs importants du serveur et les messages d'erreur.

## Fonctionnalités

### ✅ **Supprime automatiquement :**
- Console.log avec émojis de debug : 🔥 🧪 📁 📄 ⚡ 🎉 ✨ 💾
- Console.log avec mots-clés : Test, Debug, Architecture, Performance
- Console.log commentés (//console.log...)
- Console.log multi-lignes avec objets complexes

### 🛡️ **Préserve automatiquement :**
- Console.log de serveur : 🚀 ✅ ❌ 🛑 🗑️ 🧹
- Console.error, console.warn, console.info
- Console.log dans les fichiers serveur (*server*, *Server*)
- Console.log normaux sans émojis de debug

## Utilisation

```bash
# Rendre le script exécutable (une seule fois)
chmod +x remove-console-logs.sh

# Exécuter le nettoyage
./remove-console-logs.sh
```

## Protection des fichiers

Le script crée automatiquement des sauvegardes dans un dossier `console_backup_YYYYMMDD_HHMMSS/` avant toute modification.

### Restaurer un fichier :
```bash
cp console_backup_20250605_114808/monFichier.js.backup monFichier.js
```

## Mécanisme de sécurité

### Protection par nom de fichier
Tous les fichiers contenant "server" ou "Server" dans leur nom sont protégés :
- `squirrel-server.js` ✅ Protégé
- `server.js` ✅ Protégé  
- `apiServer.js` ✅ Protégé

### Protection par émoji
Les émojis serveur sont toujours préservés même dans les fichiers non-serveur :
- 🚀 Démarrage serveur
- ✅ Succès
- ❌ Erreur
- 🛑 Arrêt
- 🗑️ Suppression
- 🧹 Nettoyage

## Exemple d'utilisation

**Avant :**
```javascript
console.log('🧪 Test debug info', { data: 'test' });
console.log('🔥 Hot reload debug');
console.log('🚀 Server starting on port 3000');  // GARDÉ
console.log('Normal message');                    // GARDÉ
```

**Après :**
```javascript
console.log('🚀 Server starting on port 3000');  // GARDÉ
console.log('Normal message');                    // GARDÉ
```

## Gestion des erreurs

Le script valide automatiquement la syntaxe JavaScript après modification. En cas d'erreur, utilisez les sauvegardes pour restaurer.

## Logs d'exécution

Le script affiche :
- 📊 Nombre total de lignes supprimées
- 📊 Nombre de fichiers modifiés
- 📋 Emplacement des sauvegardes
- ✅/ℹ️ Statut de chaque fichier traité
