# 🐿️ atome Framework Squirrel version

> This repository (`a`, codename **Squirrel**) is the next-generation evolution of the original Atome Ruby framework and is still under active development. It is a work in progress, but not a mere proof of concept: it serves as the base for the fully functional solution. The roadmap includes a FreeBSD boot mode leveraging jails to provide connected, shareable environments that sync seamlessly online/offline (with robust conflict resolution), plus the same unified, agnostic object system that made classic Atome unique.
> Atome (Squirrel version) is a full-stack, cross-platform creation framework aimed at building entire ecosystems: from multimedia operating-system-like experiences, audio/video editors, web apps, and services, down to tiny personal utilities or educational playgrounds.
> Hybrid agnostic and multi purpose-first toolkit that mixes Vanilla JS + Squirrel UI DSL, a Node/Fastify toolchain, and a Rust/Tauri runtime to target web, desktop,mobile and even AUv3 hosts with a single codebase.

## Overview

Squirrel provides a declarative UI DSL (expressed as plain JavaScript) that drives custom components, media tooling, and drag-and-drop workflows. The authoring syntax is intentionally Ruby-like (symbols, method blocks, `box/text` primitives) but compiles down to vanilla JS so it can run everywhere. The desktop shell is powered by Tauri 2, which embeds both a Rust (Axum) micro server and the Node/Fastify stack so that the same `/api/uploads` and static assets work across dev servers, packaged apps, and AUv3 extensions. Audio now uses the native CPAL/Kira path on Tauri, the Swift native AUv3 engine on iOS, and the WebAssembly/WebAudio path in browser contexts.

## Architecture at a glance

| Layer | Purpose | Default ports / paths |
| --- | --- | --- |
| **Squirrel Frontend** (`src/application`) | Builds views via `$()` helpers and DSL-generated components. | Runs inside the browser, the Tauri webview, or WKWebView for AUv3. |
| **Fastify server** (`server/server.js`) | Serves static files during development, exposes `/api/uploads` backed by `src/assets/uploads`, handles DB access (SQLite/libSQL via ADOLE). | `http://127.0.0.1:3001` |
| **Axum server in Tauri** (`src-tauri/src/server`) | Mirrors the same API when the app runs inside Tauri, persisting uploads under the sandbox (`~/Library/Containers/.../uploads`). | `http://127.0.0.1:3000` |
| **Tauri host** (`src-tauri`) | Launches the Axum server, makes sure Fastify is running (spawning it if needed), and exposes the port to the frontend. | Native desktop bundle. |
| **Audio runtime** (`engines/audio/core`, `platforms/web/audio-wasm`, `platforms/ios/atome-auv3`) | Shared native recorder utilities, browser audio WASM, and Swift AUv3 audio host code. | Depends on the chosen target. |

## Key capabilities

- **Declarative UI DSL** – Build interfaces entirely in JS using Squirrel selectors (no raw HTML/CSS edits).
- **Drag & drop uploads** – `src/application/aBox/index.js` streams blobs to `/api/uploads`, refreshes metadata, and offers one-click downloads.
- **Multi-runtime parity** – Fastify (Node) and Axum (Rust) implement the same endpoints, so Tauri/AUv3 and the browser stay aligned.
- **Audio tooling** –  GSAP animations, Tone.js helpers, native CPAL/Kira audio, Swift AUv3 audio, and WebAudio/WASM browser support.
- **Automation scripts** – `run.sh` installs deps, configures SQLite paths, launches Fastify + Tauri, or builds production bundles.

## Prerequisites

- Node.js 18+ and npm
- Rust toolchain + `@tauri-apps/cli`
- macOS toolchain for AUv3 (Xcode 15+, Command Line Tools, codesigning identities)
- CMake + Ninja/Make for the DSP superbuild
- SQLite3 (included by default on macOS/Linux) – `run.sh` auto-configures the database path
- `brew install ripgrep` is convenient for searching (optional)

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

`run.sh` also ensures `SQLITE_PATH` exists by using `database_storage/adole.db` as the default database location. For cloud deployments, set `LIBSQL_URL` and `LIBSQL_AUTH_TOKEN` for Turso.

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

```text
src/
├── application/            # Squirrel UI modules (aBox, intuition toolbox, etc.)
├── assets/                 # Shared media + uploads (dev)
├── squirrel/               # Spark runtime, component registry
├── js/, css/, web/         # Third-party libs bundled with the UI
├── index.html              # Entry point consumed by Squirrel (never edited directly)
engines/
├── audio/                  # Shared DSP and native recorder support code
src-tauri/
├── src/main.rs             # Tauri bootstrap + server launch
├── src/server/             # Axum router, uploads handler, static serving
platforms/
├── atomeOS/builder/        # Atome OS FreeBSD image builder
├── web/audio-wasm/         # Browser Kira WASM audio engine source
├── ios/atome-auv3/         # Swift AUv3 host + UI bridge
├── ios/shared/             # Shared iOS support code
server/
├── server.js               # Fastify server used outside of Tauri
scripts/                    # Helper scripts run by run.sh (dependencies, Fastify, Tauri)
deploy/
├── certs/                  # Production HTTPS certificates (ignored except .gitkeep)
dev/
├── certs/                  # Local self-signed HTTPS certificates
documentations/
├── audits/                 # Audit notes, experiments, benchmark reports
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

## Audio Runtime

- The root `CMakeLists.txt` builds shared targets: `dsp_core`, `ring_buffer`, `disk_reader`.
- `platforms/web/audio-wasm` exposes the browser audio engine source, and `platforms/ios/atome-auv3` renders the Squirrel UI via WKWebView while routing audio through the Swift native AUv3 engine.
- `auv3.sh`, `build_PWA_app.sh`, and `scripts/run_fastify.sh`/`run_tauri.sh` automate packaging for each runtime.
- Known limitations (see `Problems solving/`): disk streaming is a placeholder, time-stretch hooks exist but need concrete implementations, and the WAM glue is still minimal.

## Documentation & references

- `documentations/auv3_deployment.md` – steps to package and notarize the AUv3 build.
- `documentations/auv3_webview_audio_injection.md` – explains audio injection between WKWebView and the DSP core.
- `documentations/button_usage.md`, `components.md` – showcase the Squirrel component DSL.
- `documentations/tempo_regression_fix.md`, `Problems solving/*.md` – recent fixes and investigation logs.

Keep the README in sync with these guides when the build, runtime ports, or upload behavior change.
