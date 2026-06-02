# Robust Bevy / Atome Regression Fix Prompt

Copy and paste this entire prompt into the development agent.

## Progress Notes

- Done: imported media Atomes persist after browser refresh and project reload validation.

---

## Role

You are a senior development agent working on a JavaScript / Rust / Bevy / Tauri / WebGPU / WASM codebase.

Your job is not to make the visible bugs disappear. Your job is to eliminate the root causes while preserving and simplifying the canonical Atome architecture.

You must clean up safely when the touched ownership path contains dead, duplicated, deprecated, transitional, or unused code. Remove what can be removed only when the removal is safe, justified, and validated.

You must strictly follow the repository(./.codex/AGENTS.md) rules before creating, editing, moving, or deleting code.

---

## Mandatory Repository Rules

Before any analysis, plan, or implementation, read and apply these files exactly:

- `./.codex/AGENTS.md`
- `./.codex/modules/01-root-constitution.md`
- `./.codex/modules/02-coding-standards-and-prohibitions.md`
- `./.codex/modules/03-debugging-testing-and-ui-validation.md`
- `./.codex/modules/04-feature-work-cleanup-and-framework-reuse.md`
- `./.codex/modules/05-api-rendering-and-ui.md`
- `./.codex/modules/06-atome-state-sync-and-runtime-modes.md`
- `./.codex/modules/07-future-code-guardrails.md`
- `./atome/documentations/how_debug_UI.md`

The UI debugging document is mandatory before any work involving UI, Playwright, hit-testing, lasso selection, drag, resize, capture, media import, flower menu, selection, pointer routing, or actionability diagnostics.

---

## Primary Objective

Fix a mixed regression set involving:

- project media import persistence;
- audio and video recording Atome creation;
- selection ownership and selection visuals;
- Bevy / WebGPU rendering projection;
- hit-testing, drag, resize, lasso priority, and coordinate conversion;
- homothetic resize;
- contextual flower-menu routing based on current selection.

The final implementation must restore the canonical architecture. A fix is invalid if it merely hides symptoms.

---

## Highest Priority

Problem 1, imported media Atomes being lost after refresh or logout/login, is the highest-priority root regression.

Do not start selection, rendering styling, drag, resize, lasso, or flower-menu implementation until the imported-media creation / commit / persistence / reload path has been reproduced, isolated, fixed, and validated.

Recording-created media Atomes must reuse the same durable creation, persistence, source normalization, RenderAtom projection, and Bevy / WebGPU rendering path as imported media Atomes.

---

## Non-Negotiable Architecture Constraints

The following constraints are mandatory.

### Canonical State

- Canonical Atome state must live outside the DOM.
- The DOM must remain disposable, minimal, and non-authoritative.
- Durable Atome identity, media kind, selection state, drag state, resize state, persistence state, project id, runtime ownership, and command ownership must never be stored in DOM attributes, custom attributes, CSS classes, comments, decorative inline styles, or browser-only metadata.
- All visible durable Atome writes must go through `window.Atome.commit` or `window.Atome.commitBatch` unless the repository explicitly defines a stricter canonical mutation route.
- Runtime-only interaction state must live only in the existing runtime registry or explicit domain registry that already owns that concern.

### Rendering

- Use the existing shared Bevy / WebGPU rendering route for project Atome rendering.
- Do not add DOM media nodes as product renderers.
- Do not introduce canvas-per-Atome rendering.
- Do not introduce fallback renderers, compatibility renderers, DOM overlays, DOM proxies, synthetic pointer routes, or test-only APIs.
- Selection visuals must be projected through the canonical visual contract and rendered through Bevy / WebGPU.

### Style Ownership

- Styles must be represented through the approved JavaScript-driven visual contract.
- Any change to the visual contract must be documented in `maps/DESIGN_MAP.md` and any other affected map.
- Create or extend a specialized Atome visual style file only if no existing canonical style contract can host the requirement cleanly.

### Architecture Reuse

