/**
 * 🎵 WaveSurfer.js v7.9.5 Examples - Squirrel Framework
 * 
 * Demonstration complète de WaveSurfer.js v7.9.5 avec tous les plugins disponibles
 * Utilise l'API native ES6 modules pour Tauri
 */

// Import de WaveSurfer.js v7.9.5 et tous les plugins
import WaveSurfer from '../js/wavesurfer.esm.js';
import RegionsPlugin from '../js/regions.esm.js';
import TimelinePlugin from '../js/timeline.esm.js';
import MinimapPlugin from '../js/minimap.esm.js';
import ZoomPlugin from '../js/zoom.esm.js';
import HoverPlugin from '../js/hover.esm.js';
import SpectrogramPlugin from '../js/spectrogram.esm.js';
import RecordPlugin from '../js/record.esm.js';
import EnvelopePlugin from '../js/envelope.esm.js';

console.log('🎵 WaveSurfer.js v7.9.5 - Initialisation avec tous les plugins...');

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
    height: 250px;
    background: rgba(255,255,255,0.95);
    border-radius: 10px;
    padding: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    z-index: 1000;
`;

// Ajouter un titre
const title = document.createElement('h3');
title.textContent = '🎵 Professional Audio Workstation - WaveSurfer.js v7.9.5';
title.style.cssText = 'margin: 0 0 15px 0; color: #333; font-family: Arial, sans-serif;';
proContainer.appendChild(title);

// Conteneur pour la waveform
const waveContainer = document.createElement('div');
waveContainer.id = 'waveform-container';
waveContainer.style.cssText = 'width: 100%; height: 120px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 10px;';
proContainer.appendChild(waveContainer);

// Conteneur pour les contrôles
const controlsContainer = document.createElement('div');
controlsContainer.style.cssText = 'display: flex; gap: 10px; align-items: center;';

const playBtn = document.createElement('button');
playBtn.textContent = '▶️ Play';
playBtn.style.cssText = 'padding: 8px 16px; border: none; border-radius: 5px; background: #667eea; color: white; cursor: pointer;';

const pauseBtn = document.createElement('button');
pauseBtn.textContent = '⏸️ Pause';
pauseBtn.style.cssText = 'padding: 8px 16px; border: none; border-radius: 5px; background: #764ba2; color: white; cursor: pointer;';

const stopBtn = document.createElement('button');
stopBtn.textContent = '⏹️ Stop';
stopBtn.style.cssText = 'padding: 8px 16px; border: none; border-radius: 5px; background: #f093fb; color: white; cursor: pointer;';

const statusDiv = document.createElement('div');
statusDiv.style.cssText = 'margin-left: auto; font-family: monospace; color: #666;';

controlsContainer.appendChild(playBtn);
controlsContainer.appendChild(pauseBtn);
controlsContainer.appendChild(stopBtn);
controlsContainer.appendChild(statusDiv);
proContainer.appendChild(controlsContainer);

document.body.appendChild(proContainer);

// Créer l'instance WaveSurfer avec tous les plugins
const professionalWorkstation = WaveSurfer.create({
    container: waveContainer,
    
    // Enhanced waveform styling
    waveColor: '#667eea',
    progressColor: '#764ba2',
    cursorColor: '#f093fb',
    barWidth: 2,
    barRadius: 1,
    height: 120,
    normalize: true,
    
    // Enable plugins
    plugins: [
        RegionsPlugin.create({
            enableDragSelection: true,
            regionLabelFormatter: (region, index) => `Region ${index + 1}`
        }),
        TimelinePlugin.create({
            height: 20,
            timeInterval: 0.2,
            primaryLabelInterval: 5,
            style: {
                fontSize: '10px',
                color: '#666'
            }
        }),
        MinimapPlugin.create({
            height: 30,
            waveColor: '#ddd',
            progressColor: '#999'
        }),
        ZoomPlugin.create({
            scale: 0.5
        }),
        HoverPlugin.create({
            formatTimeCallback: (seconds) => [seconds / 60, seconds % 60].map(v => `0${Math.floor(v)}`.slice(-2)).join(':')
        })
    ]
});

// Événements et callbacks
professionalWorkstation.on('ready', () => {
    console.log('🎵 Professional Workstation - Station audio professionnelle prête!');
    statusDiv.textContent = `Ready - Duration: ${Math.floor(professionalWorkstation.getDuration())}s`;
    
    // Ajouter quelques régions d'exemple
    setTimeout(() => {
        // Get regions plugin instance
        const regionsPlugin = professionalWorkstation.getActivePlugins().find(plugin => plugin.constructor.name === 'RegionsPlugin');
        if (regionsPlugin) {
            regionsPlugin.addRegion({
                start: 0,
                end: 10,
                color: 'rgba(255, 0, 0, 0.3)',
                content: 'Intro'
            });
            
            regionsPlugin.addRegion({
                start: 30,
                end: 60,
                color: 'rgba(0, 255, 0, 0.3)',
                content: 'Chorus'
            });
            
            regionsPlugin.addRegion({
                start: 120,
                end: 140,
                color: 'rgba(0, 0, 255, 0.3)',
                content: 'Outro'
            });
        }
    }, 1000);
});

professionalWorkstation.on('play', () => {
    console.log('▶️ Station: Lecture démarrée');
    statusDiv.textContent = 'Playing...';
});

professionalWorkstation.on('pause', () => {
    console.log('⏸️ Station: Lecture en pause');
    statusDiv.textContent = 'Paused';
});

professionalWorkstation.on('timeupdate', (currentTime) => {
    // Update status every second
    if (Math.floor(currentTime) % 1 === 0) {
        statusDiv.textContent = `Playing: ${Math.floor(currentTime)}s / ${Math.floor(professionalWorkstation.getDuration())}s`;
    }
});

// Contrôles
playBtn.onclick = () => professionalWorkstation.play();
pauseBtn.onclick = () => professionalWorkstation.pause();
stopBtn.onclick = () => {
    professionalWorkstation.stop();
    statusDiv.textContent = 'Stopped';
};

// Charger un fichier audio de test
professionalWorkstation.load('./assets/audios/riff.m4a');

// ==========================================
// Example 2: Stylized Audio Visualizer
// ==========================================

// Créer un conteneur pour le visualizer
const vizContainer = document.createElement('div');
vizContainer.id = 'visualizer-container';
vizContainer.style.cssText = `
    position: fixed;
    top: 380px;
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

