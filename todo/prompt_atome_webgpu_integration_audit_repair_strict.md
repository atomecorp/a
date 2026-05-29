# AI Audit and Repair Prompt — Unified Atome Canvas/WebGPU Rendering Integration

Version: 2026-05-29  
Status: Strict verification, proof, and repair prompt  
Scope: Atome/eVe rendering integration, minimal DOM enforcement, WebGPU rendering path, matrix previews, text hidden-DOM service, image/video/waveform adapters, hit-testing, cache invalidation, tests, architecture maps.

---

# Purpose

Use this prompt after an AI agent claims that the unified Atome Canvas/WebGPU rendering architecture has been implemented.

Your mission is not to trust the previous implementation.

Your mission is to prove, with executable evidence, that the integration is real, complete, minimal, maintainable, and compliant with the repository architecture. If it is not compliant, you must repair it at the source, then prove again that the repair is correct.

The target architecture is:

```text
Canonical Atome state
  -> normalized RenderAtom description
    -> type-specific adapter
      -> GPU texture, buffer, glyph/shape/text command, media frame, or waveform data
        -> shared WebGPU compositor
          -> one visible canvas surface per active rendering zone
```

The forbidden architecture is:

```text
one Atome = one visible DOM subtree
one Atome = one visible canvas
one Atome = one private renderer
one Atome = one private event system
DOM = source of truth
matrix preview = cloned DOM
text Atome = uncontrolled permanent DOM island
legacy renderer + new renderer running in parallel
```

---

# Non-negotiable authority

Before doing anything, read `.codex/AGENTS.md` completely and apply it strictly.

`.codex/AGENTS.md` has higher priority than this prompt. If a conflict exists, stop and report the exact conflicting rule.

You are not allowed to refuse, simplify, postpone, or downscope this task because it is complex, long, repetitive, or requires multiple validation passes. Complexity is not a blocker.

Allowed stop conditions are limited to:

1. a direct conflict with `.codex/AGENTS.md`;
2. a higher-priority safety or repository rule;
3. a missing dependency that makes execution technically impossible and cannot be worked around without violating the architecture;
4. a required user decision that cannot be inferred from repository evidence.

If one of these stop conditions occurs, output exactly:

```text
Execution stopped.
Blocking rule: <exact rule, file, or higher-priority constraint>
Blocked step: <step number and title>
Reason: <precise technical reason>
Evidence collected: <files, commands, logs, or missing dependency proof>
Smallest compliant next action: <specific next action>
Completed percentage: <last validated percentage>
Remaining steps: <full remaining step list>
```

A generic refusal is invalid. A partial answer is invalid. A claim without evidence is invalid.

---

# Absolute execution contract

You must execute every numbered step in order.

You must not:

- delete, merge, rename, reorder, weaken, or skip any step;
- replace this audit with a superficial code review;
- accept previous claims without proof;
- mark a step complete because files exist;
- mark a step complete because code “looks correct”;
- mark a step complete without validating the real runtime path when runtime validation is possible;
- hide failures behind TODOs, placeholders, compatibility layers, silent guards, temporary adapters, fallback paths, or legacy parallel systems;
- create TypeScript or Python code;
- perform Git write operations;
- create temporary files outside `./temp`;
- create persistent tests outside `./tests`;
- leave temporary diagnostics, debug logs, probes, or experimental files in the final state;
- declare completion while warnings, errors, stale maps, legacy routes, or unvalidated rendering paths remain unexplained.

You must:

- identify the real canonical owner for every touched responsibility;
- reuse existing architecture before creating new modules;
- remove duplicate or obsolete implementations discovered in scope;
- update maps when structure, ownership, API, rendering, or design contracts changed;
- write all code comments, logs, warnings, errors, documentation, and developer-facing messages in English;
- validate after each substantive repair;
- rerun the exact failing validation after each repair;
- widen validation only after the narrow validation passes.

---

# Mandatory progress report after every step

After every numbered step, output exactly this report:

```text
Progress: <percentage>%
Completed step: <step number and title>
Status: <passed / failed / repaired and passed / blocked>
Evidence: <files inspected, commands run, runtime checks, logs, screenshots, or exact proof>
Files inspected: <list>
Files modified: <list or none>
Tests run: <commands and result, or none with reason>
Architecture maps checked/updated: <yes/no/not needed + reason>
Remaining steps: <short list of remaining step numbers and titles>
Open risks: <none or precise list>
```

Do not skip the `Remaining steps` line.

Do not inflate progress.

