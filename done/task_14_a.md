# Task 14A Prompt — Finish Active Atome Rendering Migration

Version: 2026-05-29
Status: Complete
Scope: Continuation of `todo/task14.md`

## Execution Status — 2026-06-01

Status: complete.

Estimated progress: 100 %. Remaining work: 0 %.

Completion evidence:

- `tool_genesis.js` is now 3150 lines and delegates the cohesive owners required by this task.
- Active project Atomes render through the scene/canvas route without visible per-Atome DOM hosts.
- Matrix preview remains scene-rendered and DOM-capture-free.
- Project creation, drag/resize/text/media/group contracts are covered by static and Vitest suites.
- Browser validation on `http://127.0.0.1:3002/tests/probes/bevy_media_validation.html?final_validation=1780298700948` shows one visible Bevy canvas, zero project Atome DOM nodes, zero visible project media DOM nodes, and no console `error`, `warning`, or `warn`.

## Objective

Finish the remaining work from Task 14: complete the migration of active project Atome generation, interaction, preview, and rendering away from per-Atome DOM, while reducing `eVe/intuition/runtime/tool_genesis.js` only through cohesive ownership extraction.

This is not a code-size-only task. The remaining work must preserve and complete the new behavior:

- canonical Atome records are generated first;
- active project rendering uses `RenderAtom`, scene graph, bounded canvas/WebGPU surfaces, and shared render-at-time paths;
- project interaction starts from scene hit-test and emits canonical intents;
- durable changes pass through `window.Atome.commit` or `window.Atome.commitBatch`;
- Matrix preview uses scene rendering, not DOM capture;
- legacy DOM paths remain only for proven non-project UI until they are migrated or deleted safely.

## Mandatory Context

Before editing, read and apply:

- `.codex/AGENTS.md`
- `todo/task14.md`
- `maps/CODEMAP.md`
- `maps/API_MAP.md`
- `maps/DESIGN_MAP.md`
- `maps/ARCHITECTURE_MAP.md`
- `atome/documentations/atome_structur_to_respect.md`

Inspect the current extracted owners:

- `eVe/domains/rendering/project_scene_runtime.js`
- `eVe/domains/rendering/surface_runtime.js`
- `eVe/domains/rendering/render_atom.js`
- `eVe/domains/rendering/matrix_preview_renderer.js`
- `eVe/intuition/runtime/project_scene_render_bridge.js`
- `eVe/intuition/runtime/atome_description_frame_runtime.js`
- `eVe/intuition/runtime/media_integrity_runtime.js`
- `eVe/intuition/runtime/shape_svg_runtime.js`
- `eVe/intuition/runtime/tool_genesis.js`

## Current State

Completed:

- Active project visual rendering delegates to `project_scene_runtime.js`.
- Matrix preview active path no longer uses `html2canvas`, SVG `foreignObject`, DOM clone, or symbolic DOM scan.
- Matrix tile interactions are centralized through scene hit-test runtime.
- Project drag, resize, and text commit paths use scene intents and canonical commit.
- One hidden text service is used for active project text editing.
- `tool_genesis.js` has been reduced from 5251 lines to 3150 lines.
- Extracted owners:
  - `project_scene_render_bridge.js`
  - `atome_description_frame_runtime.js`
  - `media_integrity_runtime.js`
  - `shape_svg_runtime.js`
  - `group_visual_runtime.js`
  - `media_source_runtime.js`
  - `media_hydration_runtime.js`
  - `media_mount_runtime.js`
  - `realtime_atome_events_runtime.js`
  - `persistence_diagnostics_runtime.js`
  - `info_panel_sync_runtime.js`
  - `atome_host_registry_runtime.js`
  - `project_atome_index_runtime.js`
  - `shared_project_override_runtime.js`
  - `implicit_gesture_commit_runtime.js`
- Browser probes have validated:
  - project scene canvas remains bounded;
  - project Atomes do not create `.eve-atome` hosts;
  - Matrix preview renders through the scene renderer;
  - resize gesture commits canonical dimensions;
  - non-project SVG legacy rendering still works while project SVG stays in scene.

