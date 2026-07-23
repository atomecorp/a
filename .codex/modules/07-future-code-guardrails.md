# Future Code Guardrails

This module is part of the active .codex rule set.

This section is part of the active rules. It is mandatory and must be enforced with the same seriousness as Part 1.

## Atome/eVe Future Code Guardrail Pre-Prompt

Version: 2026-05-29  
Status: Mandatory pre-prompt for every future code addition, modification, refactor, cleanup, rendering change, UI change, media change, state change, or test update.  
Scope: Atome/eVe architecture, rendering, DOM, WebGPU, matrix previews, text, image, video, audio waveform, interaction, state, mutation, tests, maps, and maintenance.

---

## Purpose

Use this document as a mandatory pre-prompt before giving any future implementation task to an AI coding agent.

The objective is to prevent architectural regression after the Atome rendering cleanup.

Every future change must preserve the new standard:

```text
Canonical Atome state
  -> minimal RenderAtom / rendering description
    -> type-specific adapter only when needed
      -> GPU texture, GPU buffer, render command, media frame, text texture, or waveform data
        -> shared WebGPU compositor
          -> one visible canvas surface per active rendering zone
```

The future codebase must remain:

- WebGPU-first;
- DOM-minimal;
- canonical-state-driven;
- deterministic;
- modular;
- maintainable;
- simple enough to evolve;
- free from fallback renderers, compatibility shims, and duplicated rendering paths.

---

## Pre-Prompt To Give To The AI Agent

You are working inside the Atome/eVe codebase.

Your first responsibility is not to complete the requested feature quickly.

Your first responsibility is to preserve the cleaned architecture and prevent regression.

You must treat this pre-prompt as a strict execution contract for every code task.

---

## 0. Absolute authority and mandatory rule loading

Before any code inspection, planning, file creation, or file modification, you must:

1. Read `.codex/AGENTS.md` completely.
2. Apply `.codex/AGENTS.md` strictly to every inspected, modified, created, moved, or removed file.
3. Treat `.codex/AGENTS.md` as higher priority than this pre-prompt.
4. If this pre-prompt conflicts with `.codex/AGENTS.md`, stop immediately and report the exact conflicting rule.
5. Do not silently reinterpret, weaken, bypass, or auto-correct the conflict.

Mandatory inherited rules include, without limitation:

- JavaScript only for the main codebase.
- No TypeScript.
- No Python implementation.
- No patching.
- No temporary fixes.
- No compatibility shims.
- No fallback architecture.
- No direct frontend state mutation.
- All visible writes must pass through `window.Atome.commit` or `window.Atome.commitBatch`.
- DOM is a disposable projection only.
- DOM must never own canonical Atome state.
- Rendering must use WebGPU.
- Text rendering must use WebGPU with synchronized hidden HTML only where required for editing, accessibility, styling, measurement, or system interaction.
- Direct DOM manipulation is forbidden unless an existing canonical Squirrel/Atome API explicitly owns that creation path.
- UI controls must use canonical Atome/Squirrel component systems.
- Product styling must remain JavaScript-driven through approved structured design contracts.
- Temporary files must be created only under `./temp`.
- Persistent tests must be created only under `./tests`.
- Git is read-only. Do not run any Git command that mutates the repository, index, refs, branches, commits, remotes, stash, submodules, or configuration.
- Architecture maps must be updated when structure, ownership, rendering contracts, APIs, or design contracts change.
- Comments, logs, warnings, errors, documentation, and developer-facing messages must be written in English.

---

## 1. Non-negotiable Atome rendering standard

Every future rendering-related change must preserve this standard:

```text
one project rendering surface
one matrix rendering surface when the matrix is visible
optional compositor-owned offscreen render targets
one hidden text service root at most
one active text editor at most unless a stricter canonical service proves otherwise
zero visible DOM subtree per Atome on the main rendering path
zero visible canvas per Atome on the main rendering path
zero private renderer per Atome
zero private event system per Atome
```

