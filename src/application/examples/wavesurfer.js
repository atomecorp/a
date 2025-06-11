/**
 * 🎵 WaveSurfer.js v7.9.5 Examples - Squirrel Framework
 * 
 * Demonstration complète de WaveSurfer.js v7.9.5 avec tous les plugins disponibles
 * Utilise l'API native ES6 modules pour Tauri
 */


// ==========================================
// Example 1: Professional Audio Workstation
// ==========================================

// Créer un conteneur pour le workstation professionnel
const proContainer = document.createElement('div');
proContainer.id = 'pro-workstation-container';
proContainer.style.cssText = `
    position: fixed;
    top: 100px;
    left: 50px;
    width: 1000px;
    height: 380px;
    background: rgba(255,255,255,0.95);
    border-radius: 10px;
    padding: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    z-index: 1000;
`;

// Ajouter un titre
const title = document.createElement('h3');
title.textContent = '🎵 Professional Audio Workstation - WaveSurfer Web Component';
title.style.cssText = 'margin: 0 0 15px 0; color: #333; font-family: Arial, sans-serif;';
proContainer.appendChild(title);

// Status div pour les informations
const statusDiv = document.createElement('div');
statusDiv.style.cssText = 'position: absolute; bottom: 10px; right: 20px; font-family: monospace; color: #666; font-size: 12px;';
proContainer.appendChild(statusDiv);

document.body.appendChild(proContainer);

// Créer l'instance WaveSurfer avec tous les plugins - NOUVELLE VERSION WEB COMPONENT
const professionalWorkstation = new WaveSurferCompatible({
    attach: proContainer,
    x: 0,
    y: 55, // Position après le titre
    width: 960, // Largeur du container - padding
    height: 320, // Hauteur généreuse pour tous les plugins + contrôles
    url: './assets/audios/riff.m4a',
    
    // Enhanced waveform styling
    waveColor: '#667eea',
    progressColor: '#764ba2',
    cursorColor: '#f093fb',
    barWidth: 2,
    barRadius: 1,
    normalize: true,
    
    // Enable plugins
    regions: {
        enabled: true,
        dragSelection: true
    },
    timeline: {
        enabled: true,
        height: 20
    },
    minimap: {
        enabled: true,
        height: 30
    },
    zoom: {
        enabled: true,
        scale: 0.5
    },
    hover: {
        enabled: true,
        formatTimeCallback: (seconds) => [seconds / 60, seconds % 60].map(v => `0${Math.floor(v)}`.slice(-2)).join(':')
    },
    
    // Activer les contrôles intégrés
    controls: {
        enabled: true,
        play: true,
        pause: true,
        stop: true,
        volume: true,
        mute: true,
        download: false
    },
    
    callbacks: {
        onReady: () => {
            console.log('🎵 Professional Workstation - Station audio professionnelle prête!');
            statusDiv.textContent = `Ready - Duration: ${Math.floor(professionalWorkstation.getDuration())}s`;
            
            // Ajouter quelques régions d'exemple
            setTimeout(() => {
                professionalWorkstation.addRegion({
                    start: 0,
                    end: 10,
                    color: 'rgba(255, 0, 0, 0.3)',
                    content: 'Intro'
                });
                
                professionalWorkstation.addRegion({
                    start: 30,
                    end: 60,
                    color: 'rgba(0, 255, 0, 0.3)',
                    content: 'Chorus'
                });
                
                professionalWorkstation.addRegion({
                    start: 120,
                    end: 140,
                    color: 'rgba(0, 0, 255, 0.3)',
                    content: 'Outro'
                });
            }, 1000);
        },
        onPlay: () => {
            console.log('▶️ Station: Lecture démarrée');
            statusDiv.textContent = 'Playing...';
        },
        onPause: () => {
            console.log('⏸️ Station: Lecture en pause');
            statusDiv.textContent = 'Paused';
        },
        onTimeUpdate: (currentTime) => {
            // Update status every second
            if (Math.floor(currentTime) % 1 === 0) {
                statusDiv.textContent = `Playing: ${Math.floor(currentTime)}s / ${Math.floor(professionalWorkstation.getDuration())}s`;
            }
        },
        onRegionCreate: (region) => console.log('🎯 Région créée:', region)
    }
});

