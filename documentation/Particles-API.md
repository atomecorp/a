# ⚙️ Particles API - Create Your Own Particles

## 🧬 What is a Particle?

A particle is a property you can use with the `A` class. Each particle defines how a value is applied to a DOM element.

## 🛠️ Create a Simple Particle

### Basic syntax
```javascript
defineParticle('myParticle', {
    category: 'custom',
    type: 'string',
    process(element, value) {
        // Your logic here
        element.style.property = value;
    }
});
```

### Example: Rotation particle
```javascript
defineParticle('rotate', {
    category: 'transform',
    type: 'number',
    process(element, degrees) {
        element.style.transform = `rotate(${degrees}deg)`;
    }
});

// Usage
const box = new A({
    attach: 'body',
    width: 100, height: 100,
    backgroundColor: 'red',
    rotate: 45 // Our custom particle
});
```

## 🎯 Practical Examples

### Animation particle
```javascript
defineParticle('bounce', {
    category: 'animation',
    type: 'boolean',
    process(element, shouldBounce) {
        if (shouldBounce) {
            element.style.animation = 'bounce 1s infinite';
            
            // Add CSS keyframe if necessary
            if (!document.getElementById('bounce-keyframes')) {
                const style = document.createElement('style');
                style.id = 'bounce-keyframes';
                style.textContent = `
                    @keyframes bounce {
                        0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
                        40% { transform: translateY(-30px); }
                        60% { transform: translateY(-15px); }
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            element.style.animation = '';
        }
    }
});

// Usage
const bouncyBox = new A({
    attach: 'body',
    width: 80, height: 80,
    backgroundColor: 'blue',
    bounce: true
});
```

### Tooltip particle
```javascript
defineParticle('tooltip', {
    category: 'interaction',
    type: 'string',
    process(element, tooltipText) {
        if (!tooltipText) return;
        
        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.textContent = tooltipText;
        tooltip.style.cssText = `
            position: absolute;
            background: #333;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            pointer-events: none;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        
        document.body.appendChild(tooltip);
        
        element.addEventListener('mouseenter', (e) => {
            tooltip.style.left = e.pageX + 10 + 'px';
            tooltip.style.top = e.pageY - 30 + 'px';
            tooltip.style.opacity = '1';
        });
        
        element.addEventListener('mousemove', (e) => {
            tooltip.style.left = e.pageX + 10 + 'px';
            tooltip.style.top = e.pageY - 30 + 'px';
        });
        
        element.addEventListener('mouseleave', () => {
            tooltip.style.opacity = '0';
        });
    }
});

// Usage
const buttonWithTooltip = new A({
    attach: 'body',
    x: 100, y: 100,
    width: 120, height: 40,
    backgroundColor: '#007bff',
    text: 'Hover me',
    color: 'white',
    tooltip: 'This is a tooltip!'
});
```

## 🔧 Particles with Advanced Options

### Particle with validation
```javascript
defineParticle('opacity', {
    category: 'appearance',
    type: 'number',
    validate(value) {
        return typeof value === 'number' && value >= 0 && value <= 1;
    },
    process(element, value) {
        if (this.validate(value)) {
            element.style.opacity = value;
        } else {
            console.warn(`Opacity must be between 0 and 1, received: ${value}`);
        }
    }
});
```

### Particle with cleanup
```javascript
defineParticle('glow', {
    category: 'effects',
    type: 'string',
    process(element, color, oldValue, instance) {
        // Clean up old effect
        if (oldValue) {
            element.style.boxShadow = '';
        }
        
        // Apply new effect
        if (color) {
            element.style.boxShadow = `0 0 20px ${color}`;
        }
    }
});
```

## 🏭 Batch Particles with ParticleFactory

### Create multiple CSS particles
```javascript
// Automatically create particles for CSS properties
ParticleFactory.createCSSProperties([
    'borderStyle', 'borderWidth', 'borderColor'
], 'border');

// Immediate usage
const styledBox = new A({
    attach: 'body',
    borderStyle: 'solid',
    borderWidth: '2px',
    borderColor: 'red'
});
```

### Create event particles
```javascript
ParticleFactory.createEventProperties([
    'scroll', 'resize', 'load'
], 'window-events');

// Usage
const scrollWatcher = new A({
    attach: 'body',
    scroll: (e) => console.log('Page scrolled!'),
    resize: (e) => console.log('Window resized!')
});
```

## 📝 Best Practices

### 1. Particle naming
- Use camelCase: `backgroundColor`, `fontSize`
- Be descriptive: `tooltip` rather than `tip`
- Avoid conflicts with existing CSS properties

### 2. Recommended categories
- `'appearance'` - Colors, visual styles
- `'layout'` - Position, dimensions
- `'interaction'` - Events, behaviors
- `'animation'` - Animated effects
- `'content'` - Text, images, data

### 3. Error handling
```javascript
defineParticle('safeProperty', {
    category: 'custom',
    type: 'any',
    process(element, value) {
        try {
            // Your logic
        } catch (error) {
            console.warn(`Error in safeProperty:`, error);
        }
    }
});
```

## 🎨 Complete Example: Animated Gradient Particle

```javascript
defineParticle('animatedGradient', {
    category: 'effects',
    type: 'object',
    process(element, config) {
        if (!config || !config.colors) return;
        
        const { colors, duration = 3, direction = 'to right' } = config;
        
        // Create gradient
        const gradient = `linear-gradient(${direction}, ${colors.join(', ')})`;
        element.style.background = gradient;
        element.style.backgroundSize = '200% 200%';
        
        // Add animation
        const animationName = `gradient-${Math.random().toString(36).substr(2, 9)}`;
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes ${animationName} {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
        `;
        document.head.appendChild(style);
        
        element.style.animation = `${animationName} ${duration}s ease infinite`;
    }
});

// Usage
const gradientBox = new A({
    attach: 'body',
    x: 50, y: 50,
    width: 300, height: 200,
    animatedGradient: {
        colors: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'],
        duration: 4,
        direction: 'to right'
    }
});
```
