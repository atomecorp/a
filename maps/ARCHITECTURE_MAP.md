# Atome / eVe Architecture Map

Status: Initial architecture map after the Atome open / eVe closed boundary validation.

Purpose:

- Define the cross-layer architecture contract used before future implementation work.
- Make dependency direction, lifecycle, runtime modes, source-of-truth rules, and open/closed boundaries explicit.
- Prevent duplicated systems, hidden mutation paths, fallback transports, and product-specific code leaking into the open framework.

Mandatory Use:

- Before changing structure, runtime behavior, persistence, sync, MCP, tools, UI, or APIs, consult this file together with `maps/CODEMAP.md`, `maps/API_MAP.md`, and `maps/DESIGN_MAP.md`.
- Verify the referenced source module directly before relying on this map for a code change.
- Update this map in the same task when cross-layer ownership, dependency direction, lifecycle, source-of-truth rules, or runtime modes change.

## Mandatory Pre-Implementation Gate

No structural, runtime, persistence, sync, MCP, tool, UI, API, security, platform, or cross-layer change may start until the relevant maps have been consulted:

- Use `maps/CODEMAP.md` to establish file ownership, source placement, existing modules, and reusable implementation boundaries.
- Use `maps/API_MAP.md` to establish API visibility, runtime exposure, effectful operation paths, MCP compatibility, and public/semi-public/internal classification.
- Use `maps/DESIGN_MAP.md` to establish design ownership, JavaScript token/factory reuse, generated style exceptions, and product visual boundaries.
- Use this file to establish dependency direction, lifecycle, command/history flow, source-of-truth rules, runtime modes, and Atome open / eVe closed architecture constraints.

Implementation may proceed only after the architectural owner, dependency direction, mutation path, validation expectation, and required map updates are known.

## Global Vision

Atome is the open framework layer. It owns product-neutral runtime contracts, Squirrel APIs, security, synchronization primitives, server-facing contracts, audio and AV runtime boundaries, AI/MCP orchestration, voice contracts, and reusable assets.

eVe is the closed product layer. It owns product UI, private tools, visual composition, panels, Matrix, ribbon, flower, Finder-facing product workflows, Molecule/MTraX product behavior, branding, product stores, and closed runtime composition.

The server and database layers are open infrastructure when they remain product-neutral. They own authenticated event intake, state projection, sync transport, database adapters, user data routes, and operational services. Product-named route families that already exist must be verified before being promoted as stable open contracts.

The core invariant is deterministic, tool-driven, append-only state:

- User, AI, voice, MCP, script, and automation actions converge on the same tool/runtime path.
- Durable mutation flows through `window.Atome.commit` or `window.Atome.commitBatch` on the client boundary.
- Server writes flow through the event commit helpers and database persistence boundary.
- `state_current` is a projection, not the source of truth.
- Snapshots and validation states are acceleration or approval anchors, not an alternate write path.
- Atome envelope normalization and property sanitization are centralized in `atome/shared/atome_contract.js` for server/database boundaries; envelope fields such as id, type, owner, parent, and timestamps must not become durable Atome properties.
- eVe client mutations apply the same property/envelope separation at `eVe/core/atome_commit.js`: raw `props`/`properties`/`patch`/`delta` are collapsed into sanitized `payload.props`, while project, parent, actor, transaction, and gesture ids stay top-level event metadata.
- Selection, lasso focus, SVG layer focus, tool latch state, and editor/session state are transient UI/runtime state unless explicitly modeled as schema-owned Atome properties. They must not be persisted as generic `selected`, `selection`, or DOM-derived properties.
- Media and MTraX creation paths use `kind`, `media_kind`, `media_source`, `media_url`, and schema-owned timeline/poster fields. Legacy render aliases such as `media_type` and `visualType` are adapter read inputs only, not durable write fields.
- Transitional Atome aliases are adapter inputs only. Normalized records must leave boundaries as `{ id, type, kind, renderer, meta, traits, properties }`.
- Adole compatibility methods may keep historical names such as `atomes.create` and `atomes.alter`, but framework writes behind those methods must enter the append-only event pipeline through `adapter.atome.commit` / `adapter.atome.commitBatch`.
- Final Atome DOM is a disposable projection and must expose only `id="eve-atome_<atome_id>"`, CSS classes, necessary style, and visual children. Atome identity, kind, selection, grouping, media renderer state, binding flags, project ownership, replay state, sync state, and action routing facts belong in canonical Atome/runtime/domain registries outside the DOM.
- Browser events such as left click, double click, drag, resize, keyboard routing, flower menu routing, media transport, and MTRAX opening must recover only the `atome_id` from the DOM id and then consult the owning registry/correspondence table to decide behavior.

## Explicit Atome Open / eVe Closed Boundary Contract

The boundary is architectural, not cosmetic:

- Atome is open only for product-neutral contracts, framework runtime, API surfaces, security, sync, server/database infrastructure, AI/MCP orchestration, voice orchestration, audio/AV boundaries, and reusable assets.
- eVe is closed for product experience, product UI, private tools, panel chrome, Matrix/ribbon/flower/Finder workflows, product stores, branding, Molecule/MTraX behavior, and closed composition.
- Server and database are open infrastructure when they do not depend on product UI or product-only workflows.
- Tests may bridge layers to prove integration; source dependencies must still respect the owning layer.

