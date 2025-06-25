# 🍭 API SUGAR - Zero-overhead Commodities

## Vision
Add elegant shortcuts without impacting performance.

## Desired API Sugar Examples

### 1. Position & Size shortcuts
```javascript
// Instead of
element.style.left = '100px';
element.style.top = '200px';
element.style.width = '300px';
element.style.height = '150px';

// Proposed sugar
element.x = 100;           // → style.left = '100px'
element.y = 200;           // → style.top = '200px'  
element.w = 300;           // → style.width = '300px'
element.h = 150;           // → style.height = '150px'

// In $ after element creation
Object.defineProperties(element, {
  // Sugar for common styles
  x: {
    get() { return this.style.left; },
    set(v) { this.style.left = typeof v === 'number' ? v + 'px' : v; }
  },
  y: {
    get() { return this.style.top; },
    set(v) { this.style.top = typeof v === 'number' ? v + 'px' : v; }
  },
  w: {
    get() { return this.style.width; },
    set(v) { this.style.width = typeof v === 'number' ? v + 'px' : v; }
  },
  visible: {
    get() { return this.style.display !== 'none'; },
    set(v) { this.style.display = v ? '' : 'none'; }
  }
});

// Usage sugar
element.x = 100;        // instead of element.style.left = '100px'
element.visible = false; // instead of element.style.display = 'none'

// Or method chaining
element.move(100, 200).size(300, 150);
```
// In $ after element creation
element.move = (x, y) => {
  element.style.left = x + 'px';
  element.style.top = y + 'px';
  return element; // Chaining
};

element.size = (w, h) => {
  element.style.width = w + 'px';
  element.style.height = h + 'px';
  return element;
};

// Usage fluent
element.move(100, 200).size(300, 150);
### 2. Visibility shortcuts
```javascript
// Instead of
element.style.display = 'none';
element.style.visibility = 'hidden';
element.style.opacity = '0';

// Proposed sugar
element.visible = false;    // → display: none
element.hidden = true;      // → visibility: hidden
element.opacity = 0;        // → opacity: 0

// Or methods
element.hide().show().fadeOut().fadeIn();
```

### 3. Event sugar
```javascript
// Instead of
element.addEventListener('click', handler);
element.addEventListener('mouseenter', hoverHandler);

// Proposed sugar
element.click(handler);           // → addEventListener('click')
element.hover(hoverHandler);      // → addEventListener('mouseenter')
element.focus(focusHandler);      // → addEventListener('focus')
// Event shortcuts
['click', 'hover', 'focus', 'blur'].forEach(event => {
  element[event] = (callback) => {
    element.addEventListener(event === 'hover' ? 'mouseenter' : event, callback);
    return element;
  };
});

// Simple usage
element.click(() => console.log('clicked!'))
       .hover(() => element.style.opacity = '0.8');

// Method chaining
element.click(() => console.log('clicked'))
       .hover(() => element.opacity = 0.8);
```

### 4. CSS Template Literals
```javascript
// Instead of multiple assignments
element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
element.style.background = `linear-gradient(45deg, ${color1}, ${color2})`;

// Proposed sugar
element.css`
  transform: translate(${x}px, ${y}px) scale(${scale});
  background: linear-gradient(45deg, ${color1}, ${color2});
  box-shadow: 0 ${blur}px ${spread}px ${shadowColor};
`;
```

### 5. Animation shortcuts
```javascript
// Instead of verbose Web Animations API
element.animate([
  { transform: 'translateX(0px)' },
  { transform: 'translateX(100px)' }
], { duration: 300 });

// Proposed sugar
element.slideX(100, 300);         // → translate X over time
element.scaleTo(1.5, 200);        // → scale to value over time
element.fadeTo(0.5, 150);         // → fade to opacity over time

// Method chaining animations
element.slideX(100).then(() => element.scaleTo(1.2));
```

### 6. Class management sugar
```javascript
// Instead of
element.classList.add('active');
element.classList.remove('inactive');
element.classList.toggle('expanded');

// Proposed sugar (keeps originals too)
element.addClass('active').removeClass('inactive').toggleClass('expanded');

// Or properties
element.active = true;            // → classList.add('active')
element.expanded = !element.expanded; // → classList.toggle('expanded')
```

## TODO Implementation
- [ ] Getters/setters pour x, y, w, h, visible, opacity
- [ ] Methods move(), size(), hide(), show(), fadeIn(), fadeOut()
- [ ] Event shortcuts click(), hover(), focus(), blur()
- [ ] CSS template literal support
- [ ] Animation shortcuts slideX(), slideY(), scaleTo(), fadeTo()
- [ ] Class management shortcuts addClass(), removeClass(), toggleClass()
- [ ] Toutes les APIs retournent `this` pour method chaining
- [ ] Zero impact performance - utiliser defineProperty et natives



