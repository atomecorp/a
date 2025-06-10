# 🎨 Styling API - Colors, Positioning, Effects

## 🌈 Colors

### Simple Colors
```javascript
const box = new A({
    backgroundColor: 'red',     // Color name
    backgroundColor: '#ff0000', // Hexadecimal
    backgroundColor: 'rgb(255, 0, 0)', // RGB
    color: 'white'
});
```

### Object Colors
```javascript
const box = new A({
    backgroundColor: {
        red: 1,    // 0 to 1
        green: 0,
        blue: 0,
        alpha: 0.8 // Transparency
    }
});
```

## 📐 Advanced Positioning

### Relative/Absolute Position
```javascript
const parent = new A({
    attach: 'body',
    position: 'relative',
    width: 300, height: 200
});

const child = new A({
    attach: parent,
    position: 'absolute',
    x: 50, y: 30,
    width: 100, height: 50
});
```

### Z-Index
```javascript
const overlay = new A({
    attach: 'body',
    zIndex: 10, // Above other elements
    position: 'absolute'
});
```

## ✨ Visual Effects

### Rounded Corners
```javascript
const card = new A({
    smooth: 10,        // 10px rounded corners
    smooth: '50%',     // Perfect circle
    backgroundColor: 'blue'
});
```

### Shadows
```javascript
const box = new A({
    shadow: [
        {
            x: 4, y: 8, blur: 12,
            color: { red: 0, green: 0, blue: 0, alpha: 0.3 },
            invert: false // External shadow
        },
        {
            x: 0, y: 0, blur: 20,
            color: { red: 0, green: 0.5, blue: 1, alpha: 0.2 },
            invert: true // Internal shadow
        }
    ]
});
```

## 🔤 Typography

```javascript
const text = new A({
    text: 'My styled text',
    fontSize: 18,
    fontFamily: 'Arial, sans-serif',
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: '1.5'
});
```

## 🖼️ Layout

### Flexbox
```javascript
const container = new A({
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center'
});
```

### Overflow
```javascript
const scrollBox = new A({
    width: 200, height: 100,
    overflow: 'scroll',    // scroll, hidden, visible
    backgroundColor: '#f0f0f0'
});
```

## 🎭 CSS Classes and Custom Styles

### CSS Classes
```javascript
const button = new A({
    class: 'btn btn-primary',  // String
    class: ['btn', 'primary'], // Array
    class: { active: true, disabled: false } // Object
});
```

### Direct Styles
```javascript
const custom = new A({
    style: {
        transform: 'rotate(45deg)',
        transition: 'all 0.3s ease',
        cursor: 'pointer'
    }
});
```

## 🎯 Practical Examples

### Modern Button
```javascript
const modernButton = new A({
    attach: 'body',
    x: 100, y: 100,
    width: 120, height: 40,
    backgroundColor: '#007bff',
    color: 'white',
    text: 'Click',
    smooth: 6,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: '40px',
    cursor: 'pointer',
    shadow: [{
        x: 0, y: 2, blur: 8,
        color: { red: 0, green: 0.47, blue: 1, alpha: 0.3 }
    }]
});
```

### Image Card
```javascript
const imageCard = new A({
    attach: 'body',
    width: 250, height: 200,
    backgroundColor: 'white',
    smooth: 12,
    overflow: 'hidden',
    shadow: [{
        x: 0, y: 4, blur: 20,
        color: { red: 0, green: 0, blue: 0, alpha: 0.1 }
    }]
});
```
