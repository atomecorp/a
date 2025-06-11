/**
 * 🎵 WaveSurfer.js v7.9.5 Complete Example - Squirrel Framework
 * 
 * Version complète avec sélection, ruler et contrôle de lecture en boucle
 * Utilise l'architecture Web Component avec tous les plugins
 */

// Importer les modules WaveSurfer et plugins nécessaires
import WaveSurfer from '../../js/wavesurfer-v7/core/wavesurfer.esm.js';
import RegionsPlugin from '../../js/wavesurfer-v7/plugins/regions.esm.js';
import TimelinePlugin from '../../js/wavesurfer-v7/plugins/timeline.esm.js';
import MinimapPlugin from '../../js/wavesurfer-v7/plugins/minimap.esm.js';
import ZoomPlugin from '../../js/wavesurfer-v7/plugins/zoom.esm.js';
import HoverPlugin from '../../js/wavesurfer-v7/plugins/hover.esm.js';

// ==========================================
// Professional Audio Workstation avec Sélection et Ruler
// ==========================================

// Créer un conteneur pour le workstation professionnel
const proContainer = document.createElement('div');
proContainer.id = 'pro-workstation-container';
proContainer.style.cssText = `
    position: fixed;
    top: 100px;
    left: 50px;
    width: 1200px;
    height: 450px;
    background: rgba(255,255,255,0.95);
    border-radius: 10px;
    padding: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    z-index: 1000;
`;

// Ajouter un titre
const title = document.createElement('h3');
title.textContent = '🎵 Complete Audio Workstation - Sélection + Ruler + Loop Control';
title.style.cssText = 'margin: 0 0 15px 0; color: #333; font-family: Arial, sans-serif;';
proContainer.appendChild(title);

// Conteneur pour la waveform
const waveContainer = document.createElement('div');
waveContainer.id = 'waveform-container';
waveContainer.style.cssText = 'width: 100%; height: 200px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 10px; overflow: visible;';
proContainer.appendChild(waveContainer);

// Status div pour les informations
const statusDiv = document.createElement('div');
statusDiv.style.cssText = 'position: absolute; bottom: 10px; right: 20px; font-family: monospace; color: #666; font-size: 12px;';
proContainer.appendChild(statusDiv);

// Conteneur pour les contrôles de sélection et boucle
const selectionControls = document.createElement('div');
selectionControls.style.cssText = `
    position: absolute;
    bottom: 50px;
    left: 20px;
    display: flex;
    gap: 10px;
    align-items: center;
    background: rgba(0,0,0,0.1);
    padding: 10px;
    border-radius: 5px;
`;

// Bouton pour jouer la sélection
const playSelectionBtn = document.createElement('button');
playSelectionBtn.textContent = '🎯 Play Selection';
playSelectionBtn.style.cssText = `
    padding: 8px 16px;
    border: none;
    border-radius: 5px;
    background: #28a745;
    color: white;
    cursor: pointer;
    font-size: 12px;
`;

// Bouton pour activer/désactiver la boucle
const loopBtn = document.createElement('button');
loopBtn.textContent = '🔄 Loop OFF';
loopBtn.style.cssText = `
    padding: 8px 16px;
    border: none;
    border-radius: 5px;
    background: #6c757d;
    color: white;
    cursor: pointer;
    font-size: 12px;
`;

// Affichage de la sélection
const selectionInfo = document.createElement('div');
selectionInfo.textContent = 'No selection';
selectionInfo.style.cssText = 'font-family: monospace; font-size: 11px; color: #666;';

selectionControls.appendChild(playSelectionBtn);
selectionControls.appendChild(loopBtn);
selectionControls.appendChild(selectionInfo);
proContainer.appendChild(selectionControls);

document.body.appendChild(proContainer);

// Variables pour la gestion de la boucle
let isLooping = false;
let currentSelection = null;
let loopInterval = null;

