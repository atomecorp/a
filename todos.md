# ✅ atome Framework – Full Technical Roadmap & Priority Tracker (with Descriptions)

---

## 🧠 Project Vision & Philosophy

| Status | Priority | Task | Description |
|--------|----------|------|-------------|
| [ ]    | MEDIUM   | Write clear documentation: What is `atome`? DSL? OS? UI engine? | Define what atome really is, its scope, and how it differs from a framework or visual builder. |
| [ ]    | MEDIUM   | Add onboarding guide for new developers | Create a guide for new devs to install, understand the structure, and create their first atome. |
| [ ]    | MEDIUM   | Describe why a DSL was chosen | Explain the motivation behind using a DSL (simplicity, metaprogramming, declarativity). |
| [ ]    | MEDIUM   | Document how DSL interacts with Rust and aVa | Show how the front DSL connects to Rust backends and optional AI modules like aVa. |

---

## 🏗️ Architecture & Engine

| Status | Priority  | Task | Description |
|--------|-----------|------|-------------|
| [ ]    | VERY HIGH | Implement reactive engine (signals/observers) | Add a lightweight observer system to update views when a property changes. |
| [ ]    | VERY HIGH | Add DOM batching/render pipeline (`requestAnimationFrame`) | Batch particle updates into single-frame commits to improve perf and animation. |
| [ ]    | LOW       | Explore Slint/Canvas integration for native rendering | Investigate rendering UI via Canvas or native GUI libs for non-DOM targets. |
| [ ]    | HIGH      | Create architecture diagram (DSL ↔ DOM ↔ backend) | Visual diagram showing data flow and responsibility of each layer. |
| [ ]    | HIGH      | Add centralized app state store (observables or proxy) | Create a reactive object store for global UI state, like selection or user state. |

---

## ⚙️ Core Functionality

| Status | Priority | Task | Description |
|--------|----------|------|-------------|
| [ ]    | HIGH     | Validate keys in `new A({...})` with fallback or error | Ensure invalid or unknown keys are flagged or safely ignored with logs. |
| [ ]    | HIGH     | Add runtime type checking (optional) | Warn or error if a particle receives a value of an unexpected type. |
| [ ]    | HIGH     | Centralize and document `defineParticle` handlers | All particles should be registered and documented in one registry file. |
| [ ]    | HIGH     | Add warnings for unknown or mistyped particles | Catch typos like `colr` instead of `color` and warn in console. |

---

## 🧪 DOM Performance

| Status | Priority  | Task | Description |
|--------|-----------|------|-------------|
| [ ]    | VERY HIGH | Add lazy rendering / virtualization | Only render objects in view (or nearby) to reduce memory/DOM size. |
| [ ]    | HIGH      | Benchmark 1000+ DOM nodes scenario | Simulate a large grid of particles and measure FPS and memory. |
| [ ]    | VERY HIGH | Optimize performance of particle application | Minimize how much DOM is touched when particles change. |
| [ ]    | HIGH      | Implement offscreen rendering strategy | Allow hidden parts of the UI to render offscreen (Canvas, shadow DOM). |

---

## 📚 Documentation

| Status | Priority   | Task | Description |
|--------|------------|------|-------------|
| [ ]    | HIGH       | Create `API.md` with examples for each built-in particle | For each particle (e.g. `color`, `x`, `center`), explain syntax and result. |
| [ ]    | MEDIUM     | Document `apply`, `fasten`, `center`, `smooth`, etc. | Clarify what these do, what values are accepted, and their effects. |
| [ ]    | MEDIUM     | Clarify attach/layout/render order | Document when and how rendering occurs and what “attach” really does. |
| [ ]    | LOW        | Add lifecycle documentation for particles | Define init/update/remove lifecycle hooks if applicable. |
| [ ]    | VERY HIGH  | Add **i18n / localisation support** for multilingual apps | Design a way to define translations inside DSL and dynamically switch language. |

---

## 🧩 Features

| Status | Priority  | Task | Description |
|--------|-----------|------|-------------|
| [ ]    | VERY HIGH | WebSocket support | Allow real-time communication with a backend or between clients. |
| [ ]    | HIGH      | Axum hot reload integration | Enable live reloading of Axum server endpoints when developing. |
| [ ]    | VERY HIGH | PWA support | Add manifest, service worker, and offline capabilities. |
| [ ]    | HIGH      | JSON serializer for DSL export | Export any atome object to a JSON config that can be reloaded. |
| [ ]    | MEDIUM    | GUI Builder for visual DSL editing | Create a minimal drag-and-drop interface to create UI DSL code. |
| [ ]    | MEDIU     | Offline-first mode | Ensure DSL and UI can run fully offline including asset fallback. |
| [ ]    | LOW       | Define preset/style system for consistent UI | Predefined styles/themes for text, shape, buttons, etc. |

---

## 🤝 Contribution

| Status | Priority | Task | Description |
|--------|----------|------|-------------|
| [ ]    | HIGH     | Write `CONTRIBUTING.md` | Instructions to clone, set up, and contribute to the framework. |
| [ ]    | HIGH     | Document how to write a particle | Step-by-step example using `defineParticle`, and testing it. |
| [ ]    | HIGH     | Add PR template with checklist | Help contributors submit consistent and clean pull requests. |
| [ ]    | MEDIUM   | Define third-party extension structure | Convention for external DSL modules and particle bundles. |
| [ ]    | LOW      | Add particle naming convention guide | e.g. camelCase or snake_case, prefix rules, naming clarity. |

---

## 📦 ORM & Backends

| Status | Priority  | Task | Description |
|--------|-----------|------|-------------|
| [x]    | VERY HIGH | Choose ORM → Objection.js ✔️ | ✅ Decision made: Objection.js chosen as ORM layer. |
| [ ]    | VERY HIGH | Define schema model structure (if needed) | Create models and relations to back up DSL-defined objects. |
| [ ]    | VERY HIGH | Optional integration into Axum backend | Expose API routes to create/update DSL objects remotely. |

---

## 🔬 Testing

| Status | Priority | Task | Description |
|--------|----------|------|
| [ ]    | HIGH     | Unit tests for core particles (`x`, `y`, `color`, etc.) | One test file per particle ensuring DOM/rendering is correct. |
| [ ]    | HIGH     | Integration tests for compound usage | Apply multiple particles to one object and verify output. |
| [ ]    | MEDIUM   | Minimal internal JS test runner | Create your own `describe/it/assert` functions if no lib is used. |
| [ ]    | LOW      | Edge case test suite (invalid types, structure, etc.) | Example: `height: 'banana'` → no crash, safe fallback. |

---

> This roadmap includes detailed descriptions to guide development and collaboration. You can convert it to issues, GitHub projects, or Kanban boards as needed.