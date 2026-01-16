## Copilot Context / Project Rules

# Essentials — Non‑negotiable Rules (Sync, Atome Creation, Coding)

This document consolidates the **must‑follow rules** found in the documentation folders:

- documentations/
- src/application/eVe/documentations/

It focuses on **sync**, **atome creation**, and **general coding rules**.

---

## first rules : Never use fallback

- **Fallbacks are forbidden.** If something is broken or missing, **fix it** instead of using a fallback.

---

## 1) Single Mutation Pipeline (Sync is strict)

- **Frontend must not call** `window.AdoleAPI.atomes.*` directly.
- **Frontend must not write state directly**.
- **All user‑facing changes must go through** `window.Atome.commit` or `window.Atome.commitBatch`.
- **Snapshots are explicit** and user‑driven (`window.Atome.snapshot`), never automatic.
- **Events are append‑only**; there is **one single event log**, no separate “tools history”.
- **Current state is a projection** derived from the last snapshot + replayed events.
- **Replay must be deterministic**; if not, fail loudly.
- **All mutations must be persisted and historized** through this pipeline (tools, UI, AI, batch).

Source: src/application/eVe/documentations/tools.md

---

## 1.1) Real‑time Sync & Connectivity Rules

- **All sync communications use the single WebSocket endpoint** `/ws/sync`.
- **Tauri must work fully offline**, and **sync when Fastify becomes available**.
- **Synchronization is bidirectional** (Fastify ↔ Tauri). If one side is unavailable, **changes are queued and replayed** on reconnection.
- **Fastify never connects to Tauri**; clients always initiate connections.
- **Single realtime entry point**: all realtime sync and direct-message commands are centralized in [src/squirrel/apis/unified/UnifiedSync.js](src/squirrel/apis/unified/UnifiedSync.js) and exposed as `window.Squirrel.Sync` and `window.Squirrel.SyncEngine`.

Sources: documentations/realtime_sync_architecture.md, documentations/Adole Offline Online explanations.md

---

## 2) Atome Creation — Canonical Contract

- **Every Atome must follow the canonical shape**: `id`, `type`, optional `kind`, optional `renderer`, `meta`, `traits`, `properties`.
- **`id` is immutable**.
- **`type` is canonical** and selects the type definition (schema + traits + defaults).
- **`kind` is optional** but must be validated or derived by the server.
- **`renderer` is a UI hint only** and must not affect logical state or ACL.
- **`properties` must validate** against the type schema; unknown properties are rejected (unless explicitly allowed).

Source: documentations/atome_object.md

---

## 3) Atome Creation — Required Completeness

- `atome.create` must include **all physical characteristics** needed to replay and reconstruct the object (geometry, layout, style, media references, etc.).
- Missing essential properties makes creation **invalid for persistence/replay**.
- **Default parent rule**: if `parent_id` is omitted, the system attaches the Atome to the **current project**.
- **Immutable meta**: `meta.created_by` and `meta.created_at` cannot be changed by writes.

Source: documentations/tools_api_and_coding.md

---

## 4) Command Bus & Tool/Code Model (Non‑negotiable)

- **No direct mutations**. All writes must go through **ADOLE / Command Bus**.
- Tools and code **return intentions only** (Command Bus actions), not direct effects.
- **Every effectful action requires**: capabilities check, policy decision, audit log entry, idempotence.
- **Determinism** is mandatory: same inputs + same state => same commands.
- **Sandboxed execution**: no raw FS/network/process access.
- **Tool input is standardized** across UI/AI/Voice.

Sources: documentations/atome_object.md, documentations/code&tools.md

---

## 5) History & Time‑Travel Rules

- **History is immutable**; nothing is overwritten.
- **Property‑level timelines** are first‑class; each property has its own history.
- Two modes:
  - **Copy past state into present** (append a new version).
  - **Edit the past and replay** deterministically to create a new branch.
- **Snapshots are immutable** caches derived from canonical Atome data.
- **Validation points include snapshots** and are the only trusted restore anchors.
- **Undo / restore targets a gesture end or logical event boundary**.

Source: documentations/Adole Time Machine.md

---

## 6) Squirrel.js UI Rules (Coding Standards)

- **Always use Squirrel.js APIs** for DOM manipulation, components, and events.
- **Do not use** direct DOM APIs (`document.createElement`, `innerHTML`, manual listeners) unless explicitly required.
- **Prefer built‑in components** (e.g., `Squirrel.Slider`, `Squirrel.Button`).
- **Batch updates** with `Squirrel.batch` when possible.
- **Wait for `squirrel:ready`** before using Squirrel APIs.
- **Always use arrays for `children`**, even with a single child.
- **Use the system abstraction** (`runShellCommand`) instead of direct Node/Tauri APIs.
- **Keep comments in English**.
- **Avoid console logging** unless necessary for critical debugging.

Sources: documentations/instructions_for_ai.md, documentations/using_squirrel.md

---

## 7) Component Format Rules

- Use the **template‑based `define()` pattern** for components.
- **Import `{ $, define }`** from `../squirrel.js`.
- Component names must be **kebab‑case**.
- Favor templates for simple components; use function factories only for complex logic.

Source: documentations/components.md

