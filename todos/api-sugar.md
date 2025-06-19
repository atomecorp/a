# 🍭 API SUGAR - Commodités zero-overhead

## Vision
Ajouter des raccourcis élégants sans impacter les performances.

## Examples d'API sugar souhaitées

### 1. Position & Size shortcuts
```javascript
// Au lieu de
element.style.left = '100px';
element.style.top = '200px';
element.style.width = '300px';
element.style.height = '150px';

// Sugar proposé
element.x = 100;           // → style.left = '100px'
element.y = 200;           // → style.top = '200px'  
element.w = 300;           // → style.width = '300px'
element.h = 150;           // → style.height = '150px'

// Dans $ après création de l'élément
Object.defineProperties(element, {
  // Sugar pour styles courants
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
element.x = 100;        // au lieu de element.style.left = '100px'
element.visible = false; // au lieu de element.style.display = 'none'

// Ou method chaining
element.move(100, 200).size(300, 150);
```
// Dans $ après création
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
// Au lieu de
element.style.display = 'none';
element.style.visibility = 'hidden';
element.style.opacity = '0';

// Sugar proposé
element.visible = false;    // → display: none
element.hidden = true;      // → visibility: hidden
element.opacity = 0;        // → opacity: 0

// Ou methods
element.hide().show().fadeOut().fadeIn();
```

### 3. Event sugar
```javascript
// Au lieu de
element.addEventListener('click', handler);
element.addEventListener('mouseenter', hoverHandler);

// Sugar proposé
element.click(handler);           // → addEventListener('click')
element.hover(hoverHandler);      // → addEventListener('mouseenter')
element.focus(focusHandler);      // → addEventListener('focus')
// Raccourcis événements
['click', 'hover', 'focus', 'blur'].forEach(event => {
  element[event] = (callback) => {
    element.addEventListener(event === 'hover' ? 'mouseenter' : event, callback);
    return element;
  };
});

// Usage simple
element.click(() => console.log('clicked!'))
       .hover(() => element.style.opacity = '0.8');

// Method chaining
element.click(() => console.log('clicked'))
       .hover(() => element.opacity = 0.8);
```

### 4. CSS Template Literals
```javascript
// Au lieu de multiples assignations
element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
element.style.background = `linear-gradient(45deg, ${color1}, ${color2})`;

// Sugar proposé
element.css`
  transform: translate(${x}px, ${y}px) scale(${scale});
  background: linear-gradient(45deg, ${color1}, ${color2});
  box-shadow: 0 ${blur}px ${spread}px ${shadowColor};
`;
```

### 5. Animation shortcuts
```javascript
// Au lieu du Web Animations API verbeux
element.animate([
  { transform: 'translateX(0px)' },
  { transform: 'translateX(100px)' }
], { duration: 300 });

// Sugar proposé
element.slideX(100, 300);         // → translate X over time
element.scaleTo(1.5, 200);        // → scale to value over time
element.fadeTo(0.5, 150);         // → fade to opacity over time

// Method chaining animations
element.slideX(100).then(() => element.scaleTo(1.2));
```

### 6. Class management sugar
```javascript
// Au lieu de
element.classList.add('active');
element.classList.remove('inactive');
element.classList.toggle('expanded');

// Sugar proposé (garde les originaux aussi)
element.addClass('active').removeClass('inactive').toggleClass('expanded');

// Ou properties
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



