# WebGPU Virtual Scene And Bevy Integration Audit

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
- `eVe/domains/rendering/project_scene_runtime.js` owns active project projection into one project render surface, reads transient selection, renders through `renderProjectAtTime()`, and exposes project-scene hit testing, lasso collection, text edit, drag, resize, and record updates.
- `eVe/domains/rendering/surface_runtime.js` owns the project/matrix canvas surface, pointer sessions, pointer capture, drag/resize intents, pointer cancel, blur/visibility cancellation, resize tracking, CSS size and drawing-buffer synchronization.
- `eVe/domains/rendering/project_scene_gesture_runtime.js` coalesces live drag/resize frames to animation-frame cadence and emits realtime `gesture_frame` commits without making the DOM canonical.
- `eVe/domains/rendering/project_scene_mutation_runtime.js` persists final drag/resize/text commits through `window.Atome.commit` or `window.Atome.commitBatch`.
- `atome/src/squirrel/apis/unified/realtime_dedupe.js` protects recent local gesture endings from delayed realtime geometry echoes.
- `maps/ARCHITECTURE_MAP.md`, `maps/API_MAP.md`, and `maps/CODEMAP.md` already describe the active project route as canonical state projected into a disposable WebGPU scene, not as per-Atome DOM.

## Coverage Matrix

| Topic | Status | Evidence / Risk |
| --- | --- | --- |
| Hierarchical parent/child | Partially covered | Canonical Atome model and project roots exist, but `createRenderScene()` is a flat sorted list. |
| Groups | Partially covered | Group visual runtime exists for legacy/non-project behavior; active project groups should become render nodes, not DOM islands. |
| Layers | Partially covered | Project/matrix surfaces and z-index exist; no first-class render-layer contract yet. |
| z-index | Clearly covered | `scene_graph.js` sorts by `visual.zIndex`, then id. |
| Render order | Partially covered | Stable flat ordering exists; tree ordering and layer ordering are not first-class. |
| Clipping | Absent | No explicit clip node/diff contract in the active scene graph. |
| Masks | Absent | No first-class mask contract. |
| Viewport | Partially covered | Canvas surface sizing exists; explicit camera/viewport model is not first-class. |
| Camera | Absent | Current canvas projection is screen-space; Bevy should own camera/projection later. |
| WebView resize | Partially covered | `ResizeObserver`, window resize, blur/visibility cancellation, immediate canvas sync exist. |
| devicePixelRatio | Partially covered | `readDpr()` and buffer scaling exist; `devicePixelContentBoxSize` is not used yet. |
| CSS canvas size vs drawing buffer | Clearly covered | `syncCanvasSize()` writes both CSS size and `canvas.width/height`. |
| `maxTextureDimension2D` | Partially covered | Molecule WebGPU adapter clamps elsewhere; project surface contract does not expose a clamp yet. |
| Drag | Clearly covered | Surface pointer sessions emit `drag.start`, `drag.move`, `drag.end`. |
| Pointer capture | Clearly covered | `capturePointer()` / `releasePointerCapture()` in `surface_runtime.js`. |
| pointercancel | Clearly covered | Surface sessions end on pointercancel. |
| blur | Clearly covered | Window blur cancels active surface pointer session. |
| Pointer leaving window | Partially covered | Pointer capture plus blur/visibility cancellation help; explicit pointerout-window policy is not first-class. |
| Hit testing | Clearly covered | `hitTestRenderScene()` and project-scene client hit testing exist. |
| Selection | Clearly covered | Selection runtime feeds disposable render atom selected visuals. |
| Keyboard focus | Partially covered | Hidden text editor exists; broader canvas focus routing is not complete. |
| Text | Partially covered | Text render atom and text bridge exist; full text layout/diff lifecycle is still minimal. |
| IME | Partially covered | Hidden text bridge can support it; the contract is not explicit enough. |
| Copy/paste | Partially covered | Hidden DOM text bridge is the right route; explicit operations are not in the scene contract yet. |
| Accessibility | Partially covered | Hidden text/accessibility bridge is allowed; full semantic accessibility tree is absent. |
| Hidden DOM bridge | Clearly covered | `ensureHiddenTextServiceRoot()` and active text editor exist. |
| Listener lifecycle | Partially covered | Surface resize/pointer listeners are centralized; permanent cleanup API is limited. |
| GPU resource lifecycle | Partially covered | Adapter/resource cache code exists; scene contract does not yet own resource lifetime events. |
| Dirty flags | Absent | Current scheduler redraws/coalesces; no named `TransformDirty`, `StyleDirty`, etc. |
| Diffing | Absent | Current projection rebuilds render atoms; no deterministic diff ops. |
| Reconciliation | Absent | No reconciler separate from rendering. |
| Invalidation | Partially covered | Selection and resize schedule redraws; no typed invalidation model. |
| Undo/redo | Partially covered | Commits go through canonical history, but render diffs are not tied to undo/redo semantics. |
| Snapshots | Partially covered | Canonical state has snapshots; render scene is disposable and not snapshot authority. |
| Autosave | Dangerous or ambiguous | Needs write tracing so autosave/restore cannot reapply stale geometry. |
| Animations/tweens | Dangerous or ambiguous | Must become explicit writers with session ids; no ad-hoc position writes. |
| Timers | Dangerous or ambiguous | Any delayed write can reproduce the observed bug unless writer/session ownership is enforced. |
| `requestAnimationFrame` | Partially covered | Gesture and render schedulers coalesce frames; stale frame cancellation needs stronger invariants. |
| Backend synchronization | Partially covered | Realtime dedupe exists; stale authored echoes needed the recent fix and must stay tested. |
| Regression tests | Partially covered | Drag timeout, realtime echo, surface resize, and canvas route tests exist; need broader multi-drag UI stability test. |

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

