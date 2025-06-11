
// Simple timeline visibility test

import '../../a/components/WaveSurfer.js';

document.addEventListener('DOMContentLoaded', function() {
    console.log('⏰ Timeline Test Loading...');
    
    const container = document.getElementById('app');
    container.innerHTML = `
        <div style="padding: 20px; font-family: Arial, sans-serif;">
            <h1>⏰ Timeline Test</h1>
            
            <div style="margin-bottom: 20px;">
                <h2>Timeline-Enabled WaveSurfer</h2>
                <squirrel-wavesurfer 
                    id="timeline-test"
                    src="./assets/audios/clap.wav"
                    style="width: 800px; height: 150px; border: 2px solid blue; margin-bottom: 10px;">
                </squirrel-wavesurfer>
                
                <div style="margin-top: 10px;">
                    <button onclick="checkTimeline()">🔍 Check Timeline</button>
                    <button onclick="forceTimelineRender()">🔧 Force Timeline Render</button>
                    <button onclick="showTimelineElements()">👁️ Show Timeline Elements</button>
                </div>
                
                <div id="timeline-status" style="background: #f0f0f0; padding: 10px; margin-top: 10px; font-family: monospace; font-size: 12px;"></div>
            </div>
        </div>
    `;
    
    // Wait for Web Component to load
    setTimeout(() => {
        setupTimelineTest();
    }, 1000);
});

let timelineComponent = null;

function setupTimelineTest() {
    timelineComponent = document.getElementById('timeline-test');
    
    if (!timelineComponent) {
        console.error('⏰ Timeline test component not found');
        return;
    }
    
    // Listen for ready event
    timelineComponent.addEventListener('ready', () => {
        console.log('⏰ Timeline test component ready');
        setTimeout(() => {
            checkTimeline();
        }, 500);
    });
    
    console.log('⏰ Timeline test setup complete');
}

window.checkTimeline = function() {
    console.log('⏰ Checking timeline...');
    
    const statusDiv = document.getElementById('timeline-status');
    
    if (!timelineComponent) {
        statusDiv.textContent = 'Error: Timeline component not found';
        return;
    }
    
    // Run diagnostic
    let results = {};
    if (typeof timelineComponent.diagnosticTimeline === 'function') {
        results = timelineComponent.diagnosticTimeline();
    }
    
    // Check for timeline elements in various ways
    const shadowRoot = timelineComponent.shadowRoot;
    const allTimelineElements = [];
    
    if (shadowRoot) {
        const selectors = [
            '[class*="timeline"]',
            '[id*="timeline"]', 
            'div[style*="background"]',
            '.manual-timeline-container'
        ];
        
        selectors.forEach(selector => {
            const elements = shadowRoot.querySelectorAll(selector);
            elements.forEach(el => {
                if (!allTimelineElements.includes(el)) {
                    allTimelineElements.push(el);
                }
            });
        });
    }
    
    const status = {
        pluginFound: results.pluginFound || false,
        domElementsCount: results.domElementsCount || 0,
        manualTimelineElements: allTimelineElements.length,
        timelineVisible: allTimelineElements.some(el => el.offsetHeight > 0),
        containerHeight: shadowRoot ? shadowRoot.querySelector('.waveform-container')?.offsetHeight : 0
    };
    
    statusDiv.textContent = `Timeline Status:
Plugin Found: ${status.pluginFound}
DOM Elements: ${status.domElementsCount}
Manual Elements: ${status.manualTimelineElements}
Timeline Visible: ${status.timelineVisible}
Container Height: ${status.containerHeight}px

Timeline Elements Found:
${allTimelineElements.map((el, i) => `${i}: ${el.className || el.tagName} (${el.offsetWidth}x${el.offsetHeight})`).join('\\n')}`;
    
    console.log('⏰ Timeline check complete:', status);
};

window.forceTimelineRender = function() {
    console.log('⏰ Forcing timeline render...');
    
    if (!timelineComponent) {
        console.error('⏰ Timeline component not found');
        return;
    }
    
    // Try multiple approaches
    if (typeof timelineComponent.forceTimelineVisibility === 'function') {
        timelineComponent.forceTimelineVisibility();
    }
    
    if (typeof timelineComponent.renderTimelineManually === 'function') {
        timelineComponent.renderTimelineManually();
    }
    
    // Check results after a delay
    setTimeout(() => {
        checkTimeline();
    }, 500);
};

window.showTimelineElements = function() {
    console.log('⏰ Showing all timeline elements...');
    
    if (!timelineComponent || !timelineComponent.shadowRoot) {
        console.error('⏰ Timeline component or shadow root not found');
        return;
    }
    
    const shadowRoot = timelineComponent.shadowRoot;
    const allElements = shadowRoot.querySelectorAll('*');
    
    console.log(`⏰ Total elements in shadow root: ${allElements.length}`);
    
    allElements.forEach((el, index) => {
        const hasTimelineClass = el.className && el.className.includes('timeline');
        const hasTimelineContent = el.textContent && el.textContent.match(/\d+:\d+/);
        const isTimelineElement = hasTimelineClass || hasTimelineContent;
        
        if (isTimelineElement || index < 10) { // Show first 10 elements and all timeline elements
            console.log(`Element ${index}:`, {
                tag: el.tagName,
                class: el.className,
                content: el.textContent?.substring(0, 50),
                style: el.style.cssText?.substring(0, 100),
                visible: el.offsetHeight > 0,
                dimensions: `${el.offsetWidth}x${el.offsetHeight}`,
                isTimelineElement
            });
        }
    });
};