### Required rendering model

All visual Atome types must feed the shared rendering pipeline:

| Atome type | Required rendering route |
| --- | --- |
| Text | Canonical text state -> hidden text service only when needed -> text layout/texture/render commands -> WebGPU compositor |
| Image | Canonical image state -> decoded resource/texture -> WebGPU compositor |
| Video | Canonical video state -> frame source/texture -> WebGPU compositor |
| Audio waveform | Canonical audio/waveform data -> GPU buffer/texture/commands -> WebGPU compositor |
| Selection / transform handles | Canonical runtime state -> WebGPU overlay or approved shared interaction layer |
| Matrix preview | Shared renderer output, render target, cached GPU snapshot, or compositor-owned thumbnail path |
| Animation / export / compositing | Same WebGPU path as interactive rendering, not a second renderer |

The canvas/WebGPU layer is not only a performance optimization. It is the unified visual layer that allows Atomes to become composable frames for matrix previews, timeline import, video compositing, animation, export, and interactive scenes.

---

## 2. DOM-minimal policy

The DOM must stay minimal and disposable.

The visible DOM may contain only application shell elements, approved canonical Squirrel/Atome UI controls, and one managed canvas surface per active rendering zone.

Conceptual target:

```html
<canvas id="eve_surface_project" class="eve-render-surface"></canvas>
<canvas id="eve_surface_matrix" class="eve-render-surface"></canvas>
```

The exact ids may differ if the repository already owns canonical names, but the architectural rule does not change.

### Forbidden DOM patterns

Do not create or preserve:

- one visible DOM wrapper per Atome;
- one visible canvas per Atome;
- one visible image, video, audio, SVG, text, button, handle, or overlay node per Atome;
- Atome business state inside `data-*` attributes;
- Atome business state inside custom attributes;
- Atome business state inside CSS classes;
- Atome business state inside inline styles;
- Atome business state inside hidden nodes;
- Atome business state inside DOM comments;
- Atome identity, type, renderer, media kind, project id, group id, replay state, sync state, selection state, drag state, resize state, or mutation data stored in the DOM;
- business decisions based on DOM attributes, DOM classes, inline styles, comments, secondary ids, or marker nodes.

### Allowed exceptions

Allowed exceptions must be centralized, bounded, non-authoritative, and documented in the owning architecture map:

- application shell DOM;
- canonical Squirrel/Atome UI controls;
- one visible canvas surface per active rendering zone;
- compositor-owned offscreen render targets;
- one hidden text service root for editing, layout, accessibility, IME, selection, copy/paste, and measurement;
- one active hidden text editor unless repository evidence proves a stricter canonical service;
- hidden media decode elements only if unavoidable, pooled, non-visible, non-authoritative, and feeding WebGPU without becoming one permanent DOM island per Atome.

Any new exception requires evidence, map documentation, tests, and a stricter alternative analysis before implementation.

---

## 3. Canonical state and mutation policy

The canonical truth must live outside the DOM.

Atome data must remain minimal, explicit, schema-driven, and deterministic.

Do not grow the Atome model with view-local, DOM-local, renderer-local, debug-local, or convenience fields.

All behavior decisions must start from canonical Atome state, runtime registries, or explicit domain registries.

All visible business mutations must pass through:

```text
window.Atome.commit
window.Atome.commitBatch
```

Do not create:

- local writable state that competes with canonical state;
- renderer-owned business state;
- DOM-owned business state;
- cache-owned business state;
- timeline-owned business state;
- realtime-patch-owned business state;
- ad hoc mutation paths;
- silent direct mutations;
- untracked visual state.

Caches, textures, render targets, matrix thumbnails, timelines, and runtime projection data are derived acceleration layers only. They must never become canonical truth.

---

## 4. No regression rule

Every future change must preserve or improve the cleaned rendering architecture.

You must not reintroduce:

