# 🔄 Ruby to JavaScript Transpiler (Prism WASM)

## 🎯 Project Objective

The project aims to build a Ruby-to-JavaScript transpiler leveraging the **Prism WASM parser**. The main goal is to properly extract the AST (Abstract Syntax Tree) from the WebAssembly Prism module to transpile Ruby code into executable JavaScript.

## 🔄 System Flow

1. index.html loads scripts in sequence
2. squirrel_runner.js auto-starts after 500ms delay
3. Runner loads ./application/index.sqr automatically
4. **NEW:** Modular orchestrator transpiles Ruby to JavaScript using split architecture
5. A Framework maps methods from apis.js and particles (identity.js, dimension.js)
6. utils.js provides fallback mapping for unmapped CSS properties, HTML attributes, and DOM properties
7. Generated JavaScript executes via eval()
8. A Framework instances manipulate DOM through particle system with automatic method resolution

The system ensures complete Ruby-to-JavaScript method coverage through layered mapping: specific particles → utils.js fallbacks → native DOM properties

## ✅ Recent Achievements

- **70/82 nodes successfully transpiled** (85% success rate)
- **Prism WASM parser fully functional**
- **Real AST node extraction working**
- **Modular architecture implemented** (5-file split)

## 🐛 Current Issues

### 1. **JavaScript Syntax Error** (CRITICAL)
Generated code produces:
```javascript
const container = A.new({;  // ❌ Missing closing brace
```
Should be:
```javascript
const container = A.new({
  // properties
});
```

### 2. **Incomplete Hash Object Generation**
CallNodes like `attach: 'body'` are transpiled as `attach();` instead of being part of the hash structure.

## 🏗️ New Modular Architecture

The transpiler is now split into **5 specialized modules**:

### 1. `ruby_parser_manager.js`
- **Purpose:** Interface with Prism WASM
- **Functions:** `parseRubyCode()`, `initializePrism()`
- **Status:** ✅ Working

### 2. `code_generator.js`
- **Purpose:** JavaScript code generation
- **Functions:** `generateA_newCall()`, `generateHashObject()`, `fixSyntaxErrors()`
- **Status:** 🔧 Needs implementation

### 3. `ruby_handlers.js`
- **Purpose:** Ruby node type handlers
- **Functions:** `transpileLocalVariableWrite()`, `transpileCallNode()`, etc.
- **Status:** 🔧 Needs refactoring from orchestrator

### 4. `transpiler_core.js`
- **Purpose:** Main transpilation logic
- **Functions:** `transpilePrismNode()`, `transpilePrismASTToJavaScript()`
- **Status:** 🔧 Needs extraction from orchestrator

### 5. `squirrel_orchestrator.js`
- **Purpose:** Coordination and public API
- **Functions:** Main entry points and module coordination
- **Status:** 🔧 Needs simplification

## 📋 TODO List

### Phase 1: Module Creation (URGENT)
1. **Create `ruby_parser_manager.js`**
   - Extract Prism interface functions
   - Clean API for AST parsing

2. **Create `code_generator.js`**
   - Fix JavaScript syntax generation
   - Implement proper hash object building
   - Add syntax error detection/correction

3. **Create `ruby_handlers.js`**
   - Extract all node handlers from orchestrator
   - Implement missing node types
   - Fix CallNode→hash property mapping

4. **Create `transpiler_core.js`**
   - Extract main transpilation loop
   - Implement proper AST traversal
   - Add error handling

5. **Refactor `squirrel_orchestrator.js`**
   - Remove extracted code
   - Keep only coordination logic
   - Maintain backward compatibility

### Phase 2: Bug Fixes (HIGH PRIORITY)
1. **Fix syntax errors in generated JavaScript**
2. **Implement proper hash object construction**
3. **Map CallNodes to hash properties correctly**
4. **Add missing closing braces/brackets**

### Phase 3: Enhancement (MEDIUM PRIORITY)
1. **Add comprehensive error handling**
2. **Implement missing Ruby node types**
3. **Optimize performance**
4. **Add debugging tools**

## ❗ Core Problem

While we can access the Prism WASM module that parses Ruby code, we currently struggle to properly extract the AST nodes from WASM memory. The `pm_parse` function returns a pointer to the parsed result, but we must understand how to navigate the memory structure to retrieve actual Ruby nodes like `DefNode`, `CallNode`, `ClassNode`, etc.

**UPDATE:** This is largely solved - we can extract 85% of nodes correctly. The main issue is now JavaScript generation quality.

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

## 🔧 Prism Minimal Standalone Setup

We must reinstall Prism with a **minimalist setup**. This involves rewriting `install_prism.sh` so that:

* It no longer contains **any JavaScript code**.
* It **only performs downloads** of the required files.
* All JavaScript code currently embedded in the script must be extracted and provided separately as `.js` files.
* These files must be organized as follows:
  * `./squirrel/parser/` → contains all Prism-related downloaded files.
  * `./squirrel/` → contains our custom project files.

This ensures a clean separation of responsibilities and simplifies both the installation process and the structure of the project.

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

**Do not add any code in index.html**

## 📦 Ruby Code Entry Point

The Ruby source to be transpiled is located in:
```
/application/index.sqr
```

## 📁 Project Tree

```
├── a
│   ├── a.js
│   ├── apis.js
│   └── particles
│       ├── dimension.js
│       └── identity.js
├── application
│   ├── index.sqr
│   ├── require_test.sqr
├── css
│   └── styles.css
├── index.html
├── native
│   └── utils.js
├── readme.md
├── squirrel
│   ├── code_generator.js           ← NEW
│   ├── parser
│   │   ├── browser_wasi_shim.js
│   │   ├── deserialize.js
│   │   ├── nodes.js
│   │   ├── prism.wasm
│   │   └── visitor.js
│   ├── prism_helper.js
│   ├── prism_parser.js
│   ├── ruby_handlers.js            ← NEW
│   ├── ruby_parser_manager.js      ← NEW
│   ├── squirrel_orchestrator.js    ← REFACTORED
│   ├── squirrel_runner.js
│   ├── transpiler_core.js          ← NEW
│   └── wasi_wrapper.js
├── tests
│   └── tests.js
```

## 🎯 Immediate Next Steps

1. **Create the 5 new module files** with extracted functionality
2. **Fix JavaScript syntax generation** to produce valid code
3. **Test the modular architecture** with the existing Ruby code
4. **Ensure all 82 nodes transpile correctly** to valid JavaScript

All comments and logs must be in English.