Progress is calculated only from validated steps:

```text
progress = floor((validated_completed_steps / 20) * 100)
```

A failed step does not increase progress.  
A repaired step increases progress only after the repair is validated.  
Planning, reading, partial edits, failed tests, and unvalidated code do not count as completed progress.

---

# Global acceptance criteria

The integration is accepted only if all of the following are proven:

1. `.codex/AGENTS.md` was read and applied.
2. Relevant maps were read before judging or changing architecture.
3. Canonical Atome state remains outside the DOM.
4. The DOM remains a disposable projection layer only.
5. Visible Atome rendering does not create one DOM subtree per Atome on the main rendering path.
6. Visible Atome rendering does not create one canvas per Atome.
7. The project viewport uses a shared managed canvas/WebGPU surface.
8. The matrix preview uses shared renderer output, render targets, cached GPU snapshots, or equivalent compositor-owned outputs; it does not clone DOM.
9. Image Atomes render through the unified rendering path.
10. Video Atomes render through the unified rendering path.
11. Audio waveform Atomes render through the unified rendering path.
12. Text Atomes use a bounded hidden HTML text service only for editing, layout, accessibility, measurement, or system interaction, then feed the canvas/WebGPU output.
13. There is at most one hidden text service root and at most one active editor unless repository evidence proves a stricter canonical service already exists.
14. Hit-testing, selection, drag, resize, transform, and manipulation do not depend on forbidden DOM attributes or DOM-owned business state.
15. Cache invalidation is deterministic and tied to canonical state changes.
16. The legacy renderer is removed from the main path or proven unreachable.
17. No fallback rendering architecture remains active.
18. Tests or guardrails exist for DOM budget, renderer routing, text service bounds, matrix previews, and legacy path prevention.
19. The relevant maps are updated if ownership, modules, APIs, or design/rendering contracts changed.
20. Final validation passes with no unexplained errors or warnings.

---

# Required evidence ledger

Create and maintain an evidence ledger during the audit.

The ledger must contain:

```text
Requirement ID:
Requirement:
Status: pass / fail / repaired-pass / blocked
Evidence files:
Evidence commands:
Runtime evidence:
Tests:
Remaining risk:
Repair performed:
```

The ledger may be temporary during the task, but if it is created as a file it must be placed under `./temp` unless it is intentionally committed as project documentation under the correct documentation path and maps allow it.

---

# Step 1 — Read governing rules and classify the task

Read `.codex/AGENTS.md` completely.

Classify this task as:

```text
architecture audit + rendering integration validation + possible structural repair + regression validation
```

Apply the strict union of all relevant sections for debugging, refactor, rendering, UI, state, DOM, tests, maps, temporary files, and Git read-only policy.

Acceptance criteria:

- `.codex/AGENTS.md` was read.
- The task type was classified.
- The applicable rule families were listed.
- Any conflict was reported before proceeding.

---

# Step 2 — Read architecture maps and canonical documentation

Read the relevant architecture documents before judging the implementation.

Mandatory documents to inspect when present:

```text
maps/CODEMAP.md
maps/API_MAP.md
maps/DESIGN_MAP.md
maps/ARCHITECTURE_MAP.md
atome/documentations/atome_structur_to_respect.md
eve/application/documentations/
documentations/
```

Acceptance criteria:

- Existing maps were inspected.
- Missing maps were reported as missing, not ignored.
- The canonical owners for rendering, Atome state, runtime state, design-generated styles, UI surfaces, media, matrix preview, and text editing were identified.

---

# Step 3 — Establish the previous implementation footprint

Inspect the current repository state using read-only commands only.

Allowed examples:

```text
git status --short
git diff --name-only
git diff --stat
git diff -- <path>
```

Do not stage, commit, reset, checkout, restore, branch, stash, or mutate Git state.

Acceptance criteria:

- Modified, added, deleted, and untracked files relevant to the previous rendering task were listed.
- Every touched file was classified by responsibility.
- Suspicious unrelated changes were identified.
- The audit scope was defined from evidence, not assumption.

---

# Step 4 — Build the verification matrix

Create a verification matrix covering at least these requirement groups:

```text
R1  Rule compliance
R2  Map and documentation consistency
R3  Canonical state outside DOM
R4  Minimal visible DOM
R5  No per-Atome visible canvas
R6  Shared project WebGPU surface
R7  Shared matrix preview path
R8  RenderAtom normalization
R9  Image adapter
R10 Video adapter
R11 Audio waveform adapter
R12 Text hidden-DOM service
R13 Text editing and layout synchronization
R14 Hit-testing and manipulation
R15 Selection and handles
R16 Cache and invalidation
R17 Animation/compositing/export readiness
R18 Legacy renderer removal
R19 Tests and guardrails
R20 Final validation cleanliness
```

