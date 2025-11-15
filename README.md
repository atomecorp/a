# 🐿️ Squirrel Framework

> Hybrid audio-first toolkit that mixes Vanilla JS + Squirrel UI DSL, a Node/Fastify toolchain, and a Rust/Tauri runtime to target web, desktop, and AUv3 hosts with a single codebase.

## Overview

Squirrel provides a declarative UI DSL (exposed as plain JavaScript) that drives custom components, WaveSurfer integrations, and drag‑and‑drop workflows. The desktop shell is powered by Tauri 2, which embeds both a Rust (Axum) micro server and the Node/Fastify stack so that the same `/api/uploads` and static assets work across dev servers, packaged apps, and AUv3 extensions. A parallel iPlug2 pipeline shares the DSP core with AUv3 and WebAudio Module (WAM) builds.

## Architecture at a glance

| Layer | Purpose | Default ports / paths |
| --- | --- | --- |
| **Squirrel Frontend** (`src/application`) | Builds views via `$()` helpers, handles drag/drop, WaveSurfer timelines, and DSL-generated components. | Runs inside the browser, the Tauri webview, or WKWebView for AUv3. |
| **Fastify server** (`server/server.js`) | Serves static files during development, exposes `/api/uploads` backed by `src/assets/uploads`, proxies DB access (PostgreSQL via Objection/Knex). | `http://127.0.0.1:3001` |
| **Axum server in Tauri** (`src-tauri/src/server`) | Mirrors the same API when the app runs inside Tauri, persisting uploads under the sandbox (`~/Library/Containers/.../uploads`). | `http://127.0.0.1:3000` |
| **Tauri host** (`src-tauri`) | Launches the Axum server, makes sure Fastify is running (spawning it if needed), and exposes the port to the frontend. | Native desktop bundle. |
| **DSP / AUv3 / WAM** (`src/core`, `src/au`, `src/web`, `src-Auv3`) | Shared C++ DSP core compiled via the root CMake superbuild, surfaced either as an AUv3 (iPlug2) or as a WebAudio Module bridge. | Depends on the chosen target. |

## Key capabilities

- **Declarative UI DSL** – Build interfaces entirely in JS using Squirrel selectors (no raw HTML/CSS edits).
- **Drag & drop uploads** – `src/application/aBox/index.js` streams blobs to `/api/uploads`, refreshes metadata, and offers one-click downloads.
- **Multi-runtime parity** – Fastify (Node) and Axum (Rust) implement the same endpoints, so Tauri/AUv3 and the browser stay aligned.
- **Audio tooling** – WaveSurfer components, GSAP animations, Tone.js helpers, and the shared iPlug2 DSP core.
- **Automation scripts** – `run.sh` installs deps, configures PostgreSQL DSNs, launches Fastify + Tauri, or builds production bundles.

## Prerequisites

- Node.js 18+ and npm
- Rust toolchain + `@tauri-apps/cli` (installed automatically via devDependencies)
- macOS toolchain for AUv3 (Xcode 15+, Command Line Tools, codesigning identities)
- CMake + Ninja/Make for the DSP superbuild
- PostgreSQL (optional, needed for features hitting Objection/Knex) – `run.sh` writes a default DSN to `.env`
- `brew install ripgrep` is handy for searching, but not required by the build

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Run only the Fastify backend (dev web)

```bash
npm run start:server
```

This serves `src/` at `http://127.0.0.1:3001`, exposes `/api/uploads`, and uses `src/assets/uploads` as the storage root.

### 3. Launch only the Tauri shell

```bash
npm run tauri dev
```

Tauri embeds the Axum server on port `3000`, points the webview to the same `src/` assets, and spawns Fastify if it is not already running.

### 4. Orchestrated workflow

```bash
./run.sh              # installs deps (if needed), starts Fastify + Tauri
./run.sh --force-deps # forces dependency reinstall before launch
./run.sh --prod       # builds frontend + tauri bundle, mounts the dmg
```

`run.sh` also ensures `ADOLE_PG_DSN` (or equivalent) exists by generating `postgres://postgres:postgres@localhost:5432/squirrel` when nothing is configured.

