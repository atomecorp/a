# WebGPU Virtual Scene And Bevy Integration Audit

## Execution Status — 2026-06-01

Status: complete.

Estimated progress: 100 %. Remaining work: 0 %.

This audit is now resolved by the current Virtual Scene + Bevy integration:

- the minimal renderer-agnostic Virtual Scene contract exists in `eVe/domains/rendering/virtual_scene_contract.js`;
- Bevy is integrated and active for the project Atome render path through `eVe/domains/rendering/project_scene_runtime.js`, `eVe/domains/rendering/bevy_projection_adapter.js`, and `eVe/domains/rendering/bevy_web_renderer_runtime.js`;
- the legacy active project renderer family has been removed;
- CSS canvas size, drawing-buffer size, device pixel ratio, ResizeObserver input, and `maxTextureDimension2D` clamping are covered by `eVe/domains/rendering/surface_size_runtime.js` and `eVe/domains/rendering/surface_runtime.js`;
- drag, resize, pointer ownership, pointer cancel, blur/visibility cancellation, stale realtime geometry echo guards, and delayed-write regression are covered by persistent tests;
- the explicit non-regression gate "20 sequential drags across different Atomes, then 5 seconds idle" is covered by `tests/eve/project_scene_stale_drag_regression.test.mjs`;
- browser validation shows one Bevy project canvas, no visible project Atome DOM hosts, no project media DOM nodes, and a clean console.

No full Atome Virtual DOM was added. The chosen architecture remains option 3: minimal Virtual Scene contract, Bevy as renderer/ECS backend, and future Atome-side enrichment only when Bevy does not own the primitive.

## Decision

Choose option 3:

Integrate a minimal Virtual Scene contract now, then migrate the renderer/ECS responsibilities to Bevy, then enrich the Atome-side Virtual DOM-like contract only where Bevy does not own the primitive.

Do not build a complete Atome Virtual DOM before Bevy. The current code already has a canonical Atome model, disposable render atoms, a render scene, canvas-level hit testing, gesture intents, a hidden text bridge, and one shared project canvas. Bevy will bring ECS entities, hierarchy, transforms, global transforms, cameras, render layers, render graph, scheduling, and viewport mechanics. A large Atome-owned tree renderer before Bevy would duplicate those responsibilities.

The Atome-side contract should stay renderer-agnostic:

```js
Canonical Atome state
  -> minimal AtomeRenderNode projection
    -> deterministic render diffs
      -> current WebGPU canvas adapter now
      -> Bevy ECS/renderer adapter later
```

## Evidence From The Current Code

- `eVe/domains/rendering/render_atom.js` normalizes canonical Atome records into disposable render atoms with bounds, transform, visual, content, style, capabilities, project id, and renderer version.
- `eVe/domains/rendering/scene_graph.js` builds `createRenderScene()` as a visible, z-index-sorted atom list with `byId` lookup and `hitTestRenderScene()`.
- `eVe/domains/rendering/project_scene_runtime.js` owns active project projection into one project render surface, reads transient selection, renders through the Bevy web runtime, and exposes project-scene hit testing, lasso collection, text edit, drag, resize, and record updates.
- `eVe/domains/rendering/surface_runtime.js` owns the project/matrix canvas surface, pointer sessions, pointer capture, drag/resize intents, pointer cancel, blur/visibility cancellation, resize tracking, CSS size and drawing-buffer synchronization.
- `eVe/domains/rendering/project_scene_gesture_runtime.js` coalesces live drag/resize frames to animation-frame cadence and emits realtime `gesture_frame` commits without making the DOM canonical.
- `eVe/domains/rendering/project_scene_mutation_runtime.js` persists final drag/resize/text commits through `window.Atome.commit` or `window.Atome.commitBatch`.
- `atome/src/squirrel/apis/unified/realtime_dedupe.js` protects recent local gesture endings from delayed realtime geometry echoes.
- `maps/ARCHITECTURE_MAP.md`, `maps/API_MAP.md`, and `maps/CODEMAP.md` already describe the active project route as canonical state projected into a disposable WebGPU scene, not as per-Atome DOM.

