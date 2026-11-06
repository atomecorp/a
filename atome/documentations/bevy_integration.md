# Bevy Integration

## Status

Bevy is the browser/WASM project renderer of every visible WebView project projection (Web, Tauri, iOS/AUv3), built from the shared Atome Bevy core. Tauri has no native Bevy renderer: its standalone Bevy window (`bevy_renderer_native`, `platforms/desktop-tauri/src/bevy_backend/`) was never presented and was removed on 2026-11-06 (user decision).

The browser project rendering path is:

```text
canonical Atome record -> RenderAtom / Virtual Scene -> Bevy projection adapter -> browser Bevy WASM renderer
```

The Tauri and iOS visible WebView project rendering path is:

```text
canonical Atome record -> RenderAtom / Virtual Scene -> Bevy projection adapter -> Bevy WASM renderer -> WebGPU canvas
```

The Bevy backend consumes the existing renderer-agnostic virtual scene contract instead of becoming a parallel Atome state model. WebView project rendering starts one Bevy app on the existing shared project canvas and applies Virtual Scene diffs through explicit WASM exports.

## Version

The Bevy version is declared once, in the root workspace manifest:

```text
Cargo.toml   [workspace.dependencies]
```

Current pinned dependency:

```toml
bevy = { version = "0.19.0", default-features = false }
```

`default-features = false` keeps setup progressive: the wrapper (`platforms/web/bevy-renderer`) and the shared core enable only the Bevy features they use, without a second active audio stack.

## Setup

After a clean clone, run:

```bash
./setup.sh
```

The setup wrapper delegates to the existing bootstrap flow in `scripts/setup/bootstrap.sh`. That flow verifies or installs the repository prerequisites according to the current platform conventions:

- Node.js and npm;
- Git and curl;
- Rust and Cargo;
- rustup when available;
- local JavaScript dependencies;
- local Tauri CLI;
- Tauri Cargo metadata resolution.

No global Bevy binary is installed. Bevy is resolved by Cargo from the root workspace manifest.

For a non-launching audit path, run:

```bash
./setup.sh --audit
```

## Validation

`npm run check:rust` checks the shared core and its wrapper: clippy on `atome-bevy-renderer-core` and `squirrel-bevy-renderer` for `wasm32-unknown-unknown` (and on `atome-ios-bevy-renderer`, the iOS audio and local-server staticlib, for iOS), and the core's own tests (`cargo test -p atome-bevy-renderer-core`).

## Update

To update Bevy:

```bash
cargo update -p bevy
npm run check:rust
```

If the intended Bevy version changes, update `[workspace.dependencies]` in the root `Cargo.toml`, then regenerate the root `Cargo.lock` through Cargo.

The broader repository update flow still runs through:

```bash
npm run update:libs
```

That flow invokes the existing dependency refresh script, which includes the workspace's Rust dependency updates when Cargo is available.

## Contract

The shared Bevy rendering contract lives in:

```text
atome/renderers/bevy-core/
```

It defines:

- `AtomeRenderScene`: the explicit scene payload consumed by native and browser Bevy wrappers;
- `AtomeRenderNode`: a disposable projection node derived from canonical Atome data;
- `AtomeRenderOp`: the shared diff/update contract for spawn, despawn, transform, style, layer, resource, and surface changes;
- `AtomeEntityId`, `AtomeLogicalSize`, `AtomeLogicalPosition`, `AtomeLayer`, and related ECS components;
- `AtomeBevyRendererPlugin`: the shared Bevy plugin installed by the browser/WASM wrapper.

The platform wrapper lives in:

```text
platforms/web/bevy-renderer/
```

It owns canvas/window/runtime setup only. It must not duplicate projection, spawn, texture, render-op, or selection-overlay logic that belongs in the shared Atome crate.

The JavaScript renderer always uses the visible Bevy WebGPU canvas, on Tauri and iOS too: its native route (`bevy_native_renderer_runtime.js`, `bevy_native_texture_mapping.js`), never selected because no host declared a presentable native renderer, was removed on 2026-11-06, and Tauri no longer answers the native commands. iOS and the AUv3 draw through the same Web renderer WASM inside their WebView. Their Swift native command boundary (`AppNativeBevyRendererController.swift`, `bevy_native_*`) was removed on 2026-11-06, and so was the iOS staticlib's Bevy probe ABI (`atome_ios_bevy_renderer_status`, `atome_ios_bevy_scene_probe`, `Common/AtomeIosBevyRendererBridge.h`) with its `atome-bevy-renderer-core` dependency: `platforms/ios/bevy-renderer` (crate and library names kept for the Xcode link) now holds only the native audio engine and the local server, and links no Bevy.

The source of truth remains outside Bevy:

- Atome id remains immutable canonical identity.
- Logical position maps to `Transform.translation`.
- Logical size maps to a projection component, not durable state.
- Parent and layer values are projection inputs from the Atome rendering contract.
- Drag and resize must continue to commit through `window.Atome.commit` or `window.Atome.commitBatch`.
- Resize must keep logical scene coordinates, CSS size, canvas buffer size, and device pixels separate.

## Limits

This integration does not:

- add a canvas per Atome;
- create a new DOM route;
- create a second source of truth for Atome geometry;
- enable `bevy_audio`;
- keep video, SVG, text, image, and waveform display on the browser Bevy texture route without reactivating a legacy project renderer.

The browser bridge from `eVe/domains/rendering/virtual_scene_contract.js` into the Bevy WASM payload now lives in `eVe/domains/rendering/bevy_projection_adapter.js`. Browser startup and diff dispatch against the generated `atome/src/wasm/squirrel_bevy_renderer.js` module lives in `eVe/domains/rendering/bevy_web_renderer_runtime.js` and is limited to one Bevy app per shared canvas. No JavaScript native dispatch remains (removed 2026-11-06).

The web renderer now exposes wasm-bindgen diff exports for spawn, despawn, transform, style, reparent, layer, visibility, text metadata, and resource updates. `project_scene_runtime.js` consumes those exports through `diffVirtualSceneTrees(...)` so project Atome projection enters Bevy without restarting the app for each mutation.

Text, image, SVG, video, and audio waveform records are decoded by `eVe/domains/rendering/bevy_media_texture_resolver.js` into non-visible RGBA textures, then consumed by Bevy as `Image` assets attached to sprite entities. The decode elements are disposable browser resources only; final display remains Bevy/WebGPU on the shared canvas. RenderAtom content projection canonicalizes uploaded and recorded media sources through the shared media source contract before Bevy receives them, so browser-relative filenames are not emitted as renderer input. Video textures seek to a representative source frame and prime muted frame presentation before RGBA readback, avoiding black initial frames while keeping final display in Bevy. Audio waveforms use canonical peak projection data when present; inline peaks can generate the Bevy waveform texture without requiring a media URL, and imported audio without peaks is decoded from the normalized audio source to derive real waveform peaks before texture generation. Direct WAV recording stores those peaks before Bevy texture generation. Pending recording Atomes without a source are not projected to Bevy until the committed media source is available. Bevy audio remains disabled; Kira stays the only audio engine.

## Browser Media Route

Browser media support is now texture-driven:

- Text, raster images, SVG documents, video frames, and audio waveforms must provide explicit `{ width, height, rgba }` texture data in the Bevy payload.
- The Rust/WASM renderer creates Bevy `Image` assets from that RGBA data and never loads media through a visible DOM node or legacy project renderer.
- Missing media source or missing texture data is an explicit integration error.
- Kira remains the only audio engine; `bevy_audio` is not enabled.