// Les contrôles sont maintenant intégrés dans le Web Component WaveSurfer
// Plus besoin de contrôles externes - utilisez les boutons intégrés du component
// L'audio est chargé automatiquement via la propriété 'url' dans la configuration

// ==========================================
// Example 2: Stylized Audio Visualizer
// ==========================================

// Créer un conteneur pour le visualizer
const vizContainer = document.createElement('div');
vizContainer.id = 'visualizer-container';
vizContainer.style.cssText = `
    position: fixed;
    top: 520px;
    left: 50px;
    width: 600px;
    height: 200px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 20px;
    padding: 20px;
    box-shadow: 0 15px 35px rgba(102, 126, 234, 0.3);
    z-index: 1000;
`;

const vizTitle = document.createElement('h3');
vizTitle.textContent = '🎨 Audio Visualizer';
vizTitle.style.cssText = 'margin: 0 0 15px 0; color: white; font-family: Arial, sans-serif;';
vizContainer.appendChild(vizTitle);

document.body.appendChild(vizContainer);

// Créer l'instance visualizer avec le Web Component
const visualizer = new WaveSurferCompatible({
    attach: vizContainer,
    x: 0,
    y: 40, // Position après le titre
    width: 560, // Largeur du container - padding
    height: 120,
    url: './assets/audios/riff.m4a',
    waveColor: '#ffffff',
    progressColor: '#f093fb',
    cursorColor: '#ffffff',
    barWidth: 3,
    barRadius: 2,
    normalize: true,
    
    // Activer les contrôles pour ce visualizer
    controls: {
        enabled: true,
        play: true,
        pause: true,
        stop: true,
        volume: true,
        mute: true
    },
    
    // Activer hover plugin
    hover: {
        enabled: true,
        formatTimeCallback: (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    },
    
    callbacks: {
        onReady: () => {
            console.log('🎨 Visualizer initialized');
            console.log(`   Duration: ${Math.floor(visualizer.getDuration())}s`);
        },
        onPlay: () => console.log('🎨 Visualizer playing'),
        onFinish: () => console.log('🎨 Visualizer finished playing')
    }
});

// ==========================================
// Example 3: Professional Audio Editor
// ==========================================

// Créer un conteneur pour l'éditeur
const editorContainer = document.createElement('div');
editorContainer.id = 'editor-container';
editorContainer.style.cssText = `
    position: fixed;
    top: 760px;
    left: 50px;
    width: 900px;
    height: 220px;
    background: #1F2937;
    border: 1px solid #374151;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    z-index: 1000;
`;

const editorTitle = document.createElement('h3');
editorTitle.textContent = '🎛️ Professional Audio Editor';
editorTitle.style.cssText = 'margin: 0 0 15px 0; color: white; font-family: Arial, sans-serif;';
editorContainer.appendChild(editorTitle);

document.body.appendChild(editorContainer);

// Créer l'instance éditeur avec régions et Web Component
const audioEditor = new WaveSurferCompatible({
    attach: editorContainer,
    x: 0,
    y: 40, // Position après le titre
    width: 860, // Largeur du container - padding
    height: 160,
    url: './assets/audios/kick.wav',
    waveColor: '#8B9DC3',
    progressColor: '#3B82F6',
    cursorColor: '#EF4444',
    barWidth: 1,
    barRadius: 0,
    
    // Activer les régions
    regions: {
        enabled: true,
        dragSelection: true
    },
    
    // Activer le zoom
    zoom: {
        enabled: true,
        scale: 1
    },
    
    // Activer les contrôles
    controls: {
        enabled: true,
        play: true,
        pause: true,
        stop: true,
        volume: true,
        mute: true
    },
    
    callbacks: {
        onReady: () => {
            console.log('🎛️ Audio Editor ready');
            
            // Add some example regions
            setTimeout(() => {
                audioEditor.addRegion({
                    start: 0.5,
                    end: 2.0,
                    color: 'rgba(255, 193, 7, 0.3)'
                });
                
                audioEditor.addRegion({
                    start: 3.0,
                    end: 5.5,
                    color: 'rgba(40, 167, 69, 0.3)'
                });
                
                console.log('🎯 Example regions added to audio editor');
            }, 1000);
        }
    }
});

console.log('🎵 Tous les exemples WaveSurfer.js v7.9.5 ont été initialisés avec succès!');