Acceptance criteria:

- Each requirement has a planned evidence source.
- Each requirement has at least one static check or runtime validation path.
- Any missing validation path is flagged as a defect to repair later in this prompt.

---

# Step 5 — Verify DOM authority and forbidden DOM state

Search the codebase and inspect final rendered DOM paths for forbidden DOM authority.

Look for forbidden patterns including but not limited to:

```text
data-atome-id
data-atome-kind
data-project-id
data-atome-selected
data-group-atome
data-group-id
data-media-kind
data-renderer
data-eve-media-renderer
data-eve-system-layer
atome_id
eve-renderer-*
eve-media-kind-*
eve-atome-kind-*
eve-selected-true
eve-selected-false
class=""
border: medium
outline
DOM comments carrying state
serialized Atome payloads in DOM
```

Acceptance criteria:

- Static search was run.
- Runtime DOM inspection was run when the app can be executed.
- Forbidden DOM state is absent from final Atome DOM.
- Any legacy fallback reading forbidden DOM state is removed or proven unreachable.

Repair rule if failed:

- Move authority to the canonical Atome registry, runtime registry, or domain registry.
- Keep DOM as projection only.
- Add or update a regression test that fails when forbidden DOM state returns.

---

# Step 6 — Verify visible DOM minimization

Prove that the main rendering path no longer creates a visible DOM subtree per Atome.

Required runtime scene when possible:

```text
one text Atome
one image Atome
one video Atome
one audio waveform Atome
multiple transforms
selection state
matrix preview visible
```

Inspect actual DOM after rendering.

Acceptance criteria:

- Atome visual output is not represented by one visible subtree per Atome on the main rendering path.
- DOM elements that remain are shell, surface, hidden text service, or explicitly justified canonical UI controls.
- The DOM count does not grow linearly with Atome count except for approved non-rendering control surfaces.
- A DOM budget check exists or is added.

Repair rule if failed:

- Remove per-Atome visible DOM projection from the main path.
- Route visual output through the shared renderer.
- Keep only minimal shell and allowed editor/control DOM.

---

# Step 7 — Verify canvas ownership and surface count

Prove that the implementation does not create one visible canvas per Atome.

Search for canvas creation and inspect runtime canvases.

Recommended static checks:

```text
document.createElement('canvas')
document.createElement("canvas")
<canvas
OffscreenCanvas
appendChild(canvas)
querySelector('canvas')
```

Acceptance criteria:

- Project rendering uses one managed visible canvas surface per active project rendering zone.
- Matrix rendering uses one managed visible canvas surface per active matrix rendering zone when visible.
- Internal offscreen targets are allowed only when owned by the renderer/compositor/cache and not by individual Atome DOM hosts.
- No visible canvas is nested inside each Atome host.
- Any extra canvas is documented with ownership, lifecycle, and reason.

Repair rule if failed:

- Move per-Atome canvas allocation into compositor-managed textures, buffers, or offscreen render targets.
- Remove DOM-mounted per-Atome canvas surfaces.
- Add a test that fails when an Atome host contains a visible canvas.

---

# Step 8 — Verify the normalized RenderAtom contract

Inspect the model that converts canonical Atome state into renderer-facing data.

Acceptance criteria:

- A normalized render description exists or an existing canonical equivalent is identified.
- It is derived from canonical Atome state, not DOM state.
- It covers at least text, image, video, and audio waveform Atomes.
- It contains only renderer-relevant data.
- It does not duplicate authoritative business state.
- It is deterministic and stable enough for cache keys, invalidation, previews, and export.

Repair rule if failed:

- Create or refactor the canonical renderer-facing contract in the existing correct owner.
- Do not create a parallel model if an equivalent exists.
- Update maps if ownership or APIs change.

---

# Step 9 — Verify WebGPU compositor integration

Prove that WebGPU is the real visual backend for the unified rendering path.

Acceptance criteria:

- The existing WebGPU stack is reused.
- The implementation does not create a parallel renderer.
- Project rendering flows into the shared WebGPU compositor.
- Matrix preview rendering flows into the same renderer family or a compositor-owned render target path.
- Image, video, waveform, and text preview outputs can be composed as layers.
- Renderer lifecycle is explicit: initialize, resize, update resources, render frame, dispose.
- Device loss or initialization failure is handled according to existing architecture, not by adding a fallback renderer.

