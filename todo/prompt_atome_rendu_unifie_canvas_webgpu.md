# AI Implementation Prompt — Unified Atome Rendering with Minimal DOM and WebGPU

Version: 2026-05-29  
Status: Strict implementation prompt  
Scope: Atome/eVe rendering, project viewport, matrix previews, text, image, video, audio waveform, compositing, animation, export.

## Purpose

Use this document as the full prompt for the AI agent that will implement the new Atome rendering architecture.

The target is a simpler, stricter, more maintainable rendering engine where heterogeneous Atomes are rendered through one coherent visual pipeline.

The engine must minimize DOM creation, avoid one visible DOM subtree per Atome, and use the existing WebGPU rendering stack as the primary rendering path for project display, matrix previews, compositing, animation, and video-frame export.

---

# Prompt to give to the implementation AI

You are the AI agent responsible for refactoring the Atome/eVe rendering engine.

Your mission is to unify rendering for text, image, video, and audio waveform Atomes through a single WebGPU-first rendering model while keeping the DOM disposable, minimal, and non-authoritative.

The expected target is:

```text
Canonical Atome state
  -> normalized RenderAtom description
    -> type-specific adapter
      -> GPU texture, buffer, or render command
        -> WebGPU compositor
          -> one visible canvas surface per rendering zone
```

The target is not:

```text
one Atome = one visible DOM subtree
one Atome = one visible canvas element
one Atome = one private event system
one Atome = one independent renderer
```

---

## 0. Absolute rules before any code modification

Before editing any code, you must do all of the following:

1. Read `.codex/AGENTS.md` completely.
2. Apply `.codex/AGENTS.md` strictly to every file you inspect, modify, create, or remove.
3. Treat `.codex/AGENTS.md` as higher priority than this prompt if any conflict exists.
4. Read the relevant architecture maps before coding:
   - `maps/CODEMAP.md`
   - `maps/API_MAP.md`
   - `maps/DESIGN_MAP.md`
   - `maps/ARCHITECTURE_MAP.md` if it exists
5. Read the canonical Atome structure documentation:
   - `atome/documentations/atome_structur_to_respect.md`
6. Inspect the existing WebGPU renderer and reuse it. Do not create a parallel rendering engine.
7. Inspect existing Squirrel and Atome component APIs before creating any rendering, UI, or surface creation code.
8. Inspect current renderer tests and guardrails before adding new tests.
9. Identify legacy surfaces in scope. If they are on the controlling path, migrate or remove them instead of preserving parallel implementations.
10. Do not perform Git write operations. Git is read-only.

Mandatory implementation constraints from `.codex/AGENTS.md`:

- JavaScript only for the main codebase.
- No TypeScript.
- No Python implementation.
- No patches, no temporary fixes, no fallback architecture, no compatibility shims.
- No direct frontend state mutation.
- Visible writes must pass through `window.Atome.commit` or `window.Atome.commitBatch`.
- DOM is projection only, never source of truth.
- Rendering must use WebGPU.
- Text rendering must use WebGPU and maintain synchronized hidden HTML only for editing, accessibility, styling, and system interaction.
- Direct DOM manipulation is forbidden unless an existing canonical Squirrel/Atome API explicitly owns that creation path.
- UI controls must use canonical Atome/Squirrel component systems.
- User-visible strings must use the existing internationalization system.
- Temporary files must be created only under `./temp`.
- Persistent tests must be created only under `./tests`.
- Architecture maps must be updated when structure, APIs, design contracts, or ownership boundaries change.

---

## 1. Mandatory status reporting after every step

After each implementation step, output a progress report with this exact structure:

```text
Progress: <percentage>%
Completed step: <step number and title>
Remaining steps: <short list of remaining step numbers and titles>
Files inspected: <list>
Files modified: <list>
Tests run: <commands and result>
Tests still required: <list or none>
Architecture maps updated: <yes/no/not needed + reason>
Blockers: <none or precise blocker>
```

Do not skip the remaining-steps line.  
Do not declare the task complete before step 18 is finished and validated.

---

## 2. Architectural decision

The final rendering architecture must be:

```text
one project rendering surface
one matrix rendering surface when the matrix is visible
optional internal offscreen render targets
one hidden text service root at most
one active text editor at most
zero visible DOM subtree per Atome
zero visible canvas per Atome by default
```

