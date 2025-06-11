/**
 * 🔍 ZOOM FUNCTIONALITY TEST
 * Tests zoom capabilities with timeline interaction
 */

import '../../a/components/WaveSurfer.js';
import WaveSurferCompatible from '../../a/components/WaveSurfer.js';

export function createZoomTest() {
    console.log('🔍 Creating Zoom Test...');
    
    // Create a test container
    const testContainer = document.createElement('div');
    testContainer.style.cssText = `
        padding: 20px;
        margin: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;
    
    // Create title
    const title = document.createElement('h2');
    title.textContent = '🔍 Zoom Test - WaveSurfer Component';
    title.style.cssText = `
        color: white;
        text-align: center;
        margin-bottom: 20px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    testContainer.appendChild(title);
    
    // Create instructions
    const instructions = document.createElement('div');
    instructions.innerHTML = `
        <p style="color: white; margin-bottom: 10px; font-size: 14px;">
            🔍 <strong>Zoom Test Instructions:</strong>
        </p>
        <ul style="color: white; font-size: 12px; margin-left: 20px;">
            <li>Use mouse wheel over waveform to zoom in/out</li>
            <li>Use zoom controls (+/-) if available</li>
            <li>Check timeline updates correctly during zoom</li>
            <li>Verify timeline markers remain accurate</li>
            <li>Test both interaction modes with zoom</li>
        </ul>
    `;
    testContainer.appendChild(instructions);
    
    document.body.appendChild(testContainer);
    
    // Create Zoom Test WaveSurfer with enhanced configuration
    const zoomTestWave = new WaveSurferCompatible({
        attach: testContainer,
        width: 900, 
        height: 180,
        url: './assets/audios/riff.m4a',
        waveColor: '#4A90E2',
        progressColor: '#2ECC71',
        cursorColor: '#E74C3C',
        interactionMode: 'scrub',
        
        // Enhanced zoom configuration
        zoom: { 
            enabled: true, 
            scale: 0.5,
            wheelZoom: true // Enable mouse wheel zoom
        },
        
        // Timeline for zoom visualization
        timeline: { 
            enabled: true, 
            height: 35 
        },
        
        // Regions for interaction testing
        regions: {
            enabled: true,
            dragSelection: false
        },
        
        // Enhanced controls
        controls: {
            enabled: true,
            play: true,
            pause: true,
            stop: true,
            mute: true,
            volume: true,
            modeToggle: true,
            loop: true,
            clearRegions: true
        },
        
        callbacks: {
            onReady: (wavesurfer) => {
                console.log('🔍 Zoom Test Ready');
                console.log('Zoom plugin enabled:', wavesurfer.config.zoom.enabled);
                console.log('Wheel zoom enabled:', wavesurfer.config.zoom.wheelZoom);
                
                // Debug plugins
                setTimeout(() => {
                    const plugins = wavesurfer.wavesurfer.getActivePlugins();
                    console.log('🔌 Active plugins for zoom test:', plugins.map(p => ({
                        name: p.constructor?.name || p.name || 'Unknown',
                        hasZoom: 'zoom' in p,
                        hasTimeline: 'timeline' in p || 'TimelinePlugin' === p.constructor?.name,
                        methods: Object.getOwnPropertyNames(p).filter(prop => typeof p[prop] === 'function').slice(0, 5)
                    })));
                    
                    // Test zoom programmatically
                    testZoomFunctionality(wavesurfer);
                }, 500);
            },
            
            onPlay: (wavesurfer) => {
                console.log('🔍 Zoom test - Audio playing');
            },
            
            onSeek: (time, wavesurfer) => {
                console.log(`🔍 Zoom test - Seeking to: ${time.toFixed(2)}s`);
            }
        }
    });
    
    // Create zoom control buttons
    const zoomControls = document.createElement('div');
    zoomControls.style.cssText = `
        margin-top: 15px;
        text-align: center;
        display: flex;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
    `;
    
    // Zoom In button
    const zoomInBtn = createTestButton('🔍 Zoom In', () => {
        testZoomIn(zoomTestWave);
    });
    zoomControls.appendChild(zoomInBtn);
    
    // Zoom Out button
    const zoomOutBtn = createTestButton('🔍 Zoom Out', () => {
        testZoomOut(zoomTestWave);
    });
    zoomControls.appendChild(zoomOutBtn);
    
    // Reset Zoom button
    const resetZoomBtn = createTestButton('🔄 Reset Zoom', () => {
        testResetZoom(zoomTestWave);
    });
    zoomControls.appendChild(resetZoomBtn);
    
    // Diagnostic button
    const diagnosticBtn = createTestButton('🔬 Zoom Diagnostic', () => {
        runZoomDiagnostic(zoomTestWave);
    });
    zoomControls.appendChild(diagnosticBtn);
    
    testContainer.appendChild(zoomControls);
    
    return zoomTestWave;
}

function createTestButton(text, onClick) {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = `
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.4);
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s ease;
        backdrop-filter: blur(10px);
    `;
    
    button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(255,255,255,0.3)';
        button.style.transform = 'scale(1.05)';
    });
    
    button.addEventListener('mouseleave', () => {
        button.style.background = 'rgba(255,255,255,0.2)';
        button.style.transform = 'scale(1)';
    });
    
    button.addEventListener('click', onClick);
    return button;
}