## Coverage Matrix

| Topic | Status | Evidence / Risk |
| --- | --- | --- |
| Hierarchical parent/child | Clearly covered | `virtual_scene_contract.js` projects `parentId` and `children`; Bevy receives explicit parent ids for ECS mapping. |
| Groups | Clearly covered for the active project route | Project groups are render records/scene entries; legacy non-project group visuals remain outside the active project renderer. |
| Layers | Clearly covered | Virtual Scene exposes `layer`; Bevy projection maps bounded layer data and project/matrix surfaces stay separate. |
| z-index | Clearly covered | `scene_graph.js` sorts by `visual.zIndex`, then id. |
| Render order | Clearly covered | Virtual Scene sorts siblings deterministically by order, z-index, then id. |
| Clipping | Clearly covered as projection contract | `clip` and `setClip` exist in the Virtual Scene contract; advanced Bevy clip rendering remains future feature scope. |
| Masks | Clearly covered as projection contract | `mask` and `setMask` exist in the Virtual Scene contract; advanced Bevy mask rendering remains future feature scope. |
| Viewport | Clearly covered | Surface resize emits `surface.resize` with measured CSS/device buffer data; Bevy receives the active canvas size. |
| Camera | Covered by Bevy route | Browser/native Bevy owns projection/camera behavior for renderer execution; Atome does not duplicate camera state. |
| WebView resize | Clearly covered | `ResizeObserver`, window resize, blur/visibility cancellation, immediate canvas sync, and pointer cancellation exist. |
| devicePixelRatio | Clearly covered | `readDpr()` and buffer scaling are used; `devicePixelContentBoxSize` is consumed when available. |
| CSS canvas size vs drawing buffer | Clearly covered | `syncCanvasSize()` writes both CSS size and `canvas.width/height`. |
| `maxTextureDimension2D` | Clearly covered | Project surface size resolution accepts and applies `maxTextureDimension2D`. |
| Drag | Clearly covered | Surface pointer sessions emit `drag.start`, `drag.move`, `drag.end`. |
| Pointer capture | Clearly covered | `capturePointer()` / `releasePointerCapture()` in `surface_runtime.js`. |
| pointercancel | Clearly covered | Surface sessions end on pointercancel. |
| blur | Clearly covered | Window blur cancels active surface pointer session. |
| Pointer leaving window | Clearly covered for active sessions | Pointer capture plus blur/visibility cancellation close active pointer sessions deterministically. |
| Hit testing | Clearly covered | `hitTestRenderScene()` and project-scene client hit testing exist. |
| Selection | Clearly covered | Selection runtime feeds disposable render atom selected visuals. |
| Keyboard focus | Clearly covered for text editing scope | Hidden text bridge owns active text editing focus; broader command focus remains UI/runtime scope, not Virtual Scene state. |
| Text | Clearly covered | Text RenderAtom, text bridge, Bevy texture projection, and text diff metadata are implemented. |
| IME | Covered by bounded hidden text service | IME remains a valid hidden DOM text-service responsibility, not visible Atome DOM rendering. |
| Copy/paste | Covered by bounded hidden text service | Copy/paste belongs to the text service/editor path, not to visible project Atome DOM. |
| Accessibility | Covered as bounded bridge contract | Accessibility data exists in Virtual Scene projection and hidden DOM bridge remains the allowed assistive surface. |
| Hidden DOM bridge | Clearly covered | `ensureHiddenTextServiceRoot()` and active text editor exist. |
| Listener lifecycle | Clearly covered for active surface route | Surface listeners are centralized and resize observers/window handlers are replaced when host/window ownership changes. |
| GPU resource lifecycle | Clearly covered for active Bevy route | Bevy owns renderer resources; media texture resolver produces disposable RGBA payloads. |
| Dirty flags | Clearly covered | `VIRTUAL_SCENE_DIRTY_FLAGS` defines hierarchy, transform, style, text, bounds, layer, accessibility, and resource flags. |
| Diffing | Clearly covered | `diffVirtualSceneTrees()` emits deterministic ops. |
| Reconciliation | Clearly covered as minimal contract | Virtual Scene reconciliation remains deterministic projection/diff, not a second engine. |
| Invalidation | Clearly covered | Resize, selection, record update, spawn, despawn, resource, text, and transform diffs invalidate the Bevy projection. |
| Undo/redo | Clearly covered by ownership | Undo/redo remains canonical Atome history scope; render scene remains disposable and non-authoritative. |
| Snapshots | Clearly covered by ownership | Snapshots remain canonical persistence scope; render scene is reconstructible. |
| Autosave | Covered by invariant and tests | Autosave/restore must not write geometry outside the canonical commit path; stale delayed-write regression is covered. |
| Animations/tweens | Covered by invariant | Future animation writers must own explicit writer/session ids and emit canonical commands, not mutate renderer state directly. |
| Timers | Covered by regression gate | Delayed geometry writes after drag are guarded by the 20-drag/5-second idle regression. |
| `requestAnimationFrame` | Clearly covered | Gesture/render schedulers coalesce frames, and final geometry is guarded against stale realtime echoes. |
| Backend synchronization | Clearly covered | Realtime dedupe rejects stale authored geometry echoes for recent local gestures. |
| Regression tests | Clearly covered | Drag timeout, realtime echo, surface resize, canvas route, multi-drag, and 20-drag idle stability tests exist. |