Allowed dependency direction:

- eVe may depend on Atome open contracts.
- Generic system UI controls such as Button, Slider, Input, and Console belong to Atome when the control contract is product-neutral; eVe may compose them for ribbon, projection, flower, footer, toolbox, and panel surfaces but must not keep a parallel control source of truth.
- Atome must not depend on eVe closed implementation details.
- Atome may reach eVe capabilities only through injection, registered tools, runtime globals installed by product bootstrap, or explicit boundary modules with documented ownership.
- Cross-boundary calls must preserve command bus, policy checks, capability validation, audit logging, idempotency, and deterministic history semantics where the operation is effectful.

Forbidden boundary violations:

- Closed product UI, tools, stores, branding, Molecule/MTraX workflows, or panel behavior inside Atome open modules.
- eVe-local clones of open Atome security, sync, database, server, communication, audio, voice, AI, or MCP contracts.
- Direct durable state mutation from UI, panels, stores, imports, scripts, or MCP tools outside the canonical command/history path.
- Promotion of an eVe API, global, visual factory, or store to open framework status without an explicit Atome contract, tests, and synchronized map updates.
- Gesture, resize, and placement code reading canonical Atome geometry from DOM style or DOM offsets instead of described Atome state or an explicit description-derived cache.

Boundary debt:

- Product bootstrap references from Atome into eVe remain documented exceptions requiring targeted verification before structural changes.
- The legacy `atome/src/application/examples/user.js` media renderer is boundary debt and may only consume the shared eVe media source canonicalization contract for route normalization until ownership is moved into a product media rendering boundary.
- Legacy record-video bootstrap files still contain product media atome creation paths; they must preserve owner-scoped recording URLs until that ownership moves behind the shared media persistence boundary.
- Product-named server routes and closed product globals must be reviewed before they are treated as stable open APIs.
- Existing boundary debt is not permission for new cross-layer imports or duplicate service paths.

## Main Layers

### Atome Open Framework

Primary paths:

- `atome/`
- `atome/src/squirrel/`
- `atome/src/application/audio_runtime/`
- `atome/security/`
- `atome/shared/`

Responsibilities:

- Squirrel framework APIs and product-neutral components.
- Audio, AV, STT, and backend runtime contracts.
- AI, MCP, voice, mail, contacts, calendar, and bank service contracts when product-neutral.
- Security, trusted server metadata, server verification, cloud sync, and sync queue primitives.
- Generic assets and framework browser shell assets.

Dependency direction:

- Atome may depend on open server/database contracts, product-neutral utilities, and runtime adapters.
- Atome must not import closed eVe product UI, product workflows, private tools, or branding.
- When Atome needs a closed product capability, it must receive it through injection, runtime globals, registered capabilities, or an explicit boundary module.

Canonical extension points:

- `atome/src/squirrel/apis/` for Squirrel APIs.
- `atome/src/squirrel/apis/unified/` for Adole-style data APIs.
- `atome/src/squirrel/ai/` for AI/MCP orchestration.
- `atome/src/squirrel/voice/` for open voice orchestration and semantic contracts.
- `atome/src/squirrel/{mail,contacts,calendar,bank}/` for open communication service facades.
- `atome/src/application/audio_runtime/` for open audio and AV runtime contracts.
- `atome/src/application/audio_runtime/auv3_host_playback.js` for AUv3 host-routed media playback commands; eVe and MTraX consumers import this owner directly instead of mixing AUv3 playback command ownership into backend detection.
- `atome/security/` for product-neutral security and sync primitives.

Must not be duplicated by:

- eVe product-local security, sync, audio, communication, or AI orchestration bypasses.
- Product UI code embedded in Atome modules.
- Parallel service facades that do not reuse the open contracts listed in `maps/API_MAP.md`.

Status: Verified for ownership and major entry points through current maps and targeted source inspection.

### eVe Closed Product

Primary paths:

- `eVe/`
- `eVe/intuition/`
- `eVe/elements/`
- `eVe/domains/`
- `eVe/core/`
- `eVe/voice/`
- `eVe/i18n/`

Responsibilities:

- Product bootstrap and closed composition.
- Product UI shell, panels, tools, matrix, menu, ribbon, flower, projection, and Finder-facing workflows.
- Product design tokens, JavaScript visual factories, panel chrome, and i18n.
- Product stores for events, projects, media, browser, Tauri, and iOS adapters.
- Molecule/MTraX workflow, timeline, media editing, panel, preview, and product media runtime.
- Closed product voice surfaces that consume Atome voice contracts.
- Panel source-of-truth ownership: `eVe/intuition/panel_definitions.js` owns panel surface metadata, `eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js` owns eVeIntuition surface registration/open-close bridging, and `PanelCreatorV2` owns lifecycle execution. Tool runtime and menu surfaces must consume those contracts instead of declaring independent panel routing tables.
- Project media import intent is centralized in `eVe/intuition/runtime/project_media_import_runtime.js`; flower menu import and capture import must consume that runtime and must let `project_drop.importFilesToProjectViaCreator` remain the canonical media upload/project creation path.
- Tool latched-state ownership inside eVeIntuition is isolated in `eVe/intuition/runtime/eve_intuition/tool_latched_state_runtime.js`; menu state, panel surface events, and dialog-close synchronization must route through that runtime instead of local event listeners.
- Intuition layer ordering is centralized in `eVe/intuition/runtime/layer_contract.js`: project tools, floating project palettes, Molecules, component/docked palettes, panels/dialogs, main ribbon, active drag.
- Palette child projection ownership is centralized in `eVe/intuition/shared/tool_children_projection_state.js`: renderers keep transient child lists in a WeakMap bound to the host element, while durable tool persistence remains in the tool instance store. DOM `data-*` attributes must not carry serialized palette child arrays.
- MTraX diagnostics are runtime-owned: `eVe/intuition/runtime/eve_intuition/mtrax_bridge_runtime.js` owns diagnostic flags and stack capture, while `eVe/intuition/runtime/mtrack_debug_snapshot.js` owns debug snapshot DOM cloning.
- MTraX hidden playback media elements and Molecule raster-pool media elements are runtime-owned resources, not model projection nodes. MTraX probe media must stay detached; Molecule raster-pool videos must mount below the closed raster-pool shadow root so upload URLs, local server origins, and `media_user_id` query state remain outside persisted or audited DOM snapshots.
- eVeIntuition app diagnostics are runtime-owned by `eVe/intuition/runtime/eve_intuition/debug_runtime.js`; `eVeIntuition.js` injects footer, media, selection, and Atome footer dependencies but must not own the `window.__DEBUG__` implementation or deterministic test-mode style rules.
- Atome DOM projection identity is centralized in `eVe/core/atome_dom_id.js`. eVe renderers, selection, event, media, and MTRAX runtimes must use this boundary for `eve-atome_<atome_id>` lookup and WeakMap/runtime metadata instead of writing Atome `data-*` attributes into final DOM.
- Runtime facts must not be reintroduced as class names or inline styles. `system.layer` stays in runtime state, selected visual state uses only `is-selected`, media/SVG categories use generic visual classes, and final media/SVG Atome hosts keep inline styles limited to dynamic geometry.
- Project-view and Matrix-tile projection metadata is centralized in `eVe/intuition/matrix/core/project_dom_state.js`. Project-scoped runtimes may derive the project id from `project_view_<id>` or this WeakMap registry, never from `data-project-id`.
- Unified Atome rendering projection is centralized in `eVe/domains/rendering/`: canonical Atome records are normalized into disposable `RenderAtom` values, scenes are hit-tested outside the DOM, project/matrix rendering zones use bounded WebGPU canvas surfaces, and text uses one hidden synchronized service root plus at most one active editor.
- Active project Atome visual rendering enters `eVe/domains/rendering/project_scene_runtime.js`. `tool_genesis.js` may keep bounded project shell creation, but project Atome records must update the project scene and render through `renderProjectAtTime()` instead of allocating one visible `eve-atome_*` host and per-Atome interaction bindings.
- Project drag, resize, and text editing are scene intents on the active project path. `drag.end`, `resize.end`, and `text.commit` must commit through `window.Atome.commit` or `window.Atome.commitBatch`; visible DOM text/edit hosts are not part of the active project route.
- Project-visible media Atomes on the cleaned canvas route may be opened in Molecule from canonical Atome state and `project_scene_runtime` records without requiring a visible Atome DOM host. The Molecule timeline payload is derived from Atome properties and remains outside DOM attributes.
- Active project resize gestures are resolved centrally in `surface_runtime.js` from scene hit-test bounds and logical canvas edge handles. Legacy per-host resize listeners remain only for non-project DOM-rendered UI until those owners are separately migrated.
- `eVe/intuition/runtime/project_scene_render_bridge.js` is the extraction point that keeps `tool_genesis.js` from owning project-scene dispatch directly. Further `tool_genesis.js` reductions should move cohesive non-project responsibilities behind similarly explicit owners.
- `eVe/intuition/runtime/atome_description_frame_runtime.js` owns description-frame memory formerly embedded in `tool_genesis.js`, keeping frame lookup separate from Atome host creation.
- `eVe/intuition/runtime/media_integrity_runtime.js` owns legacy non-project media-host integrity registries and repair observers. This keeps media text-patch sanitization and host repair state out of `tool_genesis.js` while preserving the existing non-project media path until that path has its own full scene-render replacement.
- `eVe/intuition/runtime/shape_svg_runtime.js` owns legacy non-project SVG shape projection: SVG shape detection, data-url decoding, protected SVG fetch, mounting, and fetched-markup persistence through the canonical Atome commit API. The active project scene path must keep using RenderAtom/WebGPU instead of this DOM mounting path.
- `eVe/intuition/runtime/group_visual_runtime.js` owns legacy non-project group visual projection and runtime-only membership bookkeeping. It may mount legacy preview DOM for non-project group hosts, but it must not store canonical group state in DOM attributes and must not render active project group Atomes outside `project_scene_runtime.js`.
- `eVe/intuition/runtime/media_source_runtime.js` owns legacy media source normalization behind `tool_genesis.js`. It classifies upload versus recording sources, resolves bundled assets, normalizes protected API media routes, preserves owner-scoped media query data, and injects local/Tauri credential policy without owning media mounting, hydration side effects, or canonical media state.
- `eVe/intuition/runtime/media_hydration_runtime.js` owns protected media hydration side effects behind the legacy projection path: local availability checks, authenticated fetches, Tauri streaming URLs, blob attachment/revocation, and projection-source updates. It must not own canonical media state, media source classification, or active project scene rendering.
- `eVe/intuition/runtime/media_mount_runtime.js` owns legacy media visual mounting side effects through the Molecule media runtime: media child cleanup, `mountVisual()` dispatch, projection error updates, video poster application, and preview scrub. It must remain projection plumbing and must not replace active project media rendering in `project_scene_runtime.js`.
- `eVe/intuition/runtime/atome_host_registry_runtime.js` owns legacy non-project host projection lifecycle state formerly embedded in `tool_genesis.js`: rendered-host caches, rebinding, rendered checks, host removal, and media resource cleanup. It is not a canonical Atome registry and must not decide active project rendering or durable state ownership.
- `eVe/intuition/runtime/project_atome_index_runtime.js` owns project Atome load/index lifecycle state formerly embedded in `tool_genesis.js`: remembered renderable IDs, project snapshots, in-flight load de-duplication, recent-load cache reads, and scoped cache clearing. It is not durable Atome state and must not replace `project_scene_runtime.js` as the active project rendering owner.
- `eVe/intuition/runtime/shared_project_override_runtime.js` owns shared Atome project override cache/persistence/fetch/pruning behind `tool_genesis.js`. It may hydrate fetched shared records with the target project id before scene invalidation, but canonical sharing, ownership, and project membership remain outside this bridge.
- `eVe/intuition/runtime/implicit_gesture_commit_runtime.js` owns implicit gesture commit routing behind `tool_genesis.js`. It translates canonical gesture event batches into tool-gateway actions, marks self patches for realtime dedupe, suppresses duplicate gesture phases briefly, and delegates non-gesture batches to `window.Atome.commitBatch`; durable mutation ownership remains the canonical Atome/tool pipeline.
- `eVe/intuition/runtime/realtime_atome_events_runtime.js` owns legacy realtime binding behind `tool_genesis.js`: event bus listeners, DOM Atome event listeners, realtime update/delete routing, and media textual patch sanitation. It is an event adapter only; canonical mutation ordering and durable Atome state remain outside DOM and outside this runtime.
- `eVe/intuition/runtime/persistence_diag_runtime.js` owns temporary persistence diagnostics and compact record summaries for `tool_genesis.js` load/render tracing. It is observability-only and must not become a persistence policy owner, state source, or rendering decision point.
- `eVe/intuition/runtime/info_panel_sync_runtime.js` owns legacy info panel projection notifications behind `tool_genesis.js`. It computes panel-facing position/resize payloads, including right/bottom derivations, but it must not write canonical Atome state or own layout policy.
- Legacy project-adjacent tools that restore, assign, share, or replay project Atomes must treat project-visible updates as scene invalidations through `project_scene_runtime.js`. `delete.js`, `infos.js`, `communication.js`, and project-scoped timeline replay are not allowed to resurrect `renderAtomeRecord()` as an active project visual path.
- Matrix preview rendering uses `eVe/domains/rendering/matrix_preview_renderer.js` through `eVe/intuition/matrix/core/preview.js`. Active Matrix previews must come from project scene records and shared render targets, not `html2canvas`, SVG `foreignObject`, cloned DOM, or symbolic DOM scans.
- Matrix tile interactions are centralized in `eVe/intuition/matrix/ui/matrix_interaction_runtime.js`. Tile open, menu, create, and label-edit intents must be resolved by one scroll-surface gesture binding and scene hit testing rather than per-project preview/tile listeners.
- The shared render-at-time entry point in `eVe/domains/rendering/webgpu_compositor.js` is the architectural entry for interactive display, previews, animation, and export targets. It must consume the existing WebGPU adapter infrastructure and must not grow separate UI, preview, and export renderers.
- Global visual tiers must use distinct HTML layer nodes under `#intuition`; z-index values alone are not sufficient when tools, Molecules, docked palettes, panels, and drag items coexist.
- Shared product-tool slider ownership now lives in the open Atome/Squirrel component layer at `atome/src/squirrel/components/tool_slider_builder.js`; eVe consumers must use that owner through the shared wrapper/re-export surfaces instead of keeping feature-local slider DOM or gesture logic.
- Background text creation has one geometry owner per phase: `text_creation_session.js` owns the synchronous focusable provisional surface, `ui.text.create` owns the canonical Atome frame written through creation, and `text_fit_runtime.js` owns later content-driven growth without moving the original click coordinate.
- IntuitionX projection tools keep static visual constants class-owned in `eVe/elements/eVe_look.js`; projection runtimes may expose active/hover/kind state through data attributes and may keep slider width inline only while the slider control is dynamically resized.

