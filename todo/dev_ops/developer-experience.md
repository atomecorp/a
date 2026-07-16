# 🚨 DEVELOPER EXPERIENCE - Clearer Errors

Status: Actif

## Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

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

// Desired - explicit typed error, without implicit reparenting
// → Error: "Parent '#nonexistent-container' not found"
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
- [ ] Typed error for invalid parent selectors without fallback
- [ ] CSS property validation with typo detection
- [ ] Type checking for event handlers
- [ ] Dev vs prod mode (verbose vs silent)
- [ ] `debugSquirrel()` helper for system state