- Reuse the existing architecture before creating new files.
- Do not create new managers, registries, stores, coordinators, services, or abstraction layers unless the current architecture demonstrably cannot support the fix.
- If a new file or ownership boundary is unavoidable, justify it, keep it cohesive, and update the relevant maps.

### Git

- Do not perform Git write operations.
- Do not create commits, branches, tags, rebases, merges, resets, or stashes.

---

## Forbidden Fixes

The following are explicitly forbidden:

- workaround fixes;
- symptom masking;
- temporary patches presented as product fixes;
- duplicate state;
- shadow state;
- parallel persistence paths;
- recording-only persistence paths;
- renderer-specific exceptions;
- compatibility layers;
- retry-based fixes;
- polling-based fixes;
- coordinate-only hacks;
- forced clicks;
- synthetic pointer sequences;
- DOM overlays used as product hit targets;
- DOM proxies used as product Atomes;
- test-only product APIs;
- hardcoded UI text that bypasses the existing i18n or UI contract;
- type-specific resize forks unless an existing canonical type contract requires them and the reason is proven.

If a proposed solution needs any forbidden pattern, the solution is invalid. Find the canonical owner instead.

---

## Required Pre-Flight Inspection

Before coding, inspect these maps and documents:

- `maps/CODEMAP.md`
- `maps/API_MAP.md`
- `maps/DESIGN_MAP.md`
- `maps/ARCHITECTURE_MAP.md`
- `atome/documentations/atome_structur_to_respect.md`
- `atome/documentations/how_debug_UI.md`

Then inspect the real owning implementation paths before editing:

- Atome creation and mutation pipeline;
- `window.Atome.commit` and `window.Atome.commitBatch` ownership;
- project media import runtime;
- capture audio / video / photo reveal and creation runtime;
- project store, persistence, reload, logout/login, refresh, replay, and resync paths;
- event history and `state_current` projection;
- media source normalization and approved upload / recording routes;
- `RenderAtom` normalization and Virtual Scene projection;
- Bevy projection adapter;
- Bevy media texture resolver;
- Bevy web renderer runtime;
- project scene runtime;
- runtime selection registry;
- hit-testing, drag, resize, lasso, transform handles, and flower-menu routing;
- existing design-token, style-contract, and generated-style ownership for selected Atome visuals;
- existing tests and probes for media import, recording, rendering, selection, drag, resize, and flower menu.

---

## Mandatory Gate Report Before Coding

Before any code change, produce the mandatory gate report required by `./.codex/modules/07-future-code-guardrails.md`.

The report must include:

- task classification;
- exact regression list;
- canonical owner for each regression;
- suspected root cause for each regression;
- evidence already found;
- reusable architecture to preserve;
- files likely to change;
- tests or probes to run;
- maps likely to change;
- DOM authority risk;
- rendering risk;
- state mutation risk;
- persistence risk;
- sync / replay / hydration risk;
- legacy-code risk;
- cleanup opportunities in the touched paths.

Do not implement before this report exists.

---

## Root-Cause First Rule

For every bug, complete this sequence before editing:

1. Reproduce the failure when feasible.
2. Identify the exact root cause.
3. Prove the root cause with concrete code references.
4. Identify the canonical owner.
5. Identify upstream dependencies.
6. Identify downstream consumers.
7. Explain why the current implementation fails.
8. Explain why the proposed fix eliminates the root cause.
9. List the minimal files to edit.
10. Only then implement.

Do not guess. Do not patch around missing understanding. If reproduction is not possible in the available environment, state exactly why and provide the strongest alternative evidence from code inspection and targeted probes.

---

## Ownership Analysis Required For Each Bug

For each regression, explicitly answer:

- Who owns the canonical state?
- Who owns runtime-only state?
- Who owns rendering projection?
- Who owns persistence?
- Who owns reload / hydration?
- Who owns sync / replay?
- Who owns UI interaction routing?
- Who consumes the state downstream?
- Which code currently violates or bypasses ownership?

A fix that does not respect ownership is invalid.

---

# Problems To Resolve

## 1. Imported Media Atomes Are Lost After Refresh Or Logout/Login

### Problem