Dependency direction:

- eVe may consume Atome open contracts.
- eVe may own closed adapters around product workflows.
- eVe must not reimplement generic Atome security, server, sync, persistence, communication, or audio contracts.
- eVe closed APIs must not be promoted to Atome without an explicit open contract, tests, and map updates.

Canonical extension points:

- `eVe/intuition/runtime/` for closed UI/tool runtime surfaces.
- `eVe/intuition/tools/core/` for tool registry, runtime, interaction, and tool definition SSOT.
- `eVe/intuition/tools/` for product tools.
- `eVe/intuition/tools/clipboard/` for shared closed copy/paste state, clipboard payload normalization, system clipboard bridge behavior, and paste event generation behind the copy/paste product tools.
- `eVe/elements/` for product design factories, tokens, and i18n-bound UI construction.
- `eVe/domains/*/api/` for closed domain APIs.
- `eVe/core/*_store/` for closed product store adapters.
- `eVe/domains/mtrax/` and `eVe/intuition/tools/molecule/` for closed Molecule/MTraX workflows.
- Linked audio for dropped video files is owned inside `eVe/domains/mtrax/clips/` and must consume the existing MTraX descriptor media resolver and extraction/conversion path instead of introducing a parallel audio import pipeline.

Must not be duplicated by:

