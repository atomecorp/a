/**
 * 🎵 WaveSurfer Intelligent Region Loop - Demo
 * 
 * Demonstrates the new intelligent region loop functionality
 * inspired by official wavesurfer.js examples.
 * 
 * Features:
 * - Automatic region detection during playback
 * - Intelligent region looping when loop is enabled
 * - Region-in and region-out events
 * - Manual region loop control
 * - UI controls for testing
 */

import WaveSurferCompatible from '../../a/components/WaveSurfer.js';

console.log('🎵 Testing WaveSurfer Intelligent Region Loop...');

// Create container for demo
const container = document.createElement('div');
container.style.cssText = `
    position: fixed;
    top: 50px;
    left: 50px;
    width: 800px;
    height: 600px;
    background: #f0f0f0;
    border: 2px solid #333;
    border-radius: 10px;
    padding: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 1000;
    font-family: Arial, sans-serif;
`;

// Title
const title = document.createElement('h2');
title.textContent = '🎵 Intelligent Region Loop Demo';
title.style.margin = '0 0 15px 0';
container.appendChild(title);

// Info display
const infoDisplay = document.createElement('div');
infoDisplay.style.cssText = `
    background: #333;
    color: #00ff00;
    padding: 10px;
    border-radius: 5px;
    font-family: monospace;
    font-size: 12px;
    height: 100px;
    overflow-y: auto;
    margin-bottom: 15px;
`;
container.appendChild(infoDisplay);

// Log function
function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    infoDisplay.innerHTML += `[${timestamp}] ${message}<br>`;
    infoDisplay.scrollTop = infoDisplay.scrollHeight;
    console.log(message);
}

// Control buttons
const controlsDiv = document.createElement('div');
controlsDiv.style.cssText = `
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
    flex-wrap: wrap;
`;

// Create control buttons
const buttons = [
    {
        text: '🎯 Add Region at 5-10s',
        action: () => {
            const region = wavesurfer.addRegion({
                start: 5,
                end: 10,
                content: 'Test Region 1',
                color: 'rgba(255, 0, 0, 0.3)',
                drag: true,
                resize: true
            });
            log(`🎯 Added region: 5-10s`);
        }
    },
    {
        text: '🎯 Add Region at 15-20s',
        action: () => {
            const region = wavesurfer.addRegion({
                start: 15,
                end: 20,
                content: 'Test Region 2',
                color: 'rgba(0, 255, 0, 0.3)',
                drag: true,
                resize: true
            });
            log(`🎯 Added region: 15-20s`);
        }
    },
    {
        text: '🔁 Toggle Loop',
        action: () => {
            wavesurfer.toggleLoop();
            log(`🔁 Loop ${wavesurfer.isLooping ? 'enabled' : 'disabled'}`);
        }
    },
    {
        text: '🎯 Loop Current Region',
        action: () => {
            wavesurfer.loopCurrentRegion();
            log(`🎯 Attempting to loop current region`);
        }
    },
    {
        text: '🔄 Clear Loop Region',
        action: () => {
            wavesurfer.clearLoopRegion();
            log(`🔄 Loop region cleared`);
        }
    },
    {
        text: '🗑️ Clear All Regions',
        action: () => {
            wavesurfer.clearRegions();
            log(`🗑️ All regions cleared`);
        }
    },
    {
        text: '❌ Close Demo',
        action: () => {
            wavesurfer.destroy();
            document.body.removeChild(container);
            log(`❌ Demo closed`);
        }
    }
];

buttons.forEach(btn => {
    const button = document.createElement('button');
    button.textContent = btn.text;
    button.style.cssText = `
        padding: 8px 12px;
        border: none;
        border-radius: 5px;
        background: #4CAF50;
        color: white;
        cursor: pointer;
        font-size: 12px;
    `;
    button.addEventListener('click', btn.action);
    controlsDiv.appendChild(button);
});

container.appendChild(controlsDiv);

