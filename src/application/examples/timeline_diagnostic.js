
// Timeline diagnostic: Compare Web Component vs Native API

import '../../a/components/WaveSurfer.js';

console.log('🔍 Timeline Diagnostic Script Loading...');

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔍 DOM Content Loaded - Starting Timeline Diagnostic');
    
    const container = document.getElementById('app');
    container.innerHTML = `
        <div style="padding: 20px; font-family: Arial, sans-serif;">
            <h1>🔍 Timeline Diagnostic</h1>
            
            <div style="margin-bottom: 30px;">
                <h2>1. Web Component Implementation</h2>
                <squirrel-wavesurfer 
                    id="webcomponent-test"
                    src="./assets/audio/sample.mp3"
                    style="width: 100%; height: 120px; border: 2px solid blue; margin-bottom: 10px;">
                </squirrel-wavesurfer>
                <button onclick="diagnosticWebComponent()">🔍 Diagnostic Web Component</button>
                <div id="webcomponent-debug" style="background: #f0f0f0; padding: 10px; margin-top: 10px; white-space: pre-wrap; font-family: monospace; font-size: 12px;"></div>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h2>2. Native API Implementation (Reference)</h2>
                <div id="native-waveform" style="width: 100%; height: 120px; border: 2px solid green; margin-bottom: 10px;"></div>
                <button onclick="diagnosticNativeAPI()">🔍 Diagnostic Native API</button>
                <div id="native-debug" style="background: #f0f0f0; padding: 10px; margin-top: 10px; white-space: pre-wrap; font-family: monospace; font-size: 12px;"></div>
            </div>
            
            <div>
                <h2>3. Comparison Results</h2>
                <div id="comparison-results" style="background: #ffffcc; padding: 15px; margin-top: 10px; font-family: monospace; font-size: 12px;"></div>
            </div>
        </div>
    `;
    
    // Wait for Web Component to be ready
    setTimeout(() => {
        setupNativeAPI();
    }, 1000);
});

let nativeWaveSurfer = null;

async function setupNativeAPI() {
    console.log('🔍 Setting up Native API for comparison...');
    
    try {
        // Import WaveSurfer dynamically using our local files
        const WaveSurfer = (await import('../../js/wavesurfer-v7/core/wavesurfer.esm.js')).default;
        const TimelinePlugin = (await import('../../js/wavesurfer-v7/plugins/timeline.esm.js')).default;
        const RegionsPlugin = (await import('../../js/wavesurfer-v7/plugins/regions.esm.js')).default;
        
        const container = document.getElementById('native-waveform');
        
        nativeWaveSurfer = WaveSurfer.create({
            container: container,
            waveColor: '#4FC3F7',
            progressColor: '#29B6F6',
            cursorColor: '#FF5722',
            barWidth: 2,
            barRadius: 3,
            responsive: true,
            height: 80,
            normalize: true,
            plugins: [
                TimelinePlugin.create({
                    height: 20,
                    timeInterval: 0.2,
                    primaryLabelInterval: 5,
                    style: {
                        fontSize: '10px',
                        color: '#666'
                    }
                }),
                RegionsPlugin.create()
            ]
        });
        
        // Load audio
        await nativeWaveSurfer.load('./assets/audio/sample.mp3');
        
        console.log('✅ Native API setup complete');
        
    } catch (error) {
        console.error('❌ Native API setup failed:', error);
        document.getElementById('native-debug').textContent = 'Error: ' + error.message;
    }
}

window.diagnosticWebComponent = function() {
    console.log('🔍 Running Web Component Diagnostic...');
    
    const webComponent = document.getElementById('webcomponent-test');
    const debugDiv = document.getElementById('webcomponent-debug');
    
    if (!webComponent) {
        debugDiv.textContent = 'Error: Web Component not found';
        return;
    }
    
    // Check if Web Component has diagnostic method
    if (typeof webComponent.diagnosticTimeline === 'function') {
        const results = webComponent.diagnosticTimeline();
        debugDiv.textContent = 'Web Component Timeline Diagnostic:\n' + JSON.stringify(results, null, 2);
        
        // Store for comparison
        window.webComponentResults = results;
        
    } else {
        debugDiv.textContent = 'Error: diagnosticTimeline method not available on Web Component';
    }
    
    // Additional checks
    const shadowRoot = webComponent.shadowRoot;
    if (shadowRoot) {
        const timelineElements = shadowRoot.querySelectorAll('[class*="timeline"], [class*="time"]');
        debugDiv.textContent += '\n\nTimeline DOM Elements in Shadow Root: ' + timelineElements.length;
        timelineElements.forEach((el, i) => {
            debugDiv.textContent += `\nElement ${i}: ${el.tagName} class="${el.className}" style="${el.style.cssText}"`;
        });
    }
    
    // Compare if both results available
    if (window.webComponentResults && window.nativeResults) {
        compareResults();
    }
};

