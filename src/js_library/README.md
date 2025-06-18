# 📚 JS Library Integration

A comprehensive library management system for integrating popular JavaScript libraries with the Squirrel Framework.

## 🚀 Supported Libraries

### 🎬 GSAP (GreenSock Animation Platform)
- **Purpose**: High-performance animations
- **Features**: Smooth animations, timelines, morphing, physics
- **CDN**: `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js`
- **Directory**: `./gsap/` - Complete GSAP integration with tests and documentation

### 📝 CodeMirror
- **Purpose**: Code editor in the browser
- **Features**: Syntax highlighting, autocompletion, themes
- **CDN**: `https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.min.js`

### 🗺️ Leaflet.js
- **Purpose**: Interactive maps
- **Features**: Mobile-friendly maps, markers, overlays, geolocation
- **CDN**: `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js`
- **Directory**: `./leaflet/` - Complete Leaflet integration with comprehensive testing

### 🎵 Tone.js
- **Purpose**: Web Audio framework
- **Features**: Synthesizers, effects, sequencing, audio playback
- **CDN**: `https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.min.js`

## 📁 Directory Structure

```
js_library/
├── index.js                       # Main library manager
├── README.md                      # This documentation
├── gsap/                          # GSAP library directory
│   ├── gsap-wrapper.js           # GSAP wrapper with advanced features
│   ├── gsap-comprehensive-test.html  # Complete feature tests
│   ├── gsap-wrapper-test.html    # Wrapper-specific tests
│   ├── GSAP-INTEGRATION-REPORT.md # Detailed integration report
│   └── README.md                 # GSAP-specific documentation
├── codemirror/
│   ├── codemirror-wrapper.js     # CodeMirror integration
│   └── README.md                 # CodeMirror documentation
├── leaflet/                      # Leaflet library directory
│   ├── leaflet-wrapper.js       # Leaflet maps integration wrapper
│   ├── leaflet-comprehensive-test.html # Complete feature tests
│   ├── leaflet-wrapper-test.html # Wrapper-specific tests
│   ├── LEAFLET-INTEGRATION-REPORT.md # Detailed integration report
│   ├── README.md                # Leaflet-specific documentation
│   └── index.html               # Directory navigation page
└── tone/
    ├── tone-wrapper.js           # Tone.js audio integration
    └── README.md                 # Tone.js documentation
```

Each library directory contains:
- Wrapper implementation
- Test files (where applicable)
- Documentation
- Integration examples

## 📦 Installation

```javascript
// Import the library manager
import jsLibrary from './js_library/index.js';

// Load libraries individually
await jsLibrary.loadGSAP();
await jsLibrary.loadCodeMirror();
await jsLibrary.loadLeaflet();
await jsLibrary.loadTone();

// Or load multiple libraries
await Promise.all([
  jsLibrary.loadGSAP(),
  jsLibrary.loadLeaflet()
]);
```

## 🎬 GSAP Usage

```javascript
// Basic animation
const element = document.querySelector('#myElement');
gsapWrapper.animate(element, { x: 100, opacity: 0.5 }, 1);

// Fade animations
gsapWrapper.fadeIn(element);
gsapWrapper.fadeOut(element);

// With Squirrel Framework
const box = new A({ attach: 'body', width: 100, height: 100 });
box.animate({ scale: 1.5, rotation: 360 }, 2);
```

## 📝 CodeMirror Usage

```javascript
// Create a code editor
const editor = codeMirrorWrapper.createEditor('#editor-container', {
  mode: 'javascript',
  theme: 'dark',
  lineNumbers: true,
  value: 'console.log("Hello World!");'
});

// With Squirrel Framework
const editorBox = new A({ attach: 'body', width: 500, height: 300 });
const codeEditor = editorBox.makeCodeEditor({
  mode: 'css',
  theme: 'monokai'
});
```

## 🗺️ Leaflet Usage

