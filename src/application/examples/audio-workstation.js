/**
 * 🎵 Exemple d'utilisation pratique - WaveSurfer + Squirrel Framework
 * 
 * Cet exemple montre comment utiliser WaveSurfer avec d'autres composants
 * du Squirrel Framework dans une application réelle.
 */

import { WaveSurfer, Slider, Module } from './src/application/index.js';

// Interface audio complète avec contrôles
class AudioWorkstation {
    constructor(container) {
        this.container = container;
        this.components = new Map();
        this.init();
    }

    async init() {
        // 1. Créer le lecteur audio principal
        this.wavePlayer = new WaveSurfer({
            container: this.createSection('Lecteur Audio'),
            height: 100,
            waveColor: '#4A90E2',
            progressColor: '#2ECC71',
            showControls: true,
            callbacks: {
                onTimeUpdate: (time) => this.updateTimeDisplay(time),
                onReady: () => this.onAudioReady()
            }
        });

        // 2. Contrôles avec Sliders
        this.createVolumeControl();
        this.createSpeedControl();
        this.createEQControls();

        // 3. Module de traitement audio
        this.createAudioProcessor();

        // 4. Charger un fichier audio par défaut
        await this.loadDefaultAudio();
    }

    createSection(title) {
        const section = document.createElement('div');
        section.className = 'audio-section';
        section.innerHTML = `<h3>${title}</h3>`;
        
        const content = document.createElement('div');
        content.className = 'section-content';
        section.appendChild(content);
        
        this.container.appendChild(section);
        return content;
    }

    createVolumeControl() {
        const volumeSection = this.createSection('Volume');
        
        this.volumeSlider = new Slider({
            attach: volumeSection,
            min: 0,
            max: 100,
            value: 80,
            orientation: 'horizontal',
            style: {
                width: '300px',
                color: '#4A90E2'
            },
            callback: (value) => {
                if (this.wavePlayer) {
                    this.wavePlayer.setVolume(value / 100);
                }
            }
        });
    }

    createSpeedControl() {
        const speedSection = this.createSection('Vitesse de Lecture');
        
        this.speedSlider = new Slider({
            attach: speedSection,
            min: 25,
            max: 200,
            value: 100,
            orientation: 'horizontal',
            style: {
                width: '300px',
                color: '#E74C3C'
            },
            callback: (value) => {
                if (this.wavePlayer && this.wavePlayer.wavesurfer) {
                    this.wavePlayer.wavesurfer.setPlaybackRate(value / 100);
                }
            }
        });
    }

    createEQControls() {
        const eqSection = this.createSection('Égaliseur (3 Bandes)');
        
        const frequencies = ['Graves', 'Médiums', 'Aigus'];
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1'];
        
        frequencies.forEach((freq, index) => {
            const eqSlider = new Slider({
                attach: eqSection,
                min: -12,
                max: 12,
                value: 0,
                orientation: 'vertical',
                style: {
                    height: '150px',
                    color: colors[index],
                    display: 'inline-block',
                    margin: '0 20px'
                },
                callback: (value) => {
                    console.log(`${freq}: ${value > 0 ? '+' : ''}${value}dB`);
                }
            });
            
            // Label pour chaque bande
            const label = document.createElement('div');
            label.textContent = freq;
            label.style.textAlign = 'center';
            label.style.marginTop = '10px';
            eqSection.appendChild(label);
        });
    }

    createAudioProcessor() {
        const processorSection = this.createSection('Traitement Audio');
        
        this.audioModule = new Module({
            attach: processorSection,
            title: 'Audio FX',
            width: 200,
            height: 150,
            inputs: ['Audio In'],
            outputs: ['Audio Out'],
            style: {
                backgroundColor: '#2C3E50',
                color: 'white'
            }
        });

        // Ajouter des contrôles d'effets
        const effectsContainer = document.createElement('div');
        effectsContainer.style.padding = '10px';
        
        const reverbSlider = new Slider({
            attach: effectsContainer,
            min: 0,
            max: 100,
            value: 0,
            orientation: 'horizontal',
            style: {
                width: '150px',
                color: '#9B59B6'
            },
            callback: (value) => {
                console.log(`Reverb: ${value}%`);
            }
        });
        
        const reverbLabel = document.createElement('div');
        reverbLabel.textContent = 'Reverb';
        reverbLabel.style.fontSize = '12px';
        reverbLabel.style.color = 'white';
        reverbLabel.style.marginBottom = '5px';
        
        effectsContainer.insertBefore(reverbLabel, effectsContainer.firstChild);
        this.audioModule.container.appendChild(effectsContainer);
    }

    async loadDefaultAudio() {
        const audioFiles = [
            './src/assets/audios/Ices_From_Hells.m4a',
            './src/assets/audios/riff.m4a',
            './src/assets/audios/kick.wav'
        ];

        for (const file of audioFiles) {
            try {
                await this.wavePlayer.loadAudio(file);
                console.log(`🎵 Audio chargé: ${file}`);
                break;
            } catch (e) {
                console.warn(`⚠️ Impossible de charger: ${file}`);
            }
        }
    }

    updateTimeDisplay(currentTime) {
        if (!this.timeDisplay) {
            this.timeDisplay = document.createElement('div');
            this.timeDisplay.style.cssText = 'position: fixed; top: 20px; right: 20px; background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 5px; font-family: monospace;';
            document.body.appendChild(this.timeDisplay);
        }
        
        const duration = this.wavePlayer.getDuration() || 0;
        const progress = duration > 0 ? (currentTime / duration * 100).toFixed(1) : 0;
        
        this.timeDisplay.innerHTML = `
            <div>⏱️ ${this.formatTime(currentTime)} / ${this.formatTime(duration)}</div>
            <div>📊 ${progress}%</div>
            <div>🔊 ${(this.wavePlayer.getVolume() * 100).toFixed(0)}%</div>
        `;
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    onAudioReady() {
        console.log('🎉 Audio Workstation prête!');
        
        // Ajouter quelques régions d'exemple
        if (this.wavePlayer.getDuration() > 30) {
            this.wavePlayer.addRegion({
                start: 5,
                end: 15,
                color: 'rgba(255, 255, 0, 0.2)',
                content: 'Intro'
            });
            
            this.wavePlayer.addRegion({
                start: 20,
                end: 40,
                color: 'rgba(0, 255, 0, 0.2)',
                content: 'Chorus'
            });
        }
    }
}

// Initialisation automatique si un container est trouvé
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('audio-workstation');
    if (container) {
        new AudioWorkstation(container);
    }
});

export default AudioWorkstation;
