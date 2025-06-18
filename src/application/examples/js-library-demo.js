/**
 * 🧪 JS Library Integration Example
 * Shows how to use GSAP, CodeMirror, Leaflet, and Tone.js with Squirrel Framework
 */

async function initLibraryDemo() {
    console.log('🚀 Starting JS Library Demo...');

    try {
        // Import the library manager
        const jsLibrary = (await import('./src/js_library/index.js')).default;

        // Load all libraries
        console.log('📦 Loading libraries...');
        await Promise.all([
            jsLibrary.loadGSAP(),
            jsLibrary.loadCodeMirror(),
            jsLibrary.loadLeaflet(),
            jsLibrary.loadTone()
        ]);

        console.log('✅ All libraries loaded!');

        // Create animated elements with Squirrel + GSAP
        createAnimatedElements();

        // Create code editor with Squirrel + CodeMirror
        createCodeEditor();

        // Create interactive map with Squirrel + Leaflet
        createInteractiveMap();

        // Create audio controls with Squirrel + Tone.js
        createAudioControls();

        console.log('🎉 Demo initialized successfully!');

    } catch (error) {
        console.error('❌ Demo initialization failed:', error);
    }
}

function createAnimatedElements() {
    // Create animated box using Squirrel Framework
    const animatedBox = new A({
        attach: 'body',
        id: 'demo-animated-box',
        width: 100,
        height: 100,
        backgroundColor: '#ff6b6b',
        x: 50,
        y: 100,
        borderRadius: '8px',
        cursor: 'pointer'
    });

    // Add click animation using GSAP
    animatedBox.html_object.addEventListener('click', () => {
        // Use the GSAP wrapper methods added to A class
        animatedBox.animate({ scale: 1.2, rotation: 360 }, 0.5);
        setTimeout(() => {
            animatedBox.animate({ scale: 1, rotation: 0 }, 0.5);
        }, 500);
    });

    // Create control buttons
    const buttonContainer = new A({
        attach: 'body',
        id: 'animation-controls',
        x: 50,
        y: 220,
        width: 400,
        height: 50
    });

    ['Fade In', 'Fade Out', 'Bounce', 'Slide'].forEach((action, index) => {
        const button = new A({
            attach: 'animation-controls',
            markup: 'button',
            text: action,
            x: index * 90,
            y: 0,
            width: 80,
            height: 40,
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        });

        button.html_object.addEventListener('click', () => {
            switch(action) {
                case 'Fade In':
                    animatedBox.fadeIn();
                    break;
                case 'Fade Out':
                    animatedBox.fadeOut();
                    break;
                case 'Bounce':
                    window.gsapWrapper.bounce(animatedBox.html_object);
                    break;
                case 'Slide':
                    animatedBox.slideIn('left');
                    break;
            }
        });
    });
}

function createCodeEditor() {
    // Create editor container using Squirrel
    const editorContainer = new A({
        attach: 'body',
        id: 'demo-editor-container',
        x: 500,
        y: 100,
        width: 500,
        height: 300,
        border: '1px solid #555',
        borderRadius: '4px'
    });

    // Create CodeMirror editor
    const editor = editorContainer.makeCodeEditor({
        mode: 'javascript',
        theme: 'dark',
        value: `// 🎯 Squirrel + JS Libraries Demo
function demoFunction() {
    // Create element with Squirrel
    const element = new A({
        attach: 'body',
        text: 'Hello World!',
        backgroundColor: '#4CAF50'
    });
    
    // Animate with GSAP
    element.animate({ x: 100, scale: 1.5 }, 1);
    
    // Play sound with Tone.js
    element.playNote('C4', '4n');
}

demoFunction();`,
        onChange: (code) => {
            console.log('Code changed:', code.length, 'characters');
        }
    });

    // Create editor controls
    const editorControls = new A({
        attach: 'body',
        x: 500,
        y: 420,
        width: 500,
        height: 40
    });

    ['JavaScript', 'CSS', 'HTML', 'JSON'].forEach((mode, index) => {
        const button = new A({
            attach: editorControls.id,
            markup: 'button',
            text: mode,
            x: index * 100,
            y: 0,
            width: 90,
            height: 35,
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        });

        button.html_object.addEventListener('click', () => {
            editor.setMode(mode.toLowerCase());
        });
    });
}