Use WebGPU as the shared visual backend for:

- project viewport rendering;
- matrix thumbnails;
- image composition;
- video frame composition;
- audio waveform drawing;
- text display;
- interactive selection and handles;
- animation;
- exportable frame rendering;
- video compositing.

The canvas is not chosen only for image performance. It is chosen because every Atome must become a composable layer that can later be imported into a timeline, merged into a video frame, animated, previewed, exported, or used as part of an interactive scene.

---

## 3. DOM policy for this task

### 3.1 Visible DOM target

The ideal visible rendering DOM is limited to application shell elements plus one managed canvas surface per active rendering zone.

Conceptual target:

```html
<canvas id="eve_surface_project" class="eve-render-surface"></canvas>
<canvas id="eve_surface_matrix" class="eve-render-surface"></canvas>
```

Rules:

- Do not create one visible canvas per Atome.
- Do not create one visible wrapper per Atome.
- Do not create visible image, video, audio, SVG, text, button, handle, or overlay nodes per Atome.
- Do not create DOM metadata for Atome identity, type, selection, media state, project state, replay state, sync state, or renderer state.
- Do not use `data-*` attributes to carry Atome business state.
- Do not use DOM classes that encode Atome ids, project ids, media kinds, renderer names, ownership, state, or replay facts.
- Do not branch business behavior from DOM attributes, DOM classes, inline styles, DOM comments, hidden nodes, or marker nodes.

If existing shell DOM is necessary, preserve it only when it is not proportional to the number of Atomes and does not become a source of truth.

### 3.2 Hidden text DOM exception

The only allowed Atome-specific DOM exception is text, and it must be centralized.

Allowed text infrastructure:

```text
one hidden text layout service root
one active text editor surface at most
```

This hidden text layer may support:

- text editing;
- IME input;
- selection;
- copy/paste;
- accessibility;
- browser-native focus behavior;
- measuring or synchronizing rich text layout;
- paragraph and style inspection;
- temporary editing affordances.

It must not own:

- canonical text content;
- Atome identity;
- persistence state;
- replay state;
- sync state;
- mutation ordering;
- business logic;
- final visual truth.

Text DOM is a synchronized projection of canonical Atome state. After editing, changes must be committed through the canonical mutation pipeline and the text DOM must be detached, reset, or reused without becoming the persistent representation.

### 3.3 Required DOM budget tests

Create or update tests that fail if:

- a visible DOM node is created for every Atome;
- a visible canvas is created for every Atome;
- a listener is attached for every Atome;
- matrix previews instantiate miniature project DOM trees;
- hidden text roots multiply per text Atome;
- a text editor remains mounted after edition ends;
- final Atome DOM contains business state;
- renderer state is recovered from DOM instead of registries.

Minimum scenario:

```text
100 heterogeneous Atomes: text, image, video, audio waveform
Expected visible Atome DOM growth: zero or bounded constant
Expected visible canvas count: bounded constant
Expected per-Atome event listeners: zero
```

---

## 4. Unified RenderAtom contract

Create or reuse one normalized render description that all Atome types pass through.

Do not expand the canonical Atome model with view-local verbosity. The RenderAtom object is a runtime projection derived from canonical Atome state.

Conceptual JavaScript shape:

```js
const renderAtom = {
  id: "atome-id",
  type: "text",
  revision: 1,
  bounds: {
    x: 0,
    y: 0,
    width: 320,
    height: 180
  },
  transform: {
    translateX: 0,
    translateY: 0,
    scaleX: 1,
    scaleY: 1,
    rotate: 0,
    originX: 0,
    originY: 0
  },
  visual: {
    visible: true,
    opacity: 1,
    zIndex: 0,
    blendMode: "normal"
  },
  content: {},
  style: {},
  capabilities: {
    editable: false,
    playable: false,
    audible: false,
    selectable: true,
    exportable: true
  }
};
```

Rules:

- `RenderAtom` is disposable runtime data.
- `RenderAtom` must be recreated or invalidated from canonical state.
- `RenderAtom` must not become a second writable source of truth.
- DOM must never serialize or mirror the full `RenderAtom`.
- Renderer caches may use revision keys but must not own business state.
- Adding a new Atome type must require one adapter, not a new rendering architecture.

---

