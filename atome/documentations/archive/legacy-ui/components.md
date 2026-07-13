# Component Format Guide

This document describes the standard format for components in the `components` folder, based on the HyperSquirrel pattern.

---

## 📋 Basic Structure

All components follow a consistent structure using **template-based definitions**:

### Required Import

```javascript
import { $, define } from '../squirrel.js';
```

### Definition Pattern

```javascript
define('component-name', {
  tag: 'div',
  css: {
    // Component styles
  }
});
```

---

## 🔧 Minimum Required

### Minimal Example

```javascript
import { $, define } from '../squirrel.js';

define('my-component', {
  tag: 'div',
  css: {
    padding: '10px',
    backgroundColor: '#f0f0f0'
  }
});
```

---

## 📝 Simple Component Example

```javascript
import { $, define } from '../squirrel.js';

/**
 * Simple Button Component Template
 */
define('simple-button', {
  tag: 'button',
  text: 'Click me',
  css: {
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: 'system-ui, sans-serif'
  },
  attrs: {
    type: 'button'
  }
});

// Usage with property override
const myButton = $('simple-button', {
  text: 'My Custom Button',
  css: { 
    backgroundColor: '#28a745' 
  },
  onClick: () => alert('Clicked!')
});
```

---

## 🎯 Template vs Function Patterns

### Template Pattern (Recommended)
```javascript
// ✅ Configuration-based template
define('my-button', {
  tag: 'button',
  text: 'Default Text',
  css: { /* default styles */ }
});

// Usage with merge/override
const button = $('my-button', {
  text: 'Custom Text',
  css: { backgroundColor: 'red' }
});
```

### Function Pattern (For Complex Logic)
```javascript
// ✅ Function factory for complex components
function ComplexButton(props) {
  const button = $('button', {
    text: props.text || 'Default',
    css: { /* styles */ },
    on: {
      click: props.onClick
    }
  });
  
  // Complex logic here
  return button;
}

// Direct function call usage
const button = ComplexButton({
  text: 'Custom',
  onClick: () => console.log('clicked')
});
```

---

## 🏗️ Advanced Template Example

```javascript
import { $, define } from '../squirrel.js';

/**
 * Card Component with multiple elements
 */
define('info-card', {
  tag: 'div',
  class: 'info-card',
  css: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '16px',
    backgroundColor: '#fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  children: [
    {
      tag: 'h3',
      class: 'card-title',
      text: 'Default Title',
      css: {
        margin: '0 0 8px 0',
        fontSize: '18px',
        fontWeight: 'bold'
      }
    },
    {
      tag: 'p',
      class: 'card-content',
      text: 'Default content...',
      css: {
        margin: '0',
        fontSize: '14px',
        color: '#666'
      }
    }
  ]
});

// Usage
const card = $('info-card', {
  children: [
    { text: 'Custom Title' },
    { text: 'Custom content here' }
  ]
});
```

---

## 🎯 Conventions

- **Component names**: Use kebab-case (`info-card`, `nav-button`)
- **File names**: Use snake_case (`info_card.js`, `nav_button.js`)
- **Template properties**: Use configuration objects
- **Property override**: Merge styles and properties at usage
- **Events**: Add via `onClick`, `onHover` etc. at usage time

---

## 📊 Format Consistency

- All components use `{ $, define }` from `../squirrel.js`
- All are registered with `define()` and configuration objects
- All support property merge/override at usage
- Templates define default behavior, usage customizes

---

## 📝 Best Practices

1. **Always** import `{ $, define }` from `../squirrel.js`
2. **Use** `define()` with configuration objects for simple components
3. **Use** function factories for complex logic and state management
4. **Define** sensible defaults in templates
5. **Support** property override via `$('component-name', { ... })`
6. **Document** the component with comments
7. **Test** both default and customized usage

---

## 🔄 Usage Patterns

### Basic Usage
```javascript
const element = $('component-name');
```

### With Property Override
```javascript
const element = $('component-name', {
  text: 'Custom text',
  css: { color: 'red' }
});
```

### With Event Handlers
```javascript
const element = $('component-name', {
  onClick: () => console.log('clicked'),
  onHover: () => console.log('hovered')
});
```

### With Parent Attachment
```javascript
const element = $('component-name', {
  parent: document.getElementById('container')
});
```

This structure ensures consistency and reusability for all components in the HyperSquirrel ecosystem.