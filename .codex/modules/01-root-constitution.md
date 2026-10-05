# Architecture and DOM Projection Constitution

Applicable to application-code and architecture work. The project core and common method have already been read; this module owns the detailed rendering and projection constraints. Repository paths below are relative to the main atome/eVe project root.

## Architectural priorities

Understand the affected cross-platform, distributed, realtime multimedia, low-latency audio, rendering, synchronization, database, operating-system, server, and deterministic-state boundaries before changing them. Prioritize architectural integrity, simplicity, determinism, maintainability, scalability, modularity, performance, low latency, and long-term consistency.

The Atome model and state contracts are defined in [module 06](06-atome-state-sync-and-runtime-modes.md); communication and canonical UI contracts are defined in [module 05](05-api-rendering-and-ui.md). Use the relevant audit and architecture graphs in `maps/` to resolve ownership, mutation-flow, replay, rendering, and synchronization defects. A discovered defect that requires work beyond the authorized task is a blocker for that dependent path, not permission to expand the task.

## Shared rendering architecture

All visual Atome types must follow this direction:

```text
Canonical Atome state
  -> minimal RenderAtom / rendering description
    -> type-specific adapter only where required
      -> GPU texture, buffer, render command, media frame, text texture, or waveform data
        -> shared WebGPU compositor
          -> one visible canvas per active rendering zone
```

The visible rendering budget is one project surface and one matrix surface while the matrix is visible, with optional compositor-owned offscreen targets. It permits at most one hidden text-service root and one active text editor unless repository evidence establishes a stricter canonical service. There must be zero visible DOM subtrees per Atome, zero visible canvases per Atome, zero private renderers per Atome, and zero private event systems per Atome on the main rendering path.

| Visual concern | Required route |
| --- | --- |
| Text | Canonical text state -> bounded hidden text service when needed -> layout, texture, or render commands -> shared WebGPU compositor |
| Image | Canonical image state -> decoded resource or texture -> shared WebGPU compositor |
| Video | Canonical video state -> frame source or texture -> shared WebGPU compositor |
| Audio waveform | Canonical audio/waveform data -> GPU buffer, texture, or commands -> shared WebGPU compositor |
| Selection and transform handles | Canonical runtime state -> WebGPU overlay or approved shared interaction layer |
| Matrix preview | Shared-renderer output, render target, cached GPU snapshot, or compositor-owned thumbnail path |
| Animation, export, effects, and compositing | Same WebGPU route as interactive rendering |

WebGPU is the unified visual layer for interactive scenes, matrix previews, timeline import, animation, video compositing, and export. DOM must never become the primary renderer. Do not introduce or retain an active fallback renderer, compatibility renderer, private type renderer outside the shared pipeline, duplicated media or matrix renderer, cloned DOM thumbnail, permanent hidden DOM island per Atome, or parallel old/new rendering path in the touched route.

### Bounded non-authoritative exceptions

Visible DOM may contain application shell elements, approved canonical Squirrel/Atome controls, and the managed canvas for each active rendering zone. The following exceptions must be centralized, bounded, non-authoritative, and documented in the owning architecture map:

- product-neutral shell DOM and canonical Squirrel/Atome UI controls;
- compositor-owned offscreen render targets;
- the bounded hidden HTML text service for editing, layout, accessibility, IME, selection, copy/paste, styling, measurement, and system interaction;
- unavoidable hidden media-decode elements that are pooled, invisible, feed WebGPU, and never form a permanent DOM island per Atome;
- explicitly documented legacy or migration projections, accessibility, editing, shell, measurement, system interaction, and canonical-control surfaces.

An exception does not authorize DOM-owned state, per-Atome visible rendering on the main path, cloned previews, or a second visible backend. A new exception requires evidence, a stricter-alternative analysis, map documentation, tests, and the bounded authorization required by the project core before implementation. Existing DOM projection allowances below constrain approved exception surfaces; they do not authorize new per-Atome DOM rendering.

## Final Atome DOM projection contract