## 5. Scene graph and interaction model

Because DOM is no longer one node per Atome, interactions must be handled through the rendering engine and scene graph.

Required model:

```text
browser pointer or keyboard event
  -> central surface event handler
    -> scene graph hit-test
      -> Atome intent
        -> policy/capability validation
          -> canonical mutation pipeline
            -> dirty flags
              -> WebGPU render
```

Rules:

- Centralize pointer events on the rendering surface or viewport owner.
- Do not attach pointer listeners per Atome.
- Use scene graph bounds, transforms, z-order, masks, clips, and hit regions for selection.
- Draw selection, hover, guides, resize handles, crop handles, and bounding boxes through WebGPU or one bounded overlay surface.
- Do not use DOM classes as the authoritative selected state.
- Do not use DOM geometry as source of truth for drag, resize, transform, or layout.
- Commit real mutations through `window.Atome.commit` or `window.Atome.commitBatch`.

---

## 6. Type rendering strategies

### 6.1 Image Atomes

Target path:

```text
image source
  -> asset cache
    -> GPU texture
      -> WebGPU compositor
```

Rules:

- Images render as GPU textures.
- No visible `<img>` per Atome.
- Decode and upload must be cached by source, dimensions, device pixel ratio, and asset revision.
- Transform changes must not force image decode or texture upload.
- Matrix previews reuse the same texture pipeline at thumbnail resolution.

### 6.2 Video Atomes

Target path:

```text
video source at time t
  -> decoded frame or frame provider
    -> GPU texture
      -> WebGPU compositor
```

Rules:

- No visible `<video>` per Atome.
- If an HTML video element is technically needed for decoding, it must be hidden, centralized, pooled, and non-authoritative.
- Frame extraction must be tied to timeline time or media transport state.
- Frame cache depth must be bounded.
- Rendering one frame for export must use the same compositor path as interactive rendering.
- Do not create a second video compositor for export.

### 6.3 Audio waveform Atomes

Target path:

```text
audio source
  -> peak analysis cache
    -> waveform vertex or texture data
      -> WebGPU draw
```

Rules:

- Audio waveform is visual data, not DOM or SVG markup.
- No visible `<audio>` per waveform Atome.
- Playback state must stay in the audio/media runtime, not DOM.
- Peak data must be cached by source, revision, sample window, zoom level, and channel policy.
- Zooming should reuse multiresolution peaks where possible.
- Long files must not regenerate full waveforms every frame.

### 6.4 Text Atomes

Text is the strict exception because professional text requires editing, IME, selection, accessibility, style resolution, and complex layout.

Target path:

```text
canonical rich text Atome
  -> hidden synchronized text service
    -> layout and editing bridge
      -> WebGPU text texture or glyph commands
        -> WebGPU compositor
```

Required text capabilities:

- rich text runs;
- font family, weight, style, size;
- color and opacity;
- line height;
- letter spacing;
- paragraph spacing;
- alignment;
- text flow inside a box;
- selection geometry;
- editing state;
- copy/paste;
- IME input;
- accessibility bridge;
- deterministic export rendering.

Rules:

- The hidden HTML text layer is allowed only as a synchronized service.
- Visible text rendering must be WebGPU-driven.
- The DOM must not become the text storage model.
- The hidden text root must be reused across text Atomes.
- The active editor must be unique.
- The active editor must mount only during editing.
- On edit commit, the result must flow into the canonical Atome mutation pipeline.
- On edit cancel, no canonical mutation must be emitted.
- Text style must be canonical Atome data, not extracted from DOM as truth.
- Avoid `html2canvas` or DOM screenshot libraries as the architectural renderer.
- If browser layout is used for measurement, it remains a measurement bridge, not the renderer of record.

Professional DTP target:

```text
DOM hidden layer = editing, accessibility, system text behavior, layout measurement
WebGPU layer = visible text, preview text, export text, compositing text
Canonical Atome state = text content and style truth
```

---

## 7. Matrix preview strategy

The matrix is an item that groups different user projects. It must preview projects without cloning their DOM.

Target path:

```text
project canonical state
  -> render project at thumbnail size
    -> internal GPU render target
      -> preview texture cache
        -> matrix WebGPU surface
```

Rules:

- Do not create a mini DOM project for each matrix item.
- Do not create one canvas DOM per preview tile.
- Do not duplicate the rendering engine for matrix previews.
- Matrix previews must use the same renderer with different render target dimensions and quality settings.
- Preview textures must be cached by project id, project revision, preview size, device pixel ratio, render quality, theme or design revision, and renderer version.
- Updating one project must invalidate only its preview, not the full matrix.
- Matrix interaction must use scene graph hit-testing, not per-tile DOM event listeners.

---

## 8. Compositing, animation, and export requirement

This refactor must make Atomes usable as compositable layers for:

- interactive project display;
- matrix previews;
- animation;
- timeline playback;
- video editing;
- export of still frames;
- export of video frames;
- future effects and transitions.

Required invariant:

```text
The same logical renderer must be able to render a project at time t into a visible surface or an offscreen export target.
```

Do not implement:

- one renderer for UI;
- one renderer for thumbnails;
- one renderer for export;
- one renderer for video composition.

Implement one renderer with multiple render targets.

---

## 9. Cache policy

Caches are allowed only as performance projections derived from canonical state.

Required caches:

### 9.1 Texture cache

Key must include at least:

```text
asset id or content hash
source revision
target dimensions
device pixel ratio
color or decode policy
renderer version
```

### 9.2 Text render cache

Key must include at least:

```text
text content revision
rich text style revision
paragraph style revision
box dimensions
font availability revision
device pixel ratio
renderer version
```

### 9.3 Video frame cache

Key must include at least:

```text
media id
media revision
time or frame index
decode policy
target dimensions
renderer version
```

The cache must be bounded.

### 9.4 Waveform cache

Key must include at least:

```text
audio id
audio revision
sample range
zoom level
channel policy
peak generation version
```

### 9.5 Matrix preview cache

Key must include at least:

```text
project id
project revision
preview dimensions
device pixel ratio
render quality
design revision
renderer version
```

Rules:

- Caches must never become business state.
- Dirty flags must be explicit.
- Transform-only changes must not invalidate content textures.
- Content changes must not force full scene rebuild when partial invalidation is possible.
- Cache eviction must be deterministic enough to debug and safe under memory pressure.

---

## 10. API and mutation requirements

Any new feature must expose a clear API and must remain compatible with AI automation, deterministic replay, and Atome history.

Rules:

- Effectful operations must pass through the existing command or mutation pipeline.
- Do not bypass the Command Bus if it owns the operation.
- Do not mutate frontend state directly.
- Do not mutate canonical Atome state from renderer code.
- Renderer code may request invalidation or emit user intent, not silently rewrite business state.
- Any renderer-visible property must come from canonical Atome state or approved runtime registries.
- Any new API must be documented in the relevant map.

---

## 11. Implementation plan

### Step 1 — Read rules, maps, and current architecture

Actions:

- Read `.codex/AGENTS.md`.
- Read relevant maps and Atome structure documentation.
- Inspect current rendering entry points.
- Inspect existing WebGPU setup.
- Inspect current matrix preview implementation.
- Inspect current text, image, video, and audio waveform rendering paths.
- Inspect current tests and validation commands.
- Modify no production code in this step.

Deliverable:

- Short architecture inventory.
- List of canonical owners found.
- List of reusable renderer modules found.
- List of legacy or duplicated surfaces found.

Progress after this step: `5%`  
Remaining steps after this step: 2–18.

---

### Step 2 — Establish the single rendering target model

Actions:

- Identify the project surface owner.
- Identify the matrix surface owner.
- Decide where render targets are owned.
- Reuse existing WebGPU device, context, pipeline, and lifecycle code.
- Avoid creating new standalone renderer systems.
- Define the bounded DOM surface budget.

Deliverable:

- Surface ownership plan.
- DOM budget plan.
- Clear statement of whether existing surfaces are reused, extended, or refactored.

Progress after this step: `10%`  
Remaining steps after this step: 3–18.

---

### Step 3 — Audit current DOM growth and event listeners

Actions:

- Measure or inspect DOM nodes created per Atome.
- Identify visible wrappers, canvas elements, image nodes, video nodes, audio nodes, SVG nodes, text nodes, handles, and overlays created per Atome.
- Identify event listeners attached per Atome.
- Identify any Atome business state stored in DOM attributes, classes, inline styles, comments, or marker nodes.
- Identify matrix preview DOM cloning or mini project DOM creation.