```text
DOM-first rendering
canvas-per-Atome rendering
hidden permanent DOM islands per Atome
private renderers per Atome type outside the shared pipeline
legacy renderer fallbacks
duplicated media renderers
duplicated matrix preview renderers
cloned DOM thumbnails
view-local business state
DOM-owned selection state
DOM-owned drag/resize state
dataset-backed Atome metadata
compatibility shims
temporary adapters
parallel old/new rendering paths
```

If the requested feature appears to require one of these patterns, do not implement it. Instead, stop and report the architecture violation with a compliant alternative.

---

## 5. Mandatory task classification before action

Before coding, classify the task as one or more of:

```text
feature addition
bug fix
regression repair
rendering change
media change
text change
matrix preview change
state/mutation change
interaction change
UI/component change
performance optimization
cleanup/refactor
API change
test/guardrail change
documentation/map change
```

Then apply the strict union of all relevant `.codex/AGENTS.md` sections.

Do not begin implementation before this classification is stated.

---

## 6. Mandatory pre-flight inspection

Before modifying code, inspect the real owning architecture.

Required documents and maps to inspect when present:

```text
.codex/AGENTS.md
maps/CODEMAP.md
maps/API_MAP.md
maps/DESIGN_MAP.md
maps/ARCHITECTURE_MAP.md
atome/documentations/atome_structur_to_respect.md
eve/application/documentations/
documentations/
```

Required code areas to inspect when the task touches them:

```text
WebGPU renderer
RenderAtom normalization
Atome creation and mutation pipeline
runtime registries
matrix preview pipeline
text service / text editor integration
image adapter
video adapter
audio waveform adapter
selection / hit-testing / drag / resize / transform pipeline
cache invalidation pipeline
export / animation / compositing path
legacy renderer references
tests and guardrails
```

You must reuse the existing architecture before creating new modules.

Do not create a new module, helper, adapter, service, renderer, UI control, or API until you have proven that no existing canonical owner should receive the responsibility.

Before adding any new layer, apply the simplicity test:

```text
Can the canonical owner absorb this responsibility directly?
Has existing code been checked for removal or merging first, and simplified where safe and relevant?
Is the layer required by a real lifecycle, runtime, security, or reuse boundary?
Is its cost justified by measured evidence rather than anticipated complexity?
```

If the answer does not justify the layer, do not create it. Prefer deletion, convergence, and direct composition.

---

## 7. Mandatory implementation gate

Before editing any file, produce this gate report:

```text
Task classification: <list>
Applicable rule families: <list>
Canonical owner identified: <yes/no + file/module>
Existing reusable architecture: <files/modules>
Files likely to change: <list>
Tests/guardrails to run or create: <list>
Map impact: <none / maps to update>
DOM risk: <none / precise risk>
Rendering risk: <none / precise risk>
State mutation risk: <none / precise risk>
Legacy risk: <none / precise risk>
Complexity delta: <reduced / unchanged with justification / prohibited increase>
Capacity recovery: <code, dependency, resource, or configuration removed / none with reason>
Decision: <proceed / blocked>
```

If `Canonical owner identified` is `no`, do not code. Continue architecture inspection or stop with a precise blocker.

---

## 8. Mandatory self-check during implementation

During implementation, after each substantive edit, verify:

1. The change does not create visible DOM per Atome.
2. The change does not create visible canvas per Atome.
3. The change does not add business state to the DOM.
4. The change does not branch business behavior from DOM metadata.
5. The change does not add fallback rendering.
6. The change does not duplicate a renderer, adapter, component, state owner, or API.
7. The change does not bypass `window.Atome.commit` or `window.Atome.commitBatch`.
8. The change does not turn cache, texture, render target, matrix preview, or timeline data into canonical truth.
9. The change does not add TypeScript or Python.
10. The change does not create temporary files outside `./temp` or persistent tests outside `./tests`.
11. The change does not enlarge an oversized touched file without reduction ownership.
12. The change keeps comments, logs, warnings, errors, documentation, and developer-facing messages in English.
13. The change keeps user-visible strings inside the existing internationalization system.
14. The change remains compatible with deterministic replay, persistence, sync, and rendering.
15. The change does not add speculative abstraction, configuration, cache, registry, adapter, dependency, or execution path.
16. The change removes dead, duplicate, obsolete, temporary, or unnecessary code discovered in the touched scope when safe.
17. The change does not retain listeners, timers, subscriptions, media resources, GPU resources, caches, or workers beyond their explicit lifecycle.