This contract governs approved final Atome projection hosts and subtrees, including legacy or migration exception surfaces. The allowed carriers below do not authorize new visible DOM rendering per Atome on the main path.

The DOM MUST be treated only as a disposable projection of canonical Atome state. The DOM is allowed to expose:

- one canonical host id using the format `eve-atome_<atome_id>`;
- semantic CSS classes required for styling, hit testing, rendering selection, and view-only grouping;
- inline style only for dynamic geometry required by the current rendering contract;
- real visual children such as text nodes, SVG, canvas, image/video/audio rendering surfaces, handles, or view-only UI controls.

The DOM MUST NEVER contain Atome authority, Atome metadata, business state, replay state, persistence state, sync state, runtime ownership, action routing decisions, mutation payloads, or serialized Atome structures.

This prohibition applies to every DOM carrier. Runtime, business, persistence, replay, sync, ownership, renderer, media-kind, group, project, selection, drag, resize, event-binding, debug-routing, or system-layer facts MUST NOT be stored as:

- `data-*` attributes;
- custom attributes;
- disguised CSS classes;
- inline styles;
- DOM comments;
- secondary ids;
- serialized payloads;
- hidden text nodes;
- element names, wrapper nodes, or marker nodes whose only purpose is to encode runtime state.

The following attributes MUST NOT be present on final Atome DOM hosts or inside final Atome DOM subtrees:

- `data-atome-id`;
- `data-atome-kind`;
- `data-project-id`;
- `data-atome-selected`;
- `data-group-atome`;
- `data-group-id`;
- `data-group-type`;
- `data-mtrax-import`;
- `data-source-kind`;
- `data-media-kind`;
- `data-eve-media-renderer`;
- `data-eve-system-layer`;
- `data-atome-events-bound`;
- `data-eve-drag-bound`;
- `data-eve-resize-bound`;
- `data-media-api-ready`;
- `data-role`;
- `data-renderer`;
- `atome_id`;
- any empty `class=""` attribute;
- any custom attribute that carries Atome identity, type, state, ownership, registry membership, persistence, replay, sync, debug routing, media renderer state, selection state, drag state, resize state, group state, project state, event binding state, or mutation payloads;
- any new `data-*` attribute that carries Atome identity, type, state, ownership, registry membership, persistence, replay, sync, debug routing, media renderer state, selection state, drag state, resize state, group state, project state, or event binding state.

The following runtime class forms MUST NOT be present on final Atome DOM hosts or inside final Atome DOM subtrees:

- `eve-system-layer-*`;
- `eve-project-id-*`;
- `eve-group-id-*`;
- `eve-media-kind-*`;
- `eve-renderer-*`;
- `eve-source-kind-*`;
- `eve-mtrax-import-*`, except the exact visual wrapper class `eve-mtrax-import-preview-media`;
- `eve-atome-kind-*`;
- `eve-binding-*`;
- `eve-events-bound-*`;
- `eve-drag-bound-*`;
- `eve-resize-bound-*`;
- `eve-api-ready-*`;
- `eve-selected-true`;
- `eve-selected-false`;
- any new class that embeds an Atome id, project id, group id, system layer name, renderer name, media kind, source kind, boolean business state, persistence state, replay state, sync state, debug-routing fact, event-binding fact, or mutation payload.

The following generic visual classes are allowed by default because they describe structure, visual category, or generic UI state rather than business/runtime identity:

- `eve-atome`;
- `eve-matrix-tile`;
- `eve-media-atome`;
- `eve-shape-atome`;
- `eve-svg-atome`;
- `eve-rounded-large`;
- `eve-atome-shape-svg`;
- `eve-atome-group-placeholder`;
- `eve-mtrax-import-preview-media`;
- `eve-media-canvas`;
- `eve-media-audio-host`;
- `is-selected`;
- `is-dragging`;
- `is-resizing`;
- `is-hidden`;
- `is-disabled`;
- `is-focused`.