Deliverable:

- DOM growth report.
- Per-Atome DOM removal list.
- Listener centralization list.
- Forbidden DOM authority list.

Progress after this step: `15%`  
Remaining steps after this step: 4–18.

---

### Step 4 — Define or reuse the RenderAtom normalization layer

Actions:

- Create or reuse a normalized runtime description for rendering.
- Keep canonical Atome structure minimal.
- Derive `RenderAtom` from canonical state.
- Do not store `RenderAtom` in DOM.
- Do not make `RenderAtom` writable business state.
- Include bounds, transform, visual fields, content pointer, style pointer, capabilities, and revision data.

Deliverable:

- Normalization function or module.
- Unit tests for text, image, video, and audio waveform Atomes.
- Confirmation that canonical Atome schema was not polluted with view-local fields.

Progress after this step: `20%`  
Remaining steps after this step: 5–18.

---

### Step 5 — Build the scene graph and hit-test model

Actions:

- Represent renderable Atomes in a scene graph.
- Sort by layer and z-order.
- Add hit-test support using bounds, transforms, clipping, and visibility.
- Centralize pointer events on the surface owner.
- Remove or disable per-Atome listeners where the new path replaces them.
- Ensure interactions emit Atome intents and canonical mutations, not renderer state writes.

Deliverable:

- Scene graph owner.
- Hit-test implementation.
- Tests for selection and event routing without per-Atome DOM listeners.

Progress after this step: `26%`  
Remaining steps after this step: 6–18.

---

### Step 6 — Implement or refactor the central WebGPU compositor

Actions:

- Reuse existing WebGPU infrastructure.
- Add a central render scheduling path if one does not already exist.
- Support visible canvas targets and offscreen render targets through the same compositor.
- Support layer composition by `RenderAtom` order.
- Add dirty flags.
- Keep type-specific logic outside the compositor.
- Keep the compositor small and cohesive.

Deliverable:

- Central compositor path.
- Render target abstraction or existing equivalent.
- Tests or probes proving one project surface can render multiple heterogeneous Atomes.

Progress after this step: `32%`  
Remaining steps after this step: 7–18.

---

### Step 7 — Implement image adapter

Actions:

- Convert image Atomes into GPU textures.
- Reuse existing asset loading and cache mechanisms.
- Avoid visible `<img>` nodes per Atome.
- Ensure transform-only changes do not re-decode images.
- Add cache invalidation by asset revision.

Deliverable:

- Image rendering adapter.
- Texture cache integration.
- Tests for image rendering, transform updates, and DOM budget.

Progress after this step: `38%`  
Remaining steps after this step: 8–18.

---

### Step 8 — Implement video adapter

Actions:

- Convert video Atomes into frame textures at time `t`.
- Reuse or centralize existing media decode infrastructure.
- Avoid visible `<video>` nodes per Atome.
- Pool hidden decode resources only if technically required.
- Bound video frame cache memory.
- Use the same frame path for interactive rendering and export rendering.

Deliverable:

- Video rendering adapter.
- Bounded frame cache.
- Tests for timeline time change, frame invalidation, and DOM budget.

Progress after this step: `44%`  
Remaining steps after this step: 9–18.

---

### Step 9 — Implement audio waveform adapter

Actions:

- Convert audio Atomes into waveform draw data.
- Use cached peaks or generate peaks through the existing audio/media pipeline.
- Draw waveform using WebGPU.
- Avoid visible `<audio>` or SVG waveform per Atome.
- Support zoom-level cache.
- Keep playback state outside the DOM.

Deliverable:

- Audio waveform adapter.
- Peak cache integration.
- Tests for long waveform rendering, zoom updates, and DOM budget.

Progress after this step: `50%`  
Remaining steps after this step: 10–18.

---

### Step 10 — Implement text layout and editing bridge

Actions:

- Create or reuse one hidden text service root through the canonical UI/surface infrastructure.
- Ensure the hidden text service is shared across all text Atomes.
- Ensure only one active editor exists at a time.
- Support rich text layout data required by DTP-like behavior.
- Support editing, IME, selection, copy/paste, and accessibility.
- Commit text edits through the canonical mutation pipeline.
- Cancel edits without canonical mutation.
- Destroy, detach, or reset the editor after editing ends.
- Do not store canonical text content in DOM.