### 5. Production bundles & packages

```bash
npm run build          # rollup build for npm package
npm run build:cdn      # minimized UMD bundle for CDN
npm run build:all      # npm + CDN builds
npm run tauri build    # production desktop bundle (also invoked by ./run.sh --prod)
```

### 6. Tests & utilities

```bash
npm run test           # vitest
npm run scan:components
npm run check:syntax
```

## Upload workflow

1. `DragDrop.createDropZone` in `src/application/aBox/index.js` collects dropped files.
2. Each file is sent as `application/octet-stream` with an `X-Filename` header to `/api/uploads`.
3. The server (Fastify or Axum) sanitizes the filename, resolves collisions, writes to disk, and responds with `{ success: true, file }`.
4. `fetchUploadsMetadata` polls `/api/uploads` to rebuild the list; clicking an entry triggers `/api/uploads/:file` for download.

> **Storage paths**
>
> - **Fastify (Node)**: saves under `src/assets/uploads` relative to the repo root.
> - **Tauri/Axum**: saves under the app’s sandbox (`~/Library/Containers/.../uploads`). When the UI runs inside AUv3 or the packaged app, inspect that path instead of the repo folder.

## Repository tour

```
src/
├── application/            # Squirrel UI modules (aBox, intuition toolbox, etc.)
├── assets/                 # Shared media + uploads (dev)
├── core/                   # DSP building blocks shared with AUv3/WAM
├── squirrel/               # Spark runtime, component registry
├── js/, css/, web/         # Third-party libs bundled with the UI
├── index.html              # Entry point consumed by Squirrel (never edited directly)
src-tauri/
├── src/main.rs             # Tauri bootstrap + server launch
├── src/server/             # Axum router, uploads handler, static serving
src-Auv3/                   # iPlug2 AUv3 host + Swift UI bridge
server/server.js            # Fastify server used outside of Tauri
scripts_utils/              # Helper scripts run by run.sh (dependencies, Fastify, Tauri)
documentations/             # Detailed guides (AUv3, deployment, squirrel usage, etc.)
Problems solving/, audit&bench/, R&D/  # Notes, experiments, benchmark reports
```

## DSL ⇄ Rust ⇄ JavaScript pipeline

- The DSL authoring style mirrors `box`, `text`, and other primitives (`documentations/using_squirrel.md`).
- `src-tauri/src/server/mod.rs` demonstrates how nodes are parsed, sanitized, and exposed to the frontend.
- The Rust snippet below shows the simplified data flow used in the docs:

```rust
pub fn parse_dsl() -> Vec<String> {
    let mut node = Node::new("note", "text");
    node.set("content", json!("✎ Edit me inline"));
    node.set("editable", json!(true));
    vec![node.to_js()]
}
```

The generated JS is still plain ES modules and ends up calling helpers like `createNode` or `$()` so it can run unchanged whether the app is embedded in a browser, in Tauri, or inside the AUv3 WebView.

## Audio plugins, AUv3, and WAM

- The root `CMakeLists.txt` builds shared targets: `dsp_core`, `ring_buffer`, `disk_reader`.
- `src/au` exposes the DSP parameters to iPlug2; `src/web` exposes the same graph to a WebAudio Module stub, and `src-Auv3/iplug/AUViewController.swift` renders the Squirrel UI via WKWebView.
- `auv3.sh`, `build_PWA_app.sh`, and `scripts_utils/run_fastify.sh`/`run_tauri.sh` automate packaging for each runtime.
- Known limitations (see `Problems solving/`): disk streaming is a placeholder, time-stretch hooks exist but need concrete implementations, and the WAM glue is still minimal.

## Documentation & references

- `documentations/auv3_deployment.md` – steps to package and notarize the AUv3 build.
- `documentations/auv3_webview_audio_injection.md` – explains audio injection between WKWebView and the DSP core.
- `documentations/button_usage.md`, `components.md` – showcase the Squirrel component DSL.
- `documentations/tempo_regression_fix.md`, `Problems solving/*.md` – recent fixes and investigation logs.

