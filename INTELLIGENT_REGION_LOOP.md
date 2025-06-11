# 🎵 WaveSurfer Intelligent Region Loop - Documentation

## 📋 Vue d'ensemble

Cette amélioration du composant WaveSurfer ajoute une fonctionnalité de **boucle intelligente des régions** inspirée des exemples officiels de wavesurfer.js. Le système détecte automatiquement les régions pendant la lecture et adapte le comportement de boucle en conséquence.

## 🚀 Nouvelles Fonctionnalités

### 1. **Détection Automatique des Régions**
- Détection en temps réel de l'entrée et sortie des régions
- Événements `region-in` et `region-out` 
- Suivi de la région active pendant la lecture

### 2. **Boucle Intelligente**
- **Boucle de région** : Si vous êtes dans une région quand la boucle est activée, elle boucle automatiquement cette région
- **Boucle complète** : Si vous êtes en dehors des régions, boucle la piste entière
- **Auto-détection** : Le système détecte automatiquement la région actuelle pour la boucle

### 3. **Contrôles Manuels**
- Bouton "Loop Current Region" pour définir manuellement la région à boucler
- Méthode `clearLoopRegion()` pour revenir à la boucle complète
- Indicateurs visuels sur le bouton de boucle

### 4. **Événements Avancés**
- `region-in` : Déclenché en entrant dans une région
- `region-out` : Déclenché en sortant d'une région  
- `region-looped` : Déclenché quand une région recommence
- `loop-configured` : Déclenché quand la configuration de boucle est prête

## 📖 Inspiration et Implémentation

### Sources d'Inspiration
Cette implémentation s'inspire directement des exemples officiels de wavesurfer.js :

#### **examples/regions.js**
```javascript
// Pattern pour la détection des régions actives
let activeRegion = null
regions.on('region-in', (region) => {
    activeRegion = region
})
regions.on('region-out', (region) => {
    if (activeRegion === region) {
        if (loop) {
            region.play()
        }
    }
})
```

#### **examples/silence.js**
```javascript
// Pattern pour l'arrêt automatique à la fin d'une région
ws.on('timeupdate', (currentTime) => {
    if (activeRegion && currentTime >= activeRegion.end) {
        ws.pause()
        activeRegion = null
    }
})
```

### Notre Implémentation Améliorée

```javascript
// Méthode principale pour la gestion de la boucle des régions
handleRegionLoop(currentTime) {
    if (!this.isLooping || !this.isPlaying) return;
    
    if (this.loopRegion) {
        // Vérifier si on a atteint la fin de la région en boucle
        if (currentTime >= this.loopRegion.end) {
            console.log(`🔁 Fin de région "${this.loopRegion.id}", retour à ${this.loopRegion.start.toFixed(2)}s`);
            
            // Retourner au début de la région
            const startProgress = this.loopRegion.start / this.getDuration();
            this.wavesurfer.seekTo(startProgress);
            
            // Émettre un événement personnalisé
            this.dispatchEvent(new CustomEvent('region-looped', { 
                detail: { region: this.loopRegion, wavesurfer: this } 
            }));
        }
    }
}

// Détection et suivi des régions actives
updateActiveRegion(currentTime) {
    const newActiveRegion = this.getActiveRegionAt(currentTime);
    
    // Événement region-in
    if (newActiveRegion && newActiveRegion !== this.activeRegion) {
        this.activeRegion = newActiveRegion;
        console.log(`🎯 Entrée dans la région "${newActiveRegion.id}"`);
        
        this.dispatchEvent(new CustomEvent('region-in', { 
            detail: { region: newActiveRegion, wavesurfer: this } 
        }));
        
        // Auto-configuration de la boucle
        if (this.isLooping && !this.loopRegion) {
            this.setLoopRegion(newActiveRegion);
        }
    }
    
    // Événement region-out
    if (this.activeRegion && (!newActiveRegion || newActiveRegion.id !== this.activeRegion.id)) {
        const oldRegion = this.activeRegion;
        this.dispatchEvent(new CustomEvent('region-out', { 
            detail: { region: oldRegion, wavesurfer: this } 
        }));
        this.activeRegion = newActiveRegion;
    }
}
```

## 🎮 API et Utilisation

### Nouvelles Méthodes

#### `setLoopRegion(region)`
Définit une région spécifique pour la boucle.
```javascript
const region = wavesurfer.getActiveRegionAt(10.5); // Région à 10.5s
wavesurfer.setLoopRegion(region);
```

