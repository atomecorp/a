# 🎚️ Slider API - Interactive Slider Component

## 🚀 Basic Usage

### Simple Horizontal Slider
```javascript
const volumeSlider = new Slider({
    attach: 'body',
    id: 'volume_slider',
    x: 50, y: 100,
    width: 300, height: 40,
    value: 50,
    callbacks: {
        onChange: (value) => console.log(`Volume: ${value}%`)
    }
});
```

## ⚙️ Configuration Options

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `type` | string | Slider orientation: 'horizontal', 'vertical', 'circular' | `'horizontal'` |
| `min` | number | Minimum value | `0` |
| `max` | number | Maximum value | `100` |
| `step` | number | Step increment | `1` |
| `value` | number | Initial value | `50` |
| `width` | number | Component width | `300` |
| `height` | number | Component height | `60` |
| `trackWidth` | number | Track width/length | auto |
| `trackHeight` | number | Track height/thickness | `8` |
| `zIndex` | number | Z-index for layering | `1` |

## 🎨 Styling Options

### New Styling API
```javascript
const styledSlider = new Slider({
    attach: 'body',
    
    // Container styling
    support: {
        backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '20px',
        padding: '20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
    },
    
    // Track/Rail styling
    rail: {
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: '6px'
    },
    
    // Progress bar styling
    progress: {
        backgroundColor: 'linear-gradient(90deg, #ff6b6b, #feca57)',
        borderRadius: '6px',
        boxShadow: '0 4px 15px rgba(255, 107, 107, 0.4)'
    },
    
    // Thumb/Handle styling
    grip: {
        width: 28,
        height: 28,
        backgroundColor: '#e74c3c',
        border: '3px solid #ffffff',
        borderRadius: '8px',
        boxShadow: '0 6px 20px rgba(231, 76, 60, 0.4)',
        cursor: 'grab'
    }
});
```

### Legacy Colors API (still supported)
```javascript
const coloredSlider = new Slider({
    colors: {
        container: '#ffffff',
        track: '#e0e0e0',
        progress: '#2196f3',
        thumb: '#1976d2'
    }
});
```

## 📐 Slider Types

### Vertical Slider
```javascript
const brightnessSlider = new Slider({
    attach: 'body',
    type: 'vertical',
    x: 500, y: 100,
    width: 80, height: 300,
    trackWidth: 8,
    trackHeight: 200,
    value: 70,
    callbacks: {
        onChange: (value) => console.log(`Brightness: ${value}%`)
    }
});
```

### Circular Slider
```javascript
const circularSlider = new Slider({
    attach: 'body',
    type: 'circular',
    x: 100, y: 100,
    value: 30,
    circular: {
        radius: 80,
        strokeWidth: 8,
        startAngle: 0,
        endAngle: 270
    },
    callbacks: {
        onChange: (value) => console.log(`Circular value: ${value}`)
    }
});
```

## 🌈 Color Variations

### Gradient Colors
```javascript
const temperatureSlider = new Slider({
    attach: 'body',
    value: 25,
    variation: [
        { color: '#0099ff', position: { x: '0%' } },    // Cold (blue)
        { color: '#00ff99', position: { x: '30%' } },   // Cool (green)
        { color: '#ffff00', position: { x: '60%' } },   // Warm (yellow)
        { color: '#ff6600', position: { x: '80%' } },   // Hot (orange)
        { color: '#ff0000', position: { x: '100%' } }   // Very hot (red)
    ]
});
```

## 📞 Callbacks

```javascript
const interactiveSlider = new Slider({
    attach: 'body',
    callbacks: {
        // Called when value changes
        onChange: (value) => {
            console.log(`New value: ${value}`);
        },
        
        // Called when dragging starts
        onStart: (value) => {
            console.log(`Start dragging at: ${value}`);
        },
        
        // Called when dragging ends
        onEnd: (value) => {
            console.log(`End dragging at: ${value}`);
        },
        
        // Called during dragging (realtime)
        onDrag: (value) => {
            console.log(`Dragging: ${value}`);
        }
    }
});
```

## 🎯 Public Methods

### Value Control
```javascript
const slider = new Slider({ /* config */ });

// Set value programmatically
slider.setValue(75);

// Get current value
const currentValue = slider.getValue();

// Alternative getter
const value = slider.getCurrentValue();
```

### Dynamic Styling
```javascript
// Update grip (thumb) styling
slider.setGripStyle({
    backgroundColor: 'red',
    borderRadius: '10px'
});

// Update container styling
slider.setSupportStyle({
    backgroundColor: 'blue'
});
```

## 🎨 Complete Examples

### Audio Volume Control
```javascript
const audioVolumeSlider = new Slider({
    attach: 'body',
    id: 'audio_volume',
    x: 50, y: 50,
    width: 400, height: 60,
    value: 50,
    
    support: {
        backgroundColor: '#2c3e50',
        borderRadius: '15px',
        padding: '15px'
    },
    
    rail: {
        backgroundColor: '#34495e',
        borderRadius: '4px'
    },
    
    progress: {
        backgroundColor: 'linear-gradient(90deg, #3498db, #e74c3c)',
        borderRadius: '4px'
    },
    
    grip: {
        backgroundColor: '#ecf0f1',
        border: '2px solid #3498db',
        borderRadius: '50%'
    },
    
    callbacks: {
        onChange: (volume) => {
            // Control audio element
            document.getElementById('audio').volume = volume / 100;
            console.log(`Volume set to: ${volume}%`);
        }
    }
});
```

### Temperature Control with Visual Feedback
```javascript
const temperatureControl = new Slider({
    attach: 'body',
    x: 100, y: 200,
    width: 500, height: 80,
    min: -10,
    max: 40,
    value: 20,
    step: 0.5,
    
    variation: [
        { color: '#3498db', position: { x: '0%' } },   // Cold
        { color: '#2ecc71', position: { x: '40%' } },  // Mild
        { color: '#f39c12', position: { x: '70%' } },  // Warm
        { color: '#e74c3c', position: { x: '100%' } }  // Hot
    ],
    
    callbacks: {
        onChange: (temp) => {
            const tempDisplay = document.getElementById('temp-display');
            if (tempDisplay) {
                tempDisplay.textContent = `${temp}°C`;
                
                // Change background color based on temperature
                if (temp < 0) {
                    document.body.style.backgroundColor = '#ebf3fd';
                } else if (temp < 15) {
                    document.body.style.backgroundColor = '#f8f9fa';
                } else if (temp < 25) {
                    document.body.style.backgroundColor = '#fff3cd';
                } else {
                    document.body.style.backgroundColor = '#f8d7da';
                }
            }
        }
    }
});
```

### Circular Progress Indicator
```javascript
const progressIndicator = new Slider({
    attach: 'body',
    type: 'circular',
    x: 300, y: 100,
    value: 0,
    
    circular: {
        radius: 100,
        strokeWidth: 12,
        startAngle: -90,  // Start from top
        endAngle: 270     // Full circle
    },
    
    colors: {
        container: 'transparent',
        track: '#ecf0f1',
        progress: '#3498db'
    },
    
    callbacks: {
        onChange: (progress) => {
            console.log(`Progress: ${progress}%`);
        }
    }
});

// Simulate progress
let progress = 0;
const interval = setInterval(() => {
    progress += 1;
    progressIndicator.setValue(progress);
    
    if (progress >= 100) {
        clearInterval(interval);
        console.log('Progress complete!');
    }
}, 50);
```
