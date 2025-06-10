# 🎵 WaveSurfer API - Lecteur Audio avec Forme d'Onde

## 🚀 Utilisation de base

### Créer un lecteur simple
```javascript
const player = new WaveSurfer({
    attach: 'body',
    id: 'my_player',
    x: 50, y: 100,
    width: 600, height: 150,
    audioUrl: 'assets/audios/song.mp3'
});
```

## ⚙️ Configuration

| Option | Type | Description | Défaut |
|--------|------|-------------|--------|
| `audioUrl` | string | URL du fichier audio | requis |
| `waveColor` | string | Couleur de la forme d'onde | `'#999'` |
| `progressColor` | string | Couleur de progression | `'#555'` |
| `cursorColor` | string | Couleur du curseur | `'#333'` |
| `height` | number | Hauteur du composant | `128` |
| `barWidth` | number | Largeur des barres | `2` |
| `barGap` | number | Espacement entre barres | `1` |

```javascript
const customPlayer = new WaveSurfer({
    attach: 'body',
    x: 50, y: 100,
    width: 800, height: 200,
    audioUrl: 'assets/audios/music.mp3',
    waveColor: '#ddd',
    progressColor: '#ff6b6b',
    cursorColor: '#ff0000',
    barWidth: 3,
    barGap: 1
});
```

## 🎛️ Contrôles

### Lecture/Pause
```javascript
const player = new WaveSurfer({
    audioUrl: 'music.mp3',
    // ... autres options
});

// Lire
player.play();

// Pause
player.pause();

// Stop
player.stop();

// Basculer play/pause
player.playPause();
```

### Navigation
```javascript
// Aller à un pourcentage (0-1)
player.seekTo(0.5); // Milieu du fichier

// Aller à un temps en secondes
player.setCurrentTime(30);

// Obtenir la durée totale
const duration = player.getDuration();

// Obtenir le temps actuel
const currentTime = player.getCurrentTime();
```

## 📊 Événements

```javascript
const player = new WaveSurfer({
    audioUrl: 'music.mp3',
    callbacks: {
        // Quand l'audio est prêt
        ready: () => {
            console.log('Audio chargé et prêt');
        },
        
        // Pendant la lecture
        audioprocess: (currentTime) => {
            console.log('Temps actuel:', currentTime);
        },
        
        // Quand la lecture commence
        play: () => {
            console.log('Lecture démarrée');
        },
        
        // Quand la lecture s'arrête
        pause: () => {
            console.log('Lecture en pause');
        },
        
        // Quand l'audio se termine
        finish: () => {
            console.log('Lecture terminée');
        },
        
        // Quand on clique sur la forme d'onde
        seek: (progress) => {
            console.log('Navigation vers:', progress);
        }
    }
});
```

## 🎨 Exemple complet avec contrôles

```javascript
// Créer le conteneur principal
const playerContainer = new A({
    attach: 'body',
    x: 50, y: 50,
    width: 700, height: 250,
    backgroundColor: '#f8f9fa',
    smooth: 10,
    padding: 20
});

// Créer le lecteur WaveSurfer
const audioPlayer = new WaveSurfer({
    attach: playerContainer,
    x: 0, y: 60,
    width: 660, height: 120,
    audioUrl: 'assets/audios/Ices_From_Hells.m4a',
    waveColor: '#e9ecef',
    progressColor: '#007bff',
    cursorColor: '#dc3545',
    barWidth: 2,
    callbacks: {
        ready: () => {
            console.log('Audio prêt à être lu');
            playButton.text('▶️ Play');
        },
        play: () => playButton.text('⏸️ Pause'),
        pause: () => playButton.text('▶️ Play'),
        audioprocess: (time) => {
            const minutes = Math.floor(time / 60);
            const seconds = Math.floor(time % 60);
            timeDisplay.text(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
    }
});

// Bouton Play/Pause
const playButton = new A({
    attach: playerContainer,
    x: 10, y: 10,
    width: 100, height: 40,
    backgroundColor: '#007bff',
    color: 'white',
    text: '⏳ Loading...',
    smooth: 5,
    textAlign: 'center',
    lineHeight: '40px',
    cursor: 'pointer',
    onClick: () => audioPlayer.playPause()
});

// Affichage du temps
const timeDisplay = new A({
    attach: playerContainer,
    x: 120, y: 10,
    width: 100, height: 40,
    text: '0:00',
    fontSize: 16,
    lineHeight: '40px'
});

// Bouton Stop
const stopButton = new A({
    attach: playerContainer,
    x: 230, y: 10,
    width: 80, height: 40,
    backgroundColor: '#dc3545',
    color: 'white',
    text: '⏹️ Stop',
    smooth: 5,
    textAlign: 'center',
    lineHeight: '40px',
    cursor: 'pointer',
    onClick: () => {
        audioPlayer.stop();
        timeDisplay.text('0:00');
    }
});
```

## 📱 Exemple responsive

```javascript
const responsivePlayer = new WaveSurfer({
    attach: 'body',
    x: 20, y: 20,
    width: 'calc(100vw - 40px)', // Largeur responsive
    height: 100,
    audioUrl: 'music.mp3',
    waveColor: '#ddd',
    progressColor: '#007bff'
});

// Adapter la taille sur redimensionnement
window.addEventListener('resize', () => {
    responsivePlayer.getWaveSurfer().drawer.containerWidth = 
        responsivePlayer.getElement().offsetWidth;
    responsivePlayer.getWaveSurfer().drawBuffer();
});
```