#### `clearLoopRegion()`
Efface la région de boucle, revient à la boucle complète.
```javascript
wavesurfer.clearLoopRegion();
```

#### `loopCurrentRegion()`
Définit la région à la position actuelle pour la boucle.
```javascript
wavesurfer.loopCurrentRegion();
```

#### `getActiveRegionAt(time)`
Trouve la région active à un temps donné.
```javascript
const region = wavesurfer.getActiveRegionAt(15.3);
if (region) {
    console.log(`Région trouvée: ${region.id}`);
}
```

### Propriétés Ajoutées

- `this.loopRegion` - Région actuellement en boucle (null = boucle complète)
- `this.activeRegion` - Région active pendant la lecture
- Indicateurs visuels sur les boutons de contrôle

### Événements Personnalisés

```javascript
// Écouter les événements de région
wavesurfer.addEventListener('region-in', (event) => {
    const region = event.detail.region;
    console.log(`Entrée dans: ${region.content}`);
});

wavesurfer.addEventListener('region-out', (event) => {
    const region = event.detail.region;
    console.log(`Sortie de: ${region.content}`);
});

wavesurfer.addEventListener('region-looped', (event) => {
    const region = event.detail.region;
    console.log(`Boucle de région: ${region.content}`);
});
```

## 🧪 Tests et Démonstration

### Fichier de Test
- **Emplacement** : `/test_intelligent_region_loop.html`
- **Démo Interactive** : `/src/application/examples/wavesurfer_intelligent_region_loop.js`

### Comment Tester

1. **Ouvrir** `test_intelligent_region_loop.html` dans un navigateur
2. **Cliquer** "Launch Interactive Demo"
3. **Créer des régions** avec les boutons ou en mode sélection
4. **Activer la boucle** et jouer l'audio
5. **Observer** le comportement intelligent :
   - En dehors des régions → boucle la piste complète
   - Dans une région → boucle automatiquement cette région
   - Événements temps réel dans la console

### Scénarios de Test

1. **Test de base** :
   - Créer une région
   - Activer la boucle
   - Jouer dans la région → doit boucler la région

2. **Test d'auto-détection** :
   - Créer plusieurs régions
   - Activer la boucle
   - Se déplacer entre les régions → doit changer automatiquement

3. **Test manuel** :
   - Utiliser "Loop Current Region" 
   - Vérifier la boucle manuelle

4. **Test de nettoyage** :
   - Effacer toutes les régions
   - Vérifier que la boucle revient au mode complet

## 🔧 Configuration

### Activation des Fonctionnalités

```javascript
const wavesurfer = new WaveSurferCompatible({
    // Activer les régions (requis)
    regions: {
        enabled: true,
        dragSelection: true
    },
    
    // Activer les contrôles de boucle
    controls: {
        enabled: true,
        loop: true,
        clearRegions: true
    },
    
    // Mode d'interaction pour créer des régions
    interactionMode: 'selection', // ou 'scrub'
    
    // Callbacks pour les événements de région
    callbacks: {
        onRegionCreate: (region) => console.log('Région créée:', region),
        onRegionUpdate: (region) => console.log('Région mise à jour:', region),
        onRegionRemove: (region) => console.log('Région supprimée:', region)
    }
});

// Événements personnalisés
wavesurfer.addEventListener('region-in', (e) => {
    console.log('Entrée région:', e.detail.region);
});

wavesurfer.addEventListener('region-out', (e) => {
    console.log('Sortie région:', e.detail.region);
});
```

## 📈 Avantages

### Pour les Développeurs
- **API simple** et intuitive
- **Événements riches** pour l'intégration
- **Comportement automatique** intelligent
- **Contrôles manuels** pour les cas avancés

### Pour les Utilisateurs
- **Workflow naturel** : la boucle s'adapte automatiquement
- **Contrôles visuels** clairs
- **Feedback temps réel** des actions
- **Interface intuitive** pour la gestion des régions

## 🏆 Conclusion

Cette implémentation améliore significativement l'expérience utilisateur en automatisant la gestion des boucles de régions tout en gardant la flexibilité pour les contrôles manuels. Elle s'inspire des meilleures pratiques des exemples officiels tout en ajoutant une couche d'intelligence et d'automatisation.

**Status**: ✅ **Implémentation Complète et Testée**

---

*Développé pour le Squirrel Framework - Version 4.1.0*
