/**
 * 🎵 WaveSurfer Dual Mode Demo - Squirrel Framework
 * 
 * Demonstrates the dual interaction modes (scrub vs selection) 
 * with visible timeline ruler and enhanced controls.
 */

import WaveSurferCompatible from '../../a/components/WaveSurfer.js';

export function createWaveSurferDualModeDemo() {
    console.log('🎵 Creating WaveSurfer Dual Mode Demo...');
    
    // Example 1: Scrub Mode with Timeline
    const scrubExample = new WaveSurferCompatible({
        attach: 'body',
        x: 50, y: 50,
        width: 900, height: 160,
        url: './assets/audios/riff.m4a',
        waveColor: '#4A90E2',
        progressColor: '#2ECC71',
        cursorColor: '#E74C3C',
        interactionMode: 'scrub', // Start in scrub mode
        
        // Enhanced timeline configuration
        timeline: { 
            enabled: true, 
            height: 30 
        },
        
        // Regions enabled but dragSelection controlled by mode
        regions: {
            enabled: true,
            dragSelection: false // Will be controlled by interaction mode
        },
        
        controls: {
            enabled: true,
            play: true,
            pause: true,
            stop: true,
            mute: true,
            volume: true,
            modeToggle: true, // Enable mode toggle
            loop: true // Enable loop control
        },
        
        callbacks: {
            onReady: (wavesurfer) => {
                console.log('🎯 Scrub Mode Example Ready');
                console.log('Current mode:', wavesurfer.getInteractionMode());
                
                // Debug the regions plugin
                setTimeout(() => {
                    const plugins = wavesurfer.wavesurfer.getActivePlugins();
                    console.log('🔌 Debug plugins for scrub example:', plugins.map(p => ({
                        name: p.constructor?.name || p.name || 'Unknown',
                        dragSelection: p.options?.dragSelection || p.dragSelection,
                        hasAddRegion: typeof p.addRegion === 'function'
                    })));
                }, 200);
                
                // Add instruction text
                const instruction = document.createElement('div');
                instruction.style.cssText = `
                    position: absolute;
                    top: ${wavesurfer.config.y - 25}px;
                    left: ${wavesurfer.config.x}px;
                    color: #2C3E50;
                    font-weight: bold;
                    font-size: 14px;
                `;
                instruction.textContent = '🎯 SCRUB MODE: Click 🎯 to toggle to Selection Mode';
                document.body.appendChild(instruction);
                wavesurfer.instructionElement = instruction;
            },
            
            onRegionCreate: (region, wavesurfer) => {
                console.log('🎯 Region created in mode:', wavesurfer.getInteractionMode());
                region.setOptions({ 
                    color: 'rgba(231, 76, 60, 0.3)',
                    resize: true,
                    drag: true
                });
            }
        }
    });
    
    // Listen for mode changes
    scrubExample.addEventListener('mode-changed', (event) => {
        const { oldMode, newMode } = event.detail;
        console.log(`🔄 Mode changed: ${oldMode} → ${newMode}`);
        
        // Update instruction text
        if (scrubExample.instructionElement) {
            scrubExample.instructionElement.textContent = newMode === 'scrub' ? 
                '🎯 SCRUB MODE: Click to seek, drag to scrub. Click 🎯 to switch to Selection Mode' :
                '✋ SELECTION MODE: Click to position, drag to create regions. Click ✋ to switch to Scrub Mode';
        }
    });
    
    // Example 2: Selection Mode with Timeline
    const selectionExample = new WaveSurferCompatible({
        attach: 'body',
        x: 50, y: 250,
        width: 900, height: 160,
        url: './assets/audios/Ices_From_Hells.m4a',
        waveColor: '#9B59B6',
        progressColor: '#E67E22',
        cursorColor: '#1ABC9C',
        interactionMode: 'selection', // Start in selection mode
        
        // Enhanced timeline configuration
        timeline: { 
            enabled: true, 
            height: 30 
        },
        
        regions: {
            enabled: true,
            dragSelection: false // Will be controlled by interaction mode
        },
        
        controls: {
            enabled: true,
            play: true,
            pause: true,
            stop: true,
            mute: true,
            volume: true,
            modeToggle: true,
            loop: true
        },
        
        callbacks: {
            onReady: (wavesurfer) => {
                console.log('✋ Selection Mode Example Ready');
                console.log('Current mode:', wavesurfer.getInteractionMode());
                
                // Debug the regions plugin
                setTimeout(() => {
                    const plugins = wavesurfer.wavesurfer.getActivePlugins();
                    console.log('🔌 Debug plugins for selection example:', plugins.map(p => ({
                        name: p.constructor?.name || p.name || 'Unknown',
                        dragSelection: p.options?.dragSelection || p.dragSelection,
                        hasAddRegion: typeof p.addRegion === 'function'
                    })));
                }, 200);
                
                // Add instruction text
                const instruction = document.createElement('div');
                instruction.style.cssText = `
                    position: absolute;
                    top: ${wavesurfer.config.y - 25}px;
                    left: ${wavesurfer.config.x}px;
                    color: #2C3E50;
                    font-weight: bold;
                    font-size: 14px;
                `;
                instruction.textContent = '✋ SELECTION MODE: Drag to create regions. Click ✋ to toggle to Scrub Mode';
                document.body.appendChild(instruction);
                wavesurfer.instructionElement = instruction;
            },
            
            onRegionCreate: (region, wavesurfer) => {
                console.log('✋ Region created in mode:', wavesurfer.getInteractionMode());
                region.setOptions({ 
                    color: 'rgba(155, 89, 182, 0.3)',
                    resize: true,
                    drag: true
                });
                
                // Auto-play the region when created
                setTimeout(() => {
                    region.play();
                }, 100);
            }
        }
    });
    
    // Listen for mode changes
    selectionExample.addEventListener('mode-changed', (event) => {
        const { oldMode, newMode } = event.detail;
        console.log(`🔄 Mode changed: ${oldMode} → ${newMode}`);
        
        // Update instruction text
        if (selectionExample.instructionElement) {
            selectionExample.instructionElement.textContent = newMode === 'scrub' ? 
                '🎯 SCRUB MODE: Click to seek, drag to scrub. Click 🎯 to switch to Selection Mode' :
                '✋ SELECTION MODE: Click to position, drag to create regions. Click ✋ to switch to Scrub Mode';
        }
    });
    
    // Example 3: Advanced Demo with Timeline and Multiple Features
    const advancedExample = new WaveSurferCompatible({
        attach: 'body',
        x: 50, y: 450,
        width: 900, height: 180,
        url: './assets/audios/clap.wav',
        waveColor: '#34495E',
        progressColor: '#F39C12',
        cursorColor: '#E74C3C',
        interactionMode: 'scrub',
        
        // Multiple plugins enabled
        timeline: { 
            enabled: true, 
            height: 35 
        },
        minimap: { 
            enabled: true, 
            height: 40 
        },
        
        regions: {
            enabled: true,
            dragSelection: false
        },
        
        controls: {
            enabled: true,
            play: true,
            pause: true,
            stop: true,
            mute: true,
            volume: true,
            modeToggle: true,
            loop: true
        },
        
        callbacks: {
            onReady: (wavesurfer) => {
                console.log('🚀 Advanced Dual Mode Example Ready');
                
                // Add comprehensive instruction text
                const instruction = document.createElement('div');
                instruction.style.cssText = `
                    position: absolute;
                    top: ${wavesurfer.config.y - 25}px;
                    left: ${wavesurfer.config.x}px;
                    color: #2C3E50;
                    font-weight: bold;
                    font-size: 14px;
                `;
                instruction.textContent = '🚀 ADVANCED: Timeline + Minimap + Dual Mode Toggle';
                document.body.appendChild(instruction);
                wavesurfer.instructionElement = instruction;
                
                // Add some demo regions programmatically
                setTimeout(() => {
                    if (wavesurfer.isReady) {
                        const duration = wavesurfer.getDuration();
                        
                        // Add first region
                        wavesurfer.addRegion({
                            start: duration * 0.1,
                            end: duration * 0.3,
                            color: 'rgba(52, 152, 219, 0.3)',
                            drag: true,
                            resize: true
                        });
                        
                        // Add second region
                        wavesurfer.addRegion({
                            start: duration * 0.6,
                            end: duration * 0.8,
                            color: 'rgba(46, 204, 113, 0.3)',
                            drag: true,
                            resize: true
                        });
                    }
                }, 1000);
            },
            
            onRegionCreate: (region, wavesurfer) => {
                console.log('🚀 Region created:', region);
                region.setOptions({ 
                    color: 'rgba(243, 156, 18, 0.3)',
                    resize: true,
                    drag: true
                });
            }
        }
    });
    
    // Add global instructions
    const globalInstructions = document.createElement('div');
    globalInstructions.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(52, 73, 94, 0.9);
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-family: 'Roboto', Arial, sans-serif;
        font-size: 12px;
        max-width: 300px;
        z-index: 1000;
    `;
    globalInstructions.innerHTML = `
        <h4 style="margin: 0 0 10px 0; color: #3498DB;">🎵 Dual Mode Controls</h4>
        <p style="margin: 5px 0;"><strong>🎯 Scrub Mode:</strong> Click to seek, drag to scrub</p>
        <p style="margin: 5px 0;"><strong>✋ Selection Mode:</strong> Drag to create regions</p>
        <p style="margin: 5px 0;"><strong>Toggle:</strong> Click the mode button (🎯/✋)</p>
        <p style="margin: 5px 0;"><strong>Timeline:</strong> Shows time ruler above waveform</p>
    `;
    document.body.appendChild(globalInstructions);
    
    console.log('🎵 ✅ WaveSurfer Dual Mode Demo created successfully!');
    
    return {
        scrubExample,
        selectionExample,
        advancedExample,
        globalInstructions
    };
}

// Auto-create the demo when this module is imported
document.addEventListener('DOMContentLoaded', () => {
    createWaveSurferDualModeDemo();
});
