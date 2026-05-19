# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

# Universal Canvas Audit And Migration Plan

Date: 2026-05-14
Status: audit required before implementation

## Decision

The full canvas/WebGPU ownership migration must not be coded in the same change as the layer fix.

The current runtime still renders project and creative objects through managed DOM nodes in several critical paths. Migrating those nodes blindly to a universal canvas would change hit testing, text editing, media playback, selection, drag/drop, persistence, and panel interoperability at the same time. That has a high regression risk.

## Current Rendering Model

Canvas/WebGPU-based areas:

- `eVe/core/media_engine/molecule.webgpu.js` owns the WebGPU renderer used by molecule/media layers.
- `eVe/intuition/tools/core/mtrax_renderer_webgpu_adapter.js` and related MTraX renderer modules provide a WebGPU-backed rendering path for timeline/media preview flows.
- `eVe/domains/media/preview/webgpu_video_preview_renderer.js` provides WebGPU preview rendering for video preview.
- Some snapshot, poster, and thumbnail paths use temporary 2D canvas extraction.

HTML/DOM-based project areas still present:

- `eVe/intuition/tools/project_bootstrap.js` creates `project_view_*` as fixed HTML `div` project layers.
- `eVe/intuition/tools/project_drop.js` creates and moves projected tool/atome hosts as DOM elements with `data-atome-id`.
- `eVe/core/atome_events/drag_runtime.js` binds pointer drag directly to DOM atome hosts.
- `eVe/core/atome_events/project_layer_runtime.js` performs lasso selection against DOM nodes.
- `eVe/intuition/eVeIntuition.js` contains diagnostics and workflows that inspect `[data-atome-id]` DOM hosts directly.
- Text editing still depends on hidden/visible DOM contenteditable paths.
- Image, video, SVG, group, toolbox, and footer workflows still use DOM nodes as interactive ownership surfaces.

HTML system UI that may remain HTML-based:

- Main toolbox/ribbon.
- Panels and panel chrome.
- Main/company/menu surfaces.
- Debug/system overlays.
- Framework controls that are not creative project content.

## Why HTML Still Exists

- Pointer interaction and selection are currently coupled to DOM host identity.
- Atome persistence updates read and write DOM host position during local gestures.
- Text editing uses DOM editing primitives.
- Media/video playback paths still use native `video`, `img`, `svg`, and DOM containers in places.
- Panels and framework controls intentionally live outside project content and must interoperate with project gestures.

## Target Architecture

1. Introduce a single Universal Canvas project surface per project.
2. Define a renderable scene graph derived from canonical Atome state.
3. Move creative/project atoms into canvas/WebGPU draw commands.
4. Keep HTML only for system UI and synchronized accessibility/editing mirrors.
5. Route all hit testing through a canvas interaction index, not `document.querySelector('[data-atome-id]')`.
6. Route drag, resize, lasso, selection, and grouping through canvas-space coordinates.
7. Keep the global layer contract responsible for cross-boundary ordering between active drag, panels, system UI, canvas content, and background.

## Migration Path

1. Add a read-only scene graph projection beside the current DOM project layer.
2. Build a WebGPU project renderer that draws shape, image, SVG, video frame, text preview, and group bounds from the scene graph.
3. Add canvas hit-test indexes and compare their output against the current DOM selection/drag target in diagnostics.
4. Migrate one low-risk atome kind first, preferably static shape, behind an explicit runtime flag used only for verification.
5. Migrate image and SVG once coordinate, sizing, and selection parity are verified.
6. Migrate text display while keeping synchronized hidden HTML for editing and accessibility.
7. Migrate video/media after playback ownership and frame scheduling are fully separated from DOM media nodes.
8. Remove DOM creative hosts only after drag, resize, lasso, selection, grouping, persistence, replay, and MTraX integration tests pass.

## Verification Checklist

- Project load renders the same objects from canonical state.
- Selection returns identical atome IDs in DOM and canvas hit-test modes.
- Drag updates deterministic `left/top` state and replay restores the same result.
- Active drag appears above panels and system UI through the central layer contract.
- Panels remain above non-drag project content.
- Text edit opens against the correct atome and commits through Atome history.
- Image/video/SVG objects preserve size, crop, transform, opacity, and z ordering.
- Lasso selection behaves identically across mixed object types.
- MTraX/project interactions do not lose pointer capture or media playback state.

## Risks

- Text editing can regress if DOM mirrors are not synchronized precisely.
- Video and audio timing can regress if media ownership moves before the playback engine is isolated.
- Existing tooling expects `[data-atome-id]` DOM hosts, so diagnostics and tool bridges need replacement contracts.
- A partial migration can create two sources of truth unless the scene graph is strictly derived from Atome state.