function testZoomFunctionality(wavesurfer) {
    console.log('🔍 === TESTING ZOOM FUNCTIONALITY ===');
    
    // Check if WaveSurfer has zoom method
    if (wavesurfer.wavesurfer && typeof wavesurfer.wavesurfer.zoom === 'function') {
        console.log('✅ WaveSurfer.zoom() method available');
        
        // Test different zoom levels
        setTimeout(() => {
            console.log('🔍 Testing zoom level 100 (zoom in)');
            wavesurfer.wavesurfer.zoom(100);
        }, 1000);
        
        setTimeout(() => {
            console.log('🔍 Testing zoom level 25 (zoom out)');
            wavesurfer.wavesurfer.zoom(25);
        }, 2000);
        
        setTimeout(() => {
            console.log('🔍 Resetting to default zoom');
            wavesurfer.wavesurfer.zoom(50);
        }, 3000);
        
    } else {
        console.warn('⚠️ WaveSurfer.zoom() method not available');
    }
    
    // Check for zoom plugin
    const plugins = wavesurfer.wavesurfer.getActivePlugins();
    const zoomPlugin = plugins.find(plugin => 
        plugin.constructor?.name === 'ZoomPlugin' || 
        plugin.name === 'zoom' ||
        'zoom' in plugin
    );
    
    if (zoomPlugin) {
        console.log('✅ Zoom plugin found:', {
            constructor: zoomPlugin.constructor?.name,
            name: zoomPlugin.name,
            methods: Object.getOwnPropertyNames(zoomPlugin).filter(prop => typeof zoomPlugin[prop] === 'function')
        });
    } else {
        console.warn('⚠️ Zoom plugin not found in active plugins');
    }
}

function testZoomIn(wavesurfer) {
    console.log('🔍 Manual Zoom In Test');
    if (wavesurfer.wavesurfer && typeof wavesurfer.wavesurfer.zoom === 'function') {
        const currentZoom = wavesurfer.wavesurfer.options?.pixelsPerSecond || 50;
        const newZoom = currentZoom * 1.5;
        console.log(`🔍 Zooming from ${currentZoom} to ${newZoom} pixels per second`);
        wavesurfer.wavesurfer.zoom(newZoom);
    } else {
        console.warn('🔍 Zoom method not available');
    }
}

function testZoomOut(wavesurfer) {
    console.log('🔍 Manual Zoom Out Test');
    if (wavesurfer.wavesurfer && typeof wavesurfer.wavesurfer.zoom === 'function') {
        const currentZoom = wavesurfer.wavesurfer.options?.pixelsPerSecond || 50;
        const newZoom = Math.max(10, currentZoom * 0.7);
        console.log(`🔍 Zooming from ${currentZoom} to ${newZoom} pixels per second`);
        wavesurfer.wavesurfer.zoom(newZoom);
    } else {
        console.warn('🔍 Zoom method not available');
    }
}

function testResetZoom(wavesurfer) {
    console.log('🔄 Reset Zoom Test');
    if (wavesurfer.wavesurfer && typeof wavesurfer.wavesurfer.zoom === 'function') {
        console.log('🔄 Resetting zoom to 50 pixels per second');
        wavesurfer.wavesurfer.zoom(50);
    } else {
        console.warn('🔄 Zoom method not available');
    }
}

function runZoomDiagnostic(wavesurfer) {
    console.log('🔬 === ZOOM DIAGNOSTIC ===');
    
    const diagnostic = {
        zoomEnabled: wavesurfer.config.zoom.enabled,
        wheelZoomEnabled: wavesurfer.config.zoom.wheelZoom,
        zoomScale: wavesurfer.config.zoom.scale,
        hasZoomMethod: !!(wavesurfer.wavesurfer && typeof wavesurfer.wavesurfer.zoom === 'function'),
        activePlugins: [],
        zoomPlugin: null,
        timelinePlugin: null,
        wavesurferOptions: null
    };
    
    // Check active plugins
    if (wavesurfer.wavesurfer && wavesurfer.wavesurfer.getActivePlugins) {
        const plugins = wavesurfer.wavesurfer.getActivePlugins();
        diagnostic.activePlugins = plugins.map(p => ({
            name: p.constructor?.name || p.name || 'Unknown',
            hasZoom: 'zoom' in p,
            hasTimeline: 'timeline' in p || 'TimelinePlugin' === p.constructor?.name
        }));
        
        diagnostic.zoomPlugin = plugins.find(p => 
            p.constructor?.name === 'ZoomPlugin' || 
            p.name === 'zoom' ||
            'zoom' in p
        );
        
        diagnostic.timelinePlugin = plugins.find(p => 
            p.constructor?.name === 'TimelinePlugin' || 
            p.name === 'timeline'
        );
    }
    
    // Get WaveSurfer options
    if (wavesurfer.wavesurfer && wavesurfer.wavesurfer.options) {
        diagnostic.wavesurferOptions = {
            pixelsPerSecond: wavesurfer.wavesurfer.options.pixelsPerSecond,
            minPxPerSec: wavesurfer.wavesurfer.options.minPxPerSec,
            scrollParent: wavesurfer.wavesurfer.options.scrollParent
        };
    }
    
    console.log('🔬 Zoom Diagnostic Results:', diagnostic);
    
    // Display results in a formatted way
    console.log(`🔬 Zoom Enabled: ${diagnostic.zoomEnabled ? '✅' : '❌'}`);
    console.log(`🔬 Wheel Zoom: ${diagnostic.wheelZoomEnabled ? '✅' : '❌'}`);
    console.log(`🔬 Zoom Method Available: ${diagnostic.hasZoomMethod ? '✅' : '❌'}`);
    console.log(`🔬 Zoom Plugin Found: ${diagnostic.zoomPlugin ? '✅' : '❌'}`);
    console.log(`🔬 Timeline Plugin Found: ${diagnostic.timelinePlugin ? '✅' : '❌'}`);
    
    return diagnostic;
}

// Auto-start zoom test if this file is loaded directly
if (import.meta.url === window.location.href) {
    document.addEventListener('DOMContentLoaded', () => {
        createZoomTest();
    });
}
