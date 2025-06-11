/**
 * 🎛️ CONTROL POSITIONING TEST
 * Tests that controls are properly positioned and don't overlap with waveform
 */

import '../../a/components/WaveSurfer.js';
import WaveSurferCompatible from '../../a/components/WaveSurfer.js';

export function createControlPositioningTest() {
    console.log('🎛️ Creating Control Positioning Test...');
    
    // Create test container
    const testContainer = document.createElement('div');
    testContainer.style.cssText = `
        padding: 20px;
        margin: 20px;
        background: linear-gradient(135deg, #8BC34A 0%, #4CAF50 100%);
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;
    
    // Create title
    const title = document.createElement('h2');
    title.textContent = '🎛️ Control Positioning Test - Flexbox Layout';
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
            🎛️ <strong>Control Positioning Test:</strong>
        </p>
        <ul style="color: white; font-size: 12px; margin-left: 20px;">
            <li>✅ Controls should appear below waveform (not overlapping)</li>
            <li>✅ Timeline should be integrated with waveform area</li>
            <li>✅ Controls should stay at bottom when resizing</li>
            <li>✅ All controls should be visible and functional</li>
            <li>✅ No z-index conflicts or overlapping elements</li>
        </ul>
    `;
    testContainer.appendChild(instructions);
    
    document.body.appendChild(testContainer);
    
    // Test 1: Standard layout with all features
    const test1 = new WaveSurferCompatible({
        attach: testContainer,
        width: 900, 
        height: 200,
        url: './assets/audios/riff.m4a',
        waveColor: '#2196F3',
        progressColor: '#FF9800',
        cursorColor: '#F44336',
        interactionMode: 'scrub',
        
        // Enable all plugins to test layout
        timeline: { 
            enabled: true, 
            height: 30 
        },
        
        minimap: { 
            enabled: true, 
            height: 40 
        },
        
        zoom: { 
            enabled: true, 
            scale: 0.5,
            wheelZoom: true
        },
        
        regions: {
            enabled: true,
            dragSelection: false
        },
        
        // Full controls suite
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
                console.log('🎛️ Control Positioning Test Ready');
                setTimeout(() => {
                    runLayoutDiagnostic(wavesurfer, 'Test 1 (All Features)');
                }, 500);
            }
        }
    });
    
    // Create layout diagnostic button
    const diagnosticControls = document.createElement('div');
    diagnosticControls.style.cssText = `
        margin-top: 15px;
        text-align: center;
        display: flex;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
    `;
    
    const layoutDiagnosticBtn = createTestButton('🔬 Layout Diagnostic', () => {
        runLayoutDiagnostic(test1, 'Manual Diagnostic');
    });
    diagnosticControls.appendChild(layoutDiagnosticBtn);
    
    const resizeTestBtn = createTestButton('📏 Resize Test', () => {
        testResponsiveLayout(test1);
    });
    diagnosticControls.appendChild(resizeTestBtn);
    
    const overlapCheckBtn = createTestButton('👀 Overlap Check', () => {
        checkForOverlaps(test1);
    });
    diagnosticControls.appendChild(overlapCheckBtn);
    
    testContainer.appendChild(diagnosticControls);
    
    // Test 2: Minimal layout for comparison
    setTimeout(() => {
        createMinimalLayoutTest();
    }, 1000);
    
    return test1;
}

