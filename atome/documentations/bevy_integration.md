# Bevy Integration

## Status

Bevy is integrated as an official, feature-gated Tauri Rust dependency and as the active browser/WASM project renderer entry point for supported visible Atome projections.

The active project rendering path is:

```text
canonical Atome record -> RenderAtom / Virtual Scene -> Bevy projection adapter -> browser Bevy WASM renderer
```

The Bevy backend consumes the existing renderer-agnostic virtual scene contract instead of becoming a parallel Atome state model. Browser project rendering starts one Bevy app on the existing shared project canvas and applies Virtual Scene diffs through explicit WASM exports.

## Version

The Bevy version is declared in:

```text
platforms/desktop-tauri/Cargo.toml
```

Current pinned dependency:

```toml
bevy = { version = "0.18.1", default-features = false, optional = true }
```

The dependency is exposed through the Cargo feature:

```toml
bevy_backend = ["dep:bevy"]
```

`default-features = false` keeps setup progressive: Cargo resolves Bevy and the ECS/transform contract used by the minimal backend without enabling a second active windowing or renderer stack.

The native backend currently keeps the window-loop policy as Atome-owned Rust values that mirror Bevy `WinitSettings`, `UpdateMode`, and `PresentMode` names. Directly enabling Bevy `bevy_winit`/`bevy_window` for `0.18.1` was checked locally, but this Cargo registry state does not expose the required `bevy_a11y 0.18.x` dependency. The bridge must switch these values to Bevy's concrete types only when that dependency graph resolves cleanly.

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

No global Bevy binary is installed. Bevy is resolved by Cargo from the Tauri crate manifest.

For a non-launching audit path, run:

```bash
./setup.sh --audit
```

## Validation

Use these commands to validate the Bevy integration:

```bash
npm run cargo:metadata
npm run cargo:bevy:check
npm run cargo:bevy:test
```

`npm run cargo:bevy:check` proves that the Bevy dependency resolves and the feature-gated backend compiles.

`npm run cargo:bevy:test` proves the minimal Atome-to-Bevy mapping contract compiles and creates Bevy ECS entities from explicit projection data.

## Power Policy

The Bevy preparation backend must behave like a professional desktop application, not a continuously ticking game loop.

Primary source:

```text
platforms/desktop-tauri/src/bevy_backend/power.rs
```

Profiles are selected by:

```bash
ATOME_POWER_PROFILE=eco|balanced|performance
```

Default profile:

```text
eco
```

Profile policy:

- `eco`: focused reactive low-power updates every 5 seconds; unfocused reactive low-power updates every 60 seconds.
- `balanced`: mirrors Bevy `WinitSettings::desktop_app()`.
- `performance`: mirrors Bevy `WinitSettings::game()` and is opt-in only.

Present policy:

- `eco` and `balanced` use a capped/vsync-style `AutoVsync` policy.
- `performance` may use `AutoNoVsync`.

Redraw policy:

- Idle does not write transforms.
- Redraw requests are explicit and counted.
- Interaction, animation, resize, and external state changes may request redraw.
- Interaction temporarily raises the focused update budget to about 60 updates per second, then returns to the selected idle profile.
- Transform writes without dirty interaction/state causes are treated as ghost idle mutations.

The Rust tests verify:

- default profile is not continuous;
- idle update budgets stay low;
- performance continuous mode is opt-in;
- default present mode is capped;
- interaction temporarily raises the budget and returns to idle;
- redraw requests are explicit;
- idle transform writes are rejected without a dirty cause;
- unexpected idle position changes are detectable.

## Update

To update Bevy:

```bash
cargo update --manifest-path platforms/desktop-tauri/Cargo.toml -p bevy
npm run cargo:bevy:check
npm run cargo:bevy:test
```

If the intended Bevy version changes, update `platforms/desktop-tauri/Cargo.toml`, then regenerate `platforms/desktop-tauri/Cargo.lock` through Cargo.

The broader repository update flow still runs through:

```bash
npm run update:libs
```

That flow invokes the existing dependency refresh script, which includes Rust dependency updates for the Tauri crate when Cargo is available.

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
- `AtomeBevyRendererPlugin`: the shared Bevy plugin installed by the browser/WASM and Tauri/native wrappers.

Platform wrappers live in:

```text
platforms/web/bevy-renderer/
platforms/desktop-tauri/src/bevy_backend/
```

They own canvas/window/runtime setup only. They must not duplicate projection, spawn, texture, render-op, or selection-overlay logic that belongs in the shared Atome crate.

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

The browser bridge from `eVe/domains/rendering/virtual_scene_contract.js` into the Bevy WASM payload now lives in `eVe/domains/rendering/bevy_projection_adapter.js`. Browser startup and diff dispatch against the generated `atome/src/wasm/squirrel_bevy_renderer.js` module lives in `eVe/domains/rendering/bevy_web_renderer_runtime.js` and is limited to one Bevy app per shared canvas.

The web renderer now exposes wasm-bindgen diff exports for spawn, despawn, transform, style, reparent, layer, visibility, text metadata, and resource updates. `project_scene_runtime.js` consumes those exports through `diffVirtualSceneTrees(...)` so project Atome projection enters Bevy without restarting the app for each mutation.

Text, image, SVG, video, and audio waveform records are decoded by `eVe/domains/rendering/bevy_media_texture_resolver.js` into non-visible RGBA textures, then consumed by Bevy as `Image` assets attached to sprite entities. The decode elements are disposable browser resources only; final display remains Bevy/WebGPU on the shared canvas. RenderAtom content projection canonicalizes uploaded and recorded media sources through the shared media source contract before Bevy receives them, so browser-relative filenames are not emitted as renderer input. Video textures seek to a representative source frame and prime muted frame presentation before RGBA readback, avoiding black initial frames while keeping final display in Bevy. Audio waveforms use canonical peak projection data when present; inline peaks can generate the Bevy waveform texture without requiring a media URL, and imported audio without peaks is decoded from the normalized audio source to derive real waveform peaks before texture generation. Direct WAV recording stores those peaks before Bevy texture generation. Pending recording Atomes without a source are not projected to Bevy until the committed media source is available. Bevy audio remains disabled; Kira stays the only audio engine.

## Browser Media Route

Browser media support is now texture-driven:

- Text, raster images, SVG documents, video frames, and audio waveforms must provide explicit `{ width, height, rgba }` texture data in the Bevy payload.
- The Rust/WASM renderer creates Bevy `Image` assets from that RGBA data and never loads media through a visible DOM node or legacy project renderer.
- Missing media source or missing texture data is an explicit integration error.
- Kira remains the only audio engine; `bevy_audio` is not enabled.
