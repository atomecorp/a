# ⚡ Events API - Event Handling and Interactions

## 🖱️ Mouse Events

### Simple Click
```javascript
const button = new A({
    attach: 'body',
    text: 'Click me',
    onClick: (event) => {
        console.log('Button clicked!');
    }
});
```

### Detailed Events
```javascript
const interactiveBox = new A({
    attach: 'body',
    width: 100, height: 100,
    backgroundColor: 'blue',
    
    // Clicks
    click: (e) => console.log('Click'),
    dblclick: (e) => console.log('Double-click'),
    
    // Mouse
    mousedown: (e) => console.log('Button pressed'),
    mouseup: (e) => console.log('Button released'),
    mouseover: (e) => console.log('Hover'),
    mouseout: (e) => console.log('Leave hover'),
    mousemove: (e) => console.log('Movement')
});
```

### Practical Shortcuts
```javascript
const element = new A({
    // Shortcuts
    onMouseOver: () => element.backgroundColor('red'),
    onMouseOut: () => element.backgroundColor('blue')
});
```

## ⌨️ Keyboard Events

```javascript
const input = new A({
    markup: 'input',
    attach: 'body',
    
    keydown: (e) => {
        console.log('Key pressed:', e.key);
        if (e.key === 'Enter') {
            console.log('Enter pressed!');
        }
    },
    
    keyup: (e) => console.log('Key released'),
    
    input: (e) => {
        console.log('Value:', e.target.value);
    }
});
```

## 🎯 Focus and Forms

```javascript
const textField = new A({
    markup: 'input',
    type: 'text',
    placeholder: 'Type here...',
    
    focus: (e) => {
        console.log('Field focused');
        e.target.style.borderColor = 'blue';
    },
    
    blur: (e) => {
        console.log('Field left');
        e.target.style.borderColor = 'gray';
    },
    
    change: (e) => {
        console.log('Value changed:', e.target.value);
    }
});
```

## 🔄 Methods for Adding Events

### After Creation
```javascript
const box = new A({
    attach: 'body',
    width: 100, height: 100
});

// Add event after creation
box.onclick((e) => {
    console.log('Click added later!');
});

// Chain events
box.onmouseover(() => box.backgroundColor('red'))
   .onmouseout(() => box.backgroundColor('blue'));
```

## 🎨 Interaction Examples

### Button with Hover Effect
```javascript
const hoverButton = new A({
    attach: 'body',
    x: 50, y: 50,
    width: 120, height: 40,
    backgroundColor: '#007bff',
    color: 'white',
    text: 'Hover me',
    smooth: 5,
    cursor: 'pointer',
    
    onMouseOver: function() {
        this.backgroundColor('#0056b3');
        this.style({ transform: 'scale(1.05)' });
    },
    
    onMouseOut: function() {
        this.backgroundColor('#007bff');
        this.style({ transform: 'scale(1)' });
    },
    
    onClick: function() {
        this.text('Clicked!');
        setTimeout(() => this.text('Hover me'), 1000);
    }
});
```

### Simple Drawing Area
```javascript
const canvas = new A({
    attach: 'body',
    width: 400, height: 300,
    backgroundColor: '#f0f0f0',
    border: '2px solid #ccc'
});

let isDrawing = false;

canvas.mousedown(() => isDrawing = true);
canvas.mouseup(() => isDrawing = false);
canvas.mousemove((e) => {
    if (isDrawing) {
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        new A({
            attach: canvas,
            x: x - 2, y: y - 2,
            width: 4, height: 4,
            backgroundColor: 'red',
            smooth: '50%'
        });
    }
});
```

### Simple Drag & Drop
```javascript
const draggable = new A({
    attach: 'body',
    x: 100, y: 100,
    width: 80, height: 80,
    backgroundColor: 'green',
    text: 'Drag me',
    cursor: 'move'
});

let isDragging = false;
let startX, startY;

draggable.mousedown((e) => {
    isDragging = true;
    startX = e.clientX - parseInt(draggable.getElement().style.left);
    startY = e.clientY - parseInt(draggable.getElement().style.top);
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        draggable.x(e.clientX - startX);
        draggable.y(e.clientY - startY);
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});
```

## 📱 Touch Events (Mobile)

```javascript
const touchBox = new A({
    attach: 'body',
    width: 150, height: 150,
    backgroundColor: 'purple',
    
    // Touch events
    touchstart: (e) => {
        console.log('Touch start');
        e.preventDefault(); // Prevent scrolling
    },
    
    touchmove: (e) => {
        console.log('Touch move');
        e.preventDefault();
    },
    
    touchend: (e) => {
        console.log('Touch end');
    }
});
```