Residual scope:

- No blocking Task 14A work remains.
- Valid non-project DOM paths are retained only where they are still proven non-project UI.
- Future reductions of `tool_genesis.js` remain allowed only through cohesive owner extraction with matching tests and maps.
- Generation and rendering behavior remains canonical-first, not DOM-first.

## Task 14A Work Breakdown

### 14A.1 Audit Remaining `tool_genesis.js` Responsibilities

Classify every remaining major responsibility in `tool_genesis.js`:

- Atome creation orchestration;
- canonical commit and refresh orchestration;
- project scene bridge calls;
- non-project DOM projection;
- media URL/source resolution;
- group preview and group host visual runtime;
- protected media hydration;
- realtime patch handling;
- deletion/cleanup;
- selection and info panel synchronization;
- legacy diagnostic or persistence helpers.

Deliverable:

- Add or update an audit test under `tests/probes/` proving each extracted owner remains outside `tool_genesis.js`.
- Do not extract pass-through wrappers.
- Do not remove a branch unless its project and non-project call sites are proven dead.

### 14A.2 Extract Group Visual Runtime If Cohesive

Target likely owner:

- group host preview rendering;
- group steps normalization application;
- group placeholder visual update;
- group preview mounting;
- group timeline visual synchronization when it is host-visual only.

Rules:

- Keep canonical group state outside DOM.
- DOM may remain for non-project legacy group visual paths only.
- Project-visible group Atomes must remain scene-rendered through `RenderAtom`.
- Do not move unrelated Atome creation logic into the group module.

Tests:

- Non-project group preview still renders.
- Project group record updates scene runtime and does not create `.eve-atome` hosts.
- Audit test proves group visual owner is not inline in `tool_genesis.js`.

### 14A.3 Extract Media Source Resolution Runtime If Cohesive

Target likely owner:

- bundled media resolution;
- upload/recording source inference;
- protected media URL normalization;
- direct renderable media URL checks;
- local/Tauri media fetch credential decisions where they are media-specific.

Rules:

- Do not duplicate existing shared media modules.
- Reuse:
  - `eVe/domains/media/api/media_api_shared.js`
  - `eVe/domains/media/shared/media_source.js`
  - `eVe/domains/media/shared/media_identifier.js`
  - `eVe/intuition/runtime/eve_intuition/asset_url_runtime.js`
- Keep platform credential helpers injected if ownership belongs elsewhere.

Tests:

- Upload, recording, bundled, protected, and local media source cases normalize as before.
- Project media rendering still uses scene/adapters and creates no visible `<img>`, `<video>`, `<audio>`, or SVG waveform DOM.
- Non-project media paths still resolve sources.

### 14A.4 Finish Legacy Branch Deletion Audit

Search and classify remaining references to:

- `createAtomeElement(`
- `bindAtomeHost(`
- `renderAtomeRecord(`
- `project_view_`
- `.eve-atome`
- `.eve-atome-text`
- `.eve-atome-shape-svg`
- media DOM selectors such as `img`, `video`, `audio`, SVG waveform hosts.

For every candidate branch:

- prove whether it is active project, non-project UI, test/probe, or dead;
- delete only if dead in both project and non-project flows;
- keep and document if still valid non-project legacy;
- migrate if it still controls active project behavior.

Tests:

- Add static audit tests for each deleted branch.
- Add at least one browser probe for every behavior category touched.

### 14A.5 Complete Atome Generation and Render Contract Integration

Verify `createAtome()` and related creation flows:

- generate canonical Atome records first;
- sanitize properties through the canonical Atome contract;
- commit through `window.Atome.commit`;
- refresh from canonical state when available;
- render active project Atomes through scene runtime;
- do not allocate project `.eve-atome` hosts;
- keep `render: false` as canonical-only and DOM-free.

Tests:

- `createAtome()` project shape/text/media/group records render through scene.
- `createAtome(..., { render: false })` commits but creates no DOM projection.
- generation does not persist renderer/runtime-only scene state into Atome properties.

