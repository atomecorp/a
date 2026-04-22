# 📚 Libraries Management - Complete Guide

## 🎯 Available Libraries

### Animation & Graphics
- **GSAP v3.13.0** - Professional-grade animation library
- **Three.js v0.179.1** - 3D graphics and WebGL library

### Audio
- **Tone.js v15.1.22** - Audio synthesis and music library

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
├── three.min.js (331KB)
├── three.min.js.version
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
*Total Libraries: 4 core*
*Total Size: optimized by local asset policy*
