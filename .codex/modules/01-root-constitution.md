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
          -> one visible project canvas
```

The visible rendering budget is one project surface (`eve_surface_project`), with optional compositor-owned offscreen targets. The Matrix and every BevyUI panel draw on that same canvas; no separate matrix canvas is created (the `eve_surface_matrix` id declared in `eVe/domains/rendering/surface_runtime.js` has no caller). It permits at most one hidden text-service root and one active text editor unless repository evidence establishes a stricter canonical service. There must be zero visible DOM subtrees per Atome, zero visible canvases per Atome, zero private renderers per Atome, and zero private event systems per Atome on the main rendering path.

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

Visible DOM may contain application shell elements, approved canonical Squirrel/Atome shell controls, and the managed project canvas. Product panels, menus, Flower and Dashboard are BevyUI records on that canvas, not DOM. The following exceptions must be centralized, bounded, non-authoritative, and documented in the owning architecture map:

- product-neutral shell DOM and canonical Squirrel/Atome UI controls;
- compositor-owned offscreen render targets;
- the bounded hidden HTML text service for editing, layout, accessibility, IME, selection, copy/paste, styling, measurement, and system interaction;
- unavoidable hidden media-decode elements that are pooled, invisible, feed WebGPU, and never form a permanent DOM island per Atome;
- explicitly documented legacy or migration projections, accessibility, editing, shell, measurement, system interaction, and canonical-control surfaces.

An exception does not authorize DOM-owned state, per-Atome visible rendering on the main path, cloned previews, or a second visible backend. A new exception requires evidence, a stricter-alternative analysis, map documentation, tests, and the bounded authorization required by the project core before implementation. The residual DOM host limits below constrain an existing path; they do not authorize new per-Atome DOM rendering.

## Atome projection contract

Project Atomes have no DOM host. `eVe/domains/rendering/project_scene_runtime.js` projects canonical state through `project_scene_bevy_projection_runtime.js` and `bevy_web_renderer_runtime.js` into the Bevy (Rust→WASM) renderer, which draws every project Atome, the Matrix and every BevyUI panel on the single project canvas `eve_surface_project`. Pointer input on that canvas is resolved by Bevy-side hit-testing (`eVe/domains/rendering/project_scene_hit_testing.js`, with canvas point conversion in `surface_hit_target_runtime.js`), never by a DOM target. Visual Atome styling belongs to the JavaScript-driven visual contract in `maps/DESIGN_MAP.md` and reaches pixels only through that route.

The DOM, canvas, WebGPU resources and Bevy entities are disposable projections of canonical Atome state. None of them may hold Atome authority, metadata, business state, replay, persistence or sync state, runtime ownership, action-routing decisions, mutation payloads or serialized Atome structures, and no behavior may be decided by reading them back.

### Residual DOM host path

`eVe/core/atome_dom_id.js` still provides the `eve-atome_<atome_id>` host id, the generic `eve-atome` class and a WeakMap of per-host runtime state. Only one path registers such hosts: `tool_genesis_render_state_runtime.js` → `createAtomeElement` in `eVe/intuition/runtime/tool_genesis_host_runtime.js`, used for Atomes whose parent is not a project scene. Selection, tool-runtime and Matrix modules still import its lookup helpers; for project Atomes those lookups find no host. Do not extend this path or create new per-Atome DOM hosts.

While this path exists, its hosts obey these limits:

- the only identity carrier is the host id `eve-atome_<atome_id>`; the only classes are generic visual or UI-state classes (`eve-atome`, `is-selected`, `is-dragging`, `is-resizing`, `is-hidden`, `is-disabled`, `is-focused` and equivalent structural classes);
- no `data-*` or custom attribute, disguised class (for example `eve-selected-true`, `eve-project-id-*`, `eve-system-layer-*`), DOM comment, secondary id, hidden text node or marker-only wrapper may carry Atome identity, type, project or group membership, selection, drag/resize, renderer readiness, media kind, system layer, event binding, persistence, replay, sync or debug state;
- inline style is limited to dynamic geometry (`left`, `top`, `width`, `height`, dynamic `z-index`); decorative or stateful inline CSS is forbidden;
- runtime facts live in the `atome_dom_id.js` WeakMap or the owning registry, never on the element.

### Role separation

- Atome registry: Atome identity, type/kind, particles, persistence-facing state and canonical mutation facts.
- Runtime registry: ephemeral UI/runtime state such as selection, drag/resize sessions, media renderer readiness, group preview membership and non-persistent interaction state.
- Domain registries: domain runtime facts such as media projection, Molecule timeline and transport state, audio/video rendering state and debug instrumentation.
- Renderer (Bevy/WebGPU) and DOM: paintable structure, geometry projection, hit-test geometry, browser-native event targets and visual surfaces only.
- Event layer: translates canvas or browser input into Atome intent by id through hit-testing, then delegates to registries and the canonical mutation API.

Code that writes Atome business facts into any projection carrier, or reads behavior decisions back from one, is architecturally invalid. An active migration does not authorize legacy behavioral fallback reads; the approved fallback exceptions are limited to localization in module 02.

### Regression proof

Every Atome rendering or interaction change must include or preserve an automated check on the real route: Bevy hit-testing (`hitTestRuntimeAtClientPoint` / `collectRuntimeAtomsInClientRect` in `project_scene_hit_testing.js`) resolving the expected Atome id, plus pixel evidence from the real canvas, after creation, selection/deselection, drag, resize, refresh, reload and the media, SVG or text rendering in scope. Use the canonical UI procedure in [module 03](03-debugging-testing-and-ui-validation.md) and `atome/documentations/how_debug_UI.md`. A check that queries `closest('.eve-atome')` cannot prove project behavior, because project Atomes have no DOM host. When the residual DOM host path is touched, also verify that its hosts carry none of the forbidden attributes, classes or inline styles above.

## Validation ownership

Use [module 03](03-debugging-testing-and-ui-validation.md) for execution and real-interaction evidence, and module 06 for canonical-state survival checks. Static code review alone cannot prove a visible rendering or interaction result. Preserve the rendering budgets, routes, exception bounds, and real-route regression contract above whenever the corresponding flow is touched.