Keep the README in sync with these guides when the build, runtime ports, or upload behavior change.# 🐿️ Squirrel Framework

## 🎯 Overview

Modern hybrid framework combining the flexibility of an ES6 module system, audio processing capabilities with  Rust performance via Tauri.

## 🏗️ Architecture

### **Frontend (JavaScript + Audio)**

- **Squirrel Framework** - ES6 modular system with dynamic loading
- **WebComponent** -   Slider, Matrix, intuition ...
- **Tauri Integration** - Native desktop application

### **Backend (Rust)**

- **Axum Server** - High-performance API
- **Fastify Server** - Static file server
- **Tauri Runtime** - Native desktop integration

## 🚀 Quick Start

```bash
# Full development
./dev.sh

# Or step by step
npm install             # Install dependencies (includes WaveSurfer.js)
npm run start:server    # Fastify server
npm run tauri dev       # Tauri application
```

## 📁 Structure

```
src/
├── application/
│   ├── index.js        # Framework exports (includes WaveSurfer)
│   └── examples/
│       ├── wavesurfer.js    # 5 WaveSurfer examples
│       └── audio-workstation.js  # Advanced integration
├── a/
│   └── components/
│       ├── Module.js   # Draggable modules
│       ├── Slider.js   # Interactive sliders
│       ├── Matrix.js   # Grid components
│       └── WaveSurfer.js    # Audio waveform component ✨
├── assets/audios/      # Audio files for testing
└── index.html          # Main interface

demos:
├── demo-wavesurfer.html      # Interactive demonstration
├── audio-workstation.html    # Professional audio interface
└── test-wavesurfer.html      # Integration validation
```

- **Performance**: Rust handles critical tasks, JavaScript manages the UI—resulting in high overall performance.
- **Flexibility**: The scripting language enables intuitive, powerful code with advanced metaprogramming capabilities.
- **Interoperability**: A performant bridge between frontend and backend leverages each technology’s strengths.

## Minimal DSL Example (Editable Text Inline, Events, Metaprogramming)

```text
page = box(id: :main, width: :full, height: :full, attach: :body)


## Minimal DSL Example (Editable Text Inline, Events, Metaprogramming)

```text
page = box(id: :main, width: :full, height: :full, attach: :body)

note = text(id: :note,
   content: "✎ Edit me inline",
   editable: true,         # maps to contenteditable
   draggable: true,
   left: 88,
   top: 88,
   style: { font_size: 20, color: :blue })

note.on(:key_down) do |e|
  puts "Key: #{e[:key]}"
end

note.define_method(:highlight) do
  self[:color] = :red
end

note.instance_var_write(:saved_text, "Initial value")

puts note.instance_var_read(:saved_text)        # -> "Initial value"
puts note.respond_to?(:highlight)               # -> true
puts note.inspect                               # -> full DSL object dump

# Call to a Rust backend function for a heavy computation
data = { name: "John", age: 42 }
result = rust(:process_data, data)
puts "Rust response: \#{result}"

```

# Rust Parser and Backend for DSL

This file contains the minimal Rust code to:

- Parse a simple DSL object
- Convert it into JavaScript
- Handle a backend method `process_data` exposed to Tauri frontend

---

## Node Parser and JS Generator

```rust
use serde_json::json;
use std::collections::HashMap;

// Simulate a simple node structure for UI elements
#[derive(Debug)]
struct Node {
    id: String,
    element_type: String,
    properties: HashMap<String, serde_json::Value>,
}

impl Node {
    fn new(id: &str, element_type: &str) -> Self {
        Node {
            id: id.to_string(),
            element_type: element_type.to_string(),
            properties: HashMap::new(),
        }
    }

    fn set(&mut self, key: &str, value: serde_json::Value) {
        self.properties.insert(key.to_string(), value);
    }

    fn to_js(&self) -> String {
        let props = serde_json::to_string(&self.properties).unwrap();
        format!("createNode('{}', '{}', {});", self.id, self.element_type, props)
    }
}