// Créer l'instance WaveSurfer avec tous les plugins - Web Component
const professionalWorkstation = new WaveSurferCompatible({
    attach: proContainer,
    x: 0,
    y: 55, // Position après le titre
    width: 1160, // Largeur du container - padding
    height: 350, // Hauteur généreuse pour tous les plugins + contrôles
    url: './assets/audios/riff.m4a',
    
    // Enhanced waveform styling
    waveColor: '#667eea',
    progressColor: '#764ba2',
    cursorColor: '#f093fb',
    barWidth: 2,
    barRadius: 1,
    normalize: true,
    
    // Enable plugins - IMPORTANT: Activer sélection et ruler
    regions: {
        enabled: true,
        dragSelection: true
    },
    timeline: {
        enabled: true,
        height: 25 // Ruler plus visible
    },
    minimap: {
        enabled: true,
        height: 40
    },
    zoom: {
        enabled: true,
        scale: 0.5
    },
    hover: {
        enabled: true,
        formatTimeCallback: (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
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
            console.log('🎵 Complete Workstation - Prêt avec sélection et ruler!');
            statusDiv.textContent = `Ready - Duration: ${Math.floor(professionalWorkstation.getDuration())}s`;
            
            // Ajouter une région d'exemple pour démontrer la sélection
            setTimeout(() => {
                const exampleRegion = professionalWorkstation.addRegion({
                    start: 30,
                    end: 60,
                    color: 'rgba(0, 255, 0, 0.4)',
                    content: 'Example Selection',
                    drag: true,
                    resize: true
                });
                
                if (exampleRegion) {
                    currentSelection = { start: 30, end: 60 };
                    updateSelectionInfo();
                    console.log('🎯 Région d\'exemple créée pour démonstration');
                }
            }, 1000);
        },
        
        onPlay: () => {
            console.log('▶️ Station: Lecture démarrée');
            statusDiv.textContent = 'Playing...';
        },
        
        onPause: () => {
            console.log('⏸️ Station: Lecture en pause');
            statusDiv.textContent = 'Paused';
            if (loopInterval) {
                clearInterval(loopInterval);
                loopInterval = null;
            }
        },
        
        onFinish: () => {
            console.log('🏁 Station: Lecture terminée');
            statusDiv.textContent = 'Finished';
            
            // Si la boucle est activée et qu'on a une sélection, recommencer
            if (isLooping && currentSelection) {
                setTimeout(() => {
                    professionalWorkstation.seekTo(currentSelection.start / professionalWorkstation.getDuration());
                    professionalWorkstation.play();
                }, 100);
            }
        },
        
        onTimeUpdate: (currentTime) => {
            // Vérifier si on dépasse la fin de la sélection en mode boucle
            if (isLooping && currentSelection && currentTime >= currentSelection.end) {
                professionalWorkstation.seekTo(currentSelection.start / professionalWorkstation.getDuration());
            }
            
            // Update status
            if (Math.floor(currentTime) % 1 === 0) {
                const loopStatus = isLooping ? ' [LOOP]' : '';
                statusDiv.textContent = `Playing: ${Math.floor(currentTime)}s / ${Math.floor(professionalWorkstation.getDuration())}s${loopStatus}`;
            }
        },
        
        onRegionCreate: (region) => {
            console.log('🎯 Nouvelle région créée:', region);
            if (region && region.start !== undefined && region.end !== undefined) {
                currentSelection = {
                    start: region.start,
                    end: region.end
                };
                updateSelectionInfo();
            }
        },
        
        onRegionUpdate: (region) => {
            console.log('🎯 Région mise à jour:', region);
            if (region && region.start !== undefined && region.end !== undefined) {
                currentSelection = {
                    start: region.start,
                    end: region.end
                };
                updateSelectionInfo();
            }
        }
    }
});

// Fonction pour mettre à jour l'affichage de la sélection
function updateSelectionInfo() {
    if (currentSelection) {
        const start = Math.floor(currentSelection.start);
        const end = Math.floor(currentSelection.end);
        const duration = end - start;
        selectionInfo.textContent = `Selection: ${start}s → ${end}s (${duration}s)`;
    } else {
        selectionInfo.textContent = 'No selection';
    }
}

// Gestion du bouton "Play Selection"
playSelectionBtn.addEventListener('click', () => {
    if (!currentSelection) {
        alert('Aucune sélection active. Créez une région en glissant sur la waveform.');
        return;
    }
    
    // Aller au début de la sélection et jouer
    const startProgress = currentSelection.start / professionalWorkstation.getDuration();
    professionalWorkstation.seekTo(startProgress);
    professionalWorkstation.play();
    
    console.log(`🎯 Lecture de la sélection: ${currentSelection.start}s → ${currentSelection.end}s`);
});

// Gestion du bouton Loop
loopBtn.addEventListener('click', () => {
    isLooping = !isLooping;
    
    if (isLooping) {
        loopBtn.textContent = '🔄 Loop ON';
        loopBtn.style.background = '#007bff';
        
        if (!currentSelection) {
            alert('Créez d\'abord une sélection pour activer la boucle.');
            isLooping = false;
            loopBtn.textContent = '🔄 Loop OFF';
            loopBtn.style.background = '#6c757d';
            return;
        }
        
        console.log('🔄 Mode boucle activé');
    } else {
        loopBtn.textContent = '🔄 Loop OFF';
        loopBtn.style.background = '#6c757d';
        
        if (loopInterval) {
            clearInterval(loopInterval);
            loopInterval = null;
        }
        
        console.log('🔄 Mode boucle désactivé');
    }
});

// Styles pour améliorer l'interaction
const style = document.createElement('style');
style.textContent = `
    #pro-workstation-container button:hover {
        transform: scale(1.05);
        transition: transform 0.2s ease;
    }
    
    #pro-workstation-container button:active {
        transform: scale(0.95);
    }
`;
document.head.appendChild(style);

console.log('🎵 WaveSurfer Complete Example initialisé avec sélection, ruler et contrôle de boucle!');
