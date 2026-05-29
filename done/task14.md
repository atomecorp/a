# Task 14 Prompt — Migrate Active Atome Rendering off Per-Atome DOM

Version: 2026-05-29
Status: Strict execution prompt
Scope: Step 14 of `todo/prompt_atome_rendu_unifie_canvas_webgpu_v2_strict.md`

## Objective

Complete Step 14: remove or migrate legacy DOM render paths from the active Atome/eVe rendering route.

The work is not complete until the main project and Matrix rendering paths no longer create visible DOM proportional to Atome count and no longer attach per-Atome visual interaction listeners.

Target active route:

```text
canonical project Atome records
  -> RenderAtom normalization
  -> render scene
  -> shared WebGPU render-at-time path
  -> bounded visible canvas surface
  -> central scene hit-test
  -> canonical Atome intent / commit
```

Forbidden active route:

```text
canonical project Atome records
  -> renderAtomeRecord()
  -> createAtomeElement()
  -> one visible host div per Atome
  -> per-Atome text/media/SVG children
  -> per-Atome drag/resize/text listeners
```

## Mandatory Context

Before editing code, read and apply:

- `.codex/AGENTS.md`
- `todo/prompt_atome_rendu_unifie_canvas_webgpu_v2_strict.md`
- `maps/CODEMAP.md`
- `maps/API_MAP.md`
- `maps/DESIGN_MAP.md`
- `maps/ARCHITECTURE_MAP.md`
- `atome/documentations/atome_structur_to_respect.md`

Inspect these active legacy owners:

- `eVe/intuition/runtime/tool_genesis.js`
- `eVe/core/atome_events.js`
- `eVe/core/atome_events/host_binding_runtime.js`
- `eVe/core/atome_events/drag_runtime.js`
- `eVe/core/atome_events/resize_runtime.js`
- `eVe/core/atome_events/text_edit_runtime.js`
- `eVe/intuition/matrix/core/preview.js`
- `eVe/intuition/matrix/ui/view.js`
- `eVe/domains/media/rendering/project_media_atome_renderer.js`
- `eVe/domains/media/rendering/project_audio_waveform_renderer.js`

Inspect the new unified rendering foundation:

- `eVe/domains/rendering/render_atom.js`
- `eVe/domains/rendering/scene_graph.js`
- `eVe/domains/rendering/surface_runtime.js`
- `eVe/domains/rendering/webgpu_compositor.js`
- `eVe/domains/rendering/render_at_time.js`
- `eVe/domains/rendering/image_adapter.js`
- `eVe/domains/rendering/video_adapter.js`
- `eVe/domains/rendering/waveform_adapter.js`
- `eVe/domains/rendering/text_bridge.js`
- `eVe/domains/rendering/text_adapter.js`
- `eVe/domains/rendering/matrix_preview_renderer.js`

## Non-Negotiable Rules

- JavaScript only.
- No fallback renderer.
- No compatibility shim.
- No TypeScript.
- No Python.
- No Git write operations.
- No visible DOM node per Atome.
- No visible canvas per Atome.
- No visible `<img>`, `<video>`, `<audio>`, SVG waveform, or text DOM per Atome.
- No project DOM cloning for Matrix previews.
- No per-Atome pointer/drag/resize/text listener.
- No renderer state in DOM attributes, custom attributes, classes, inline styles, comments, or hidden nodes.
- All durable mutations must pass through `window.Atome.commit` or `window.Atome.commitBatch`.
- DOM may remain only as bounded application shell, one project render canvas, one Matrix render canvas, and the centralized hidden text service.
- Every sub-step must include automated tests and a headless browser console check.

## Current Evidence

The active blocker is in `eVe/intuition/runtime/tool_genesis.js`:

- `ensureProjectLayer()` creates and owns project DOM layers.
- `renderAtomeRecord()` is the active rendering entry point for project Atomes.
- `createAtomeElement()` creates one visible host `div` per Atome.
- Text Atomes create visible `.eve-atome-text` DOM.
- Media Atomes call `mountMediaApiAtome()`, which mounts visible media projection children.
- Group/SVG Atomes create visible placeholder/SVG DOM.
- `bindAtomeHost()` attaches per-Atome drag, resize, and text behavior.
- Several callers expect `renderAtomeRecord()` to return an `HTMLElement`.

The active Matrix blocker is in:

- `eVe/intuition/matrix/core/preview.js`, which uses canvas scaling, `html2canvas`, SVG `foreignObject`, and symbolic DOM snapshot rendering.
- `eVe/intuition/matrix/ui/view.js`, which creates project tile DOM, preview DOM, labels, and per-tile handlers.

