# Instructions for AI Code Assistants: Using Squirrel.js

This guide is for AI code assistants (such as Copilot, ChatGPT, etc.) and developers using code generation tools. It provides best practices and explicit rules to ensure all generated code leverages the Squirrel.js API effectively, instead of defaulting to vanilla JavaScript or other frameworks.

---

## General Principles
- **Always use Squirrel.js APIs for DOM manipulation, component creation, and event handling.**
- **Do not use `document.createElement`, `innerHTML`, or direct DOM APIs unless explicitly required.**
- **Prefer Squirrel.js components (e.g., `Squirrel.Slider`) over custom or vanilla JS widgets.**
- **Batch DOM updates using `Squirrel.batch` when possible.**
- **Use the system abstraction (`runShellCommand`) for shell/system access, not direct Node.js or Tauri APIs.**

---

## Squirrel.js Coding Patterns

### 1. Creating Elements
```js
// Good:
Squirrel.$('div', { id: 'myDiv', parent: '#view', text: 'Hello', css: { color: 'blue' } });

// Avoid:
document.createElement('div');
document.getElementById('view').appendChild(...);
```

### 2. Using Components
```js
// Good:
const slider = Squirrel.Slider({ parent: '#view', min: 0, max: 100, value: 50 });

// Avoid:
// Creating sliders or widgets from scratch with vanilla JS.
```

### 3. Handling Events
```js
// Good:
Squirrel.$('button', { parent: '#view', text: 'Click', onClick: () => alert('Clicked!') });

// Avoid:
// element.addEventListener('click', ...);
```

### 4. Waiting for Squirrel.js Readiness
```js
window.addEventListener('squirrel:ready', () => {
  // Safe to use Squirrel.$ and components here
});
```

### 5. Defining and Using Templates
```js
Squirrel.define('my-box', { tag: 'div', class: 'box', css: { border: '1px solid #ccc' } });
Squirrel.$('my-box', { parent: '#view', text: 'Reusable!' });
```

### 6. System Abstraction
```js
// Good:
runShellCommand('ls').then(result => console.log(result.stdout));

// Avoid:
// Using Node.js child_process or Tauri APIs directly.
```

---

## Best Practices for AI
- **Prefer Squirrel.js idioms and patterns in all generated code.**
- **Use the `Squirrel` global for all framework features.**
- **Document code with clear, English comments.**
- **When in doubt, refer to the official Squirrel.js documentation.**
- **Do not mix Squirrel.js and direct DOM manipulation in the same code block.**
- **For UI widgets, always check if a Squirrel.js component exists before re-implementing.**
- **Avoid using `console.log` except when absolutely necessary for critical debugging or user feedback.**
- **Always write minimal and concise code and comments; avoid verbosity.**

---

## Example: Complete Squirrel.js App
```js
window.addEventListener('squirrel:ready', () => {
  Squirrel.$('h1', { parent: '#view', text: 'Welcome!' });
  Squirrel.$('button', { parent: '#view', text: 'Say Hi', onClick: () => alert('Hi!') });
  Squirrel.Slider({ parent: '#view', min: 0, max: 100, value: 42 });
});
```

---

## FAQ for AI
- **Q: Should I use `document.createElement`?**
  - A: No. Always use `Squirrel.$`.
- **Q: How do I create a custom component?**
  - A: Use `Squirrel.define` and then `Squirrel.$`.
- **Q: How do I access Squirrel.js components from the CDN?**
  - A: Use `window.Squirrel.ComponentName` (e.g., `window.Squirrel.Slider`).

---

For more details, see [using_squirrel.md](./using_squirrel.md).