If any check fails, repair the source immediately before moving forward.

---

## 9. Mandatory validation and tests

Every future task must include validation proportional to the touched scope.

Run the narrowest relevant validation after each substantive repair, then widen only after the narrow check passes.

When the touched scope involves rendering, UI, interaction, Atomes, matrix previews, media, text, mutation, sync, replay, or cache invalidation, tests or guardrails must verify the relevant subset of:

- DOM budget remains minimal.
- No visible DOM subtree is created per Atome on the main rendering path.
- No visible canvas is created per Atome on the main rendering path.
- WebGPU remains the primary rendering route.
- Text uses the bounded hidden HTML service only for valid text reasons.
- Matrix previews do not clone DOM.
- Image Atomes route through the unified renderer.
- Video Atomes route through the unified renderer.
- Audio waveform Atomes route through the unified renderer.
- Hit-testing, selection, drag, resize, and transform do not depend on forbidden DOM metadata.
- Cache invalidation follows canonical state changes.
- Legacy renderer paths are not active.
- No fallback renderer path is active.
- Canonical state survives DOM teardown, rerender, hydration, replay, or reconciliation without reading truth from the DOM.

If a required test does not exist, create or update the smallest correct persistent test under `./tests`.

Do not fake validation. Do not replace runtime validation with code-reading when real runtime validation is available.

For UI issues, validate real interaction paths when relevant:

```text
click
tap
pointer down / move / up
drag
resize
keyboard
focus
selection
copy/paste
IME when text editing is in scope
matrix preview display
project viewport display
video frame display
waveform display
```

---

## 10. Mandatory repair protocol for non-compliance

If you discover non-compliant code inside the touched ownership path, you must repair it before adding new feature scope.

Non-compliance includes:

- DOM-owned state;
- duplicated state ownership;
- fallback renderer;
- legacy renderer still active on the main route;
- feature-local renderer that bypasses the shared WebGPU compositor;
- canvas per Atome;
- visible DOM per Atome;
- matrix preview from cloned DOM;
- text rendered as uncontrolled DOM instead of WebGPU output with hidden text service;
- direct state mutation;
- oversized touched file without reduction ownership;
- dead, duplicated, deprecated, unreachable, or abandoned code in the touched path.

Repair rules:

1. Identify the root cause.
2. Identify the canonical owner.
3. Move responsibility to the canonical owner.
4. Remove the duplicate, fallback, shim, or obsolete path.
5. Update tests or guardrails.
6. Update maps if ownership, API, rendering, design, or structure changed.
7. Rerun the failing validation.
8. Only continue after the repair passes.

Do not leave a TODO saying it will be fixed later.

---

## 11. Mandatory progress report

For every future task, create a numbered execution plan before coding.

After each numbered step, report progress with this exact structure:

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

Progress must be calculated only from validated steps:

```text
progress = floor((validated_completed_steps / total_numbered_steps) * 100)
```

Do not count:

- planning;
- reading without validation;
- partial edits;
- failed tests;
- unvalidated code;
- unproven claims;
- placeholder files;
- TODO-only work;
- “looks correct” review.

A step is complete only when its acceptance criteria are satisfied and its required validation has passed or the absence of runnable validation is precisely justified.

---

## 12. Mandatory stop format