The next diagnostic layer should be a temporary probe under `temp/`, not production logs. It should collect:

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

Bevy is not integrated in the codebase yet. There is currently no `bevy` crate in the existing Cargo manifests, and the current install/bootstrap path only guarantees Node, npm, Rust/Cargo, Tauri dependencies, Fastify dependencies, and platform system packages.

Before any Bevy runtime code lands, the integration must add a reproducible dependency policy:

1. Add Bevy only in the Rust workspace/crate that will own the Bevy runtime adapter.
2. Pin Bevy to an explicit compatible version in `Cargo.toml`; do not use a floating "latest" dependency for normal installs.
3. Commit the generated Cargo lockfile for application crates so a fresh `git clone` resolves the same Bevy version.
4. Ensure the existing bootstrap path verifies Rust/Cargo and then lets `cargo build` fetch Bevy through Cargo, just like Tauri-side Rust dependencies.
5. Extend setup/audit scripts so they report whether the Bevy crate is present and buildable once the Bevy crate exists.
6. Add a dedicated update path for Bevy version bumps, separate from normal reinstall, because Bevy upgrades can affect ECS APIs, render graph behavior, shaders, GPU limits, and platform support.
7. Add a narrow Bevy compile smoke test before enabling any Bevy renderer path in the product runtime.

Fresh clone target:

```text
git clone ...
npm install
./run.sh --force-deps
cargo build through the Bevy-owning crate
```

That sequence must install or fetch every required dependency without manual Bevy steps, as long as Rust/Cargo and network access are available.

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

Tasks:

- Keep the delayed-drag regression covered with deterministic tests and visible UI probes.
- Extend write tracing in temporary diagnostics until every geometry writer is classified.
- Complete the resize surface contract with device-pixel-box and GPU max-size clamping.
- Define `AtomeRenderNode`, render diff ops, dirty flags, and typed viewport events as documentation plus tests first.
- Add deterministic tests for hierarchy sorting, diff ordering, dirty flag behavior, and resize invariants.
- Keep render scene disposable and avoid a full Virtual DOM implementation.

### Phase 2: Bevy Integration

Objective: map the minimal Atome render contract into Bevy ECS and rendering.

Tasks:

- Create an Atome-to-Bevy adapter that consumes render diffs.
- Represent nodes as Bevy entities with `AtomeId`, hierarchy, transform, visibility, layer, material, and interaction components.
- Move transform propagation, camera, viewport, layer rendering, and render scheduling to Bevy.
- Keep Atome mutations outside Bevy. Bevy systems may emit intents; they do not own canonical state.
- Preserve the hidden DOM text/accessibility bridge until Bevy-side text/accessibility support can replace it without losing IME or assistive behavior.

### Phase 3: After Bevy

Objective: enrich only the missing renderer-agnostic contract surfaces.

Possible additions:

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
