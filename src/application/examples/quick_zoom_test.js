/**
 * 🔍 QUICK ZOOM TEST
 * Quick test to verify zoom functionality
 */

import '../../a/components/WaveSurfer.js';
import WaveSurferCompatible from '../../a/components/WaveSurfer.js';

console.log('🔍 Quick Zoom Test Loading...');

// Create a simple test to verify zoom works
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔍 Starting Quick Zoom Test');
    
    // Create title
    const title = document.createElement('h1');
    title.textContent = '🔍 Quick Zoom Test';
    title.style.cssText = 'text-align: center; color: #333; font-family: sans-serif;';
    document.body.appendChild(title);
    
    // Instructions
    const instructions = document.createElement('p');
    instructions.innerHTML = `
        <strong>Instructions:</strong><br>
        • Use mouse wheel over waveform to zoom<br>
        • Click zoom buttons below<br>
        • Check console for diagnostic info
    `;
    instructions.style.cssText = 'text-align: center; margin: 20px; padding: 15px; background: #f0f0f0; border-radius: 8px;';
    document.body.appendChild(instructions);
    
    // Create WaveSurfer with zoom enabled
    const wavesurfer = new WaveSurferCompatible({
        attach: 'body',
        width: 800,
        height: 150,
        url: './assets/audios/riff.m4a',
        
        // Zoom configuration
        zoom: {
            enabled: true,
            scale: 0.5,
            wheelZoom: true
        },
        
        // Timeline to see zoom effect
        timeline: {
            enabled: true,
            height: 25
        },
        
        // Basic controls
        controls: {
            enabled: true,
            play: true,
            pause: true
        },
        
        callbacks: {
            onReady: (ws) => {
                console.log('🔍 WaveSurfer ready, testing zoom...');
                
                // Check if zoom plugin is active
                const plugins = ws.wavesurfer.getActivePlugins();
                const zoomPlugin = plugins.find(p => 
                    p.constructor?.name === 'ZoomPlugin' ||
                    p.name === 'zoom'
                );
                
                console.log('🔍 Zoom plugin found:', !!zoomPlugin);
                console.log('🔍 Has zoom method:', typeof ws.wavesurfer.zoom === 'function');
                
                // Test zoom programmatically
                if (typeof ws.wavesurfer.zoom === 'function') {
                    setTimeout(() => {
                        console.log('🔍 Testing zoom to 100 pixels/sec');
                        ws.wavesurfer.zoom(100);
                    }, 1000);
                    
                    setTimeout(() => {
                        console.log('🔍 Testing zoom to 25 pixels/sec');
                        ws.wavesurfer.zoom(25);
                    }, 2000);
                    
                    setTimeout(() => {
                        console.log('🔍 Reset zoom to 50 pixels/sec');
                        ws.wavesurfer.zoom(50);
                    }, 3000);
                }
            }
        }
    });
    
    // Add zoom control buttons
    const controls = document.createElement('div');
    controls.style.cssText = 'text-align: center; margin: 20px;';
    
    const zoomInBtn = document.createElement('button');
    zoomInBtn.textContent = '🔍 Zoom In';
    zoomInBtn.style.cssText = 'margin: 5px; padding: 10px 20px; font-size: 14px;';
    zoomInBtn.onclick = () => {
        if (wavesurfer.wavesurfer && typeof wavesurfer.wavesurfer.zoom === 'function') {
            console.log('🔍 Manual zoom in');
            wavesurfer.wavesurfer.zoom(100);
        }
    };
    
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.textContent = '🔍 Zoom Out';
    zoomOutBtn.style.cssText = 'margin: 5px; padding: 10px 20px; font-size: 14px;';
    zoomOutBtn.onclick = () => {
        if (wavesurfer.wavesurfer && typeof wavesurfer.wavesurfer.zoom === 'function') {
            console.log('🔍 Manual zoom out');
            wavesurfer.wavesurfer.zoom(25);
        }
    };
    
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '🔄 Reset';
    resetBtn.style.cssText = 'margin: 5px; padding: 10px 20px; font-size: 14px;';
    resetBtn.onclick = () => {
        if (wavesurfer.wavesurfer && typeof wavesurfer.wavesurfer.zoom === 'function') {
            console.log('🔄 Reset zoom');
            wavesurfer.wavesurfer.zoom(50);
        }
    };
    
    controls.appendChild(zoomInBtn);
    controls.appendChild(zoomOutBtn);
    controls.appendChild(resetBtn);
    document.body.appendChild(controls);
});
