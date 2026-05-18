# 🚨 DEVELOPER EXPERIENCE - Clearer Errors

## Current Issues
The framework fails silently in several cases, making debugging difficult.

## Examples of Errors to Improve

### 1. Nonexistent Template
```javascript
// Current - silent fail
const element = $('nonexistent-template', { text: 'Hello' });
// → Creates an empty div without warning

// Desired - clear error
// → Console: "⚠️ Template 'nonexistent-template' not found. Available: ['box', 'button', 'card']"
```

### 2. Invalid Parent Selector
```javascript
// Current - silent fail or native error
const element = $('box', { 
  parent: '#nonexistent-container' 
});
// → Element created but not attached

// Desired - fallback + warning
// → Console: "⚠️ Parent '#nonexistent-container' not found. Falling back to document.body"
```

### 3. Invalid CSS Properties
```javascript
// Current - silent fail
const element = $('box', {
  css: {
    'invalid-property': 'value',
    backgroundColr: 'red' // typo
  }
});

// Desired - validation + suggestions
// → Console: "⚠️ Unknown CSS property 'backgroundColr'. Did you mean 'backgroundColor'?"
```

### 4. Non-function Event Handlers
```javascript
// Current - unclear native error
const element = $('button', {
  onclick: "not a function" // String instead of function
});

// Desired - explicit error
// → Console: "❌ Event handler 'onclick' must be a function, got string"
```

## TODO Implementation
- [ ] Template registry validation with suggestions
- [ ] Warning for invalid parent selectors + fallback
- [ ] CSS property validation with typo detection
- [ ] Type checking for event handlers
- [ ] Dev vs prod mode (verbose vs silent)
- [ ] `debugSquirrel()` helper for system state
