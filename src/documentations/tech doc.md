# 🧠 Technical Documentation: atome DSL Framework

## 🔰 Introduction

The **atome DSL framework** is a lightweight, expressive, and dynamic runtime engine for creating declarative UI and behavior through plain JavaScript objects. It allows the creation, manipulation, and extension of UI elements via custom *particles* (properties), using a system inspired by Ruby's object model and metaprogramming power.

This document serves two purposes:

1. **How to use the framework**: for developers who want to build apps with it.
2. **How to contribute**: for developers who want to improve or extend the framework.

---

## 🏗️ Core Concepts

### 📦 The A Object

Every UI element is created through an instance of the `A` class (alias of `Atome`).
Example:

```js
new A({
  attach: 'body',
  id: 'main_container',
  markup: 'span',
  role: 'container',
  x: 150,
  y: 50,
  width: 400,
  height: 300,
  color: 'blue',
  display: 'block',
  smooth: 10,
  shadow: [
    { blur: 3, x: 4, y: 8, color: { red: 0, green: 0, blue: 0, alpha: 0.6 }, invert: true },
    { blur: 12, x: 0, y: 0, color: { red: 0, green: 0.5, blue: 0, alpha: 0.6 }, invert: false }
  ],
  overflow: 'hidden',
  fasten: [] // contains child IDs
});
```

This creates a DOM element with style and behavior controlled by our DSL.

### 🧬 Particles

Particles are properties (or behaviors) that can be attached to an A object.
Examples: `x`, `y`, `width`, `color`, `shadow`, etc.

Each particle is applied through a handler declared via:

```js
defineParticle('x', (atom, value) => {
  atom.style.left = value + 'px';
});
```

---

## 🔧 `defineParticle`: The Heart of Extensibility

### 🔍 Purpose

`defineParticle(name, handler)` is used to **add a new property or behavior** to all future A objects. It is the core mechanism that makes the framework extensible.

### 🛠️ How it Works

When an A object is created, each key in the passed object is checked:

* If a `particle` handler exists for that key → it gets applied to the object
* Otherwise → ignored or stored for later use

### 🧪 Example: Custom Particle

```js
defineParticle('glow', (atom, value) => {
  atom.style.filter = `drop-shadow(0 0 ${value}px gold)`;
});

new A({
  id: 'magic_btn',
  glow: 20,
});
```

Result: Adds a glowing shadow to the button.

---

## 🧩 Anatomy of the Engine

### 1. The `A` Constructor

* Parses incoming hash (DSL config)
* Iterates over keys
* Calls the corresponding particle handlers

### 2. Built-in Particles

The engine auto-registers default particles:

* Style: `left`, `top`, `width`, `height`, `backgroundColor`, `color`, `boxShadow`, `opacity`, `zIndex`
* HTML Attributes: `id`, `title`, `alt`, `src`, `href`
* DOM Properties: `innerHTML`, `textContent`, `value`, `checked`

### 3. Manual Override

You can override any built-in particle by calling `defineParticle` again with the same name. This allows fine-grained control.

---

## 🚀 How to Use the Framework

### ➕ Add a New Object

```js
new A({ id: 'hello', textContent: 'Hello World!', x: 100, y: 40 });
```

### 🧱 Create Reusable Components

```js
function button(label) {
  return new A({
    markup: 'button',
    textContent: label,
    color: 'white',
    backgroundColor: 'blue',
    padding: 10,
    borderRadius: 6
  });
}

button('Click Me');
```

### 🔄 Add Interactivity

You can attach events manually:

```js
let btn = new A({ id: 'mybtn', textContent: 'Click me' });
document.getElementById('mybtn').addEventListener('click', () => alert('clicked!'));
```

---

## 🤝 Contributing to the Framework

### 🪛 Add New Particles

Use `defineParticle('yourProp', handler)` in `essentials.js` or new module.

### 📁 Add to Core

If your particle is generic, add it to the default registry for inclusion in every project.

### 🧪 Add Tests (TODO)

All core particles should have matching test cases and interactive examples.

### 📚 Improve Docs

All new particles should be documented with:

* What it does
* Example usage
* Edge cases (if any)

---

## 📅 Roadmap

* [ ] Particle validation system
* [ ] Reactive update system (signals/observers)
* [ ] JSON serializer for full UI export
* [ ] Live reload & hot module swap
* [ ] GUI for building DSL objects visually

---

## 🧭 Philosophy Reminder

> Simple objects, powerful behaviors.
> Particles are the atoms of your interface.