You are not allowed to refuse because the task is long, complex, repetitive, high-risk, or requires multiple validation passes.

Allowed stop conditions are limited to:

1. conflict with `.codex/AGENTS.md`;
2. conflict with a higher-priority instruction;
3. missing dependency that makes execution technically impossible without violating architecture;
4. required product decision that cannot be inferred from repository evidence;
5. lack of tool access required for mandatory validation.

If a valid stop condition exists, output exactly:

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

A generic refusal is invalid. A simplified alternative is invalid unless it is the smallest compliant next action after a valid blocker.

---

## 13. Mandatory final completion lock

Do not declare the task complete until all of the following are true:

- `.codex/AGENTS.md` was read and applied.
- The task was classified.
- The canonical owner was identified.
- Existing architecture was reused where appropriate.
- No DOM authority was introduced.
- No visible DOM subtree per Atome was introduced on the main rendering path.
- No visible canvas per Atome was introduced on the main rendering path.
- No fallback renderer was introduced.
- No legacy renderer path remains active in the touched route.
- No duplicated renderer, adapter, API, state owner, or UI component was introduced.
- No speculative abstraction, cache, registry, adapter, dependency, or execution path was introduced.
- Dead, duplicate, obsolete, temporary, and unnecessary code in the touched scope was removed when safe.
- Resources introduced or touched have an explicit release and ownership lifecycle.
- Text, if touched, remains routed through WebGPU with hidden HTML only for valid text-service reasons.
- Matrix preview, if touched, remains renderer-owned and does not clone DOM.
- Image, video, or waveform rendering, if touched, remains on the unified WebGPU route.
- Mutations, if touched, go through the canonical commit pipeline.
- Cache, timeline, texture, and preview data remain derived and non-authoritative.
- Relevant tests or guardrails were run or created.
- Maps were updated when ownership, structure, API, design, or rendering contracts changed.
- Temporary diagnostics were removed or confined to `./temp`.
- Persistent tests were placed only under `./tests`.
- All final errors, warnings, skipped tests, or missing validations are explicitly reported.
- `eVe/documentations/FRAMEWORK_STATE.md` reflects every verified framework-state change, limitation, regression, uncertainty, and validation result produced by the task.

### Framework state maintenance

`eVe/documentations/FRAMEWORK_STATE.md` (the **State File**) is the
repository's persistent, factual operational record of the framework's
verified current state. It is not a roadmap, a task list, a changelog
substitute, or an aspirational design document.

Before finalizing a task, update the State File when the task reaches a
completion decision and produces a verified change to framework behavior,
ownership, validation status, known limitations, regressions, or
evidence-based recommendations. This includes feature work, removals, bug
fixes, investigations, refactors, migrations, cleanup, API, rendering, UI,
media, state, synchronization, replay, history, test, validation, map, and
documentation work.

For a task that makes no repository change, update the State File only when it
produces new factual evidence, changes a verification status, records a known
limitation, or produces an evidence-based recommendation. Do not add a
no-change record that merely repeats known information.

Before changing the State File:

1. Read the relevant implementation, directly relevant documentation, maps,
   task records, and current State File entries.
2. Inspect the task's actual affected files and diff.
3. Run the narrowest relevant validation, widening it only when the task risk
   or result requires it.
4. Distinguish code-inspected, test-confirmed, manually validated, documented
   intent, inference, and unverified claims.
5. Preserve verified information unless current evidence supersedes it.

Never report planned, proposed, assumed, or requested work as implemented.
Never infer success solely from an edit, an unexecuted test, or a task
description. Never hide a failed, skipped, blocked, flaky, unavailable, or
not-run validation. Mark every material unverified claim, ambiguous ownership
boundary, unavailable validation, suspected issue, or stale record as
**To verify**, with its reason, affected scope, and smallest verification
action.

The State File must use these consistently named sections:

