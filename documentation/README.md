# 🐿️ Squirrel Framework - Documentation

Squirrel is a simple JavaScript framework for creating user interfaces with declarative syntax.

## 📚 Quick Start Guide

### Installation
```html
<script type="module" src="a/a.js"></script>
```

### First Example
```javascript
const box = new A({
    attach: 'body',
    id: 'my_box',
    x: 50,
    y: 50,
    width: 200,
    height: 100,
    backgroundColor: 'blue',
    text: 'Hello Squirrel!'
});
```

## 📖 Documentation

### Core APIs
- [🎯 Core API](./Core-API.md) - A Class and basic particles
- [🎨 Styling](./Styling-API.md) - Colors, positioning, effects
- [⚡ Events](./Events-API.md) - Event handling and interactions

### Components
- [🎚️ Slider](./Slider-API.md) - Horizontal/vertical/circular slider component
- [🔲 Matrix](./Matrix-API.md) - Interactive grids and tables
- [🧩 Module](./Module-API.md) - Module system and plugins
- [🎵 WaveSurfer](./WaveSurfer-API.md) - Audio player with waveform visualization

### Advanced
- [⚙️ Particles](./Particles-API.md) - Create your own particles
- [🏗️ Architecture](./Architecture.md) - Framework internal structure

## 🚀 Quick Examples

### Interactive Button
```javascript
const button = new A({
    attach: 'body',
    x: 100, y: 100,
    width: 120, height: 40,
    backgroundColor: '#007bff',
    text: 'Click me',
    color: 'white',
    smooth: 5,
    onClick: () => alert('Button clicked!')
});
```

### Volume Slider
```javascript
const volumeSlider = new Slider({
    attach: 'body',
    x: 50, y: 200,
    width: 300, height: 40,
    value: 50,
    callbacks: {
        onChange: (value) => console.log(`Volume: ${value}%`)
    }
});
```

### Interactive Grid
```javascript
const grid = new Matrix({
    attach: 'body',
    x: 50, y: 300,
    rows: 3, columns: 3,
    cellWidth: 50, cellHeight: 50,
    callbacks: {
        onClick: (id, x, y) => console.log(`Cell clicked: ${x}, ${y}`)
    }
});
```

## 🔗 Useful Links
- [Architecture Guide](./Architecture.md)
- [Complete Examples](../src/application/examples/)
- [Source Code](../src/a/)