Repair rule if failed:

- Remove parallel or bypass renderers.
- Wire rendering into the existing WebGPU owner.
- Keep fallback-free architecture unless `.codex/AGENTS.md` or existing architecture explicitly defines an approved exception.

---

# Step 10 — Verify image, video, and waveform adapters

Inspect each media adapter.

Acceptance criteria for image:

- Decoding/loading is separated from rendering.
- Rendering emits texture/resource updates or render commands, not DOM image projection.
- Cache invalidation happens when source, crop, transform, opacity, blend, filter, or relevant style changes.

Acceptance criteria for video:

- Video frames can feed the compositor.
- Playback state is not stored in DOM attributes.
- Frame update scheduling is centralized or explicitly owned.
- Paused, seeked, playing, ended, hidden, and matrix preview states are handled deterministically.

Acceptance criteria for audio waveform:

- Waveform data is derived from canonical audio/media data or a domain cache.
- Rendering emits buffers/commands/textures, not DOM waveform fragments.
- Zoom, duration, selection, amplitude, and visible time range invalidate correctly.

Repair rule if failed:

- Refactor adapters to produce renderer-owned resources or commands.
- Remove DOM-owned media rendering from the main path.
- Add focused tests for the failing adapter.

---

# Step 11 — Verify hidden HTML text service

Text is the only allowed controlled exception, and it must remain bounded.

Acceptance criteria:

- Hidden HTML exists only as a centralized text service, not one uncontrolled text DOM tree per Atome.
- There is at most one hidden text service root unless repository evidence proves a stricter existing canonical design.
- There is at most one active text editor instance unless repository evidence proves a stricter existing canonical design.
- The hidden service is used for editing, selection, IME, accessibility, layout, measurement, or style resolution.
- Display output is converted into renderer-consumable data for canvas/WebGPU.
- Text decorations, font weight, color, layout, text flow, and existing editing behavior do not regress.
- The DOM text service does not become authoritative storage for text content or style.
- Text changes commit through the canonical mutation pipeline.

Repair rule if failed:

- Centralize text DOM into one service.
- Move text authority to canonical Atome state.
- Synchronize text service output to renderer resources.
- Add or update tests covering edit -> commit -> render -> matrix preview.

---

# Step 12 — Verify matrix preview integration

Prove that matrix thumbnails/previews are not DOM clones and are not rendered by independent per-Atome renderers.

Acceptance criteria:

- Matrix preview uses compositor-owned render targets, cached snapshots, shared renderer output, or an equivalent centralized path.
- Preview invalidation is tied to canonical state changes.
- Preview generation does not create persistent per-Atome visible DOM.
- Preview generation does not create one visible canvas per Atome.
- Text, image, video, and waveform previews use the same normalized render contract family.
- Matrix rendering remains isolated from project editing state except through explicit canonical state and cache invalidation.

Repair rule if failed:

- Replace DOM cloning with renderer-owned snapshot generation.
- Add cache keys and invalidation from canonical state.
- Add tests for preview refresh after text, image, video frame, and waveform changes where possible.

---

# Step 13 — Verify hit-testing, selection, and manipulation

Prove that interaction works without DOM-owned Atome state.

Acceptance criteria:

- Hit-testing resolves from pointer coordinates, renderer geometry, spatial index, or canonical registry data.
- DOM is not used to store Atome identity, selection, group ownership, renderer state, or behavior routing.
- Selection state lives in runtime/canonical state according to the existing architecture.
- Selection projection uses allowed generic visual classes or renderer visuals, not forbidden state classes.
- Drag, resize, rotate, transform, keyboard routing, and focus do not depend on forbidden DOM data.
- Real UI interactions are tested when possible.

Repair rule if failed:

- Move interaction authority to registry/domain owners.
- Keep DOM event targets as input sources only.
- Add runtime tests for click, drag, resize, selection, deselection, and keyboard routing when applicable.

---

# Step 14 — Verify cache, invalidation, and lifecycle cleanup

Inspect preview, render resource, texture, buffer, video frame, waveform, and text layout caches.

Acceptance criteria:

- Cache keys derive from canonical render-relevant state.
- Cache invalidation is explicit and deterministic.
- Resource disposal exists for removed Atomes, closed projects, hidden matrix, device loss, and media source changes.
- No stale renderer resources survive after deletion or replacement.
- No cache depends on DOM snapshots as source of truth.