- Atome open product-specific UI.
- New product stores outside the existing store families without a documented ownership reason.
- Panel-local styling or tool behavior that bypasses the shared eVe visual and tool runtime contracts.
- Application example files that replace the eVe `new_menu_v2` product menu content or theme directly.
- Feature-local slider interaction readers keyed only to legacy toolbox/projection class names when the canonical shared slider data-role contract already exists.

Status: Verified for major layer responsibilities through current maps and targeted source inspection.

### Server and Database Infrastructure

Primary paths:

- `server/`
- `database/`

Responsibilities:

- Fastify server bootstrap, auth, routes, WebSocket endpoints, file/user/sharing services, mail gateway, visio, operational logging, and sync.
- Database driver selection and Atome persistence over `atomes`, `particles`, `particles_versions`, `events`, `state_current`, `snapshots`, `permissions`, and `sync_queue`.
- Durable event commit and current-state projection.
- Deferred owner or parent references stored through `_pending_owner_id` or `_pending_parent_id` must resolve both the identity row in `atomes` and the matching `state_current` projection metadata, so runtime current-state reads do not diverge from persistence identity reads.

Dependency direction:

- Server/database may depend on Atome product-neutral shared helpers and open service contracts.
- Server/database must not depend on eVe product UI.
- Product-specific routes or names must be treated as boundary debt until explicitly reviewed.

Canonical extension points:

- `server/atomeRoutes.orm.js` for server-side Atome event commit helpers.
- `database/adole.js` and `database/driver.js` for SQL persistence and database driver concerns.
- `server/wsApiState.js`, `server/wsSend.js`, and the Fastify WebSocket registration points for WebSocket runtime state.
- Existing route modules for their own families only, with size reduction required before feature growth in oversized files.

Must not be duplicated by:

- Direct SQL from UI or product modules.
- Independent persistence code outside database and server commit boundaries.
- HTTP polling or non-WebSocket communication paths for framework communication.

Status: Verified for route families and persistence boundary through `maps/API_MAP.md`, `eVe/documentations/atome_persistence_contract.md`, and targeted search. Oversized server files require reduction before feature growth.

### Tests, Probes, and Temporary Artifacts

Primary paths:

- `tests/`
- colocated `*.test.mjs` files under owning modules
- `temp/`

Responsibilities:

- Persistent tests live under `tests/` or colocated where the project already owns targeted module tests.
- Temporary probes, reports, generated diagnostics, and transient scripts live only under `temp/`.

Dependency direction:

- Tests may exercise Atome, eVe, server, and database boundaries.
- Temporary probes must not become maintained source or documentation.

Status: Verified by repository tree inspection and existing scripts.

## Runtime Modes

The architecture targets these runtime modes with the same Atome contract, command/history policy, sharing model, and synchronization rules:

- Web browser: Fastify, WebGPU, Kira WASM, Symphonia WASM.
- Tauri desktop: local Axum, WebGPU, native Kira, native Symphonia.
- iOS AiS companion app: AIS server, native SQLite iOS, WebGPU, native Kira, native Symphonia.
- AUv3: AIS server, native SQLite iOS, WebGPU, native Kira, native Symphonia, no blocking or allocation-prone realtime audio work.
- FreeBSD Pure OS: native FreeBSD runtime, Fastify server, auto-launched WebView, native Kira, native Symphonia.

Runtime parity rule:

- A feature shipped in one mode must either keep the same Atome, tool, history, sharing, and sync semantics in all supported modes, or return an explicit typed unsupported-mode error.
- Platform differences belong in adapters, not in duplicated business logic.

Connection rules:

- Tauri UI may initiate to local Axum, then sync outward to Fastify.
- Browser targets Fastify only.
- AiS targets Fastify.
- AUv3 coordinates with the companion app and approved local channels.
- Cloud Fastify must not initiate to client-local Tauri or Axum services.
- Communication must be centralized and WebSocket-based for framework communication.

