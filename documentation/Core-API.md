# 🎯 Core API - A Class and Basic Particles

## A Class - The Basic Element

### Syntax
```javascript
const element = new A({
    // Configuration properties
});
```

## 📍 Positioning

| Particle | Type | Description | Example |
|----------|------|-------------|---------|
| `x` | number | Horizontal position | `x: 100` |
| `y` | number | Vertical position | `y: 50` |
| `position` | string | CSS positioning type | `position: 'absolute'` |

```javascript
const box = new A({
    attach: 'body',
    x: 100,
    y: 50,
    position: 'absolute'
});
```

## 📏 Dimensions

| Particle | Type | Description | Example |
|----------|------|-------------|---------|
| `width` | number/string | Width | `width: 200` |
| `height` | number/string | Height | `height: 100` |

```javascript
const rect = new A({
    attach: 'body',
    width: 200,
    height: 100,
    backgroundColor: 'red'
});
```

## 🎨 Appearance

| Particle | Type | Description | Example |
|----------|------|-------------|---------|
| `backgroundColor` | string | Background color | `backgroundColor: 'blue'` |
| `color` | string | Text color | `color: 'white'` |
| `smooth` | number | Rounded corners | `smooth: 10` |

```javascript
const card = new A({
    attach: 'body',
    width: 200, height: 150,
    backgroundColor: '#f0f0f0',
    color: '#333',
    smooth: 10
});
```

## 📝 Content

| Particle | Type | Description | Example |
|----------|------|-------------|---------|
| `text` | string | Displayed text | `text: 'Hello'` |
| `html` | string | HTML content | `html: '<b>Bold</b>'` |

```javascript
const label = new A({
    attach: 'body',
    text: 'My text',
    fontSize: 16,
    fontWeight: 'bold'
});
```

## 🏷️ Structure

| Particle | Type | Description | Example |
|----------|------|-------------|---------|
| `id` | string | Unique identifier | `id: 'my_element'` |
| `attach` | string/element | Parent to attach to | `attach: 'body'` |
| `markup` | string | HTML element type | `markup: 'div'` |

```javascript
const container = new A({
    attach: 'body',
    id: 'main_container',
    markup: 'div',
    width: 400,
    height: 300
});
```

## ⚡ Methods

### Property Modification
```javascript
const box = new A({ /* config */ });

// Change position
box.x(150);
box.y(75);

// Change color
box.backgroundColor('green');

// Chain methods
box.x(200).y(100).backgroundColor('purple');
```

### Element Access
```javascript
// Get DOM element
const domElement = box.getElement();

// Get element by ID
const element = A.getById('my_element');
```
