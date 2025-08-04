# 📚 Libraries Management - Complete Guide

## 🎯 Available Libraries

### Animation & Graphics
- **GSAP v3.13.0** - Professional-grade animation library
- **Three.js v0.179.1** - 3D graphics and WebGL library

### Audio
- **Tone.js v15.1.22** - Audio synthesis and music library
- **Wavesurfer.js v7.10.1** - Audio waveform visualization with plugins

### Mapping
- **Leaflet v1.9.4** - Interactive maps library

## 🔧 Management Commands

### Latest Versions (Recommended)
```bash
npm run update:libs
```
- Automatically detects latest versions from NPM registry
- Downloads and replaces all libraries
- Creates version tracking files

### Stable Versions (Fallback)
```bash
npm run update:libs:stable
```
- Uses proven stable versions
- Faster execution with fixed URLs
- Good for production builds

### Legacy Script (Deprecated)
```bash
npm run update:libs:basic
```
- Old script for GSAP/Tone.js only

## 📁 File Structure

```
src/js/
├── gsap.min.js (71KB)
├── gsap.min.js.version
├── tone.min.js (337KB)
├── tone.min.js.version
├── leaflet.min.js (144KB)
├── leaflet.min.js.version
├── leaflet.min.css (11KB)
├── leaflet.min.css.version
├── wavesurfer.min.js (30KB)
├── wavesurfer.min.js.version
├── three.min.js (331KB)
├── three.min.js.version
└── wavesurfer-v7/
    ├── core/
    │   ├── wavesurfer.esm.min.js (29KB)
    │   └── wavesurfer.esm.min.js.version
    └── plugins/
        ├── envelope.esm.min.js (8.8KB)
        ├── hover.esm.min.js (3.5KB)
        ├── minimap.esm.min.js (32KB)
        ├── record.esm.min.js (6.7KB)
        ├── regions.esm.min.js (12KB)
        ├── spectrogram.esm.min.js (32KB)
        ├── spectrogram-windowed.esm.min.js (35KB)
        ├── timeline.esm.min.js (4.9KB)
        └── zoom.esm.min.js (2.7KB)
```

## 🎭 Wavesurfer.js Plugins

### Essential Plugins Included:
- **envelope** - Amplitude envelope visualization
- **hover** - Hover interactions and tooltips
- **minimap** - Overview/minimap of the waveform
- **record** - Audio recording capabilities
- **regions** - Select and manipulate waveform regions
- **spectrogram** - Frequency spectrum visualization
- **spectrogram-windowed** - Windowed spectrogram analysis
- **timeline** - Time axis and markers
- **zoom** - Zoom functionality for waveforms

### Usage Example:
```javascript
// Import wavesurfer with plugins
import WaveSurfer from './js/wavesurfer-v7/core/wavesurfer.esm.min.js';
import RegionsPlugin from './js/wavesurfer-v7/plugins/regions.esm.min.js';
import TimelinePlugin from './js/wavesurfer-v7/plugins/timeline.esm.min.js';

const wavesurfer = WaveSurfer.create({
  container: '#waveform',
  plugins: [
    RegionsPlugin.create(),
    TimelinePlugin.create()
  ]
});
```

## 📊 Version Tracking

Each library includes a `.version` file with:
- Package name and version
- Download date and time
- Source URL for verification
- Enables rollback and audit trail

## 🚀 Integration Notes

### HTML Integration:
```html
<!-- CSS -->
<link rel="stylesheet" href="js/leaflet.min.css">

<!-- Libraries -->
<script src="js/gsap.min.js"></script>
<script src="js/tone.min.js"></script>
<script src="js/leaflet.min.js"></script>
<script src="js/wavesurfer.min.js"></script>
<script type="module" src="js/three.min.js"></script>
```

### JavaScript Usage:
```javascript
// GSAP animations
gsap.to(".element", { duration: 2, x: 100 });

// Tone.js audio
const synth = new Tone.Synth().toDestination();

// Leaflet maps
const map = L.map('mapid').setView([51.505, -0.09], 13);

// Wavesurfer audio
const wavesurfer = WaveSurfer.create({ container: '#waveform' });

// Three.js 3D (ES6 module)
import * as THREE from './js/three.min.js';
```

## 🔄 Update Schedule

**Recommended:** Monthly updates to stay current
```bash
# Check current versions
ls -la src/js/*.version

# Update to latest
npm run update:libs

# Verify downloads
ls -lh src/js/
```

## 🛡️ Safety Features

- Automatic backup before updates
- Version tracking for rollback
- File size validation
- Error handling with restoration
- Parallel download optimization

---

*Generated: $(date)*
*Total Libraries: 5 core + 9 wavesurfer plugins*
*Total Size: ~1.1MB optimized*