## Implementation Plan

### 14.1 Create a Project Render Scene Runtime

Create a cohesive runtime under `eVe/domains/rendering/` that owns active project scene state:

- Accept canonical Atome records for a project.
- Normalize them through `normalizeRenderAtoms()`.
- Store scene state in a runtime registry keyed by project id.
- Update the bounded project surface with `ensureRenderSurface({ zone: "project" })`.
- Render through `renderProjectAtTime()`.
- Return a projection handle object, not an `HTMLElement`.

Required API shape:

```js
const projection = await renderProjectScene({
  projectId,
  projectRevision,
  records,
  host,
  time,
  quality
});
```

The returned projection may include:

```js
{
  ok: true,
  project_id,
  surface,
  scene,
  render_result
}
```

It must not include or require an Atome DOM host.

Tests:

- 100 heterogeneous Atomes produce one project canvas.
- No `.eve-atome` host is created.
- No per-Atome visible DOM child is created.
- Scene contains 100 `RenderAtom` entries.
- Browser console has no error or warning.

### 14.2 Add a Legacy Return-Contract Audit

Before replacing `renderAtomeRecord()`, audit all call sites that require an actual `HTMLElement`.

Classify each call site as:

- model-only render request;
- project visual render request;
- media-specific runtime request;
- group/timeline request;
- tool or system UI request;
- test/diagnostic request.

For every call site, decide one of:

- migrate to project scene runtime;
- keep as non-project UI shell path if bounded and not Atome-count-proportional;
- remove if obsolete;
- stop with exact blocker if it still requires Atome DOM authority.

Deliverable:

- A short source comment is not enough.
- Add or update a test proving project visual calls no longer rely on returned `HTMLElement`.

### 14.3 Split `tool_genesis.js` Instead of Extending It

`tool_genesis.js` is critical legacy. Do not grow it further.

Extract cohesive logic into smaller owners:

- Atome record/spec normalization, if still needed by non-rendering callers.
- Project scene rendering bridge.
- Tool/system UI rendering paths that are not project Atome visual rendering.
- Legacy host cleanup/deletion utilities if still required during removal.

Do not create pass-through wrappers. Each new module must own a real cohesive responsibility.

After extraction, `tool_genesis.js` should delegate project visual rendering to the unified project scene runtime and stop creating visible Atome hosts for project Atomes.

Tests:

- Existing project creation flow still commits canonical Atomes.
- Rendering a project uses `renderProjectScene()` or equivalent unified API.
- `renderAtomeRecord()` is not on the active project visual path.

### 14.4 Replace Project Media Rendering Entrypoints

Migrate `eVe/domains/media/rendering/project_media_atome_renderer.js`:

- It must not call `toolBase.renderAtomeRecord()` for project-visible media.
- It must publish/update canonical properties and project scene invalidation.
- It must use `RenderAtom` and adapters for image, video, and audio waveform resources.
- `hydrateRenderedProjectMediaAtome()` must become scene invalidation plus registry update, not DOM style mutation.

Tests:

- Image media projection does not create visible `<img>`.
- Video media projection does not create visible `<video>`.
- Audio waveform projection does not create `<audio>`, SVG, or `.eve-project-audio-recording-waveform`.
- Transform-only updates do not regenerate image/video/waveform content resources.

### 14.5 Replace Text Active Rendering Path

Migrate project text Atomes:

- Visible text must render through `text_adapter.js`.
- Hidden text DOM is used only through `text_bridge.js`.
- Editing starts one active hidden editor.
- Commit calls `window.Atome.commit`.
- Cancel emits no canonical mutation.
- Final project DOM contains no `.eve-atome-text` per Atome.

Tests:

- 100 text Atomes create one hidden text root at most.
- Only one active editor exists during editing.
- After commit or cancel, active editor count is zero.
- No text content is recovered from visible DOM for rendering or persistence.

### 14.6 Replace Matrix Preview Capture

Migrate `eVe/intuition/matrix/core/preview.js`:

- Remove `html2canvas` usage from the active preview path.
- Remove SVG `foreignObject` preview capture from the active path.
- Remove symbolic DOM scanning from the active path.
- Use `createMatrixPreviewRenderer()` and shared render targets.
- Cache previews by project id, project revision, preview size, device pixel ratio, quality, design revision, and renderer version.

Tests:

- Rendering many project previews does not create mini project DOM trees.
- Matrix preview uses one Matrix render surface.
- Updating one project invalidates only its preview cache entry.
- Browser console has no error or warning.