function createMinimalLayoutTest() {
    console.log('🎛️ Creating Minimal Layout Test...');
    
    const minimalContainer = document.createElement('div');
    minimalContainer.style.cssText = `
        padding: 20px;
        margin: 20px;
        background: linear-gradient(135deg, #9C27B0 0%, #673AB7 100%);
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;
    
    const title = document.createElement('h3');
    title.textContent = '🎛️ Minimal Layout Test (Comparison)';
    title.style.cssText = `
        color: white;
        text-align: center;
        margin-bottom: 15px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    minimalContainer.appendChild(title);
    
    document.body.appendChild(minimalContainer);
    
    const test2 = new WaveSurferCompatible({
        attach: minimalContainer,
        width: 900, 
        height: 120,
        url: './assets/audios/clap.wav',
        waveColor: '#E91E63',
        progressColor: '#FFC107',
        cursorColor: '#4CAF50',
        interactionMode: 'selection',
        
        // Minimal plugins
        timeline: { 
            enabled: true, 
            height: 25 
        },
        
        regions: {
            enabled: true,
            dragSelection: false
        },
        
        // Basic controls only
        controls: {
            enabled: true,
            play: true,
            pause: true,
            modeToggle: true
        },
        
        callbacks: {
            onReady: (wavesurfer) => {
                console.log('🎛️ Minimal Layout Test Ready');
                setTimeout(() => {
                    runLayoutDiagnostic(wavesurfer, 'Test 2 (Minimal)');
                }, 500);
            }
        }
    });
    
    return test2;
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

function runLayoutDiagnostic(wavesurfer, testName) {
    console.log(`🔬 === LAYOUT DIAGNOSTIC: ${testName} ===`);
    
    const diagnostic = {
        testName,
        containerInfo: {},
        waveformContainerInfo: {},
        controlsContainerInfo: {},
        layoutType: null,
        overlappingElements: [],
        zIndexIssues: [],
        pluginElements: []
    };
    
    if (!wavesurfer.shadowRoot) {
        console.warn('🔬 No shadow root found');
        return diagnostic;
    }
    
    // Get main elements
    const container = wavesurfer.shadowRoot.querySelector('.wavesurfer-container');
    const waveformContainer = wavesurfer.shadowRoot.querySelector('.waveform-container');
    const controlsContainer = wavesurfer.shadowRoot.querySelector('.controls-container');
    
    if (container) {
        const computedStyle = window.getComputedStyle(container);
        diagnostic.containerInfo = {
            display: computedStyle.display,
            flexDirection: computedStyle.flexDirection,
            height: container.offsetHeight,
            width: container.offsetWidth,
            position: computedStyle.position
        };
        diagnostic.layoutType = computedStyle.display === 'flex' ? 'flexbox' : 'other';
    }
    
    if (waveformContainer) {
        const computedStyle = window.getComputedStyle(waveformContainer);
        diagnostic.waveformContainerInfo = {
            flex: computedStyle.flex,
            height: waveformContainer.offsetHeight,
            width: waveformContainer.offsetWidth,
            position: computedStyle.position,
            top: waveformContainer.offsetTop,
            left: waveformContainer.offsetLeft
        };
        
        // Check for plugin elements
        const pluginElements = waveformContainer.querySelectorAll('div');
        diagnostic.pluginElements = Array.from(pluginElements).map(el => ({
            tagName: el.tagName,
            className: el.className,
            height: el.offsetHeight,
            width: el.offsetWidth,
            position: window.getComputedStyle(el).position,
            zIndex: window.getComputedStyle(el).zIndex
        }));
    }
    
    if (controlsContainer) {
        const computedStyle = window.getComputedStyle(controlsContainer);
        diagnostic.controlsContainerInfo = {
            flexShrink: computedStyle.flexShrink,
            height: controlsContainer.offsetHeight,
            width: controlsContainer.offsetWidth,
            position: computedStyle.position,
            top: controlsContainer.offsetTop,
            left: controlsContainer.offsetLeft,
            marginTop: computedStyle.marginTop
        };
    }
    
    // Check for overlaps
    if (waveformContainer && controlsContainer) {
        const waveformRect = waveformContainer.getBoundingClientRect();
        const controlsRect = controlsContainer.getBoundingClientRect();
        
        const overlapping = !(
            waveformRect.bottom <= controlsRect.top ||
            waveformRect.top >= controlsRect.bottom ||
            waveformRect.right <= controlsRect.left ||
            waveformRect.left >= controlsRect.right
        );
        
        if (overlapping) {
            diagnostic.overlappingElements.push({
                element1: 'waveform-container',
                element2: 'controls-container',
                waveformRect: {
                    top: waveformRect.top,
                    bottom: waveformRect.bottom,
                    left: waveformRect.left,
                    right: waveformRect.right
                },
                controlsRect: {
                    top: controlsRect.top,
                    bottom: controlsRect.bottom,
                    left: controlsRect.left,
                    right: controlsRect.right
                }
            });
        }
    }
    
    console.log('🔬 Layout Diagnostic Results:', diagnostic);
    
    // Display results
    console.log(`🔬 Layout Type: ${diagnostic.layoutType || 'Unknown'}`);
    console.log(`🔬 Container Display: ${diagnostic.containerInfo.display || 'Unknown'}`);
    console.log(`🔬 Flex Direction: ${diagnostic.containerInfo.flexDirection || 'N/A'}`);
    console.log(`🔬 Overlapping Elements: ${diagnostic.overlappingElements.length > 0 ? '❌' : '✅'}`);
    console.log(`🔬 Plugin Elements Found: ${diagnostic.pluginElements.length}`);
    
    if (diagnostic.overlappingElements.length > 0) {
        console.warn('🔬 ⚠️ OVERLAPPING ELEMENTS DETECTED:', diagnostic.overlappingElements);
    }
    
    return diagnostic;
}

function testResponsiveLayout(wavesurfer) {
    console.log('📏 Testing Responsive Layout...');
    
    if (!wavesurfer.shadowRoot) return;
    
    const container = wavesurfer.shadowRoot.querySelector('.wavesurfer-container');
    if (!container) return;
    
    const originalWidth = container.style.width;
    
    // Test different widths
    const testWidths = ['600px', '400px', '800px', '1200px'];
    let testIndex = 0;
    
    const runNextTest = () => {
        if (testIndex < testWidths.length) {
            const width = testWidths[testIndex];
            console.log(`📏 Testing width: ${width}`);
            
            container.style.width = width;
            
            setTimeout(() => {
                runLayoutDiagnostic(wavesurfer, `Responsive Test ${width}`);
                testIndex++;
                runNextTest();
            }, 500);
        } else {
            // Restore original width
            container.style.width = originalWidth;
            console.log('📏 Responsive test completed');
        }
    };
    
    runNextTest();
}

function checkForOverlaps(wavesurfer) {
    console.log('👀 Checking for element overlaps...');
    
    if (!wavesurfer.shadowRoot) return;
    
    const allElements = wavesurfer.shadowRoot.querySelectorAll('*');
    const overlaps = [];
    
    const elementsArray = Array.from(allElements).filter(el => 
        el.offsetWidth > 0 && el.offsetHeight > 0
    );
    
    for (let i = 0; i < elementsArray.length; i++) {
        for (let j = i + 1; j < elementsArray.length; j++) {
            const el1 = elementsArray[i];
            const el2 = elementsArray[j];
            
            // Skip if one is parent of the other
            if (el1.contains(el2) || el2.contains(el1)) continue;
            
            const rect1 = el1.getBoundingClientRect();
            const rect2 = el2.getBoundingClientRect();
            
            const overlapping = !(
                rect1.bottom <= rect2.top ||
                rect1.top >= rect2.bottom ||
                rect1.right <= rect2.left ||
                rect1.left >= rect2.right
            );
            
            if (overlapping) {
                overlaps.push({
                    element1: {
                        tagName: el1.tagName,
                        className: el1.className,
                        id: el1.id
                    },
                    element2: {
                        tagName: el2.tagName,
                        className: el2.className,
                        id: el2.id
                    }
                });
            }
        }
    }
    
    console.log(`👀 Overlap check complete. Found ${overlaps.length} overlaps`);
    if (overlaps.length > 0) {
        console.warn('👀 ⚠️ OVERLAPS DETECTED:', overlaps);
    } else {
        console.log('👀 ✅ No overlaps detected');
    }
    
    return overlaps;
}

// Auto-start control positioning test if this file is loaded directly
if (import.meta.url === window.location.href) {
    document.addEventListener('DOMContentLoaded', () => {
        createControlPositioningTest();
    });
}