1. Scope and evidence status
2. Implemented and verified capabilities
3. Partial implementations and known limitations
4. Regressions, bugs, and unresolved issues
5. Recent task record
6. Uncertainties and verification backlog
7. Recommended next steps

Each material verified capability must identify its observable behavior, owner
or source location, evidence level, and important operational constraint.
Each limitation or unresolved issue must identify the affected scope and
supporting evidence. Each recent task entry must be concise and newest-first,
and state its date, title, outcome, factual state change, changed files,
validation results, unavailable or skipped validation, and **To verify**
items. Condense older records after their essential factual state is preserved.

Keep the State File concise, dated, traceable, and free of secrets or personal
data. Reference source paths, test names, commands, or issue identifiers when
they materially improve traceability. Recommendations must be clearly marked
as recommendations, not as current behavior or completed work.

Final report format:

```text
Final status: <complete / blocked>
Validated architecture: <summary>
Files modified: <list>
Files created: <list>
Files removed: <list>
Tests run: <commands and results>
Tests created or updated: <list>
Architecture maps updated: <list or none + reason>
DOM budget result: <pass/fail/not in scope + evidence>
WebGPU route result: <pass/fail/not in scope + evidence>
Text service result: <pass/fail/not in scope + evidence>
Matrix preview result: <pass/fail/not in scope + evidence>
Legacy renderer result: <pass/fail/not in scope + evidence>
State mutation result: <pass/fail/not in scope + evidence>
Framework state: <updated / not updated + specific reason>
State File: <eVe/documentations/FRAMEWORK_STATE.md / not updated + reason>
Task outcome: <completed / partially completed / blocked / reverted / no change>
Framework-state summary: <factual summary>
Framework-state uncertainties: <**To verify** items / none>
Recommended next step: <smallest evidence-based action / none>
Remaining risks: <none or precise list>
Completion claim: <one sentence proving all gates passed>
```

If any required item is not validated, final status must be `blocked`, not `complete`.

---

## 14. Permanent anti-drift checklist

Before any future code answer, modification, or refactor, answer these questions internally and enforce the result:

```text
Does this change keep Atome state canonical and outside the DOM?
Does this change keep DOM disposable and minimal?
Does this change keep WebGPU as the visual rendering engine?
Does this change avoid visible DOM per Atome?
Does this change avoid visible canvas per Atome?
Does this change avoid fallback renderers?
Does this change avoid duplicated ownership?
Does this change avoid direct state mutation?
Does this change avoid cloned DOM previews?
Does this change keep text service bounded and non-authoritative?
Does this change preserve deterministic replay, persistence, sync, and rendering?
Does this change reduce or at least not increase total conceptual and runtime complexity?
Did this change remove safe dead code, duplicate logic, obsolete configuration, or retained resources from the touched scope?
Does this change update tests and maps when required?
```

If any answer is `no`, the change is not allowed until the architecture is corrected.

---

## 15. Short mandatory instruction block for small tasks

For very small future tasks, this shorter block may be pasted before the task, but it does not replace the full pre-prompt above:

```text
Before acting, read and apply .codex/AGENTS.md. Preserve the Atome/eVe cleaned architecture: canonical state outside DOM, WebGPU-first rendering, one visible canvas per rendering zone, no visible DOM subtree per Atome, no visible canvas per Atome, no fallback renderer, no duplicated renderer, no DOM-owned state, no direct mutation outside window.Atome.commit / commitBatch, no TypeScript, no Python, no Git write operations, no temporary files outside ./temp, no persistent tests outside ./tests. Reuse existing architecture and prefer the simplest architecture-compliant change: do not add speculative abstractions, caches, adapters, registries, dependencies, or execution paths; remove safe dead and duplicate code in the touched scope. Update maps when ownership/API/design/rendering contracts change, and validate with tests or guardrails. If the request conflicts with these rules, stop with the exact blocking rule and the smallest compliant next action. Do not simplify, skip, postpone, or mark complete without proof.
```

---

## End of pre-prompt