---

## 8) i18n Rules (eVe)

- Use `eveT()` for every label/placeholder in new tools and dialogs.
- **No fallbacks**: missing keys must be fixed, not bypassed.
- Keep keys grouped by domain (e.g., `eve.menu.*`, `eve.user.*`).

Source: src/application/eVe/documentations/int8.md

---

## 9) Separation of Logic vs Rendering

- **Type/kind/renderer are separate concepts**:
  - `type`: canonical schema
  - `kind`: optional logical category
  - `renderer`: UI hint (DOM/WebGL/Native/etc.)
- The server **must not depend on rendering**, and ACL applies to logical particles.

Source: documentations/Eden atome Database.md

---

## 10) Sharing & Public Access Rules

- **Sharing is explicit, permission‑driven, and auditable**. No silent propagation.
- **Shared data must not be redundantly stored on the server**; access is enforced via permissions.
- **Share modes**:
  - **Real‑time (linked)**: changes propagate instantly.
  - **Manual (linked)**: local changes are pushed only when explicitly published.
  - **Detached copy (unlinked)**: one‑time copy with no further sync.
- **Property‑level permissions apply** (e.g., share read‑only for `width` so recipients cannot edit it).
- **Public visibility** is supported: some documents can be **public read** or **public write** for all eVe users.

Source: documentations/Adole_Security_and_sharing.md

---

## 11) Tools API & Automation

- Tool APIs **must persist changes and be fully historized** through the mutation pipeline.
- Tools are **programmable via APIs** for batch operations and AI control.
- **Gestures (drag, resize, rotate, etc.) must be historized with high precision** so they can be replayed like a film.

Source: src/application/eVe/documentations/tools.md

---

## 12) Ontology

- **All objects and concepts are Atomes** in eVe.

# 🐿️ atome Framework Squirrel versioj

> This repository (`a`, codename **Squirrel**) is the next-generation evolution of the original Atome Ruby framework and is still under active development. It is a work in progress, but not a mere proof of concept: it serves as the base for the fully functional solution. The roadmap includes a FreeBSD boot mode leveraging jails to provide connected, shareable environments that sync seamlessly online/offline (with robust conflict resolution), plus the same unified, agnostic object system that made classic Atome unique.
> Atome (Squirrel version) is a full-stack, cross-platform creation framework aimed at building entire ecosystems: from multimedia operating-system-like experiences, audio/video editors, web apps, and services, down to tiny personal utilities or educational playgrounds.
> Hybrid agnostic and multi purpose-first toolkit that mixes Vanilla JS + Squirrel UI DSL, a Node/Fastify toolchain, and a Rust/Tauri runtime to target web, desktop,mobile and even AUv3 hosts with a single codebase.

## Overview

Squirrel provides a declarative UI DSL (expressed as plain JavaScript) that drives custom components, WaveSurfer integrations, and drag-and-drop workflows. The authoring syntax is intentionally Ruby-like (symbols, method blocks, `box/text` primitives) but compiles down to vanilla JS so it can run everywhere. The desktop shell is powered by Tauri 2, which embeds both a Rust (Axum) micro server and the Node/Fastify stack so that the same `/api/uploads` and static assets work across dev servers, packaged apps, and AUv3 extensions. A shared iPlug2 pipeline keeps the DSP core consistent between AUv3 and WebAudio Module (WAM) builds.

## Architecture at a glance

| Layer | Purpose | Default ports / paths |
| --- | --- | --- |
| **Squirrel Frontend** (`src/application`) | Builds views via `$()` helpers and DSL-generated components. | Runs inside the browser, the Tauri webview, or WKWebView for AUv3. |
| **Fastify server** (`server/server.js`) | Serves static files during development, exposes `/api/uploads` backed by `src/assets/uploads`, handles DB access (SQLite/libSQL via ADOLE). | `http://127.0.0.1:3001` |
| **Axum server in Tauri** (`src-tauri/src/server`) | Mirrors the same API when the app runs inside Tauri, persisting uploads under the sandbox (`~/Library/Containers/.../uploads`). | `http://127.0.0.1:3000` |
| **Tauri host** (`src-tauri`) | Launches the Axum server, makes sure Fastify is running (spawning it if needed), and exposes the port to the frontend. | Native desktop bundle. |
| **DSP / AUv3 / WAM** (`src/core`, `src/au`, `src/web`, `src-Auv3`) | Shared C++ DSP core compiled via the root CMake superbuild, surfaced either as an AUv3 (iPlug2) or as a WebAudio Module bridge. | Depends on the chosen target. |

## Key capabilities

- **Declarative UI DSL** – Build interfaces entirely in JS using Squirrel selectors (no raw HTML/CSS edits).
- **Drag & drop uploads** – `src/application/aBox/index.js` streams blobs to `/api/uploads`, refreshes metadata, and offers one-click downloads.
- **Multi-runtime parity** – Fastify (Node) and Axum (Rust) implement the same endpoints, so Tauri/AUv3 and the browser stay aligned.
- **Audio tooling** –  GSAP animations, Tone.js helpers, and the shared iPlug2 DSP core.
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

Keep the README in sync with these guides when the build, runtime ports, or upload behavior change.