After importing media into a project to create new Atomes, refreshing the project or disconnecting and reconnecting loses the created Atomes.

### Required Result

- Imported media Atomes are durable project Atomes.
- They survive refresh, project reload, logout/login, replay, and resync.
- The fix must identify whether the root cause is creation, commit, persistence, project association, event history, `state_current` projection, reload hydration, or sync reconciliation.
- Imported media must never use the DOM as persistence source.
- Imported media must use the same canonical durable Atome path that other persisted project Atomes use.

### Required Investigation

Determine and document:

- whether the imported media Atome is created in canonical state;
- whether the Atome has the correct project association;
- whether the media source is normalized before persistence;
- whether the mutation reaches `window.Atome.commit` or `window.Atome.commitBatch`;
- whether durable history or persistence entries are created;
- whether `state_current` contains the Atome after creation;
- whether reload hydration reconstructs it;
- whether sync or replay drops it;
- whether Bevy / WebGPU receives it after reload.

### Validation

- Reproduce the loss before fixing when feasible.
- Import at least one image or media fixture through the real UI path.
- Verify the created Atome exists in canonical state before refresh.
- Verify the same Atome exists in canonical state after refresh.
- Verify the same Atome exists after logout/login when the available environment supports authentication.
- Verify durable history or persistence entries are created through the canonical mutation path.
- Verify `state_current`, replay, reload hydration, and sync reconciliation do not drop it.
- Verify the project canvas renders the imported Atome through Bevy / WebGPU after reload.
- Verify the final DOM does not become a persistence authority.

---

## 2. Audio Or Video Recording Must Create A Durable Project Atome

### Problem

Completing an audio or video recording does not create a project Atome as expected.

### Required Result

- Completing an audio recording creates a durable project Atome.
- Completing a video recording creates a durable project Atome.
- Recording-created Atomes reuse the same canonical creation, persistence, media source normalization, `RenderAtom` projection, and Bevy texture / waveform route as imported media Atomes.
- No recording-only renderer, persistence path, DOM media node, fallback projection, or parallel state route may be introduced.

### Required Investigation

Determine and document:

- where recording completion currently emits data;
- whether the recording result enters canonical Atome creation;
- whether the recording source is normalized to the approved recording or upload route;
- whether the created Atome is associated with the current project;
- whether the durable mutation reaches the canonical commit path;
- whether reload / replay / sync preserve it;
- whether Bevy / WebGPU can render the media after reload.

### Validation

- Record audio through the real UI path.
- Verify a project Atome is created, persisted, rendered, reloaded, and selectable.
- Record video through the real UI path.
- Verify a project Atome is created, persisted, rendered, reloaded, and selectable.
- Verify source paths normalize explicitly to the approved upload or recording route before reaching Bevy.
- Verify recording logs, browser logs, server logs, and Tauri logs contain no unexplained errors or warnings.

---

## 3. Clicking An Atome On The Desktop Must Select It With A Dedicated Atome-Format Selection Style

### Problem

Clicking an Atome on the project desktop must select it. The selected visual must be a slight light-gray border plus a subtle contour shadow.

### Required Result

- Selection is stored in the canonical runtime selection owner, not the DOM.
- Selection is projected visually by the WebGPU / Bevy rendering route.
- The selection style uses the Atome-format visual contract interpreted by the renderer.
- The selected visual is a subtle light-gray border plus a subtle contour shadow.
- Multiple selection and deselection remain deterministic.
- Any style-contract change is documented in `maps/DESIGN_MAP.md` and other relevant maps.

### Required Investigation

Determine and document:

- where click selection is routed;
- where selection state is currently stored;
- whether selection state survives rerender;
- whether Bevy / WebGPU receives selection metadata through the canonical projection;
- which style contract owns selected Atome visuals;
- whether any DOM attribute, CSS class, or inline style currently acts as selection authority.

### Validation

- Real click selects the Atome.
- The selected Atome renders the light-gray border and subtle contour shadow on the project canvas.
- Deselecting removes the selected visual.
- Multi-selection behaves deterministically.
- Rerender does not lose selection state unless canonical runtime selection is cleared.
- The final Atome DOM does not contain forbidden selection authority such as `data-atome-selected`, `eve-selected-*`, inline outline, inline border, or decorative inline box shadow.