Status: Derived from `.codex/AGENTS.md` and `eVe/eVe_essentials.md`; specific adapter implementations must be verified before mutation.

## Canonical Data and Mutation Flow

Durable mutation flow:

```text
Human / AI / Voice / MCP / Script / Automation
  -> tool or runtime capability
  -> command / policy / capability / idempotency checks
  -> window.Atome.commit or window.Atome.commitBatch
  -> server event commit helper
  -> database/adole.js
  -> append-only events and property versions
  -> state_current projection
  -> WebSocket sync and deterministic replay
```

Rules:

- Tools are the canonical mutation entry point.
- Tool execution emits intentions and property-level diffs; history must not depend on re-executing arbitrary tool code to rebuild state.
- Runtime state is derived and rebuildable.
- Event history and property versions are authoritative.
- Molecule session history is timeline-scoped: durable Molecule commands append history events, undo/redo restore deterministic timeline snapshots, and keyboard handling inside a Molecule must not fall through to global Atome selection undo.
- Validation states and snapshots are explicit and immutable anchors.
- Direct UI, panel, import handler, store, or domain mutation of durable Atome state is forbidden.
- Soft-delete is the durable deletion model for canonical Atome history.

Primary sources:

- `todo/ai_voice/history_and_ai.md`
- `eVe/documentations/atome_persistence_contract.md`
- `eVe/eVe_essentials.md`
- `maps/API_MAP.md`

Status: Documented as the target architecture. Individual legacy code paths must be verified during relevant implementation phases.

## UI, Design, and Rendering Separation

UI ownership:

- Atome owns product-neutral Squirrel components and framework shell assets.
- eVe owns product UI, panels, tools, design tokens, JavaScript visual factories, and product styling behavior.

Design source of truth:

- Product design is JavaScript-driven and documented in `maps/DESIGN_MAP.md`.
- Product styling must use structured JavaScript objects, token modules, approved visual factories, and documented CSS variable installation points.
- Static CSS files are framework, vendor, or generated exceptions, not the eVe product design source of truth.

Rendering and identity:

- UI elements must have stable, traceable identity.
- Product UI should route through Squirrel/eVe factories and layer contracts.
- Panel UI must respect the header/body/tools/footer panel contract.
- Panel body remains the scrollable region when the panel contract applies.
- DOM projection attributes must stay limited to short references, renderer hints, roles, and transient interaction flags. Group timelines, group steps, members, media sources, media identifiers, local paths, previews, caches, and serialized Atome state must stay in Atome properties, timeline persistence, media stores, or disposable non-serialized renderer state, never in `data-*` attributes such as `data-media-src` or `data-eve-media-source`.
- Persisted project media Atomes must pass an explicit integrity contract before commit/render: stable source ref, renderable media kind, duration for audio/video, visual ref, and visual status. Generated waveform/thumbnail refs are model properties, not DOM attributes.
- Import and recording restoration coverage must include every maintained audio/video fixture and must validate reconstruction from serialized canonical properties after DOM teardown. Browser media probes can validate playback, but local Node contract tests must continue to guard the persistence boundary without requiring auth or a running server.
- Project DOM teardown tests must include mixed project content: normal Atomes, grouped Atomes, media Atomes, timeline tracks, clips, waveform refs, and thumbnail refs. The pass condition is reconstruction from canonical serialized properties only; stale DOM attributes are never accepted as restoration input.
- Media diagnostics inspect canonical media/runtime state and lightweight projection evidence only. A visible renderer-owned project host is acceptable evidence for imports whose minimal DOM projection intentionally has no native `<img>`, `<video>`, `<audio>`, or inline `<svg>` child.
- Audio/video recording stop flows must create a project-visible source Atome through the existing media Atome creation path and active project id. Timeline clips remain derived Molecule content; they must not replace the canonical project Atome created for the recording.
- Matrix slot state is logical state, not a permanent DOM grid. The Matrix DOM may expose project tiles and the first actionable empty creation tile; repeated empty slots are represented by layout math and CSS grid positioning through `matrix_virtual_slots.js`.
- MTraX timeline ticks are dense renderer output. Interactive loop and marker zones remain DOM-owned, but repeated ruler ticks and labels should use the canvas-backed ruler surface when canvas is available, with the existing DOM tick fallback retained for non-canvas environments.
- MTraX close orchestration must complete canonical teardown before the public close API resolves. Close may preserve dormant metadata for desktop restoration, but stale runtime clips, queued prewarm, close-time preview export, and post-commit verification must not block or repopulate a closed panel.
- Mutation ownership is enforced by `scripts/check_mutation_ownership_guardrails.mjs`: `state_current` is a projection read surface outside server route owners, runtime durable writes must enter through the canonical event commit owner rather than ad hoc HTTP calls, timeline replay baselines must never be recovered from DOM projection state before backend apply, and timeline preview/replay code must never produce backend commits from DOM projection reads.
- New project Atomes created through `toolBase.createAtome` follow the command sequence `buildCreateAtomeCommand -> validateCreateAtomeCommand -> commitCreateAtome -> refreshCreatedAtomeState -> renderCreatedAtome`. DOM hosts and `renderedAtomes` / `renderedAtomeHosts` are render caches only and are populated after commit; `{ render: false }` keeps creation canonical without dispatching projection events.
- Event projection invariants are enforced at `database/adole.js`: append-only events update `particles` and `state_current` in one transaction, duplicate event ids do not advance projection version, and reserved envelope fields are stripped from projected properties.
- State snapshots are restoration accelerators, not superior truth: controlled snapshot restore uses `restoreStateSnapshot` to normalize snapshot records into append-only `set` events before projection; legacy `restoreSnapshot` remains a migration adapter until contained.
- Legacy Squirrel Atome instances may keep `this.element` only as a DOM projection adapter. Canonical Atome business state, media refs, waveform/thumbnail refs, and group timeline/member state must not be stored on HTMLElement properties or serialized model-shaped `data-*` attributes; `scripts/check_squirrel_dom_adapter_guardrails.mjs` enforces that containment boundary.
- MTraX preview render payloads are derived cache data owned by `eVe/domains/mtrax/preview/preview_registry_runtime.js`; timeline DOM projections must reference them through short `data-preview-id` values and must not serialize preview signatures, thumbnail pixels, waveform peaks, local media URLs, or cache payloads.
- `scripts/check_dom_projection_guardrails.mjs` is the persistent validation and audit-report entry point for maintained DOM snapshots and debug captures that need measurable minimal-projection evidence, repeated `data-atome-id` projection context documentation, duplicate-id/root-shape checks, `.dom` subtree rejection of `html/head/body` roots, full-document nested-root checks, local source leak checks, durable media-error attribute checks, repeated Atome model-data duplication checks, named canvas renderer surface checks, and density thresholds for nodes, inline styles, canvas, and video elements.
- `scripts/export_dom_subtrees.mjs` owns offline extraction of matrix, project, timeline, and media-host subtree exports from a captured DOM/HTML file. It writes only under `temp/`; maintained subtree files contain one canonical root per matrix/project/timeline export, media-host exports deduplicate repeated captured projections by `data-atome-id`, and full-app captures are `.snapshot` diagnostics rather than audited `.dom` fixtures.