### 14A.6 Broaden Real Browser Validation

Use Browser plugin workflow. Temporary probes must live under `./temp` and be removed after validation.

Add or run browser validation for:

- project with shape, text, image/video/audio metadata, SVG shape, and group record;
- Matrix preview from the same project;
- resize gesture on canvas;
- text edit commit/cancel if route supports it;
- non-project SVG/group/media legacy path after extraction;
- console `error`, `warning`, and `warn` must be empty or explained with evidence.

Required browser assertions:

- project canvas count is bounded;
- project `.eve-atome` count is zero;
- project visible text/media/SVG DOM count is zero;
- scene atom count matches canonical project records;
- Matrix preview cache has entries after preview render;
- resize/text changes emit canonical commits;
- no temporary probe remains after validation.

### 14A.7 Update Maps After Every Ownership Change

Update maps in the same task when ownership changes:

- `maps/CODEMAP.md`
- `maps/API_MAP.md`
- `maps/DESIGN_MAP.md` if visual behavior changes;
- `maps/ARCHITECTURE_MAP.md`

Each new owner must be documented with:

- responsibility;
- boundary;
- whether it is active project scene path or legacy non-project path;
- prohibited regressions.

### 14A.8 Required Validation

Run at minimum:

```text
node --test tests/probes/tool_genesis_create_atome_order.test.mjs tests/probes/matrix_rendering_migration_contract.test.mjs tests/probes/project_render_legacy_audit.test.mjs
npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
npm run test:run -- tests/eve/project_audio_waveform_renderer.test.mjs
npm run check:syntax
npm run check:dom-projection-guardrails
npm run check:mutation-ownership-guardrails
npm run check:squirrel-dom-adapter-guardrails
npm run check:molecule-guardrails
```

Also run at least one browser probe for any touched visual or interaction behavior.

## Acceptance Criteria

Task 14A is complete only when:

1. `tool_genesis.js` is reduced by cohesive ownership extraction, not wrappers.
2. Active project Atome generation renders through scene/canvas, not per-Atome DOM.
3. Matrix preview remains scene-rendered and DOM-capture-free.
4. Drag, resize, and text behavior remain scene intent plus canonical commit.
5. Non-project legacy paths touched by the refactor still work or are deleted only with proof.
6. New owners are documented in maps.
7. Static tests and browser probes prove the behavior.
8. No temporary probes, logs, or servers remain.

Completion validation run on 2026-06-01:

```text
node --test tests/probes/tool_genesis_create_atome_order.test.mjs tests/probes/matrix_rendering_migration_contract.test.mjs tests/probes/project_render_legacy_audit.test.mjs
PASS: 34 tests

npm run test:run -- tests/eve/unified_rendering_contract.test.mjs tests/eve/project_audio_waveform_renderer.test.mjs
PASS: 2 files, 13 tests

npm run check:syntax
PASS: Syntax OK (657 file(s))

npm run check:dom-projection-guardrails
PASS: DOM projection guardrails OK

npm run check:mutation-ownership-guardrails
PASS: mutation ownership guardrails: ok

npm run check:squirrel-dom-adapter-guardrails
PASS: squirrel DOM adapter guardrails: ok

npm run check:molecule-guardrails
PASS: Molecule guardrails OK

Browser validation
PASS: Bevy canvas visible, project Atome DOM count 0, project media DOM count 0, console error/warn count 0.
```

## Stop Conditions

Stop and report a blocker if:

- a branch appears dead for project rendering but is still required by a valid non-project UI path;
- a required interaction cannot be expressed as scene intent plus canonical commit;
- a generation path requires DOM state as canonical truth;
- deleting a legacy branch would affect persistence, replay, sync, media ownership, or non-project UI without a replacement owner;
- the change would violate `.codex/AGENTS.md`.

Blocker report format:

```text
Execution stopped.
Blocking rule: <exact rule>
Blocked sub-step: <sub-step id>
Reason: <evidence-backed reason>
Compliant alternative: <smallest compliant next action>
```