## Mandatory Invariants

1. Canonical Atome state is the only business source of truth.
2. The render scene is disposable and fully reconstructible from canonical state plus transient interaction state.
3. Renderer systems never mutate canonical state except by emitting declared commands through `window.Atome.commit` or `window.Atome.commitBatch`.
4. At any instant, only one logical writer may own geometry for an Atome: drag, resize, layout, animation, restore, sync, or explicit command.
5. A delayed write must not modify an Atome after drag/resize ends when its `gesture_id`, `tx_id`, pointer id, or writer epoch is stale.
6. WebView resize never changes logical Atome positions or logical Atome sizes.
7. Resize changes viewport, render target, or camera projection; it never stretches existing rendered pixels as the product behavior.
8. CSS canvas size and drawing-buffer size must be synchronized before the next render pass.
9. Atomes must not be deformed by canvas/WebView resize.
10. Screen coordinates, viewport coordinates, world coordinates, canvas CSS pixels, and device pixels must remain separate values.
11. Realtime patches are transport deltas only; they are never a second source of truth.
12. Selection, drag, resize, focus, text edit, and accessibility state are runtime/projection state, not DOM-owned business state.

## Current Bug Diagnosis Priority

Before any Bevy migration, keep the current bug class closed:

- delayed geometry echoes from realtime or stale gesture frames;
- stale `requestAnimationFrame` commits after a drag has ended;
- timeouts during final drag/resize commit;
- resize stretching the canvas bitmap before drawing-buffer sync;
- hidden competing writers from restore, autosave, layout, animation, or sync.

The current fix direction is correct:

- live move frames update disposable project scene records;
- final drag/resize writes are committed through the canonical mutation boundary;
- recent local gesture end geometry is remembered before awaiting backend commit;
- realtime dedupe rejects delayed geometry echoes that match recent local gesture ids;
- resize synchronizes the canvas CSS size and drawing buffer immediately, then schedules render.

The diagnostic layer, when needed for a new regression, must be a temporary probe under `temp/`, not production logs. It should collect:

- timestamp;
- atom id;
- old geometry;
- new geometry;
- writer/source;
- cause: drag, resize, layout, animation, restore, autosave, sync, raf, timer;
- `gesture_id`;
- `tx_id`;
- pointer id;
- active dragging state;
- frame id;
- project id and active canvas id;
- CSS canvas size;
- drawing-buffer size;
- device pixel ratio;
- viewport/camera state once introduced.

Success criterion:

After 20 drags across different Atomes and a 5 second idle wait, no geometry changes without an active user command or an accepted canonical sync event newer than the local gesture.

Status: covered by `tests/eve/project_scene_stale_drag_regression.test.mjs`.

## Minimal Virtual Scene Contract Before Bevy

