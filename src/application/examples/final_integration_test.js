/**
 * 🎉 FINAL INTEGRATION TEST
 * Complete test of all WaveSurfer features
 */

import '../../a/components/WaveSurfer.js';
import WaveSurferCompatible from '../../a/components/WaveSurfer.js';

console.log('🎉 Final Integration Test Loading...');

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎉 Starting Final Integration Test');
    
    // Create page header
    const header = document.createElement('div');
    header.style.cssText = `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        text-align: center;
        padding: 30px;
        margin-bottom: 30px;
        border-radius: 15px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;
    
    header.innerHTML = `
        <h1 style="margin: 0; font-size: 2.5em; font-family: 'Segoe UI', sans-serif;">
            🎉 WaveSurfer Component - Final Test
        </h1>
        <p style="margin: 15px 0 0 0; font-size: 1.2em; opacity: 0.9;">
            Complete integration test with all features enabled
        </p>
    `;
    document.body.appendChild(header);
    
    // Create feature checklist
    const checklist = document.createElement('div');
    checklist.style.cssText = `
        background: #f8f9fa;
        padding: 20px;
        margin: 20px 0;
        border-radius: 10px;
        border-left: 5px solid #28a745;
    `;
    
    checklist.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #28a745;">✅ Features to Test:</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 14px;">
            <div>
                <strong>🎯 Interaction Modes:</strong><br>
                • Scrub mode (🎯) - click to seek<br>
                • Selection mode (✋) - drag to create regions<br>
                • Mode toggle button
            </div>
            <div>
                <strong>🔍 Zoom & Timeline:</strong><br>
                • Mouse wheel zoom<br>
                • Timeline markers<br>
                • Zoom controls
            </div>
            <div>
                <strong>🎛️ Controls:</strong><br>
                • Play/Pause/Stop<br>
                • Volume control<br>
                • Loop functionality
            </div>
            <div>
                <strong>🎯 Regions:</strong><br>
                • Create regions in selection mode<br>
                • Clear regions button<br>
                • Region events
            </div>
        </div>
    `;
    document.body.appendChild(checklist);
    
    // Create the ultimate WaveSurfer test instance
    const ultimateWaveSurfer = new WaveSurferCompatible({
        attach: 'body',
        width: 1000,
        height: 200,
        url: './assets/audios/riff.m4a',
        
        // Visual styling
        waveColor: '#667eea',
        progressColor: '#764ba2',
        cursorColor: '#f093fb',
        barWidth: 2,
        barRadius: 1,
        
        // Start in scrub mode
        interactionMode: 'scrub',
        
        // Enable ALL plugins
        timeline: { 
            enabled: true, 
            height: 35 
        },
        minimap: { 
            enabled: true, 
            height: 50 
        },
        zoom: { 
            enabled: true, 
            scale: 0.5,
            wheelZoom: true 
        },
        regions: {
            enabled: true,
            dragSelection: false // Controlled by interaction mode
        },
        
        // Complete control suite
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
                console.log('🎉 === FINAL TEST READY ===');
                console.log('🎉 All features loaded successfully!');
                
                // Run comprehensive diagnostic
                setTimeout(() => {
                    runFinalDiagnostic(wavesurfer);
                }, 1000);
                
                // Auto-test sequence
                setTimeout(() => {
                    runAutoTestSequence(wavesurfer);
                }, 2000);
            },
            
            onPlay: () => console.log('🎵 Audio playing'),
            onPause: () => console.log('⏸️ Audio paused'),
            onSeek: (time) => console.log(`🎯 Seeking to: ${time.toFixed(2)}s`),
            onRegionCreate: (region) => console.log('🎯 Region created:', region.id),
            onRegionUpdate: (region) => console.log('🎯 Region updated:', region.id),
            onRegionRemove: (region) => console.log('🎯 Region removed:', region.id)
        }
    });
    
    // Create manual test controls
    const testControls = document.createElement('div');
    testControls.style.cssText = `
        margin: 30px 0;
        padding: 20px;
        background: #e9ecef;
        border-radius: 10px;
        text-align: center;
    `;
    
    testControls.innerHTML = `
        <h3 style="margin: 0 0 15px 0;">🧪 Manual Test Controls</h3>
        <div id="manual-controls" style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;"></div>
    `;
    document.body.appendChild(testControls);
    
    const controlsContainer = document.getElementById('manual-controls');
    
    // Add manual test buttons
    const buttons = [
        { text: '🎯→✋ Switch to Selection', action: () => ultimateWaveSurfer.setInteractionMode('selection') },
        { text: '✋→🎯 Switch to Scrub', action: () => ultimateWaveSurfer.setInteractionMode('scrub') },
        { text: '🔍 Zoom In', action: () => ultimateWaveSurfer.wavesurfer?.zoom(100) },
        { text: '🔍 Zoom Out', action: () => ultimateWaveSurfer.wavesurfer?.zoom(25) },
        { text: '🔄 Reset Zoom', action: () => ultimateWaveSurfer.wavesurfer?.zoom(50) },
        { text: '🎯 Add Test Region', action: () => addTestRegion(ultimateWaveSurfer) },
        { text: '🗑️ Clear All Regions', action: () => ultimateWaveSurfer.clearRegions() },
        { text: '🔬 Run Diagnostic', action: () => runFinalDiagnostic(ultimateWaveSurfer) }
    ];
    
    buttons.forEach(({ text, action }) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `
            padding: 8px 16px;
            margin: 2px;
            border: none;
            border-radius: 6px;
            background: #007bff;
            color: white;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
        `;
        btn.addEventListener('mouseenter', () => btn.style.background = '#0056b3');
        btn.addEventListener('mouseleave', () => btn.style.background = '#007bff');
        btn.addEventListener('click', action);
        controlsContainer.appendChild(btn);
    });
    
    // Create results area
    const results = document.createElement('div');
    results.id = 'test-results';
    results.style.cssText = `
        margin: 30px 0;
        padding: 20px;
        background: #f8f9fa;
        border-radius: 10px;
        border-left: 5px solid #17a2b8;
    `;
    results.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #17a2b8;">📊 Test Results</h3>
        <div id="results-content">Waiting for tests to run...</div>
    `;
    document.body.appendChild(results);
});

function runFinalDiagnostic(wavesurfer) {
    console.log('🔬 === RUNNING FINAL DIAGNOSTIC ===');
    
    const diagnostic = {
        timestamp: new Date().toISOString(),
        componentReady: wavesurfer.isReady,
        currentMode: wavesurfer.getInteractionMode(),
        pluginsLoaded: [],
        features: {},
        apis: {},
        layout: {}
    };
    
    // Check plugins
    if (wavesurfer.wavesurfer?.getActivePlugins) {
        const plugins = wavesurfer.wavesurfer.getActivePlugins();
        diagnostic.pluginsLoaded = plugins.map(p => p.constructor?.name || p.name || 'Unknown');
    }
    
    // Check features
    diagnostic.features = {
        timeline: wavesurfer.config.timeline.enabled,
        zoom: wavesurfer.config.zoom.enabled,
        wheelZoom: wavesurfer.config.zoom.wheelZoom,
        regions: wavesurfer.config.regions.enabled,
        controls: wavesurfer.config.controls.enabled,
        modeToggle: wavesurfer.config.controls.modeToggle
    };
    
    // Check APIs
    diagnostic.apis = {
        hasWaveSurferInstance: !!wavesurfer.wavesurfer,
        hasZoomMethod: !!(wavesurfer.wavesurfer?.zoom),
        hasPlayMethod: !!(wavesurfer.wavesurfer?.play),
        hasRegionsPlugin: diagnostic.pluginsLoaded.includes('RegionsPlugin'),
        hasTimelinePlugin: diagnostic.pluginsLoaded.includes('TimelinePlugin'),
        hasZoomPlugin: diagnostic.pluginsLoaded.includes('ZoomPlugin')
    };
    
    // Check layout
    if (wavesurfer.shadowRoot) {
        const container = wavesurfer.shadowRoot.querySelector('.wavesurfer-container');
        const waveformContainer = wavesurfer.shadowRoot.querySelector('.waveform-container');
        const controlsContainer = wavesurfer.shadowRoot.querySelector('.controls-container');
        
        diagnostic.layout = {
            containerFound: !!container,
            waveformContainerFound: !!waveformContainer,
            controlsContainerFound: !!controlsContainer,
            containerDisplay: container ? window.getComputedStyle(container).display : null,
            containerFlexDirection: container ? window.getComputedStyle(container).flexDirection : null
        };
    }
    
    console.log('🔬 Final Diagnostic Results:', diagnostic);
    
    // Update results display
    const resultsContent = document.getElementById('results-content');
    if (resultsContent) {
        const successCount = Object.values(diagnostic.apis).filter(Boolean).length;
        const totalChecks = Object.keys(diagnostic.apis).length;
        
        resultsContent.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; font-size: 14px;">
                <div>
                    <strong>📦 Plugins (${diagnostic.pluginsLoaded.length}):</strong><br>
                    ${diagnostic.pluginsLoaded.join(', ') || 'None'}
                </div>
                <div>
                    <strong>🎯 Current Mode:</strong><br>
                    ${diagnostic.currentMode} 
                    ${diagnostic.currentMode === 'scrub' ? '🎯' : '✋'}
                </div>
                <div>
                    <strong>✅ API Status:</strong><br>
                    ${successCount}/${totalChecks} checks passed
                </div>
            </div>
            <div style="margin-top: 15px; padding: 10px; background: ${successCount === totalChecks ? '#d4edda' : '#f8d7da'}; border-radius: 5px;">
                <strong>${successCount === totalChecks ? '🎉 ALL SYSTEMS GO!' : '⚠️ Some issues detected'}</strong>
            </div>
        `;
    }
    
    return diagnostic;
}

