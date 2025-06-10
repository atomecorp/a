# 🏗️ Architecture - Framework Internal Structure

## 🔍 Overview

Squirrel is organized in several layers:

```
Application (your code)
    ↓
Components (Slider, Matrix, etc.)
    ↓
A Class (base element)
    ↓
Particles (properties/behaviors)
    ↓
DOM (final rendering)
```

## 📁 File Structure

```
src/a/
├── a.js                 # Main A Class
├── apis.js              # Global APIs
├── components/          # Reusable components
│   ├── Slider.js
│   ├── Matrix.js
│   └── WaveSurfer.js
├── particles/           # Particle system
│   └── all.js
└── utils/               # Utilities
    ├── particle-factory.js
    ├── dom-cache.js
    └── event-manager.js
```

## 🧩 A Class - The Framework Core

### Responsibilities
- Create and manage DOM elements
- Apply particles
- Handle attachment and hierarchy
- Provide fluent API

### Element lifecycle
```javascript
const element = new A({
    attach: 'body',
    x: 100, y: 50,
    backgroundColor: 'red'
});

// 1. Create A instance
// 2. Process particles
// 3. Create DOM element
// 4. Apply styles
// 5. Attach to parent
```

## ⚛️ Particle System

### What is a particle?
A particle is a unit of behavior that transforms a value into DOM modification.

### Particle types
- **Simple CSS**: `width`, `height`, `color`
- **Complex CSS**: `shadow`, `smooth`
- **Events**: `click`, `mouseover`
- **Structural**: `attach`, `id`, `markup`

### ParticleFactory
```javascript
// Automatically creates CSS particles
ParticleFactory.createCSSProperties([
    'width', 'height', 'color'
], 'dimension');

// Creates event particles
ParticleFactory.createEventProperties([
    'click', 'mouseover'
], 'interaction');
```

## 🎛️ Components

### Component structure
```javascript
class MyComponent {
    constructor(config) {
        this.config = { /* defaults */, ...config };
        this.elements = {};
        this._init();
    }
    
    _init() {
        this._createContainer();
        this._createSubElements();
        this._attachEvents();
    }
    
    _createContainer() {
        this.elements.container = new A({
            // Container configuration
        });
    }
}
```

### Best practices for components
- Use the `A` class for all elements
- Store references in `this.elements`
- Prefix private methods with `_`
- Provide a simple public API

## 🔄 Data Flow

### 1. Initial configuration
```javascript
const config = {
    x: 100,
    backgroundColor: 'red',
    onClick: handler
};
```

### 2. Particle processing
```javascript
// In the A class
this._collectPropertyUpdates(key, value, styleUpdates, datasetUpdates);
```

### 3. Apply to DOM
```javascript
// Style update
Object.assign(element.style, styleUpdates);

// Attribute update
for (const [key, value] of Object.entries(datasetUpdates)) {
    element.setAttribute(key, value);
}
```

## 🚀 Performance

### Built-in optimizations
- **DOM Cache**: Avoids repeated lookups
- **Batch updates**: Groups CSS modifications
- **Lazy loading**: Loads components on demand

### DOMCache
```javascript
// Using cache for selectors
const element = DOMCache.getElement('#my-id');
```

### ParticleFactory optimizations
- Automatic particle generation
- 60% bundle size reduction
- Improved performance for particle application

## 🔌 Extensibility

### Adding a new component
```javascript
// 1. Create the class
class MyNewComponent {
    constructor(config) {
        // Implementation
    }
}

// 2. Export it
export { MyNewComponent };

// 3. Use it
import { MyNewComponent } from './components/MyNewComponent.js';
```

### Adding global particles
```javascript
// In particles/all.js
defineParticle('myNewProperty', {
    category: 'custom',
    process(element, value) {
        // Logic
    }
});
```

## 📊 Debug and Inspection

### Global registry
```javascript
// Access all created elements
console.log(_registry);

// Get an element by ID
const element = A.getById('my_id');
```

### Debug methods
```javascript
const element = new A({ id: 'test' });

// Inspect the instance
element.inspect();

// Access DOM element
const dom = element.getElement();
```

## 🛠️ Utility APIs

### EventManager
```javascript
// Centralized event manager
const manager = new EventManager();
manager.on('custom-event', handler);
manager.emit('custom-event', data);
```

### Animation optimizer
```javascript
// Animation optimization
const optimizer = new AnimationOptimizer();
optimizer.scheduleUpdate(() => {
    // DOM modifications
});
```

## 🎯 Complete Architecture Example

```javascript
// Main application
class MyApp {
    constructor() {
        this.components = {};
        this._init();
    }
    
    _init() {
        this._createLayout();
        this._createComponents();
        this._setupGlobalEvents();
    }
    
    _createLayout() {
        this.layout = new A({
            attach: 'body',
            id: 'app-container',
            width: '100vw',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column'
        });
    }
    
    _createComponents() {
        // Header
        this.components.header = new A({
            attach: this.layout,
            height: 60,
            backgroundColor: '#333',
            color: 'white'
        });
        
        // Volume slider
        this.components.volumeSlider = new Slider({
            attach: this.layout,
            width: 300,
            callbacks: {
                onChange: (value) => this._handleVolumeChange(value)
            }
        });
        
        // Audio player
        this.components.audioPlayer = new WaveSurfer({
            attach: this.layout,
            audioUrl: 'music.mp3'
        });
    }
    
    _handleVolumeChange(volume) {
        // Business logic
        this.components.audioPlayer.setVolume(volume / 100);
    }
}

// Launch application
new MyApp();
```
