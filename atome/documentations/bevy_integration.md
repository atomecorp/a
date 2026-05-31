# Bevy Integration

## Status

Bevy is integrated as an official, feature-gated Tauri Rust dependency. It is not the active Atome renderer yet.

The active project rendering path remains:

```text
canonical Atome record -> RenderAtom / AtomeRenderNode -> shared WebGPU compositor
```

The Bevy backend is a native preparation surface for a future renderer migration. It must consume the existing renderer-agnostic virtual scene contract instead of becoming a parallel Atome state model.

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

The first native contract lives in:

```text
platforms/desktop-tauri/src/bevy_backend/mod.rs
```

It defines:

- `AtomeBevyNode`: a disposable native projection node derived from canonical Atome data;
- `AtomeBevyLogicalSize`: logical size in Atome scene units;
- `AtomeBevyLayer`: layer ordering as explicit projection data;
- `AtomeBevyProjection`: a Bevy resource that keeps mapping evidence without owning canonical Atome state;
- `spawn_atome_node`: a minimal compile-time entry point for creating a Bevy entity from projection data.

The source of truth remains outside Bevy:

- Atome id remains immutable canonical identity.
- Logical position maps to `Transform.translation`.
- Logical size maps to a projection component, not durable state.
- Parent and layer values are projection inputs from the Atome rendering contract.
- Drag and resize must continue to commit through `window.Atome.commit` or `window.Atome.commitBatch`.
- Resize must keep logical scene coordinates, CSS size, canvas buffer size, and device pixels separate.

## Limits

This integration does not:

- replace the current WebGPU compositor;
- add a Bevy window;
- add a new DOM route;
- add a canvas per Atome;
- migrate project drag, resize, or media rendering;
- create a second source of truth for Atome geometry.

The next renderer migration step is to build a read-only bridge from `eVe/domains/rendering/virtual_scene_contract.js` into the Bevy projection components, then validate it against the existing project-scene WebGPU route before any active rendering handoff.
