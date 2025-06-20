# Using Squirrel.js: Complete English Guide

Welcome to Squirrel.js! This guide is for developers who want to use and extend Squirrel.js in English, whether you are a beginner or an expert. It covers installation, basic usage, advanced features, and best practices.

---

## Table of Contents
1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Quick Start Example](#quick-start-example)
4. [Core Concepts](#core-concepts)
5. [Beginner Tutorial](#beginner-tutorial)
6. [Advanced Usage](#advanced-usage)
7. [Component System](#component-system)
8. [Custom Components](#custom-components)
9. [System Abstraction](#system-abstraction)
10. [Performance Tips](#performance-tips)
11. [Internationalization](#internationalization)
12. [FAQ](#faq)
13. [Resources](#resources)

---

## Introduction
Squirrel.js is a minimal, modular JavaScript framework for building modern web interfaces. It is designed for speed, flexibility, and easy integration with both browser and system environments (Node.js, Tauri, etc.).

---

## Installation

### CDN (Recommended for Quick Start)
```html
<script src="https://cdn.jsdelivr.net/gh/atomecorp/a@latest/dist/squirrel.min.js"></script>
```

### NPM (For Node.js or Bundler Projects)
```bash
npm install squirreljs
```

### Local (Development)
Download or clone the repo, then include the built file:
```html
<script src="./dist/squirrel.js"></script>
```

---

## Quick Start Example

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Squirrel.js Quick Start</title>
  <script src="https://cdn.jsdelivr.net/gh/atomecorp/a@latest/dist/squirrel.min.js"></script>
</head>
<body>
  <div id="view"></div>
  <script>
    window.addEventListener('squirrel:ready', () => {
      Squirrel.$('span', {
        id: 'hello',
        parent: '#view',
        text: 'Hello, Squirrel.js!',
        css: { color: 'green', fontWeight: 'bold' }
      });
    });
  </script>
</body>
</html>
```

---

## Core Concepts
- **$**: The main function to create and update DOM elements.
- **Components**: Reusable UI elements (Slider, Button, Table, etc.) available via `Squirrel.Slider`, `Squirrel.Button`, etc.
- **Templates**: Define reusable element blueprints.
- **Events**: Use standard JS event handlers (e.g., `onClick`).
- **System Abstraction**: Unified API for shell/system access (Node.js, Tauri, browser).

---

## Beginner Tutorial

### 1. Creating Elements
```js
Squirrel.$('div', {
  id: 'myDiv',
  parent: '#view',
  text: 'This is a div!',
  css: { backgroundColor: '#eee', padding: '10px' }
});
```

### 2. Using Built-in Components
```js
const slider = Squirrel.Slider({
  parent: '#view',
  min: 0,
  max: 100,
  value: 50,
  onInput: value => console.log('Slider value:', value)
});
```

### 3. Handling Events
```js
Squirrel.$('button', {
  parent: '#view',
  text: 'Click me',
  onClick: () => alert('Button clicked!')
});
```

---

## Advanced Usage

### Dynamic Templates
```js
Squirrel.define('fancy-box', {
  tag: 'div',
  class: 'fancy',
  css: { border: '2px solid #f90', padding: '20px' }
});
Squirrel.$('fancy-box', { parent: '#view', text: 'Reusable box!' });
```

### Batch DOM Updates
```js
Squirrel.batch(
  () => Squirrel.$('div', { id: 'a', parent: '#view', text: 'A' }),
  () => Squirrel.$('div', { id: 'b', parent: '#view', text: 'B' })
);
```

### Observing Mutations
```js
Squirrel.observeMutations(document.getElementById('view'), mutation => {
  console.log('DOM changed:', mutation);
});
```

---

## Component System

Squirrel.js comes with many ready-to-use components:
- `Squirrel.Slider`
- `Squirrel.Button`
- `Squirrel.Table`
- `Squirrel.Badge`
- `Squirrel.Tooltip`
- ...and more!

### Example: Customizing a Slider
```js
const slider = Squirrel.Slider({
  parent: '#view',
  min: 0,
  max: 100,
  value: 75,
  skin: {
    track: { backgroundColor: '#222' },
    handle: { backgroundColor: '#f90' }
  },
  onInput: value => console.log('Value:', value)
});
```

---

## Custom Components

You can create your own components by defining templates and logic:
```js
Squirrel.define('my-card', {
  tag: 'div',
  class: 'card',
  css: { boxShadow: '0 2px 8px #ccc', padding: '16px' }
});
Squirrel.$('my-card', { parent: '#view', text: 'Custom card!' });
```

---

## System Abstraction

Squirrel.js provides a unified API for running shell/system commands (Node.js, Tauri, browser):
```js
// Example: runShellCommand abstraction
runShellCommand('echo Hello').then(result => {
  console.log(result.stdout);
});
```

---

## Performance Tips
- Use batching (`Squirrel.batch`) for multiple DOM updates.
- Minimize reflows by grouping style changes.
- Use CDN or minified builds for production.

---

## Internationalization
- All core and documentation is available in English.
- You can localize your UI by setting `text` and other properties.

---

## FAQ
**Q: How do I access a component from the CDN?**
A: Use `window.Squirrel.ComponentName`, e.g., `window.Squirrel.Slider`.

**Q: Can I use Squirrel.js with frameworks like React or Vue?**
A: Yes, but Squirrel.js is designed for direct DOM manipulation and may not fit the virtual DOM paradigm.

**Q: How do I contribute?**
A: Fork the repo, make your changes, and submit a pull request!

---

## Resources
- [GitHub Repository](https://github.com/atomecorp/a)
- [CDN on jsDelivr](https://cdn.jsdelivr.net/gh/atomecorp/a@latest/dist/squirrel.min.js)
- [NPM Package](https://www.npmjs.com/package/squirreljs)
- [API Reference](./Core-API.md)

---

Happy coding with Squirrel.js! 🐿️
