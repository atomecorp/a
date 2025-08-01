# Guide de Logs iOS pour Atome

## Filtrage des Logs dans Xcode

Pour voir uniquement les logs de votre application Atome et ignorer les erreurs système iOS, suivez ces étapes :

### 1. Ouvrir la Console Xcode

- Ouvrez Xcode
- Allez dans `Window` → `Devices and Simulators`
- Sélectionnez votre appareil iOS
- Cliquez sur `Open Console`

### 2. Filtrer les Logs

Dans la barre de recherche de la console, tapez :

```
⚛️ ATOME-APP
```

Cela affichera uniquement les logs de votre application Atome.

## Types de Logs à Surveiller

### ✅ Logs Importants - Application Atome

```
⚛️ ATOME-APP: 🚀 ATOME APPLICATION STARTING...
⚛️ ATOME-APP: [DRAG-DROP] 📂 Processing file: example.lrx
⚛️ ATOME-APP: [DRAG-DROP] 📦 Audio path assigned: Change%20the%20world.m4a
⚛️ ATOME-APP: [NORMALIZE] Called with audioPath: Change%20the%20world.m4a
⚛️ ATOME-APP: [iOS-AUDIO] Original fileName: Change%20the%20world.m4a
⚛️ ATOME-APP: [iOS-CREATE] Final URL: http://localhost:3000/medias/audio/Change%20the%20world.m4a
```

### ❌ Erreurs Système iOS à Ignorer

```
Could not create a sandbox extension for '/var/containers/Bundle/Application/...'
Failed to associate thumbnails for picked URL file:///.../lyrix_library_2025-08-01.lrx
The view service did terminate with error: Error Domain=_UIViewServiceErrorDomain...
```

## Étapes de Debug pour .lrx Files

1. **Chargement de l'app** : Recherchez `🚀 LYRIX APPLICATION STARTING`
2. **Import .lrx** : Recherchez `📦 Processing LRX file`
3. **Chemins audio** : Recherchez `Audio path assigned` pour voir les chemins dans le fichier .lrx
4. **Normalisation** : Recherchez `NORMALIZE` pour voir comment les chemins sont traités
5. **URL finale** : Recherchez `Final URL` pour voir l'URL générée

## Test des Fichiers avec Espaces

Pour tester les fichiers audio avec des espaces dans le nom :

1. **Import direct** : Glissez un fichier audio avec des espaces
   - Recherchez : `Direct space replacement`

2. **Import .lrx** : Importez un fichier .lrx contenant des chemins avec %20
   - Recherchez : `Using pre-encoded filename from .lrx`

## Résolution des Problèmes

Si l'audio ne fonctionne pas :
1. Vérifiez que l'URL finale est correcte dans les logs
2. Assurez-vous que le serveur audio fonctionne (localhost:3000)
3. Recherchez les erreurs `❌ Failed to normalize audio path`

Les erreurs système iOS (sandbox extension, thumbnails) sont normales et ne bloquent pas l'application.