const vizWaveContainer = document.createElement('div');
vizWaveContainer.id = 'viz-waveform';
vizWaveContainer.style.cssText = 'width: 100%; height: 120px; border-radius: 10px; overflow: hidden;';
vizContainer.appendChild(vizWaveContainer);

document.body.appendChild(vizContainer);

// Créer l'instance visualizer
const visualizer = WaveSurfer.create({
    container: vizWaveContainer,
    waveColor: '#ffffff',
    progressColor: '#f093fb',
    cursorColor: '#ffffff',
    barWidth: 3,
    barRadius: 2,
    height: 120,
    normalize: true,
    
    plugins: [
        HoverPlugin.create({
            formatTimeCallback: (seconds) => {
                const mins = Math.floor(seconds / 60);
                const secs = Math.floor(seconds % 60);
                return `${mins}:${secs.toString().padStart(2, '0')}`;
            }
        })
    ]
});

visualizer.on('ready', () => {
    console.log('🎨 Visualizer initialized');
    console.log(`   Duration: ${Math.floor(visualizer.getDuration())}s`);
});

visualizer.on('play', () => console.log('🎨 Visualizer playing'));
visualizer.on('finish', () => console.log('🎨 Visualizer finished playing'));

// Charger le même fichier
visualizer.load('./assets/audios/riff.m4a');

// ==========================================
// Example 3: Professional Audio Editor
// ==========================================

// Créer un conteneur pour l'éditeur
const editorContainer = document.createElement('div');
editorContainer.id = 'editor-container';
editorContainer.style.cssText = `
    position: fixed;
    top: 610px;
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

const editorWaveContainer = document.createElement('div');
editorWaveContainer.id = 'editor-waveform';
editorWaveContainer.style.cssText = 'width: 100%; height: 140px; border-radius: 5px;';
editorContainer.appendChild(editorWaveContainer);

document.body.appendChild(editorContainer);

// Créer l'instance éditeur avec régions
const audioEditor = WaveSurfer.create({
    container: editorWaveContainer,
    waveColor: '#8B9DC3',
    progressColor: '#3B82F6',
    cursorColor: '#EF4444',
    barWidth: 1,
    barRadius: 0,
    height: 140,
    
    plugins: [
        RegionsPlugin.create({
            enableDragSelection: true
        }),
        ZoomPlugin.create()
    ]
});

audioEditor.on('ready', () => {
    console.log('🎛️ Audio Editor ready');
    
    // Add some example regions
    setTimeout(() => {
        const regionsPlugin = audioEditor.getActivePlugins().find(plugin => plugin.constructor.name === 'RegionsPlugin');
        if (regionsPlugin) {
            regionsPlugin.addRegion({
                start: 0.5,
                end: 2.0,
                color: 'rgba(255, 193, 7, 0.3)'
            });
            
            regionsPlugin.addRegion({
                start: 3.0,
                end: 5.5,
                color: 'rgba(40, 167, 69, 0.3)'
            });
            
            console.log('🎯 Example regions added to audio editor');
        }
    }, 1000);
});

// Charger un fichier différent pour l'éditeur
audioEditor.load('./assets/audios/kick.wav');

console.log('🎵 Tous les exemples WaveSurfer.js v7.9.5 ont été initialisés avec succès!');