Status: Verified in `maps/DESIGN_MAP.md`; source modules must be inspected before visual changes.

## API and MCP Separation

API ownership:

- Open APIs live in Atome, server, and database when product-neutral.
- Closed APIs live in eVe when they control product UI, tools, stores, Molecule/MTraX, or branding.
- The exhaustive public, semi-public, and internal API inventory is a separate Phase 2 task; this map defines architectural placement and direction.

MCP/AI ownership:

- Atome owns AI/MCP orchestration, trace stores, provider client boundaries, default tool registration, and MCP protocol runtime.
- eVe owns closed runtime tools and product capabilities exposed through explicit runtime registration and capability checks.

Canonical MCP path:

```text
MCP / AI / Voice
  -> AtomeAI policy, proposal, audit, and idempotency layer
  -> runtime tool resolution
  -> eVe toolRuntimeV2 or open Atome service contract
  -> command / commit path for mutations
```

Rules:

- MCP tools must connect to existing runtime capabilities or open service contracts before direct domain APIs.
- Direct domain API use is allowed only when no runtime V2 surface exists yet and the reason is documented.
- Tools return intentions, not hidden side effects.
- Sensitive operations require policy, capability validation, audit, and confirmation flow where applicable.
- New APIs must be declared and documented in the relevant map and future registry once the registry exists.

Status: Verified at map level through `maps/API_MAP.md`, `todo/ai_voice/eVe_MCP_APIS_Tools.md`, and `eVe/eVe_essentials.md`.

## Storage, Sync, and Communication Separation

Storage:

- Durable Atome persistence belongs to `database/adole.js` and the server commit helpers.
- eVe product stores own closed product state and adapters, but durable Atome writes still route through the canonical commit flow.
- Detached profile, sharing, and sync adapters use the Adole WebSocket event commit surface for Atome mutations. Direct WebSocket `atome.create` / `atome.alter` actions remain legacy protocol edges, not framework mutation owners.
- Raw SQL outside the database layer is forbidden for Atome persistence.

Sync:

- Sync is event-based, append-only, and replayable.
- WebSocket sync transports committed events, gesture envelopes, file/media changes, ACL changes, and version/project lifecycle events.
- Offline writes queue in `sync_queue` and replay in order with idempotency keys.

Communication:

- Framework communication must stay centralized and WebSocket-based.
- REST-like route families that exist in the server are current implementation surfaces, but new communication architecture must not add polling, hidden REST fallbacks, or scattered duplicate transports.

Status: Target rules verified from authoritative docs. Existing route-level legacy and debug surfaces must be audited in the security and communication phases before being treated as final architecture.

## Code Placement Rules

Place new or changed code according to ownership:

