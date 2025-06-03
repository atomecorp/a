# 🔄 Ruby to JavaScript Transpiler (Prism WASM)

## 🎯 Project Objective

The project aims to build a Ruby-to-JavaScript transpiler leveraging the **Prism WASM parser**. The main goal is to properly extract the AST (Abstract Syntax Tree) from the WebAssembly Prism module to transpile Ruby code into executable JavaScript.

1. index.html loads scripts in sequence
2. squirrel_runner.js auto-starts after 500ms delay
3. Runner loads ./application/index.sqr automatically
4. SquirrelOrchestrator transpiles Ruby to JavaScript using Prism AST
5. A Framework maps methods from apis.js and particles (identity.js, dimension.js)
6. utils.js provides fallback mapping for unmapped CSS properties, HTML attributes, and DOM properties
7. Generated JavaScript executes via eval()
8. A Framework instances manipulate DOM through particle system with automatic method resolution
The system ensures complete Ruby-to-JavaScript method coverage through layered mapping: specific particles → utils.js fallbacks → native DOM properti

## ❗ Core Problem

While we can access the Prism WASM module that parses Ruby code, we currently struggle to properly extract the AST nodes from WASM memory. The `pm_parse` function returns a pointer to the parsed result, but we must understand how to navigate the memory structure to retrieve actual Ruby nodes like `DefNode`, `CallNode`, `ClassNode`, etc.

## 🧠 Transpiler Architecture

The transpiler uses a **hierarchical method resolution system** for Ruby-to-JS conversion:

1. Identify the Ruby node type to transpile.
2. Look for a specialized method inside the `a/` folder that handles this specific node.
3. If found, use the specialized method.
4. If not, fall back to generic methods in `utils.js`.
5. If neither exists, throw an error or generate fallback JavaScript code.

### ➕ Folder `a/` contains:

Optimized, node-specific transpilation handlers.

### ➕ File `utils.js` contains:

Generic fallback handlers to ensure complete AST node coverage.

This dual-layer system ensures high-fidelity transpilation for common Ruby constructs while guaranteeing fallback coverage for all possible Ruby node types found in the Prism AST.

## 📚 Prism Documentation

It is **absolutely essential** to carefully read and understand the official Prism documentation in order to use the parser correctly and interact properly with its WASM memory structure. Many implementation details, including node types, memory offsets, and AST traversal, are explained in depth there.

Refer to the documentation here:
[https://github.com/ruby/prism/tree/main/docs](https://github.com/ruby/prism/tree/main/docs)

---

## ⚡ Performance Requirement

The transpiled JavaScript **must match the performance** of manually-written vanilla JavaScript. **No runtime overhead or abstraction layers** should be introduced.

### ❌ Not allowed:

* Wrapper or helper functions
* Ruby object or method emulation
* Simulated Ruby runtime
* Abstraction layers for Ruby-to-JS differences
* Runtime type checks or validation
* Transformation of native JavaScript structures

### ✅ Must use only:

* Native JavaScript primitive types (number, string, boolean, object, array)
* Standard JS operators (+, -, \*, /, ==, etc.)
* Native JS control structures (if, for, while, function)
* Native JS object methods (e.g., `Array.prototype.push`)
* Standard browser or Node.js APIs

**Example:**

* A Ruby method → transpiled to a plain JS function
* A Ruby class → transpiled to an ES6 JS class
* A Ruby hash → transpiled to a plain JS object

The final output must be indistinguishable from human-written JS and run at native speed.

---

## 🔧 Prism Minimal Standalone Setup

We must reinstall Prism with a **minimalist setup**. This involves rewriting `install_prism.sh` so that:

* It no longer contains **any JavaScript code**.
* It **only performs downloads** of the required files.
* All JavaScript code currently embedded in the script must be extracted and provided separately as `.js` files.
* These files must be organized as follows:

  * `./squirrel/parser/` → contains all Prism-related downloaded files.
  * `./squirrel/` → contains our custom project files.

This ensures a clean separation of responsibilities and simplifies both the installation process and the structure of the project.

---

## 🌐 HTML Entry File Requirements

The `index.html` must be **pure HTML** with strict separation of concerns.

### ❌ Must NOT include:

* Inline JavaScript in `<script>` tags
* Inline CSS in `<style>` tags or `style` attributes
* Inline dynamic HTML content
* Any embedded resources

### ✅ Must ONLY contain:

* Minimal HTML structure (`<html>`, `<head>`, `<body>`)
* External CSS via `<link>`
* External JS via `<script src="...">`
* Semantic HTML tags with only `id` and `class` attributes

This ensures:

* Easier code maintenance
* Better cache performance
* Clear separation of structure, style, and behavior
* Independent optimization and minification of assets
* Compliance with modern web development practices

The `index.html` acts only as a structural entry point to load required external assets.

---

## 📦 Ruby Code Entry Point

The Ruby source to be transpiled is located in:

```
/application/index.sqr
```

---

## 📁 Project Tree

```
├── install_prism.sh
├── src
│   ├── a
│   │   ├── a.js
│   │   ├── apis.js
│   │   └── particles
│   │       ├── dimension.js
│   │       └── identity.js
│   ├── application
│   │   ├── index.sqr
│   │   ├── require_test.sqr
│   ├── css
│   │   └── styles.css
│   ├── documentations
│   │   ├── apis.md
│   │   ├── Benefits.md
│   │   ├── power_of_the_DSL.md
│   │   ├── tech doc.md
│   │   ├── why_web_techology_over_full_native.md
│   │   └── workflow.md
│   ├── index.html
│   └── utils.js
└── squirrel
	├── parser
	│   ├── acorn.js
	│   ├── browser_wasi_shim.js
	│   ├── deserialize.js
	│   ├── fd.js
	│   ├── fs_mem.js
	│   ├── fs_opfs.js
	│   ├── nodes.js
	│   ├── prism_helper.js
	│   ├── prism.wasm
	│   ├── strace.js
	│   ├── visitor.js
	│   ├── wasi_defs.js
	│   ├── wasi_wrapper.js
	│   └── wasi.js
	├── squirrel_orchestrator.js
	├── squirrel_parse.js
	└── squirrel_runner.js

```
do not add any code in index.html 
all comments and logs must be in english
