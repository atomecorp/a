# 🎚️ Complete Documentation - Squirrel Framework Sliders

## Table of Contents
1. [Introduction](#introduction)
2. [Slider Types](#slider-types)
3. [Basic Configuration](#basic-configuration)
4. [New Styling API](#new-styling-api)
5. [Legacy API (Compatibility)](#legacy-api-compatibility)
6. [Color Variations](#color-variations)
7. [Animations and Transitions](#animations-and-transitions)
8. [Events and Callbacks](#events-and-callbacks)
9. [Public Methods](#public-methods)
10. [Practical Examples](#practical-examples)
11. [Predefined Themes](#predefined-themes)
12. [Circular Sliders](#circular-sliders)
13. [Best Practices](#best-practices)

---

## Introduction

The Squirrel Framework Slider component provides a complete solution for creating interactive sliders with full control over appearance and behavior. It supports three main types: horizontal, vertical, and circular.

### Import

```javascript
import Slider from '../a/components/Slider.js';
```

---

## Slider Types

### 1. Horizontal Slider
```javascript
const horizontalSlider = new Slider({
    attach: 'body',
    type: 'horizontal',
    x: 50,
    y: 100,
    width: 400,
    height: 60,
    value: 50
});
```

### 2. Vertical Slider
```javascript
const verticalSlider = new Slider({
    attach: 'body',
    type: 'vertical',
    x: 500,
    y: 100,
    width: 80,
    height: 300,
    value: 70
});
```

### 3. Circular Slider
```javascript
const circularSlider = new Slider({
    attach: 'body',
    type: 'circular',
    x: 700,
    y: 100,
    value: 45,
    circular: {
        radius: 60,
        strokeWidth: 12,
        startAngle: -135,
        endAngle: 135
    }
});
```

---

## Basic Configuration

### Main Properties

| Property | Type | Default | Description |
|-----------|------|--------|-------------|
| `attach` | string | 'body' | CSS selector for parent element |
| `id` | string | auto-generated | Unique slider identifier |
| `type` | string | 'horizontal' | Type: 'horizontal', 'vertical', 'circular' |
| `x` | number | 20 | X position in pixels |
| `y` | number | 20 | Y position in pixels |
| `width` | number | 300 | Container width |
| `height` | number | 60 | Container height |
| `trackWidth` | number | 300 | Track width |
| `trackHeight` | number | 8 | Track height |
| `thumbSize` | number | 24 | Thumb size (if grip.width/height not defined) |
| `min` | number | 0 | Minimum value |
| `max` | number | 100 | Maximum value |
| `step` | number | 1 | Increment step |
| `value` | number | 50 | Initial value |

---

## New Styling API

### 🎯 grip - Thumb Styles

The thumb is the interactive element that users drag.

```javascript
grip: {
    width: 28,                    // Custom width
    height: 28,                   // Custom height
    backgroundColor: '#e74c3c',   // Background color
    border: '3px solid #ffffff', // Border
    borderRadius: '8px',         // Corner radius (50% = circle)
    boxShadow: '0 6px 20px rgba(231, 76, 60, 0.4)', // Shadow
    cursor: 'grab',              // Mouse cursor
    transition: 'transform 0.2s ease-out' // CSS animations
}
```

#### Available Properties
- `width`, `height` - Dimensions (null = uses thumbSize)
- `backgroundColor` - Background color (accepts gradients)
- `border` - Border style
- `borderRadius` - Corner radius
- `boxShadow` - Drop shadow (multiple shadows supported)
- `cursor` - Cursor style ('grab', 'pointer', 'move', etc.)
- `transition` - CSS transitions

### 🏠 support - Container Styles

The container wraps the entire slider.

```javascript
support: {
    backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '20px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
    padding: '20px'
}
```

#### Available Properties
- `backgroundColor` - Background color (gradients supported)
- `border` - Border style
- `borderRadius` - Corner radius
- `boxShadow` - Drop shadow
- `padding` - Inner spacing

### 🛤️ rail - Track Styles

The track is the path where the thumb slides.

```javascript
rail: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: '6px',
    height: 12,    // Override trackHeight
    width: null    // null = uses trackWidth
}
```

#### Available Properties
- `backgroundColor` - Background color
- `borderRadius` - Corner radius
- `height` - Height (overrides trackHeight if defined)
- `width` - Width (overrides trackWidth if defined)

### 📊 progress - Progress Styles

The progress bar indicates the current value.

```javascript
progress: {
    backgroundColor: 'linear-gradient(90deg, #ff6b6b, #feca57)',
    borderRadius: '6px',
    boxShadow: '0 4px 15px rgba(255, 107, 107, 0.4)',
    transition: 'width 0.2s ease-out'
}
```

#### Available Properties
- `backgroundColor` - Background color (gradients supported)
- `borderRadius` - Corner radius
- `boxShadow` - Drop shadow
- `transition` - CSS transitions

---

## Legacy API (Compatibility)

The old `colors` API is still supported and automatically converted:

```javascript
colors: {
    container: '#ffffff',  // → support.backgroundColor
    track: '#e0e0e0',     // → rail.backgroundColor
    progress: '#2196f3',  // → progress.backgroundColor
    thumb: '#2196f3'      // → grip.backgroundColor
}
```

### Automatic Migration

```javascript
// Old code
const slider = new Slider({
    colors: {
        container: '#f8f9fa',
        track: '#dee2e6',
        progress: '#007bff',
        thumb: '#0056b3'
    }
});

// Equivalent with new API
const slider = new Slider({
    support: { backgroundColor: '#f8f9fa' },
    rail: { backgroundColor: '#dee2e6' },
    progress: { backgroundColor: '#007bff' },
    grip: { backgroundColor: '#0056b3' }
});
```

### Hybrid API

You can mix old and new APIs:

```javascript
const hybridSlider = new Slider({
    // Base with old API
    colors: {
        container: '#fff',
        track: '#ddd',
        progress: '#28a745',
        thumb: '#155724'
    },
    
    // Override with new API
    grip: {
        borderRadius: '4px',  // Square thumb instead of round
        border: '3px solid #ffffff',
        boxShadow: '0 8px 20px rgba(21, 87, 36, 0.4)'
    },
    
    support: {
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)',
        borderRadius: '15px'
    }
});
```

---

## Color Variations

The variation system allows automatic color changes based on value.

### Simple Configuration

```javascript
variation: [
    { color: '#4caf50', position: { x: '0%' } },   // Green at 0%
    { color: '#ff9800', position: { x: '70%' } },  // Orange at 70%
    { color: '#f44336', position: { x: '100%' } }  // Red at 100%
]
```

### Example: Thermometer

```javascript
const tempSlider = new Slider({
    attach: 'body',
    value: 22,
    min: -10,
    max: 40,
    variation: [
        { color: '#2196f3', position: { x: '0%' } },   // Blue (cold)
        { color: '#4caf50', position: { x: '40%' } },  // Green (mild)
        { color: '#ff9800', position: { x: '70%' } },  // Orange (warm)
        { color: '#f44336', position: { x: '100%' } }  // Red (hot)
    ],
    callbacks: {
        onChange: (value) => {
            if (value < 15) console.log('🥶 It\'s cold!');
            else if (value > 28) console.log('🔥 It\'s hot!');
            else console.log('😊 Nice temperature');
        }
    }
});
```

### Automatic Interpolation

The system automatically interpolates between defined colors. If no variation is specified, a default red-green variation is applied.

---

## Animations and Transitions

### Animation Configuration

```javascript
animations: {
    enabled: true,           // Enable/disable animations
    duration: 0.2,          // Duration in seconds
    easing: 'ease-out'      // CSS easing function
}
```

### Available Easings

- `ease` - Standard transition
- `ease-in` - Progressive acceleration
- `ease-out` - Progressive deceleration
- `ease-in-out` - Acceleration then deceleration
- `linear` - Constant speed
- `cubic-bezier(0.4, 0.0, 0.2, 1)` - Custom function

### Custom Animations

```javascript
const animatedSlider = new Slider({
    attach: 'body',
    animations: {
        enabled: true,
        duration: 0.3,
        easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)'
    },
    grip: {
        transition: 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), box-shadow 0.3s ease-out'
    },
    progress: {
        transition: 'width 0.3s ease-out, background-color 0.2s ease-in-out'
    }
});
```

---

## Events and Callbacks

### Available Callbacks

```javascript
callbacks: {
    onChange: (value) => {
        // Called on every value change
        console.log(`New value: ${value}`);
    },
    
    onStart: (value) => {
        // Called at the start of dragging
        console.log(`Start dragging: ${value}`);
    },
    
    onEnd: (value) => {
        // Called at the end of dragging
        console.log(`End dragging: ${value}`);
    },
    
    onDrag: (value) => {
        // Called during dragging (more frequent than onChange)
        console.log(`Currently dragging: ${value}`);
    }
}
```

### Advanced Example with Feedback

```javascript
const volumeSlider = new Slider({
    attach: '#audio-controls',
    value: 50,
    callbacks: {
        onChange: (value) => {
            // Update the interface
            document.getElementById('volume-display').textContent = `${value}%`;
            
            // Change icon according to volume level
            const icon = document.getElementById('volume-icon');
            if (value === 0) icon.className = 'icon-volume-off';
            else if (value < 30) icon.className = 'icon-volume-low';
            else if (value < 70) icon.className = 'icon-volume-medium';
            else icon.className = 'icon-volume-high';
        },
        
        onStart: () => {
            // Add CSS class for visual feedback
            document.body.classList.add('adjusting-volume');
        },
        
        onEnd: (value) => {
            // Remove class and save preference
            document.body.classList.remove('adjusting-volume');
            localStorage.setItem('user-volume', value);
            
            // Vibration effect on mobile
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }
    }
});
```

---

## Public Methods

### Value Methods

```javascript
const slider = new Slider({ attach: 'body' });

// Set a value
slider.setValue(75);

// Get the current value
const currentValue = slider.getValue();
// or
const value = slider.getCurrentValue();
```

### Dynamic Styling Methods

```javascript
// Modify grip style
slider.setGripStyle({
    backgroundColor: '#e74c3c',
    borderRadius: '0',
    width: 30,
    height: 30,
    boxShadow: '0 8px 25px rgba(231, 76, 60, 0.6)'
});

// Modify container style
slider.setSupportStyle({
    backgroundColor: '#2c3e50',
    borderRadius: '30px',
    padding: '25px'
});

// Modify track style
slider.setRailStyle({
    backgroundColor: '#34495e',
    height: 15,
    borderRadius: '8px'
});

// Modify progress style
slider.setProgressStyle({
    backgroundColor: 'linear-gradient(90deg, #9b59b6, #e74c3c)',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(155, 89, 182, 0.5)'
});
```

### Configuration Methods

```javascript
// Update configuration
slider.setConfig({
    min: 0,
    max: 200,
    step: 5,
    animations: {
        duration: 0.5,
        easing: 'ease-in-out'
    }
});

// Destroy the slider
slider.destroy();
```

---

## Practical Examples

### 1. Audio Volume Slider

```javascript
const audioVolumeSlider = new Slider({
    attach: '#audio-player',
    id: 'audio_volume',
    type: 'horizontal',
    width: 200,
    height: 40,
    value: 75,
    min: 0,
    max: 100,
    
    grip: {
        width: 20,
        height: 20,
        backgroundColor: '#ff6b6b',
        borderRadius: '50%',
        border: '2px solid #ffffff',
        boxShadow: '0 4px 12px rgba(255, 107, 107, 0.4)'
    },
    
    support: {
        backgroundColor: '#f8f9fa',
        borderRadius: '10px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        padding: '10px'
    },
    
    rail: {
        backgroundColor: '#dee2e6',
        borderRadius: '2px',
        height: 4
    },
    
    progress: {
        backgroundColor: '#ff6b6b',
        borderRadius: '2px'
    },
    
    callbacks: {
        onChange: (value) => {
            // Control audio volume
            const audio = document.getElementById('audio-player');
            if (audio) {
                audio.volume = value / 100;
            }
        }
    }
});
```

### 2. Brightness Slider with Variation

```javascript
const brightnessSlider = new Slider({
    attach: '#display-controls',
    id: 'brightness_control',
    type: 'vertical',
    width: 60,
    height: 200,
    value: 80,
    
    grip: {
        width: 24,
        height: 16,
        backgroundColor: '#ffd700',
        borderRadius: '8px',
        border: '2px solid #ffffff',
        boxShadow: '0 0 15px rgba(255, 215, 0, 0.6)'
    },
    
    support: {
        backgroundColor: '#2c3e50',
        borderRadius: '15px',
        padding: '15px'
    },
    
    rail: {
        backgroundColor: '#34495e',
        borderRadius: '4px',
        width: 8
    },
    
    variation: [
        { color: '#34495e', position: { x: '0%' } },   // Dark
        { color: '#f39c12', position: { x: '50%' } },  // Orange
        { color: '#ffd700', position: { x: '100%' } }  // Bright yellow
    ],
    
    callbacks: {
        onChange: (value) => {
            // Adjust screen brightness
            document.body.style.filter = `brightness(${value}%)`;
        }
    }
});
```

### 3. Circular Temperature Slider

```javascript
const tempCircularSlider = new Slider({
    attach: '#thermostat',
    id: 'thermostat_control',
    type: 'circular',
    x: 100,
    y: 100,
    value: 22,
    min: 10,
    max: 35,
    step: 0.5,
    
    circular: {
        radius: 80,
        strokeWidth: 16,
        startAngle: -140,
        endAngle: 140
    },
    
    colors: {
        container: '#ffffff',
        track: '#ecf0f1',
        progress: '#3498db',
        thumb: '#2980b9'
    },
    
    variation: [
        { color: '#3498db', position: { x: '0%' } },   // Blue (cold)
        { color: '#2ecc71', position: { x: '30%' } },  // Green (comfortable)
        { color: '#f39c12', position: { x: '70%' } },  // Orange (warm)
        { color: '#e74c3c', position: { x: '100%' } }  // Red (very hot)
    ],
    
    callbacks: {
        onChange: (value) => {
            // Update temperature display
            document.getElementById('temp-display').textContent = `${value}°C`;
            
            // Send command to thermostat
            fetch('/api/thermostat', {
                method: 'POST',
                body: JSON.stringify({ temperature: value }),
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
});
```

---

## Predefined Themes

### Material Theme (Default)

```javascript
const materialSlider = new Slider({
    attach: 'body',
    theme: 'material'  // Soft shadows, smooth animations
});
```

### Flat Theme

```javascript
const flatSlider = new Slider({
    attach: 'body',
    theme: 'flat',  // No shadows, minimalist design
    colors: {
        container: '#34495e',
        track: '#7f8c8d',
        progress: '#e74c3c',
        thumb: '#c0392b'
    }
});
```

### Custom Theme

```javascript
const customSlider = new Slider({
    attach: 'body',
    theme: 'custom',
    
    support: {
        backgroundColor: 'linear-gradient(145deg, #667eea, #764ba2)',
        borderRadius: '25px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)'
    },
    
    grip: {
        backgroundColor: '#ffffff',
        borderRadius: '50%',
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.2)'
    }
});
```

---

## Circular Sliders

### Circular Configuration

```javascript
circular: {
    radius: 60,        // Circle radius in pixels
    strokeWidth: 12,   // Line thickness
    startAngle: -135,  // Start angle in degrees
    endAngle: 135      // End angle in degrees
}
```

### Angle Examples

```javascript
// Upper semicircle
circular: { startAngle: -180, endAngle: 0 }

// Lower semicircle
circular: { startAngle: 0, endAngle: 180 }

// Three-quarters circle
circular: { startAngle: -135, endAngle: 135 }

// Full circle
circular: { startAngle: 0, endAngle: 360 }
```

### Circular Volume Slider

```javascript
const circularVolumeSlider = new Slider({
    attach: '#audio-controls',
    type: 'circular',
    value: 65,
    
    circular: {
        radius: 50,
        strokeWidth: 10,
        startAngle: -135,
        endAngle: 135
    },
    
    colors: {
        container: '#ffffff',
        track: '#e3f2fd',
        progress: '#2196f3',
        thumb: '#1976d2'
    },
    
    variation: [
        { color: '#4caf50', position: { x: '0%' } },   // Green (quiet)
        { color: '#ff9800', position: { x: '70%' } },  // Orange (medium)
        { color: '#f44336', position: { x: '100%' } }  // Red (loud)
    ],
    
    callbacks: {
        onChange: (value) => {
            if (value > 80) {
                console.log('⚠️ High volume!');
            }
        }
    }
});
```

---

## Best Practices

### 1. Performance

```javascript
// ✅ Good: Limit onDrag callbacks for expensive operations
const slider = new Slider({
    attach: 'body',
    callbacks: {
        onChange: (value) => {
            // Light operation on every change
            document.getElementById('display').textContent = value;
        },
        
        onEnd: (value) => {
            // Expensive operation only at the end
            updateServerValue(value);
        }
    }
});

// ❌ Avoid: Expensive operations in onDrag
```

### 2. Accessibility

```javascript
// ✅ Automatic keyboard support
const accessibleSlider = new Slider({
    attach: 'body',
    // The slider automatically supports:
    // - Left/right or up/down arrows
    // - Home/End for min/max
    // - Tab for navigation
});

// Add ARIA labels
const container = document.getElementById('slider-container');
container.setAttribute('role', 'slider');
container.setAttribute('aria-label', 'Volume control');
container.setAttribute('aria-valuemin', '0');
container.setAttribute('aria-valuemax', '100');
```

### 3. Responsive Design

```javascript
// ✅ Adapt dimensions according to screen size
const responsiveSlider = new Slider({
    attach: 'body',
    width: window.innerWidth < 768 ? 250 : 400,
    height: window.innerWidth < 768 ? 50 : 60,
    
    grip: {
        width: window.innerWidth < 768 ? 20 : 24,
        height: window.innerWidth < 768 ? 20 : 24
    }
});

// Listen for size changes
window.addEventListener('resize', () => {
    // Recreate or adjust the slider if necessary
});
```

### 4. Value Validation

```javascript
const validatedSlider = new Slider({
    attach: 'body',
    min: 0,
    max: 100,
    step: 5,
    
    callbacks: {
        onChange: (value) => {
            // ✅ Validation and constraints
            if (value < 10) {
                console.warn('Very low value');
            }
            
            // Round if necessary
            const roundedValue = Math.round(value / 5) * 5;
            if (roundedValue !== value) {
                slider.setValue(roundedValue);
            }
        }
    }
});
```

### 5. Error Handling

```javascript
try {
    const slider = new Slider({
        attach: '#non-existent-element',  // Element that doesn't exist
        value: 50
    });
} catch (error) {
    console.error('Error creating slider:', error);
    // Fallback or error message
}
```

---

## Additional CSS Styles

### Focus and Hover Styles

```css
/* Improve accessibility */
.slider-thumb:focus {
    outline: 2px solid #2196f3;
    outline-offset: 2px;
}

/* Hover effect */
.slider-container:hover .slider-thumb {
    transform: scale(1.1);
}

/* Mobile styles */
@media (max-width: 768px) {
    .slider-thumb {
        width: 32px !important;
        height: 32px !important;
        /* Larger thumb for touch interaction */
    }
}
```

### Custom Animations

```css
/* Ripple animation */
@keyframes ripple {
    to {
        transform: translate(-50%, -50%) scale(4);
        opacity: 0;
    }
}

/* Pulse effect */
@keyframes pulse {
    0%, 100% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.05);
    }
}
```

---

This documentation covers all aspects of Squirrel Framework sliders. For specific questions or advanced use cases, consult the practical examples or create custom tests.