Repair rule if failed:

- Centralize invalidation at the canonical mutation/render update boundary.
- Add cleanup on Atome removal and rendering zone disposal.
- Add tests or probes that verify stale previews/resources are removed.

---

# Step 15 — Verify animation, compositing, and export readiness

The canvas/WebGPU architecture was chosen because Atome layers must later support compositing, animation, interactive scenes, and video export.

Acceptance criteria:

- Rendered Atomes can be treated as composable layers.
- The render path can produce a frame for project display and matrix preview without changing source-of-truth rules.
- Animation updates can flow through canonical/render state without DOM mutation authority.
- Export-oriented frame rendering is not blocked by DOM-only outputs.
- Text, video, image, and waveform outputs have a path to be composed into one frame.

Repair rule if failed:

- Refactor renderer outputs into compositor-owned commands/resources.
- Remove DOM-only rendering outputs from the main path.
- Document unresolved export limitations only if they are outside the previous implementation scope, and prove they do not break current rendering unification.

---

# Step 16 — Verify legacy renderer removal and absence of parallel systems

Search for legacy rendering paths and prove they are removed from the main path or unreachable.

Acceptance criteria:

- No old DOM-first renderer remains active for text, image, video, waveform, or matrix preview on the main path.
- No compatibility shim keeps both old and new renderers alive.
- No fallback architecture silently activates when WebGPU is available.
- Imports, call sites, dynamic loaders, tests, maps, and documentation are consistent with the unified renderer.
- Legacy code discovered in the touched scope is deleted, migrated, or proven out of scope.

Repair rule if failed:

- Remove legacy call sites.
- Delete or migrate obsolete files after usage verification.
- Update maps and tests.
- Do not keep transitional adapters unless explicitly required by existing architecture and fully removed within this task scope.

---

# Step 17 — Verify tests and add missing guardrails

Inspect existing tests before adding new ones.

Required guardrail coverage:

```text
DOM does not become source of truth
forbidden Atome DOM attributes/classes do not appear
visible canvas is not created per Atome
text service root is bounded
matrix preview does not clone DOM
RenderAtom contract covers heterogeneous Atomes
image/video/waveform/text route through unified renderer
legacy renderer route is not called on main path
cache invalidation refreshes preview output
```

Acceptance criteria:

- Existing relevant tests were identified.
- Missing tests were added under `./tests`.
- Tests are focused and deterministic.
- Tests do not fake success by only checking mocks detached from the real rendering path.
- Tests fail against the forbidden architecture and pass against the corrected architecture.

Repair rule if failed:

- Add the smallest high-value regression test first.
- Run the focused test.
- Then widen to relevant suites.

---

# Step 18 — Run validation commands

Run the narrowest relevant validations first, then widen.

Use the repository’s actual scripts. Prefer these when applicable and present:

```text
npm run check:syntax
npm run test:run -- <focused-test-path>
npm run test:run
npm run check:m0
npm run test:molecule
npm run check:m1
npm run check:m2
npm run dev:test-ui
npm run probe:media-fixtures
npm run probe:browser-media-acceptance
npm run probe:ui-full-stack-test8
npm run test:server-verification
```

Acceptance criteria:

- Every command run is reported with result.
- Every skipped command is reported with reason.
- Relevant browser/test/server logs are inspected.
- No unexplained warnings or errors remain.
- Validation includes real UI interaction or browser-run scenario when the touched behavior depends on the UI.

Repair rule if failed:

- Do not move to final certification.
- Return to the failing owner step.
- Repair at the source.
- Rerun the failed command first.
- Then rerun surrounding validations.

---

# Step 19 — Mandatory repair loop for any failed requirement

If any requirement failed in steps 5 through 18, execute this loop for each failure.

```text
1. Assign a failure ID.
2. State the failed requirement.
3. Identify the exact owner file/module/API.
4. Identify the root cause.
5. Prove why it is the root cause.
6. Define the smallest architecture-compliant repair.
7. Apply the repair.
8. Remove obsolete or duplicate code created or exposed by the repair.
9. Update maps if ownership, API, structure, or design/rendering contracts changed.
10. Add or update tests that would fail before the repair.
11. Rerun the exact failed validation.
12. Rerun the next relevant surrounding validation.
13. Inspect logs.
14. Remove temporary diagnostics.
15. Rerun the clean validation path.
16. Update the evidence ledger.
```

Failure categories to use:

```text
F-DOM-AUTHORITY
F-DOM-PER-ATOME
F-CANVAS-PER-ATOME
F-WEBGPU-BYPASS
F-PARALLEL-RENDERER
F-RENDERATOM-MISSING
F-IMAGE-ADAPTER-BYPASS
F-VIDEO-ADAPTER-BYPASS
F-WAVEFORM-ADAPTER-BYPASS
F-TEXT-DOM-SPRAWL
F-TEXT-AUTHORITY-IN-DOM
F-MATRIX-DOM-CLONE
F-HITTEST-DOM-AUTHORITY
F-SELECTION-DOM-STATE
F-CACHE-STALE
F-LEGACY-ACTIVE
F-MAPS-STALE
F-TEST-MISSING
F-VALIDATION-FAILED
```

A repair is accepted only when the same evidence that failed now passes.

Do not mark a failure as repaired because the code was edited. Mark it repaired only after proof.

---

# Step 20 — Final certification or hard failure report

You may declare completion only if every step passed or was repaired and passed.

The final answer must contain:

```text
Final status: PASSED / FAILED / BLOCKED
Completion: <percentage>%
Validated steps: <list>
Repaired failures: <failure IDs and summaries>
Files inspected: <full list>
Files modified: <full list>
Files deleted: <full list or none>
Maps updated: <list or none + reason>
Tests run: <commands and results>
Tests skipped: <commands and reasons>
Runtime/browser validation: <summary>
DOM budget result: <numbers and pass/fail>
Canvas ownership result: <numbers and pass/fail>
Text service result: <root count, active editor count, pass/fail>
Matrix preview result: <path used, pass/fail>
Legacy renderer result: <removed/unreachable/fail>
Remaining risks: <none or exact list>
```

If the result is `FAILED`, you must not present the task as complete. You must provide the remaining failure IDs, the exact blockers, and the smallest compliant next repair action.

If the result is `BLOCKED`, use the blocked report format from the non-negotiable authority section.

---

# Minimum runtime DOM proof script

When browser execution is available, run an equivalent JavaScript inspection in the actual app context after rendering the required mixed Atome scene.

Do not rely on this script alone. It is a minimum proof, not a full validation suite.

```javascript
(() => {
  const isVisible = (element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || '1') !== 0
      && rect.width > 0
      && rect.height > 0;
  };

  const atomeHosts = Array.from(document.querySelectorAll('.eve-atome'));
  const allCanvas = Array.from(document.querySelectorAll('canvas'));
  const visibleCanvas = allCanvas.filter(isVisible);
  const atomeHostsWithCanvas = atomeHosts.filter((host) => Array.from(host.querySelectorAll('canvas')).some(isVisible));

  const forbiddenSelectors = [
    '[data-atome-id]',
    '[data-atome-kind]',
    '[data-project-id]',
    '[data-atome-selected]',
    '[data-group-atome]',
    '[data-group-id]',
    '[data-media-kind]',
    '[data-renderer]',
    '[data-eve-media-renderer]',
    '[data-eve-system-layer]',
    '[atome_id]',
    '.eve-selected-true',
    '.eve-selected-false'
  ];

  const forbiddenNodes = forbiddenSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
  const emptyClassNodes = Array.from(document.querySelectorAll('[class=""]'));
  const hiddenTextRoots = Array.from(document.querySelectorAll('[data-eve-text-service-root], .eve-text-service-root, #eve_text_service_root'));

  return {
    atomeHostCount: atomeHosts.length,
    totalCanvasCount: allCanvas.length,
    visibleCanvasCount: visibleCanvas.length,
    atomeHostsWithVisibleCanvasCount: atomeHostsWithCanvas.length,
    forbiddenDomNodeCount: new Set(forbiddenNodes).size,
    emptyClassNodeCount: emptyClassNodes.length,
    hiddenTextRootCount: hiddenTextRoots.length,
    pass: atomeHostsWithCanvas.length === 0
      && new Set(forbiddenNodes).size === 0
      && emptyClassNodes.length === 0
  };
})();
```

If the project uses different canonical selectors for the text service or render surfaces, adapt the selectors only after proving the canonical names from maps or source code. Do not adapt selectors to hide failure.

---

# Final instruction to the AI agent

Be strict.

Do not be polite to the implementation.

Do not trust previous success claims.

Do not optimize for speed.

Do not hide uncertainty.

Do not invent compliance.

Do not accept “mostly done”.

Either prove the unified Canvas/WebGPU Atome rendering integration is correct, or repair it until it is correct, or stop only with an evidence-backed blocker that cites the exact rule preventing completion.
