# Critical File-Size Inventory — 2026-07-14

Status: Actif — remediation register.
Authority: `todo/cleanup_architecture/file_size_and_coding_standards_remediation.md` and the active `.codex` coding standards.

## Measurement

The active-source scope is `eVe`, `atome/src`, `server`, `platforms/desktop-tauri/src`, and `platforms/web`, excluding dependencies, generated build targets, and vendored code.

| Threshold | Files |
| --- | ---: |
| >300 lines | 367 |
| >500 lines | 54 |
| >800 lines | 28 |
| >1000 lines | 23 |

No file in the >1000 set may receive feature growth before its assigned reduction work starts.

## >1000-line reduction register

| Canonical owner | Current files | Required stable boundary |
| --- | --- | --- |
| Tauri server composition | `platforms/desktop-tauri/src/server/mod.rs` (5764) | Separate route registration by domain, WebSocket lifecycle, media/file handling, request authentication, and app bootstrap; preserve `AppState` as one explicit dependency boundary. |
| Fastify cloud server composition | `server/server.js` (4646) | Split route registration, WebSocket protocol setup, static/bootstrap setup, environment loading, and server lifecycle; reuse existing route modules instead of duplicating protocol logic. |
| Tauri Atome persistence | `platforms/desktop-tauri/src/server/local_atome.rs` (3736) | Separate event commit/projection, read/query, sync queue/retry, schema initialization, and WebSocket/HTTP adapter concerns while retaining one local persistence owner. |
| Tauri authentication | `platforms/desktop-tauri/src/server/local_auth.rs` (1718) | Separate credential/session, account mutation, recovery/OTP, and route adapter layers without creating a second local auth authority. |
| Bevy WASM binding | `atome/src/wasm/squirrel_bevy_renderer.js` (2949) | Treat as generated binding output: identify and maintain its generator/source contract, regenerate rather than hand-split, and document the justified generated-artifact exception. |
| Lyrix application bootstrap | `atome/src/application/lyrix/index.js` (3451) | Keep entry bootstrap only; move feature wiring, global exposure, lifecycle listeners, and platform setup to existing Lyrix domain owners. Remove stale commented plans during the split. |
| Lyrix display | `atome/src/application/lyrix/src/features/lyrics/display.js` (4350) | Split rendering, playback synchronization, animation/layout, and interaction/state translation; preserve one lyrics-display coordinator. |
| Lyrix UI | `atome/src/application/lyrix/src/components/ui.js` (2078) | Split shell composition, reusable controls, modal/notification glue, and feature-specific handlers. |
| Lyrix settings | `atome/src/application/lyrix/src/components/settings.js` (1872) | Split settings data model, persistence, panel projection, and audio/MIDI command adapters. |
| Lyrix song-library modal | `atome/src/application/lyrix/src/components/songLibraryModal.js` (1426) | Split library query/model, modal projection, and selection actions. |
| Lyrix import | `atome/src/application/lyrix/src/features/import/dragDrop.js` (1107) | Split browser drop parsing, file validation, storage import, and UI feedback. |
| Jeezs application | `atome/src/application/jeezs/index.js` (2611) | Establish a thin application entrypoint and move independent panels, data operations, and event bindings to feature modules. |
| aBox application | `atome/src/application/aBox/index.js` (1282) | Split app bootstrap, monitoring integration, list/model logic, and UI event wiring. |
| iOS file-browser example | `atome/src/application/examples/ios_file_browser.js` (2191) | Decompose into file navigation, native bridge, preview, and UI fixture modules; keep it isolated from production boot. |
| Menu example | `atome/src/application/examples/menus.js` (1642) | Decompose into menu model, example actions, and rendering fixture; do not duplicate production menu ownership. |
| Video-recording UI example | `atome/src/application/examples/record_video_UI.js` (1521) | Decompose capture state, permissions, recording transport, and projection fixture; reuse canonical media APIs. |
| Messages example | `atome/src/application/examples/messages.js` (1299) | Split message model/transport demo from UI fixture. |
| Share UI example | `atome/src/application/examples/share_ui.js` (1116) | Split share request model, canonical API use, and UI fixture. |
| Calendar UI example | `atome/src/application/examples/calendarUI.js` (1112) | Split calendar data adapter, example actions, and UI fixture. |
| Messages UI example | `atome/src/application/examples/messages_ui.js` (1109) | Split presentation fixture from message scenario setup. |
| AI example | `atome/src/application/examples/AI.js` (1099) | Split prompt/command scenario setup from UI fixture; route all tool actions through the canonical runtime. |
| Atome research artifact | `eVe/R&D/ATG.js` (1130) | Classify as actively maintained research with a bounded module split, or archive/delete after reference and runtime-use verification; it must not remain unowned executable source. |

## Execution order and validation

1. Tauri server, Fastify server, and local Atome persistence first because they own commit, storage, and runtime boundaries.
2. Generated binding provenance second; do not hand-edit generated WASM glue.
3. Lyrix/Jeezs/aBox applications, then examples and R&D after import/use audits.

Every reduction task must run its narrowest owner tests, `npm run check:syntax`, the relevant persistence/rendering guardrails, and `cargo check` for touched Rust. Update `CODEMAP`, `API_MAP`, `ARCHITECTURE_MAP`, and `DESIGN_MAP` only where ownership actually changes.

## Completed extraction

- 2026-07-14: remote-control status projection moved from `server/mod.rs` to `server/remote_control.rs`. The public route and authorization boundary are unchanged; only route composition remains in the bootstrap module. Rust formatting, repository diff checks, and `cargo check --manifest-path platforms/desktop-tauri/Cargo.toml --features bevy_renderer_core` pass.