function runAutoTestSequence(wavesurfer) {
    console.log('🤖 === RUNNING AUTO TEST SEQUENCE ===');
    
    let step = 0;
    const steps = [
        () => {
            console.log('🤖 Step 1: Testing scrub mode');
            wavesurfer.setInteractionMode('scrub');
        },
        () => {
            console.log('🤖 Step 2: Testing selection mode');
            wavesurfer.setInteractionMode('selection');
        },
        () => {
            console.log('🤖 Step 3: Testing zoom in');
            wavesurfer.wavesurfer?.zoom(80);
        },
        () => {
            console.log('🤖 Step 4: Testing zoom out');
            wavesurfer.wavesurfer?.zoom(30);
        },
        () => {
            console.log('🤖 Step 5: Reset zoom');
            wavesurfer.wavesurfer?.zoom(50);
        },
        () => {
            console.log('🤖 Step 6: Testing region creation');
            addTestRegion(wavesurfer);
        },
        () => {
            console.log('🤖 Auto test sequence complete!');
        }
    ];
    
    const runNextStep = () => {
        if (step < steps.length) {
            steps[step]();
            step++;
            setTimeout(runNextStep, 1500);
        }
    };
    
    runNextStep();
}

function addTestRegion(wavesurfer) {
    try {
        const duration = wavesurfer.wavesurfer?.getDuration() || 10;
        const start = Math.random() * (duration * 0.6);
        const end = start + (Math.random() * 2 + 1); // 1-3 second region
        
        wavesurfer.addRegion({
            start,
            end,
            color: `hsla(${Math.random() * 360}, 70%, 50%, 0.3)`,
            content: `Test Region ${Date.now().toString().slice(-4)}`
        });
        
        console.log(`🎯 Test region added: ${start.toFixed(2)}s - ${end.toFixed(2)}s`);
    } catch (error) {
        console.warn('🎯 Could not add test region:', error);
    }
}