```javascript
// Create a map wrapper instance
const mapWrapper = new LeafletWrapper('map-container', {
  center: [51.505, -0.09],
  zoom: 13
});

// Add markers with popups
mapWrapper.addMarker([51.5, -0.09], 'Hello London!');

// Add shapes
mapWrapper.addCircle([51.508, -0.11], 500, {
  color: 'red',
  fillColor: '#f03',
  fillOpacity: 0.5
});

// With Squirrel Framework
const mapAtome = atome({ tag: 'div', id: 'my-map' });
const leafletMap = mapAtome.leaflet({
  center: [40.7128, -74.0060], // New York
  zoom: 10
});
leafletMap.addMarker([40.7128, -74.0060], 'New York City');
```

## 🎵 Tone.js Usage

```javascript
// Create synthesizer
const synth = toneWrapper.createSynth('sine');

// Play notes
synth.play('C4', '4n');
synth.play('E4', '4n');
synth.play('G4', '4n');

// Create drum machine
const drums = toneWrapper.createDrumMachine();
drums.kick();
drums.snare();

// With Squirrel Framework
const button = new A({ 
  attach: 'body', 
  text: 'Play Note',
  onclick: () => button.playNote('A4', '8n')
});
```

## 🔧 Configuration

### GSAP Configuration
```javascript
const gsapConfig = {
  duration: 1,
  ease: "power2.out",
  repeat: -1,
  yoyo: true
};
```

### CodeMirror Configuration
```javascript
const editorConfig = {
  mode: 'javascript',
  theme: 'monokai',
  lineNumbers: true,
  autoCloseBrackets: true,
  matchBrackets: true,
  indentUnit: 2,
  tabSize: 2
};
```

### Leaflet Configuration
```javascript
const mapConfig = {
  center: [latitude, longitude],
  zoom: 13,
  zoomControl: true,
  attributionControl: true,
  tileLayer: 'osm' // 'osm', 'satellite', 'terrain', 'dark'
};
```

### Tone.js Configuration
```javascript
const synthConfig = {
  oscillator: { type: 'sine' },
  envelope: {
    attack: 0.1,
    decay: 0.2,
    sustain: 0.3,
    release: 1
  }
};
```

## 📊 Library Status

```javascript
// Check library status
console.log('GSAP loaded:', jsLibrary.isLoaded('gsap'));
console.log('CodeMirror loaded:', jsLibrary.isLoaded('codemirror'));

// Get library information
const libraries = jsLibrary.listLibraries();
console.table(libraries);

// Get specific wrapper info
console.log(gsapWrapper.getAnimationInfo());
console.log(codeMirrorWrapper.getEditorInfo());
console.log(leafletWrapper.getMapsInfo());
console.log(toneWrapper.getAudioInfo());
```

## 🎯 Integration with Squirrel Framework

All libraries are automatically integrated with Squirrel's `$` function and `A` class:

```javascript
// GSAP integration
const element = $('div', { id: 'animated' });
element.animate({ x: 100, y: 50 }, 1);

// CodeMirror integration
const editor = $('div', { id: 'code-editor' });
editor.makeCodeEditor({ mode: 'javascript' });

// Leaflet integration
const mapContainer = $('div', { id: 'map', width: 500, height: 400 });
mapContainer.makeMap({ center: [40.7128, -74.0060] });

// Tone.js integration
const playButton = $('button', { 
  text: 'Play Sound',
  onclick: () => playButton.playNote('C4')
});
```

## 🔍 Debugging

```javascript
// Enable debug mode
window.jsLibraryDebug = true;

// Check what's loaded
console.log('Loaded libraries:', jsLibrary.loadedLibraries);
console.log('Available libraries:', jsLibrary.listLibraries());

// Individual wrapper debugging
if (window.gsapWrapper) console.log('GSAP Info:', gsapWrapper.getAnimationInfo());
if (window.codeMirrorWrapper) console.log('Editor Info:', codeMirrorWrapper.getEditorInfo());
if (window.leafletWrapper) console.log('Maps Info:', leafletWrapper.getMapsInfo());
if (window.toneWrapper) console.log('Audio Info:', toneWrapper.getAudioInfo());
```

## 📝 Notes

- All libraries support both CDN and local loading
- Wrappers provide simplified APIs while maintaining full library access
- Integration with Squirrel Framework is automatic when both are loaded
- Error handling and fallbacks are built-in
- Performance optimized with lazy loading and caching