Selection MUST be projected only through the generic `is-selected` class. Internal selected state belongs in the runtime registry. Classes such as `eve-selected-true` and `eve-selected-false`, inline `outline` state, and dataset-backed selected flags are forbidden.

System layer data MUST be stored only in the runtime registry or an explicitly owned layer registry. It MUST NOT be projected into DOM classes such as `eve-system-layer-intuition_active_drag`, attributes such as `data-eve-system-layer`, or inline styles.

Final Atome host inline styles are limited to dynamic geometry values that cannot yet be represented by the current renderer contract, such as `left`, `top`, `width`, `height`, and `z-index` when z-order is dynamic. Decorative or stateful inline CSS is forbidden on final Atome hosts and final media/SVG projection children, including:

- `border: medium`;
- `outline` and `outline-offset`;
- `box-sizing`;
- `border`;
- `border-color`;
- `border-radius`;
- `background`;
- `background-color`;
- `box-shadow`;
- `color`;
- `overflow`;
- `touch-action`;
- `pointer-events`;
- `display`;
- `user-select`;
- any inline style whose value represents selection, drag, resize, renderer readiness, media kind, project membership, group membership, source kind, system layer, event binding, persistence, replay, sync, or debug state.

Decorative Atome styling MUST live in the approved JavaScript-driven visual contract documented in `maps/DESIGN_MAP.md`, not in final DOM inline style. Required dynamic visual values must be justified by renderer constraints and covered by regression tests.

All Atome information that is required to decide behavior MUST be centralized outside the DOM in the canonical Atome registry, runtime state registry, or the explicitly owned domain registry for that concern. Event handlers MUST resolve the nearest Atome host from the DOM id, recover the canonical `atome_id`, and then consult the appropriate registry or correspondence table to decide the action. Double click, left click, drag, resize, selection, keyboard routing, flower menu routing, MTRAX opening, media transport, persistence, refresh, replay, and debug behavior MUST NOT branch on DOM `data-*` state.

Mandatory role separation:

- Atome registry: owns Atome identity, kind, particles, persistence-facing state, and canonical mutation facts.
- Runtime registry: owns ephemeral UI/runtime state such as event binding flags, selected state, drag/resize session state, media renderer readiness, group preview membership, and non-persistent interaction state.
- Domain registries: own domain-specific runtime facts such as media projection, MTRAX timeline state, transport state, audio/video rendering state, and debug instrumentation state.
- DOM: owns only paintable structure, CSS classes, geometry projection, browser-native event targets, and visual rendering surfaces.
- Event layer: translates browser events into Atome intent by id, then delegates to registries and canonical mutation APIs.

Any code that writes Atome business facts into DOM attributes, CSS classes, inline styles, comments, secondary ids, hidden text nodes, or marker-only wrapper elements is architecturally invalid. Any code that reads Atome behavior decisions from DOM attributes, runtime-disguised classes, inline styles, comments, secondary ids, hidden text nodes, or marker-only wrapper elements is architecturally invalid. An active migration does not authorize legacy behavioral fallback reads; the approved fallback exceptions are limited to localization in module 02.

Every Atome rendering change MUST include or preserve an automated regression check that renders real Atome DOM and fails when forbidden attributes, custom attributes, empty classes, runtime-disguised classes, `border: medium`, inline outline without `is-selected`, decorative inline styles, DOM comments, secondary ids, duplicated DOM authority, or DOM-owned Atome state reappear. The regression check MUST verify the real final DOM after creation, selection/deselection, drag, resize, refresh, reload, SVG rendering, media/canvas rendering, and event resolution through `closest('.eve-atome')` plus `fromDomId(host.id)` when those flows are in scope.

## Validation ownership

Use [module 03](03-debugging-testing-and-ui-validation.md) for execution and real-interaction evidence, and module 06 for canonical-state survival checks. Static code review alone cannot prove a visible rendering or interaction result. Preserve the rendering budgets, routes, exception bounds, and real-final-DOM regression contract above whenever the corresponding flow is touched.