Deliverable:

- Text bridge service.
- Active editor lifecycle.
- Tests for single hidden root, single editor, commit, cancel, teardown, and DOM non-authority.

Progress after this step: `58%`  
Remaining steps after this step: 11–18.

---

### Step 11 — Implement WebGPU text rendering

Actions:

- Convert text layout output into WebGPU-visible draw data or text texture data.
- Use canonical text content and style as the source of truth.
- Avoid DOM screenshot libraries as the renderer architecture.
- Cache text rendering by content revision, style revision, bounds, font state, device pixel ratio, and renderer version.
- Ensure visible project text, matrix preview text, and export text use the same renderer path.

Deliverable:

- WebGPU text adapter.
- Text render cache.
- Tests for style updates, text updates, bounds updates, and export consistency.

Progress after this step: `64%`  
Remaining steps after this step: 12–18.

---

### Step 12 — Implement matrix preview rendering through the same renderer

Actions:

- Render project previews into internal render targets.
- Draw preview textures into the matrix surface.
- Remove mini DOM project previews where they exist.
- Avoid one canvas per matrix tile.
- Cache previews by project revision and render settings.
- Invalidate only affected previews.
- Use scene graph hit-testing for matrix item interaction.

Deliverable:

- Matrix preview renderer using the shared compositor.
- Preview cache.
- Tests for many project previews without DOM multiplication.

Progress after this step: `70%`  
Remaining steps after this step: 13–18.

---

### Step 13 — Implement unified render-at-time path for animation and export

Actions:

- Add or reuse a render entry point that renders a project at a specific time `t`.
- Use the same path for interactive display, preview, and export.
- Ensure video frames, animated transforms, text, image, and waveform state can be resolved for time `t`.
- Avoid creating a second export renderer.
- Ensure render targets can be visible canvas or offscreen output.

Deliverable:

- Shared render-at-time function.
- Offscreen render target support or existing equivalent.
- Tests or validation for visible frame and offscreen frame equivalence.

Progress after this step: `76%`  
Remaining steps after this step: 14–18.

---

### Step 14 — Remove or migrate legacy DOM render paths

Actions:

- Remove replaced per-Atome DOM renderers from the active path.
- Remove replaced per-Atome event listener systems from the active path.
- Remove preview DOM cloning from the active path.
- Remove redundant adapters, proxy layers, fallbacks, and compatibility shims discovered in scope.
- Before removal, verify imports, dynamic references, tests, runtime dependencies, replay dependencies, sync dependencies, and maps.

Deliverable:

- Cleaned active rendering path.
- Legacy removal or migration report.
- Tests proving removed paths are not required.

Progress after this step: `82%`  
Remaining steps after this step: 15–18.

---

### Step 15 — Add blocking DOM and architecture guardrails

Actions:

Create or update tests that fail when:

- the DOM becomes source of truth;
- forbidden Atome metadata appears in DOM;
- per-Atome visible wrappers return;
- per-Atome visible canvas elements return;
- per-Atome event listeners return;
- matrix previews use cloned project DOM;
- text creates multiple hidden roots;
- more than one text editor is active;
- the text editor remains mounted after editing ends;
- transform-only changes trigger unnecessary texture regeneration;
- export uses a separate renderer path from interactive rendering.

Deliverable:

- Regression tests.
- Guardrail tests.
- Documented validation commands.

Progress after this step: `88%`  
Remaining steps after this step: 16–18.

---

### Step 16 — Update architecture maps and documentation

Actions:

- Update `maps/CODEMAP.md` if file ownership, module boundaries, or entry points changed.
- Update `maps/API_MAP.md` if APIs changed or were added.
- Update `maps/DESIGN_MAP.md` if rendering design tokens, JavaScript-generated styling, surface design, or visual factories changed.
- Update `maps/ARCHITECTURE_MAP.md` if architecture boundaries changed or if the file exists.
- Document how to add a new Atome renderer adapter.
- Document the text exception and its strict limits.
- Document matrix preview rendering.
- Document render-at-time for export.

Deliverable:

- Updated maps.
- Short renderer architecture document if the repository already has a documentation location for this topic.

Progress after this step: `92%`  
Remaining steps after this step: 17–18.

---

### Step 17 — Run validation and inspect logs

