/**
 * 🎵 WaveSurfer.js v7.9.5 Examples - Squirrel Framework
 * 
 * Demonstration complète de WaveSurfer.js v7.9.5 avec tous les plugins disponibles
 * Utilise l'API native ES6 modules pour Tauri
 */

import WaveSurferCompatible from '../../a/components/WaveSurfer.js';

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