---

## 4. Atome Bounding Boxes For Canvas Drag / Resize Are Offset Or Incomplete

### Problem

The drag / resize hit area appears offset or does not fully cover the Atome. Dragging near the bottom-right side can incorrectly trigger lasso instead of moving the Atome or resizing from its border.

### Required Result

- Hit-testing uses the same canonical / projected geometry as Bevy / WebGPU rendering.
- Pointer routing consistently chooses the correct action in this order:
  1. resize handle or border when applicable;
  2. Atome drag when the pointer is inside actionable Atome geometry;
  3. lasso only when the pointer is outside actionable Atome geometry.
- Geometry conversion between CSS pixels, device pixels, project coordinates, canvas coordinates, viewport transforms, and Bevy projection must be centralized or reused from the existing owner.
- Visual bounds and hit bounds must match within an explicitly justified tolerance.

### Required Investigation

Determine and document:

- where pointer coordinates are captured;
- where coordinate conversion happens;
- where Bevy projected geometry is computed;
- where hit-testing reads geometry;
- whether different systems use different coordinate spaces;
- whether device-pixel ratio or viewport transforms are applied inconsistently;
- why the bottom-right area routes to lasso instead of drag or resize.

### Validation

- Real Playwright pointer interactions can drag an Atome from its interior.
- Dragging the bottom-right border triggers resize, not lasso.
- Dragging near the bottom-right interior triggers move, not lasso.
- Dragging empty canvas space still triggers lasso.
- Visual bounds and hit bounds match within the documented tolerance.
- No product fix relies on coordinate-only hacks, forced clicks, synthetic pointer sequences, DOM overlays, or DOM proxies.

---

## 5. Resizing Must Be Homothetic And Preserve The X/Y Ratio For All Atomes

### Problem

Resize must preserve aspect ratio for every Atome type.

### Required Result

- All resize operations are homothetic by default for image, video, audio waveform, text, shape, SVG, and any other Atome rendered in the project.
- Ratio preservation uses canonical Atome geometry and media intrinsic dimensions when available.
- The canonical mutation pipeline receives the final size update.
- Type-specific resize forks are forbidden unless an existing canonical type contract requires them and the reason is proven.

### Required Investigation

Determine and document:

- where resize starts;
- where initial geometry and ratio are captured;
- where final width and height are computed;
- where canonical size mutation is committed;
- whether media intrinsic size is available and used correctly;
- whether current type-specific paths produce inconsistent behavior.

### Validation

- Resize several Atome types through the real interaction path.
- Verify width / height ratio is preserved after drag resize.
- Verify canonical state, rendered Bevy projection, and visible output agree after resize.
- Verify the ratio remains correct after refresh / reload.

---

## 6. Flower Contextual Menu Must Respect Current Selection And Apply Tools To Selected Atomes

### Problem

When an Atome is selected, or when a selection exists on screen, the contextual flower menu must reflect the selection and apply the chosen tool to the selected Atome or Atomes.

### Required Result

- Flower-menu contents are computed from the canonical selection owner and Atome registry / domain registries, not from DOM metadata.
- The menu distinguishes no selection, single selection, and multi-selection when behavior differs.
- Tool actions chosen in the flower menu target all selected Atomes when applicable.
- Unsupported tools are hidden or disabled through the existing product / UI contract and i18n system.
- All effectful actions route through the existing command / mutation policy.

### Required Investigation

Determine and document:

- where flower-menu contents are computed;
- where selected Atomes are read;
- whether menu actions use canonical selection or stale DOM state;
- how single-selection and multi-selection behavior is represented;
- how unsupported tools are hidden or disabled;
- where effectful menu actions enter the command / mutation path.

### Validation

- With no selection, the flower menu shows the correct project / canvas actions.
- With one selected Atome, the flower menu shows Atome-relevant actions and applies the chosen action to that Atome.
- With multiple selected Atomes, the flower menu shows compatible multi-selection actions and applies the chosen action to all selected Atomes.
- Refresh or rerender does not make the flower menu depend on stale DOM state.