Do not implement a full Virtual DOM. Define a renderer-agnostic contract that can feed both the current WebGPU adapter and the future Bevy adapter.

Proposed node shape in JavaScript terms:

```js
AtomeRenderNode = {
    id: '',
    parentId: null,
    kind: 'shape',
    localTransform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        originX: 0,
        originY: 0
    },
    worldTransform: null,
    bounds: { x: 0, y: 0, width: 1, height: 1 },
    visible: true,
    opacity: 1,
    zIndex: 0,
    layer: 'project',
    clip: null,
    mask: null,
    material: null,
    text: null,
    interactive: true,
    accessibility: null,
    children: []
};
```

Required diff ops:

- `spawn`
- `despawn`
- `updateTransform`
- `updateStyle`
- `reparent`
- `setLayer`
- `setVisibility`
- `setClip`
- `setMask`
- `updateText`
- `updateAccessibility`

Required dirty flags:

- `HierarchyDirty`
- `TransformDirty`
- `StyleDirty`
- `TextDirty`
- `BoundsDirty`
- `LayerDirty`
- `AccessibilityDirty`
- `ResourceDirty`

The reconciler must be deterministic:

1. Normalize canonical Atome records into `AtomeRenderNode`.
2. Sort siblings by explicit order, then z-index, then id.
3. Produce stable diff ops.
4. Apply hierarchy diffs before transform/style/resource diffs.
5. Apply visibility/layer/clipping before rendering.
6. Never read business truth back from DOM or canvas.

## Mapping To Bevy

Keep in Atome:

- canonical Atome records;
- command validation;
- mutation history;
- undo/redo;
- snapshots;
- sync/realtime conflict policy;
- renderer-agnostic `AtomeRenderNode` projection;
- deterministic render diff production;
- text/accessibility semantic bridge;
- user intent normalization.

Move or map to Bevy:

- `AtomeRenderNode.id` -> `AtomeId` component;
- `parentId` and `children` -> ECS hierarchy relationships;
- `localTransform` -> Bevy `Transform`;
- `worldTransform` -> Bevy `GlobalTransform`;
- `visible` / `opacity` / material -> Bevy visibility/material components;
- `zIndex` / `layer` -> Bevy render layers, camera ordering, or renderer-specific sort components;
- clipping/masks -> Bevy render graph, render passes, stencil/mask systems, or UI clipping where appropriate;
- viewport/crop/reveal -> Bevy camera viewport and orthographic projection;
- project/matrix surfaces -> Bevy render targets or surface routing;
- animation/tween systems -> Bevy systems that emit declared Atome commands only when they own a writer token.

Do not duplicate Bevy:

- Do not build an Atome-side ECS.
- Do not build a second transform propagation system beyond minimal diff validation.
- Do not build a renderer-private hierarchy if Bevy owns hierarchy.
- Do not make a DOM-like reconciler that becomes the authoritative scene engine.

## Bevy Dependency And Reinstall Policy

Bevy is integrated in the codebase. The native desktop backend lives under `platforms/desktop-tauri/src/bevy_backend/`, and the browser/WASM renderer lives under `platforms/web/bevy-renderer/`.

The reproducible dependency policy is:

1. Add Bevy only in the Rust workspace/crate that will own the Bevy runtime adapter.
2. Pin Bevy to an explicit compatible version in `Cargo.toml`; do not use a floating "latest" dependency for normal installs.
3. Commit the generated Cargo lockfile for application crates so a fresh `git clone` resolves the same Bevy version.
4. Ensure the existing bootstrap path verifies Rust/Cargo and then lets `cargo build` fetch Bevy through Cargo, just like Tauri-side Rust dependencies.
5. Keep setup/audit validation aligned with the Bevy-owning crates and their compile smoke tests.
6. Add a dedicated update path for Bevy version bumps, separate from normal reinstall, because Bevy upgrades can affect ECS APIs, render graph behavior, shaders, GPU limits, and platform support.
7. Keep the narrow Bevy compile smoke tests in the final validation path.

Fresh clone target:

```text
git clone ...
npm install
./run.sh --force-deps
cargo build or cargo check through the Bevy-owning crate
```

That sequence installs or fetches every required dependency without manual Bevy steps, as long as Rust/Cargo and network access are available.

Update policy:

- normal reinstall should restore the pinned Bevy version from the lockfile;
- explicit dependency update should intentionally bump Bevy, refresh the lockfile, and run the Bevy smoke tests plus the existing rendering/guardrail tests;
- the project should not silently update Bevy on every framework reinstall.

## Professional Resize Contract

The current `surface_runtime.js` is already moving in the correct direction by synchronizing CSS size and drawing-buffer size immediately. The complete contract should be:

1. `ResizeObserver` observes the host, not just window resize.
2. Prefer `devicePixelContentBoxSize` when available.
3. Otherwise use content box size multiplied by `devicePixelRatio`.
4. Clamp drawing-buffer width/height against the active GPU device `maxTextureDimension2D`.
5. Write `canvas.width`, `canvas.height`, `style.width`, and `style.height` before scheduling the next render.
6. Emit a `ResizeViewport` / `surface.resize` intent containing CSS size, device size, DPR, and previous size.
7. Update viewport/camera/projection before rendering.
8. Cancel active pointer sessions during resize.
9. Never change Atome logical geometry from resize.
10. Test rapid resize, zoom/DPI changes, resize during drag, and WebView resize.

Visual success criterion:

No frame may show the project canvas as a stretched stale bitmap, and no Atome may change scale because the WebView changed size.

## Two-Phase Plan

### Phase 1: Before Bevy

Objective: stabilize current WebGPU project rendering and define the minimal contract.

Status: complete.

Completed tasks:

- Delayed-drag regression is covered with deterministic tests.
- Write tracing remains a temporary-probe policy, not production logging.
- Resize surface contract includes device-pixel box and GPU max-size clamping.
- `AtomeRenderNode`, render diff ops, dirty flags, and surface resize events are implemented.
- Deterministic tests cover hierarchy sorting, diff ordering, dirty flags, and resize/drag invariants.
- Render scene remains disposable; no full Virtual DOM implementation was added.

### Phase 2: Bevy Integration

Objective: map the minimal Atome render contract into Bevy ECS and rendering.

Status: complete for the active project route.

Completed tasks:

- Atome-to-Bevy adapter consumes Virtual Scene snapshots and diffs.
- Nodes are mapped to Bevy payloads with id, parent, transform, size, layer, material, media/text resources, and visibility.
- Bevy owns active project rendering on the shared canvas.
- Atome mutations remain outside Bevy and pass through the canonical commit pipeline.
- Hidden DOM text/accessibility bridge remains bounded and non-authoritative.

### Phase 3: After Bevy

Objective: enrich only the missing renderer-agnostic contract surfaces.

Status: no required additions remain for this audit.

Future additions only when backed by a concrete product requirement:

- richer accessibility tree projection;
- explicit semantic focus graph;
- advanced clipping/masking descriptions;
- professional multi-camera layer workflows;
- editor-only scene inspection and tracing;
- animation writer ownership contracts.

## Non-Regression Gates

Required gates before declaring the migration path safe:

- 20 sequential drags across different Atomes, then 5 seconds idle: no unauthorized geometry write.
- Group/lasso drag with delayed realtime echo: no stale movement.
- Resize WebView during idle: no Atome geometry change.
- Resize WebView during drag: pointer session cancels or resolves deterministically; no stale commit later.
- CSS canvas size and drawing buffer match expected CSS pixels times DPR before render.
- Scene can be rebuilt from canonical records with the DOM removed.
- Text commit survives redraw, refresh, blur, and hidden editor teardown.
- No per-Atome visible DOM hosts, media nodes, SVG nodes, or canvases on the active project path.

## Final Architectural Rule

Atome should own semantic truth and deterministic projection. Bevy should own ECS hierarchy, transforms, cameras, render layers, render graph, and GPU execution. The bridge between them should be a small, explicit Virtual Scene diff contract, not a second renderer and not a full pre-Bevy Virtual DOM.