// Instructions
const instructions = document.createElement('div');
instructions.innerHTML = `
<h3>🎯 How to test Intelligent Region Loop:</h3>
<ol>
    <li><strong>Add regions</strong> using the buttons above</li>
    <li><strong>Enable loop</strong> and play the audio</li>
    <li><strong>Seek inside a region</strong> - it will automatically loop that region</li>
    <li><strong>Use "Loop Current Region"</strong> to manually set the region at playhead</li>
    <li>Watch the console for <span style="color: #0066cc">region-in</span> and <span style="color: #cc6600">region-out</span> events</li>
</ol>
<p><em>The loop intelligently switches between region loop and full track loop based on your position!</em></p>
`;
instructions.style.cssText = `
    background: #fff;
    padding: 10px;
    border-radius: 5px;
    margin-bottom: 15px;
    font-size: 14px;
`;
container.appendChild(instructions);

document.body.appendChild(container);

// Create WaveSurfer with enhanced region support
const wavesurfer = new WaveSurferCompatible({
    attach: container,
    width: 760,
    height: 180,
    url: './assets/audios/audio_missing.wav', // Use a longer audio file for testing
    waveColor: '#4A90E2',
    progressColor: '#2ECC71',
    cursorColor: '#E74C3C',
    
    // Enable all region features
    regions: {
        enabled: true,
        dragSelection: true
    },
    
    // Enable timeline for easier navigation
    timeline: {
        enabled: true,
        height: 30
    },
    
    // Enable zoom for precise region creation
    zoom: {
        enabled: true,
        wheelZoom: true
    },
    
    // Enable all controls including region-specific ones
    controls: {
        enabled: true,
        play: true,
        pause: true,
        stop: true,
        loop: true,
        modeToggle: true,
        clearRegions: true
    },
    
    // Set initial mode to selection for easy region creation
    interactionMode: 'selection',
    
    callbacks: {
        onReady: (ws) => {
            log('🎵 WaveSurfer ready with intelligent region loop!');
            log('🎯 Mode: SELECTION (drag to create regions)');
            log('💡 Switch to SCRUB mode to seek by clicking');
        },
        onPlay: () => log('▶️ Playback started'),
        onPause: () => log('⏸️ Playback paused'),
        onFinish: () => log('⏹️ Playback finished'),
        onRegionCreate: (region) => {
            log(`🎯 Region created: "${region.content || region.id}" (${region.start.toFixed(2)}s - ${region.end.toFixed(2)}s)`);
        },
        onRegionUpdate: (region) => {
            log(`🎯 Region updated: "${region.content || region.id}" (${region.start.toFixed(2)}s - ${region.end.toFixed(2)}s)`);
        },
        onRegionRemove: (region) => {
            log(`🗑️ Region removed: "${region.content || region.id}"`);
        }
    }
});

// Enhanced event listeners for region tracking
wavesurfer.addEventListener('region-in', (event) => {
    const region = event.detail.region;
    log(`🎯 ➡️ ENTERED region: "${region.content || region.id}" at ${region.start.toFixed(2)}s`);
});

wavesurfer.addEventListener('region-out', (event) => {
    const region = event.detail.region;
    log(`🎯 ⬅️ LEFT region: "${region.content || region.id}" at ${region.end.toFixed(2)}s`);
});

wavesurfer.addEventListener('region-looped', (event) => {
    const region = event.detail.region;
    log(`🔁 ♻️ LOOPED region: "${region.content || region.id}" back to ${region.start.toFixed(2)}s`);
});

wavesurfer.addEventListener('mode-changed', (event) => {
    const { oldMode, newMode } = event.detail;
    log(`🎯 Mode changed: ${oldMode.toUpperCase()} → ${newMode.toUpperCase()}`);
});

wavesurfer.addEventListener('loop-configured', () => {
    log('🔁 Loop system configured and ready');
});

log('🚀 Intelligent Region Loop demo initialized!');
log('📖 Instructions displayed above the waveform');

console.log('✅ WaveSurfer Intelligent Region Loop demo ready!');