- Product-neutral Squirrel API: `atome/src/squirrel/apis/`.
- Product-neutral communication service: `atome/src/squirrel/{mail,contacts,calendar,bank}/`.
- Product-neutral AI/MCP/voice contract: `atome/src/squirrel/{ai,voice}/`.
- Product-neutral audio or AV runtime: `atome/src/application/audio_runtime/`.
- Product-neutral security or sync primitive: `atome/security/`.
- Server route, WebSocket, auth, or operational infrastructure: `server/`.
- Database adapter or persistence primitive: `database/`.
- eVe product UI, panels, tools, menu, Matrix, ribbon, flower, Finder workflow: `eVe/intuition/`.
- eVe product design tokens or factories: `eVe/elements/` and `eVe/i18n/`.
- eVe product domain workflow: `eVe/domains/`.
- eVe product store or media engine: `eVe/core/`.
- Molecule/MTraX product workflow: `eVe/domains/mtrax/`, `eVe/core/media_engine/`, or `eVe/intuition/tools/molecule/` according to the existing owner.
- Persistent tests: `tests/` or colocated with existing owner tests.
- Temporary probes and transient diagnostics: `temp/`.

Before creating a new file:

- Consult the maps.
- Search for an equivalent or partial owner.
- Reuse, extend, or factorize the existing owner when possible.
- Create a new file only when the responsibility is stable and cannot be cleanly hosted by an existing module.

## Reuse Rules

Reuse first:

- Squirrel APIs for product-neutral framework behavior.
- Adole unified APIs for authenticated data and sync semantics.
- In Tauri, local loopback state/mutation paths are authoritative during bootstrap and media opening; optional Fastify mirrors or secondary state reads must not race through cross-origin loopback HTTP.
- Atome security and sync primitives for trust, verification, cloud sync, and queue behavior.
- Communication service facades for mail, contacts, calendar, and bank.
- Atome audio/AV runtime facade for playback, recording, STT, device, codec, and graph behavior.
- eVe tool registry/runtime for product tools.
- eVe panel APIs and design factories for product panels.
- eVe visual tokens and factories for product styling.
- eVe stores for product event, project, media, browser, Tauri, and iOS storage adapters.

Do not create:

- Parallel security checks.
- Parallel sync queues.
- Parallel tool registries.
- Parallel audio engines for the same product path.
- Parallel product design token systems.
- Product-specific open Atome modules.
- Closed eVe clones of open framework services.

## Anti-Duplication Rules

The following are architectural violations unless explicitly documented as a deliberate replacement and completed in the same task:

- Runtime fallbacks, compatibility shims, temporary adapters, hidden proxies, or silent bypasses.
- Direct durable state mutation outside the command/commit path.
- New HTTP polling or REST fallback channels for framework communication.
- Direct SQL for Atome persistence outside `database/`.
- UI mutations that bypass tool/runtime contracts for durable behavior.
- Product CSS or HTML source-of-truth layers outside the documented JavaScript design system.
- New MCP tools that bypass existing runtime tools or service contracts.
- New platform-specific business logic that should be an adapter around shared semantics.

Known duplication or legacy risks:

- Oversized server, database, tool runtime, media, and design files listed in `maps/CODEMAP.md` require reduction ownership before feature growth.
- Product bootstrap references from Atome into eVe remain documented boundary points and require targeted verification before structural changes.
- Product-named server route families such as mail routes require review before becoming stable open API names.
- Molecule/MTraX naming remains transitional and belongs to later execution phases.

## Maintenance Rules

Before implementation:

- Read the relevant maps.
- Inspect the owning source modules.
- Identify the existing owner, API, helper, visual factory, or runtime capability.
- State whether the change reuses, extends, refactors, or creates code.

During implementation:

- Keep changes inside the owning layer.
- Preserve dependency direction.
- Remove dead, duplicated, deprecated, unreachable, fallback, or temporary code encountered inside touched files.
- Avoid growing oversized files; reduce or split along real ownership boundaries when a touched file violates size rules.
- Keep temporary probes under `temp/`.

After implementation:

- Run the narrowest relevant validation.
- Verify modified file boundaries, line counts, and absence of temporary logs or probes.
- Update `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/DESIGN_MAP.md`, and this file when their covered contracts change.
- Record unclear areas as `Status: To verify` instead of inventing architecture.

## Current To-Verify Areas

- Exact product bootstrap boundaries still present from Atome browser shell into eVe product startup.
- Server open/closed naming and route ownership for product-named route families.
- Existing WebSocket-only target versus historical HTTP route implementation surfaces.
- Runtime parity of all modes outside the documented contract.
- Full public, semi-public, and internal API classification, which is the next Phase 2 task.
- Complete MCP registry and automatic discovery system, which remains future architecture work.

## Source References

Primary maps:

- `maps/CODEMAP.md`
- `maps/API_MAP.md`
- `maps/DESIGN_MAP.md`

Primary architecture sources:

- `.codex/AGENTS.md`
- `todo/ai_voice/eVe_MCP_APIS_Tools.md`
- `todo/ai_voice/history_and_ai.md`
- `eVe/eVe_essentials.md`
- `eVe/documentations/atome_persistence_contract.md`
- `atome/documentations/security_architecture.md`
- `atome/documentations/sync_protocol.md`
