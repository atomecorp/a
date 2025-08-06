# AUv3 File Handling - Guide d'utilisation

## Vue d'ensemble

Le fichier `auv3_file_handling.js` démontre comment utiliser l'API de gestion de fichiers native iOS dans votre application AUv3 avec la syntaxe Squirrel.

## Fonctionnalités disponibles

### 🔧 API de base
- `sauvegarderProjet(data, name)` - Sauvegarde un projet
- `chargerProjet(name)` - Charge un projet existant
- `exporterAudio(audioData, fileName)` - Exporte de l'audio
- `listerFichiers(folder, container)` - Liste les fichiers d'un dossier

### 🎨 Interface utilisateur
- `creerInterfaceFichiers()` - Interface complète de gestion des fichiers
- Interface avec boutons pour sauvegarder, charger et lister les fichiers
- Feedback visuel avec notifications et barres de progression

### ⚡ Fonctionnalités avancées
- `activerSauvegardeAutomatique()` - Sauvegarde automatique périodique
- `exporterAudioAvecFeedback()` - Export avec barre de progression
- `testerApiFichiers()` - Test automatique de l'API

## Comment utiliser

### 1. Chargement dans votre projet

```javascript
// Dans votre fichier principal, incluez l'exemple
import './examples/auv3_file_handling.js';
```

### 2. Ouverture de l'interface

```javascript
// Ouvre l'interface de gestion des fichiers
window.FileHandlingExample.creerInterfaceFichiers();
```

### 3. Test de l'API

```javascript
// Teste toutes les fonctionnalités de base
await window.FileHandlingExample.testerApiFichiers();
```

### 4. Utilisation programmatique

```javascript
// Sauvegarder des données
const monProjet = {
    version: '1.0',
    atoms: [/* vos atomes */],
    settings: {/* vos paramètres */}
};

await window.FileHandlingExample.sauvegarderProjet(monProjet, 'MonProjet');

// Charger des données
const projet = await window.FileHandlingExample.chargerProjet('MonProjet');
console.log('Projet chargé:', projet);
```

## Structure des fichiers

### Dossiers disponibles
- `Projects/` - Projets Atome (.atome)
- `Exports/` - Fichiers audio exportés (.wav)
- `Recordings/` - Enregistrements audio
- `Templates/` - Modèles et presets

### Emplacement des fichiers
- **Local** : Documents/AtomeFiles/
- **Files app** : "Sur mon iPhone/iPad" > "Atome"

## Exemples d'utilisation avec Squirrel

### Bouton de sauvegarde rapide

```javascript
const boutonSave = $('button', {
    text: '💾 Sauvegarder',
    css: {
        padding: '10px 20px',
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer'
    }
});

boutonSave.addEventListener('click', async () => {
    const data = collecterDonneesProjets(); // Votre fonction
    await window.FileHandlingExample.sauvegarderProjet(data, 'MonProjet');
});
```

### Liste de projets interactive

```javascript
const container = $('div', {
    id: 'projectsList',
    css: { padding: '20px' }
});

// Lister et afficher les projets
await window.FileHandlingExample.listerFichiers('Projects', container);
```

### Sauvegarde automatique

```javascript
// Sauvegarde automatique toutes les 30 secondes
const autoSaveId = window.FileHandlingExample.activerSauvegardeAutomatique('MonProjet', 30);

// Arrêter la sauvegarde automatique plus tard
clearInterval(autoSaveId);
```

## Gestion d'erreurs

```javascript
try {
    await window.FileHandlingExample.sauvegarderProjet(data, 'test');
} catch (error) {
    console.error('Erreur sauvegarde:', error);
    
    // Afficher un message d'erreur avec Squirrel
    $('div', {
        text: `❌ Erreur: ${error.message}`,
        css: {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '10px',
            backgroundColor: '#f44336',
            color: 'white',
            borderRadius: '5px'
        }
    });
}
```

## Notes techniques

### Compatibilité AUv3
- ✅ Compatible avec les extensions Audio Unit v3
- ✅ Fonctionne sans `UIApplication.shared`
- ✅ Gestion mémoire optimisée avec weak references

### Formats de fichiers
- **Projets** : JSON (.atome)
- **Audio** : WAV, MP3, AAC
- **Métadonnées** : Nom, taille, date de modification

### Limitations actuelles
- 📁 Mode local uniquement (iCloud prêt mais désactivé)
- 🔒 Accès limité au dossier AtomeFiles
- 📱 Nécessite iOS 13+ pour l'API Files

## Débogage

### Console de développement

```javascript
// Activer les logs détaillés
window.AtomeFileSystem.getStorageInfo((info) => {
    console.log('📊 État du stockage:', info);
});

// Tester la connectivité
if (typeof window.AtomeFileSystem === 'undefined') {
    console.error('❌ API non disponible');
} else {
    console.log('✅ API disponible');
}
```

### Vérification des fichiers

```javascript
// Vérifier si un fichier existe
window.AtomeFileSystem.loadFile('Projects/test.atome', (result) => {
    if (result.success) {
        console.log('✅ Fichier existe');
    } else {
        console.log('❌ Fichier introuvable');
    }
});
```

## Support et développement

Pour des questions ou des améliorations :
1. Vérifiez que WebViewManager.swift inclut bien l'API
2. Consultez les logs de la console pour les erreurs
3. Testez avec `testerApiFichiers()` en premier

---

*Cet exemple démontre les meilleures pratiques pour l'intégration file system dans les applications AUv3 avec Squirrel.*