Actions:

Run the narrowest relevant validation first, then widen.

Use existing commands where applicable:

```text
npm run test:run -- <focused test path>
npm run check:syntax
npm run check:m0
npm run test:run
npm run check:m1
npm run check:m2
npm run dev:test-ui
```

Rules:

- Do not claim success from static code inspection alone.
- Inspect relevant browser, WebView, server, and test logs for errors and warnings.
- Explain every remaining warning or error.
- Remove temporary diagnostics.
- Rerun the cleaned validation path.

Deliverable:

- Validation report.
- Commands run.
- Results.
- Remaining unexplained errors or warnings, if any.

Progress after this step: `97%`  
Remaining steps after this step: 18.

---

### Step 18 — Final report

Actions:

Provide a final implementation report containing:

- architecture summary;
- files inspected;
- files modified;
- files removed;
- maps updated;
- APIs added or changed;
- tests added or changed;
- validation commands executed;
- validation results;
- DOM budget result;
- canvas count result;
- hidden text root count result;
- active text editor lifecycle result;
- performance-sensitive cache decisions;
- known limitations backed by evidence;
- any blocker that prevents full completion.

Do not report success unless all acceptance criteria are satisfied or an evidence-backed blocker is clearly documented.

Progress after this step: `100%`  
Remaining steps after this step: none.

---

## 12. Acceptance criteria

The task is successful only if all of the following are true:

1. `.codex/AGENTS.md` was read and applied.
2. Existing architecture maps were consulted before coding.
3. Existing WebGPU infrastructure was reused or cleanly refactored.
4. Rendering uses WebGPU as the primary visual engine.
5. Project display uses a bounded number of visible canvas surfaces.
6. Matrix display uses a bounded number of visible canvas surfaces.
7. Atomes do not create visible DOM proportional to their count.
8. Atomes do not create visible canvas elements proportional to their count.
9. Interactions are routed through scene graph hit-testing, not per-Atome DOM listeners.
10. Image Atomes render as GPU textures.
11. Video Atomes render as frame textures.
12. Audio waveform Atomes render through WebGPU, not DOM or massive SVG.
13. Text Atomes use a hidden synchronized HTML bridge only for editing, accessibility, styling, and system interaction.
14. Visible text rendering is WebGPU-driven.
15. Text content and style remain canonical Atome state, not DOM state.
16. Matrix previews reuse the same renderer through render targets.
17. Export and animation reuse the same render-at-time path.
18. Caches are projections only and never become business state.
19. Legacy render paths in scope were removed or migrated when safe and verifiable.
20. Tests prevent the return of DOM authority and per-Atome DOM multiplication.
21. Relevant maps and documentation were updated.
22. Final validation commands were executed and reported.

---

## 13. Anti-objectives

Do not do any of the following:

- create a visible canvas per Atome by default;
- create a visible DOM wrapper per Atome;
- create visible `<img>`, `<video>`, `<audio>`, or SVG waveform nodes per Atome;
- clone project DOM to create matrix previews;
- implement a second renderer for thumbnails;
- implement a second renderer for export;
- use DOM as source of truth;
- store Atome business state in `data-*` attributes;
- encode runtime state in CSS classes;
- store renderer readiness, selection, media kind, project id, replay state, sync state, or mutation payloads in DOM;
- attach event listeners per Atome;
- add TypeScript;
- add Python;
- add new dependencies without architecture-level justification;
- add fallback rendering paths;
- keep legacy and new renderers active in parallel without a removal plan and validation;
- patch symptoms instead of fixing the source architecture;
- leave temporary logs, probes, or debug code in production files;
- skip map updates after structural changes.

---

## 14. Final architectural summary

The target architecture is:

```text
Canonical Atome state is the truth.
DOM is disposable shell and text-system bridge only.
WebGPU is the visual renderer.
Scene graph owns visual ordering and hit-test.
Adapters translate Atome types into GPU-ready data.
The compositor renders project, matrix, animation, and export.
Text uses hidden HTML only for the parts browsers handle better, not as visible truth.
Previews are render targets, not cloned DOM.
```

The strict design rule is:

```text
Minimize DOM.
Centralize rendering.
Unify all Atome types as compositable WebGPU layers.
Keep the engine small, deterministic, testable, and maintainable.
```