### 14.7 Replace Matrix Tile Interaction Routing

Migrate Matrix interaction:

- Keep bounded shell DOM if needed for scroll/layout.
- Do not create one preview DOM subtree per project for rendering.
- Route pointer selection/open/rename/menu intents through a central Matrix surface or bounded shell handler.
- Use scene graph hit-test for project tile interactions.

If label editing still requires DOM, it must be a single active editor, not one label element per tile.

Tests:

- Matrix with many projects has bounded renderer DOM.
- No per-project preview DOM subtree.
- No per-project preview listener.
- Scene hit-test resolves the intended project id.

### 14.8 Disable or Delete Replaced Per-Atome Bindings

Once project Atomes render through the scene runtime:

- Remove calls to `bindAtomeHost()` for project Atome visual rendering.
- Remove per-Atome drag/resize/text binding from the project visual path.
- Centralize pointer events on project surface.
- Convert drag/resize/text interaction to scene intent plus canonical commit.

Do not delete event runtimes if they are still used by bounded non-project UI, but they must not control project Atome visual rendering.

Tests:

- 100 heterogeneous Atomes attach zero per-Atome project visual listeners.
- Drag/resize intent starts from scene/canonical geometry and commits through `window.Atome.commitBatch`.
- Selection state is held in runtime registries, not DOM classes as authority.

### 14.9 Remove Obsolete Legacy Rendering Code

After callers are migrated:

- Remove dead project Atome DOM creation branches.
- Remove DOM preview fallback branches in Matrix preview.
- Remove obsolete media child mounting from project visual path.
- Remove temporary diagnostics and probes.

Before deleting:

- Search imports and dynamic references with `rg`.
- Verify tests and runtime paths.
- Update maps.

### 14.10 Required Validation

Run in this order:

```text
npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
npm run test:run -- tests/eve/project_audio_waveform_renderer.test.mjs
npm run check:syntax
npm run check:dom-projection-guardrails
npm run check:mutation-ownership-guardrails
npm run check:squirrel-dom-adapter-guardrails
npm run check:molecule-guardrails
```

Also run a headless browser probe after every sub-step:

- Open the local probe page or active app route.
- Verify no console `error`, `warning`, or `warn`.
- Verify bounded canvas count.
- Verify zero visible Atome DOM growth in the project scene.
- Verify Matrix preview does not clone project DOM.

Use the Browser plugin workflow from the `browser` skill. Do not replace it with unrelated browser tooling unless the Browser plugin is unavailable.

## Required Guardrail Tests

Add or update tests under `tests/` that fail when:

- visible DOM node count grows linearly with Atome count;
- visible canvas count grows linearly with Atome count;
- project Atomes create `.eve-atome` hosts in the visual path;
- project text creates `.eve-atome-text` per Atome;
- project media creates visible `<img>`, `<video>`, `<audio>`, or SVG waveform nodes;
- per-Atome project visual listeners are attached;
- Matrix preview uses `html2canvas`, SVG `foreignObject`, DOM clone, or symbolic DOM scan on the active path;
- text hidden roots multiply;
- active text editor remains mounted after commit/cancel;
- renderer state is recovered from DOM attributes/classes/inline styles;
- export uses a different renderer path than interactive rendering.

## Acceptance Criteria for Step 14

Step 14 is complete only when all are true:

1. Active project Atome rendering no longer calls `createAtomeElement()` or equivalent per-Atome DOM creation.
2. Active project visual rendering no longer calls `bindAtomeHost()` per Atome.
3. Project display uses bounded canvas surfaces.
4. Matrix preview uses shared render targets and not DOM capture.
5. Image/video/audio/text Atomes all flow through `RenderAtom` and WebGPU adapters.
6. Text DOM is centralized and bounded.
7. Old active DOM render branches are removed or proven out of the active project path.
8. Tests and browser console validation pass.
9. Maps are updated in the same task.
10. No temporary probe remains outside `./temp`; no temporary production logs remain.

## Stop Conditions

Stop immediately and report a precise blocker if:

- a caller still requires a real Atome `HTMLElement` for canonical state;
- a required interaction cannot be expressed as scene intent plus canonical commit;
- removing a legacy branch would break persistence, replay, sync, or media ownership and the owning replacement is not yet identified;
- the required change would violate `.codex/AGENTS.md`.

The blocker report must include:

```text
Execution stopped.
Blocking rule: <exact rule>
Blocked sub-step: <sub-step id>
Reason: <evidence-backed reason>
Compliant alternative: <smallest compliant next action>
```

