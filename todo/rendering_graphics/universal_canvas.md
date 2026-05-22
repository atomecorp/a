# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Universal Canvas Audit And Migration Plan

Date: 2026-05-14
Status: audit required before implementation

## Decision

The full project-surface migration must not be coded in the same change as unrelated layer fixes.

The current runtime still renders project and creative objects through managed DOM nodes in several critical paths. Migrating those paths blindly to a universal canvas would change hit testing, text editing, media playback, selection, drag/drop, persistence, Matrix preview generation, future view modes, and Molecule interoperability at the same time. That has a high regression risk.

This plan defines the architectural target first, then the migration order.

## Architectural Intent

The canonical project is not the current DOM tree and not the current pixel output of a canvas. The canonical project is the deterministic Atome state plus explicit workspace session state.

The project must support multiple view modes over the same canonical model:

1. Natural view: the representative project composition and the primary creative surface.
2. Future alternate views such as list or table: explicit projections of the same project, not independent sources of truth.

For this plan, the natural view is the reference project projection and the Matrix preview source.

## Canonical State Contract

The migration must preserve these rules:

1. Project logic must never depend on the DOM structure of the current view mode.
2. Project logic must never depend on canvas pixel output, viewport size, or device pixel ratio.
3. Geometry, selection ownership, group membership, Molecule membership, and project content identity must derive from canonical Atome state.
4. View mode is a projection choice, not a data model fork.
5. Workspace surfaces such as open Molecules, panels, ribbons, Flowers, and tool overlays are session state, not canonical project rendering.

## Current Rendering Model

WebGPU-based areas already present:

1. `eVe/core/media_engine/molecule.webgpu.js` owns the WebGPU renderer used by molecule/media layers.
2. `eVe/intuition/tools/core/mtrax_renderer_webgpu_adapter.js` and related MTraX renderer modules provide a WebGPU-backed rendering path for timeline/media preview flows.
3. `eVe/domains/media/preview/webgpu_video_preview_renderer.js` provides WebGPU preview rendering for video preview.
4. Some snapshot, poster, and thumbnail paths use temporary 2D canvas extraction.

DOM-based project areas still present:

1. `eVe/intuition/tools/project_bootstrap.js` creates `project_view_*` as fixed HTML `div` project layers.
2. `eVe/intuition/tools/project_drop.js` creates and moves projected tool/atome hosts as DOM elements with `data-atome-id`.
3. `eVe/core/atome_events/drag_runtime.js` binds pointer drag directly to DOM atome hosts.
4. `eVe/core/atome_events/project_layer_runtime.js` performs lasso selection against DOM nodes.
5. `eVe/intuition/eVeIntuition.js` contains diagnostics and workflows that inspect `[data-atome-id]` DOM hosts directly.
6. Text editing still depends on hidden and visible DOM contenteditable paths.
7. Matrix preview generation still includes opportunistic DOM and canvas capture paths.
8. Image, video, SVG, group, toolbox, and footer workflows still use DOM nodes as interactive ownership surfaces.

HTML system UI that may remain HTML-based:

1. Main toolbox/ribbon.
2. Panels and panel chrome.
3. Main/company/menu surfaces.
4. Debug/system overlays.
5. Framework controls that are not creative project content.

## Current Structural Blockers

The current runtime is still coupled to the active DOM project surface in ways that would not survive alternate project views cleanly:

1. Project identity is still resolved from `project_view_*` DOM roots.
2. Selection, lasso, snap targets, and drag hit testing still inspect DOM hosts with `data-atome-id`.
3. Some interaction paths still depend on `elementFromPoint`, `elementsFromPoint`, and current layout geometry.
4. Matrix preview can still capture the visible surface opportunistically instead of requesting an explicit project projection.

These are migration blockers because future list or table project views must not require separate project logic.

## Why HTML Still Exists

1. Pointer interaction and selection are currently coupled to DOM host identity.
2. Atome persistence updates read and write DOM host position during local gestures.
3. Text editing uses DOM editing primitives.
4. Media/video playback paths still use native `video`, `img`, `svg`, and DOM containers in places.
5. Panels and framework controls intentionally live outside project content and must interoperate with project gestures.

## Target Architecture

1. The natural project view uses a single Universal Canvas project surface per project.
2. A renderable scene graph is derived from canonical Atome state and not from DOM host inspection.
3. Creative/project atoms move into canvas/WebGPU draw commands for the natural project view.
4. HTML remains on separate workspace layers for system UI, panels, ribbons, Flowers, and synchronized accessibility/editing mirrors.
5. Open Molecules live in dedicated workspace surfaces, separate from the canonical natural project view.
6. Matrix always renders the natural project view projection, with Molecules in their closed canonical representation.
7. All hit testing for the natural project view routes through a canvas interaction index, not `document.querySelector('[data-atome-id]')`.
8. Drag, resize, lasso, selection, and grouping route through project-space coordinates, not current DOM layout.
9. The global layer contract remains responsible for ordering between workspace surfaces, tools, panels, active drag, and project content.

## Text Rendering Requirement

The wording `text preview` must not be interpreted as degraded text rendering.

Required target:

1. The natural project view must support professional text composition quality.
2. Text rendering must preserve deterministic metrics, layout intent, transforms, opacity, and z ordering.
3. Hidden synchronized HTML mirrors remain allowed only for editing, accessibility, styling interoperability, and system text interaction.
4. The project renderer must not reduce text to a low-fidelity raster surrogate as the architectural end state.