function createInteractiveMap() {
    // Create map container using Squirrel
    const mapContainer = new A({
        attach: 'body',
        id: 'demo-map-container',
        x: 50,
        y: 300,
        width: 400,
        height: 300,
        border: '1px solid #555',
        borderRadius: '4px'
    });

    // Create Leaflet map
    const map = mapContainer.makeMap({
        center: [48.8566, 2.3522], // Paris
        zoom: 13,
        tileLayer: 'osm'
    });

    // Add some demo markers
    map.addMarker(48.8566, 2.3522, {
        popup: '🗼 Eiffel Tower'
    });

    map.addMarker(48.8606, 2.3376, {
        popup: '🏛️ Louvre Museum'
    });

    // Create map controls
    const mapControls = new A({
        attach: 'body',
        x: 50,
        y: 620,
        width: 400,
        height: 40
    });

    [
        { name: 'London', coords: [51.505, -0.09] },
        { name: 'Paris', coords: [48.8566, 2.3522] },
        { name: 'New York', coords: [40.7128, -74.0060] }
    ].forEach((city, index) => {
        const button = new A({
            attach: mapControls.id,
            markup: 'button',
            text: city.name,
            x: index * 130,
            y: 0,
            width: 120,
            height: 35,
            backgroundColor: '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        });

        button.html_object.addEventListener('click', () => {
            map.setView(city.coords, 13);
        });
    });
}

function createAudioControls() {
    // Create audio container using Squirrel
    const audioContainer = new A({
        attach: 'body',
        id: 'demo-audio-container',
        x: 500,
        y: 500,
        width: 500,
        height: 200,
        border: '1px solid #555',
        borderRadius: '4px',
        padding: '10px'
    });

    // Title
    const title = new A({
        attach: 'demo-audio-container',
        markup: 'h3',
        text: '🎵 Audio Controls',
        x: 10,
        y: 10,
        color: '#fff'
    });

    // Note buttons
    const notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
    notes.forEach((note, index) => {
        const button = new A({
            attach: 'demo-audio-container',
            markup: 'button',
            text: note,
            x: 10 + (index * 60),
            y: 50,
            width: 50,
            height: 40,
            backgroundColor: '#9C27B0',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        });

        // Add playNote method from Tone.js wrapper
        button.html_object.addEventListener('click', async () => {
            try {
                await window.toneWrapper.startAudio();
                button.playNote(note, '8n');
            } catch (error) {
                console.error('Audio error:', error);
            }
        });
    });

    // Special effect buttons
    const effects = ['Chord', 'Drums', 'Arpeggio'];
    effects.forEach((effect, index) => {
        const button = new A({
            attach: 'demo-audio-container',
            markup: 'button',
            text: effect,
            x: 10 + (index * 120),
            y: 110,
            width: 110,
            height: 40,
            backgroundColor: '#E91E63',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        });

        button.html_object.addEventListener('click', async () => {
            try {
                await window.toneWrapper.startAudio();
                const synth = window.toneWrapper.createSynth('sine');
                
                switch(effect) {
                    case 'Chord':
                        synth.play('C4', '2n');
                        setTimeout(() => synth.play('E4', '2n'), 100);
                        setTimeout(() => synth.play('G4', '2n'), 200);
                        break;
                    case 'Drums':
                        const drums = window.toneWrapper.createDrumMachine();
                        drums.kick();
                        setTimeout(() => drums.snare(), 250);
                        setTimeout(() => drums.hihat(), 125);
                        setTimeout(() => drums.hihat(), 375);
                        break;
                    case 'Arpeggio':
                        ['C4', 'E4', 'G4', 'C5'].forEach((note, i) => {
                            setTimeout(() => synth.play(note, '8n'), i * 150);
                        });
                        break;
                }
            } catch (error) {
                console.error('Audio error:', error);
            }
        });
    });
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLibraryDemo);
} else {
    initLibraryDemo();
}

export { initLibraryDemo };