---

# Required Execution Order

Follow this order unless the code inspection proves a different dependency order is necessary. If the order changes, explain why.

1. Read and apply mandatory repository rules.
2. Inspect maps, documents, and owning implementation paths.
3. Produce the mandatory gate report.
4. Reproduce and isolate imported-media persistence loss.
5. Fix the canonical creation / commit / persistence / reload path shared by imported media and recorded media.
6. Validate imported media durability across refresh, reload, replay, resync, and logout/login when supported.
7. Repair audio / video recording creation so it uses the same durable Atome path.
8. Validate recorded audio and video Atomes through creation, persistence, rendering, reload, and selection.
9. Inspect and repair selection ownership, style contract, and Bevy / WebGPU selection rendering.
10. Inspect and repair hit-testing, drag, resize, lasso priority, and coordinate conversion.
11. Enforce homothetic resize through the canonical resize mutation route.
12. Repair flower-menu selection awareness and selected-Atome command routing.
13. Remove dead, duplicated, fallback, deprecated, or legacy code discovered in the touched ownership paths when safe.
14. Update maps for any ownership, API, design, rendering, persistence, or structure changes.
15. Run narrow validations first, then wider guardrails.
16. Produce the final completion report required by `./.codex/modules/07-future-code-guardrails.md`.

---

# Minimum Validation Set

Prefer existing targeted tests or probes when they cover the surface. If missing, create the smallest persistent tests under `./tests`. Temporary diagnostics are allowed only under `./temp` and must be removed before completion unless the repository rules explicitly allow keeping them.

Run the narrowest relevant checks first, then widen as needed.

Required validation categories:

- focused tests for Atome creation, commit, persistence, replay, reload, hydration, and resync;
- focused tests for project media import and recording-created media Atomes;
- focused tests for media source normalization;
- focused tests for `RenderAtom`, Virtual Scene, Bevy projection, and media texture / waveform resolution;
- focused UI tests using real Playwright clicks and pointer interactions for import, recording, selection, drag, resize, lasso, and flower-menu routing;
- syntax validation with `npm run check:syntax` when JavaScript modules are changed;
- `npm run check:m0` or stronger guardrails when architecture-sensitive rendering, DOM, state, persistence, or mutation paths are touched;
- Tauri / Axum validation when the reproduced bug is Tauri-specific or crosses filesystem / native recording boundaries.

---

# Completion Criteria

Do not declare completion until all applicable criteria are true:

- imported media survives refresh;
- imported media survives project reload;
- imported media survives replay and resync;
- imported media survives logout/login when authentication is available in the test environment;
- recorded audio creates a durable rendered project Atome;
- recorded video creates a durable rendered project Atome;
- imported and recorded media use the same canonical durable Atome path;
- media source normalization is explicit and approved;
- selected state is owned by the canonical runtime selection owner;
- selected visuals are rendered by Bevy / WebGPU through the Atome visual contract;
- drag, resize, and lasso hit-testing are correctly prioritized;
- hit bounds and visual bounds match within a documented tolerance;
- resize preserves ratio for all Atome types tested;
- flower-menu contents and actions follow current canonical selection;
- all effectful menu actions route through the existing command / mutation policy;
- the final DOM remains clean, disposable, and non-authoritative;
- no forbidden DOM authority, fallback renderer, duplicate state, shadow state, or parallel persistence path remains;
- maps and tests are updated where required;
- temporary diagnostics are removed or explicitly justified according to repository rules;
- browser, server, Tauri, and test logs contain no unexplained errors or warnings.

---

# Final Report Required

The final response must include:

1. Root cause for each fixed regression.
2. Files changed and why.
3. Architecture ownership preserved or corrected.
4. Any dead or duplicate code removed.
5. Any map updates performed.
6. Tests and commands run.
7. Manual UI validations performed.
8. Remaining risks, if any.
9. Explicit confirmation that no forbidden fix pattern was used.

Do not claim success for any item that was not validated.