// DSL instruction handler (simplified)
pub fn parse_dsl() -> Vec<String> {
    let mut node = Node::new("note", "text");
    node.set("content", json!("✎ Edit me inline"));
    node.set("editable", json!(true));
    node.set("draggable", json!(true));
    node.set("left", json!(88));
    node.set("top", json!(88));
    node.set("style", json!({ "font_size": 20, "color": "blue" }));
    vec![node.to_js()]
}
```

---

## Backend Method for Heavy Processing

```rust
pub fn process_data(data: HashMap<String, serde_json::Value>) -> String {
    let name = data.get("name").unwrap_or(&json!("unknown"));
    let age = data.get("age").unwrap_or(&json!(0));
    format!("Processed user {} aged {}", name, age)
}
```

<!-- This backend module can be imported and exposed via `tauri.conf.json` to allow communication from the DSL/frontend.-->

# JavaScript Output from DSL Parser (Full UI Interaction)

This file contains the full JavaScript auto-generated by the DSL-to-JS Rust parser.
It includes:

- Creation of a `div` for text with `contenteditable`
- Drag and drop
- Keyboard event capture
- Dynamic style application
- A simulated `.highlight()` method

```js
// dsl_generated.js — Auto-generated from DSL parser in Rust

function createNode(id, type, props) {
  const el = document.createElement(type === "text" ? "div" : type);
  el.id = id;

  if (props.content) el.textContent = props.content;
  if (props.editable) el.contentEditable = true;

  el.style.position = "absolute";
  if (props.left !== undefined) el.style.left = props.left + "px";
  if (props.top !== undefined) el.style.top = props.top + "px";

  if (props.style) {
    Object.entries(props.style).forEach(([key, value]) => {
      const cssKey = key.replace(/_/g, "-");
      el.style[cssKey] = typeof value === "number" ? value + "px" : value;
    });
  }

  if (props.draggable) {
    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", id);
    });
  }

  // Add keyboard interaction capture
  el.addEventListener("keydown", (e) => {
    console.log("Key pressed:", e.key);
    if (e.key === "r") el.style.color = "red"; // test behavior
  });

  // Optional: highlight method (simulate DSL-defined method)
  el.highlight = () => {
    el.style.color = "red";
  };

  document.body.appendChild(el);
  return el;
}

// DSL output simulated from Rust
createNode("note", "text", {
  content: "✎ Edit me inline",
  editable: true,
  draggable: true,
  left: 88,
  top: 88,
  style: {
    font_size: 20,
    color: "blue"
  }
});
```

You can embed this file into an HTML file to test behavior directly in the browser.

---

This document serves as a guide for engineers or development teams to implement the full solution described.

## iPlug2 Minimal Integration (AUv3 + WAM)

- New CMake superbuild at project root to aggregate targets.
- Dependency: iPlug2 via `cmake/deps/iplug2_fetch.cmake` or `tools/update_iplug2.sh` (submodule alternative).
- Core DSP in `src/core`: `dsp_core`, `ring_buffer`, `disk_reader` (render-safe: no locks/allocs/I/O).
- AUv3 glue in `src/au`: headless iPlug2 plugin exposing parameters gain/play/positionFrames.
- Web glue in `src/web`: WAM entry stub + `app.js` Squirrel UI. No HTML/CSS modified.
- Swift WKWebView bridge in `src-Auv3/iplug/AUViewController.swift` using `squirrel` message channel.

Build notes

- Desktop (skeleton): configure with CMake to build `dsp_core`, `atome_au` (Apple), `atome_wam` (with Emscripten when `-DATOME_BUILD_WAM=ON`).
- iOS/macOS AUv3: integrate CMake targets into Xcode project or build an xcframework. AU view is provided by `AUViewController.swift`.
- Web WAM: build with emsdk toolchain; UI is `src/web/app.js` (Squirrel-style JS) controlling parameters only.

Limitations (Step 1)

- DiskReader generates silence placeholder; replace with AVAudioFile/AVAssetReader on Apple.
- No time-stretch yet; hook is in `DSPCore::processTimeStretch`.

Next steps

- Implement Apple disk decoding, WAM node glue, and Xcode wiring.