## Project Views

Future project display modes such as list and table are valid projections of the same canonical project.

Rules:

1. A view mode must never become a second source of truth.
2. Project logic must operate against canonical state, not the DOM of the active view mode.
3. The natural view remains the representative project projection for Matrix and project preview purposes.
4. Opening Matrix must not capture an arbitrary current workspace composition.

## Workspace State And Molecules

An open Molecule is a workspace session state, not a canonical project rendering state.

Rules:

1. A closed Molecule has a canonical representation inside the project.
2. Opening a Molecule removes its active editing surface from the main project canvas and opens a dedicated workspace surface.
3. Closing a Molecule reintegrates its canonical representation into the natural project view.
4. Multiple Molecules may be open simultaneously; their open or closed status belongs to workspace session state per Molecule, not to a single global boolean.
5. Entering Matrix must not redefine Molecule content. It may suspend or hide workspace Molecule surfaces, but the canonical project representation remains the closed form.
6. Leaving Matrix should restore the set of Molecule workspace sessions that were open before entering Matrix.

## Matrix Contract

Matrix must be a chosen projection, not a wild capture of whatever is currently visible on screen.

Rules:

1. Matrix preview always targets the natural canonical project view.
2. Matrix preview excludes open Molecule workspace surfaces.
3. Matrix preview excludes open tools, panels, ribbons, Flowers, and other workspace overlays.
4. Matrix preview must not depend on the currently active project view mode.
5. Matrix preview must not depend on ad hoc DOM capture of the current workspace composition.

## Migration Path

1. Introduce an explicit canonical project projection layer that is independent from `project_view_*` DOM identity.
2. Define explicit project view mode state so natural, list, table, and future projections all read the same canonical model.
3. Build a read-only scene graph projection beside the current DOM project layer.
4. Build a WebGPU natural project renderer that draws shapes, images, SVG, video frames, professional text composition, and group bounds from that scene graph.
5. Add canvas hit-test indexes and compare their output against the current DOM selection and drag targets in diagnostics.
6. Move Matrix preview generation to an explicit natural-view projection request instead of opportunistic capture.
7. Separate Molecule workspace-open state from canonical project representation and define restore behavior across Matrix open and close.
8. Migrate one low-risk Atome kind first, preferably static shape, behind an explicit runtime flag used only for verification.
9. Migrate image and SVG once coordinate, sizing, and selection parity are verified.
10. Migrate text display while keeping synchronized hidden HTML only for editing and accessibility.
11. Migrate video/media after playback ownership and frame scheduling are fully separated from DOM media nodes.
12. Remove DOM creative hosts only after drag, resize, lasso, selection, grouping, persistence, replay, Matrix preview, and MTraX integration tests pass.
13. Verify that the Squirrel engine, and preferably the open-source Squirrel + Atome distribution, is still exported correctly through the CDN and still produces a viable functional PWA after the rendering migration.

## Verification Checklist

1. Project load renders the same objects from canonical state.
2. Natural view, list view, table view, and future projections do not fork project logic.
3. Selection returns identical Atome IDs in DOM audit mode and canvas hit-test mode for the natural view.
4. Drag updates deterministic project-space state and replay restores the same result.
5. Active drag appears above panels and system UI through the central layer contract.
6. Panels, tools, and workspace layers remain above non-drag project content according to the layer contract.
7. Text edit opens against the correct Atome and commits through Atome history.
8. Image, video, SVG, and text preserve size, transform, opacity, and z ordering.
9. Lasso selection behaves identically across mixed object types.
10. Matrix preview always shows the natural canonical project view and never captures open Molecule workspace surfaces.
11. Entering and leaving Matrix preserves and restores the set of open Molecule workspace sessions.
12. MTraX/project interactions do not lose pointer capture or media playback state.
13. Multiple open Molecules do not corrupt canonical project rendering or workspace restore logic.
14. CDN publication still exposes the required Squirrel runtime entry points, assets, and Atome-open distribution modules without broken imports or missing public bundles.
15. The CDN-served Squirrel build, and preferably the open-source Squirrel + Atome build, still boots as an installable, functional PWA with a valid offline shell, service worker registration, and core project rendering intact.

## Risks

1. Text editing can regress if HTML mirrors are not synchronized precisely with the project renderer.
2. Video and audio timing can regress if media ownership moves before the playback engine is isolated.
3. Existing tooling expects `[data-atome-id]` DOM hosts, so diagnostics and tool bridges need replacement contracts.
4. A partial migration can create two sources of truth unless the scene graph is strictly derived from Atome state.
5. Future project views can reintroduce DOM-coupled project logic if view-mode boundaries are not enforced early.
6. Molecule workspace restore can regress if open-session state is mixed with canonical project state.
7. Rendering changes can silently break CDN bundle topology or PWA viability if export paths, asset URLs, or offline caches are not revalidated as part of the migration.

## Explicit Non-Goals For This Task

1. This task does not require converting every workspace UI surface to canvas in the same change.
2. This task does not authorize Matrix to capture arbitrary on-screen workspace overlays.
3. This task does not allow project logic to remain coupled to the currently visible DOM project structure as future view modes are introduced.