window.diagnosticNativeAPI = function() {
    console.log('🔍 Running Native API Diagnostic...');
    
    const debugDiv = document.getElementById('native-debug');
    
    if (!nativeWaveSurfer) {
        debugDiv.textContent = 'Error: Native WaveSurfer not initialized';
        return;
    }
    
    const plugins = nativeWaveSurfer.getActivePlugins ? nativeWaveSurfer.getActivePlugins() : [];
    const container = document.getElementById('native-waveform');
    const timelineElements = container.querySelectorAll('[class*="timeline"], [class*="time"]');
    
    const results = {
        plugins: plugins.map(p => p.constructor?.name || 'Unknown'),
        timelineElementsCount: timelineElements.length,
        containerHeight: container.offsetHeight,
        containerWidth: container.offsetWidth,
        timelineElements: Array.from(timelineElements).map(el => ({
            tag: el.tagName,
            className: el.className,
            style: el.style.cssText,
            offsetHeight: el.offsetHeight,
            offsetWidth: el.offsetWidth
        }))
    };
    
    // Store for comparison
    window.nativeResults = results;
    
    debugDiv.textContent = 'Native API Diagnostic:\n' + JSON.stringify(results, null, 2);
    
    // Compare if both results available
    if (window.webComponentResults && window.nativeResults) {
        compareResults();
    }
};

// Comparison function
function compareResults() {
    const comparisonDiv = document.getElementById('comparison-results');
    
    if (!window.webComponentResults || !window.nativeResults) {
        comparisonDiv.textContent = 'Both diagnostics must be run for comparison';
        return;
    }
    
    const comparison = {
        timeline_plugins: {
            webComponent: window.webComponentResults.pluginFound,
            native: window.nativeResults.plugins.includes('TimelinePlugin')
        },
        dom_elements: {
            webComponent: window.webComponentResults.domElementsCount,
            native: window.nativeResults.timelineElementsCount
        },
        active_plugins: {
            webComponent: window.webComponentResults.activePlugins,
            native: window.nativeResults.plugins
        }
    };
    
    let analysis = '=== TIMELINE COMPARISON ANALYSIS ===\n\n';
    
    if (comparison.timeline_plugins.webComponent && comparison.timeline_plugins.native) {
        analysis += '✅ Both have Timeline plugin loaded\n';
    } else {
        analysis += '❌ Timeline plugin mismatch:\n';
        analysis += `   Web Component: ${comparison.timeline_plugins.webComponent}\n`;
        analysis += `   Native API: ${comparison.timeline_plugins.native}\n`;
    }
    
    analysis += `\nDOM Elements:\n`;
    analysis += `   Web Component: ${comparison.dom_elements.webComponent} elements\n`;
    analysis += `   Native API: ${comparison.dom_elements.native} elements\n`;
    
    if (comparison.dom_elements.webComponent === 0 && comparison.dom_elements.native > 0) {
        analysis += '\n🔍 ISSUE FOUND: Native API has timeline DOM elements but Web Component does not!\n';
        analysis += 'This suggests the timeline plugin is loading but not rendering in the Web Component.\n';
    }
    
    analysis += `\nActive Plugins:\n`;
    analysis += `   Web Component: ${comparison.active_plugins.webComponent.join(', ')}\n`;
    analysis += `   Native API: ${comparison.active_plugins.native.join(', ')}\n`;
    
    comparisonDiv.textContent = analysis;
    
    console.log('🔍 Comparison completed:', comparison);
}

// Auto-run diagnostics after components load
setTimeout(() => {
    console.log('🔍 Auto-running diagnostics...');
    if (window.diagnosticWebComponent) {
        diagnosticWebComponent();
    }
    if (window.diagnosticNativeAPI) {
        diagnosticNativeAPI();
    }
}, 3000);
