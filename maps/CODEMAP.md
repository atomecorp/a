# Atome / eVe Code Map

Status: Initial framework map after the Atome open / eVe closed boundary validation.

Purpose:

- Provide the mandatory first navigation layer before future implementation work.
- Identify ownership, reusable modules, entry points, duplication risks, and areas that require targeted verification.
- Avoid using `docs/` as a root map directory. Framework maps live under `maps/`; product and framework documentation remain in `eve/documentations/` and `atome/documentations/`.

Mandatory Use:

- Before adding or changing code, consult this file first, then perform targeted code verification.
- Reuse, extend, or factorize existing modules before creating a new one.
- Update this map when ownership, structure, reusable APIs, or duplication risks change.

## Mandatory Pre-Implementation Gate

No implementation, refactor, cleanup, API work, UI work, tool work, persistence work, security work, or runtime behavior change may start until the relevant maps have been consulted:

- Start with this file to identify source ownership, existing modules, reusable boundaries, entry points, and known duplication or size risks.
- Consult `maps/API_MAP.md` before touching APIs, runtime globals, server routes, MCP surfaces, tools, persistence contracts, or exported methods.
- Consult `maps/DESIGN_MAP.md` before touching tokens, JavaScript-generated styles, visual factories, panels, tools, Matrix, Molecule/MTraX visuals, or assets.
- Consult `maps/ARCHITECTURE_MAP.md` before touching dependency direction, lifecycle, command/history flow, sync, server/database boundaries, cross-layer ownership, or runtime modes.

Implementation may proceed only after the map check identifies the owning layer, confirms whether reusable code already exists, and determines which maps must be updated in the same task.

## Global Ownership

## Explicit Atome Open / eVe Closed Boundary

The source tree is split by ownership, not by convenience:

- `atome/`, `server/`, and `database/` are open framework or infrastructure surfaces only when the code remains product-neutral.
- `eVe/` is the closed product layer for UI, product tools, workflows, branding, product stores, Molecule/MTraX behavior, and private composition.
- `tests/` may cross both layers only to validate contracts, integration, and regression behavior.
- `temp/` is the only approved location for temporary diagnostics, probes, and generated transient outputs.

Dependency rule:

- Open Atome code may not import closed eVe UI, product workflows, private tools, branding, or product stores.
- When open Atome code needs a closed product capability, the capability must be injected, registered, or exposed through an explicit runtime boundary documented in `maps/API_MAP.md` and `maps/ARCHITECTURE_MAP.md`.
- eVe may consume Atome open contracts, but it must not duplicate Atome security, sync, server, database, audio, communication, AI, MCP, or cross-platform framework services.
- Product-specific code must stay in `eVe/` unless it is deliberately promoted to Atome through an open contract, tests, and map updates.

Placement rule:

- Framework APIs, reusable runtime contracts, security, sync, server, database, audio, voice orchestration, and MCP primitives belong to Atome/open infrastructure.
- Product UI, panel chrome, tool composition, Finder-facing workflows, Matrix, ribbon, flower, closed voice surfaces, product persistence adapters, and Molecule/MTraX workflows belong to eVe.
- Existing bootstrap touchpoints from Atome into eVe are boundary debt and must be verified before structural changes rather than normalized as generic dependency permission.

### Atome Open Layer

Path: `atome/`

Role: Open framework, reusable runtime, cross-platform infrastructure, security, server-facing contracts, Squirrel APIs, AI/voice contracts, and generic assets.

Main responsibilities:

- Core Squirrel framework and public API surface.
- Cross-platform runtime bootstrap for browser, Tauri, iOS, AUv3, and FreeBSD targets.
- Shared security and synchronization primitives that must remain product-neutral.
- Audio runtime contracts and native backend boundaries.
- AI, voice, mail, contacts, calendar, bank, and MCP-facing contracts when they are product-neutral.

Should be extended by:

- Framework-level APIs and runtime contracts.
- Open security, sync, server, and cross-platform modules.
- Generic components that are not eVe product UI.

Should not contain:

- Closed eVe product UI.
- eVe workflows, branding, private tool composition, or product-specific panels.
- Product-only MTraX/Molecule UI internals unless promoted through an explicit open contract.

Status: Verified by current tree inspection.

Adole mutation boundary:

- `atome/src/squirrel/apis/unified/adole_api/atomes.js` owns public `AdoleAPI.atomes.*` compatibility methods.
- `atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js` owns browser-side Atome API record projection and must keep network/storage aliases at the boundary instead of re-emitting them as public record shape.
- `atome/src/squirrel/apis/unified/adole.js` owns detached WebSocket adapters, including `adapter.atome.commit` and `adapter.atome.commitBatch`.
- Framework code must route durable Atome writes through the event commit surface even when the public method name is still `create` or `alter`.

### eVe Closed Layer

Path: `eve/`

Role: Closed product layer containing eVe UI, product tools, workflows, composition, branding, persistence adapters, and product-specific media/Molecule/MTraX runtime.

Main responsibilities:

- eVe application bootstrap and product composition.
- Intuition UI, panels, tools, menu, ribbon, flower, matrix, and product interaction runtime.
- Closed media domains and MTraX/Molecule product workflows.
- Product-specific event stores, project stores, media stores, browser/iOS/Tauri storage adapters.
- Product i18n and design systems.

Should be extended by:

- eVe UI, panels, product tools, product workflows, branding, and closed runtime bridges.
- Product-specific media editing, MTraX/Molecule panels, and private persistence flows.

Should not contain:

- Open Atome framework primitives that must be reused outside the eVe product.
- Generic security or cross-platform server contracts that belong in Atome.

Status: Verified by current tree inspection.

Capture reveal ownership:

- `eVe/intuition/tools/capture_reveal_runtime.js` owns capture media reveal orchestration for audio recordings, video recordings, and photos.
- `eVe/intuition/tools/capture_export_geometry.js` owns the viewport-to-project-layer geometry contract for that reveal.
- `eVe/intuition/tools/capture.js` owns capture tool actions and delegates media reveal creation, animation, and final-position persistence to the reveal runtime.
- `eVe/intuition/runtime/project_media_import_runtime.js` owns shared project media file selection for flower-menu import and capture import, emits the narrow Xcode-visible import trace for iOS/AUv3 picker diagnosis, then delegates durable project media creation to `project_drop.importFilesToProjectViaCreator`.
- `eVe/intuition/tools/capture.js` remains a critical oversized legacy module after this scoped extraction. Current reduction ownership is the capture tool action layer; the intended reduction plan is to continue moving cohesive responsibilities into dedicated runtimes: fullscreen capture surface, quick-record pointer session, capture menu registration, and preview session lifecycle.

Atome DOM projection ownership:

- `eVe/core/atome_dom_id.js` owns the final Atome DOM host id contract: `eve-atome_<atome_id>`, `toDomId`, `fromDomId`, `getAtomeElement`, nearest-host resolution helpers, and WeakMap-backed runtime metadata for projection-only elements.
- `eVe/intuition/matrix/core/project_dom_state.js` owns WeakMap-backed project projection metadata for project views, Matrix tiles, and project-scoped tool projection hosts; project identity must be recovered from this runtime registry or `project_view_<id>` ids, not from `data-project-id`.
- Final Atome DOM hosts and their final rendered subtrees must not carry Atome business state, type, selection, group, media, renderer, drag, resize, binding, project, replay, or persistence data in `data-*` attributes.
- Event layers such as click, double-click, selection, drag, resize, flower menu routing, media transport, and MTRAX opening must resolve the nearest `eve-atome_*` host, recover the canonical Atome id, and then consult the Atome registry, runtime registry, or owning domain registry for behavior decisions.
- Binding flags and ephemeral UI state belong in runtime registries or WeakMaps. Group/media runtime facts belong in their owning runtime/domain registries, not in the DOM.
- Legacy code may keep narrow read-only fallbacks while migrating old DOM, but new rendering code must emit the clean projection contract and new routing code must not branch on Atome `data-*` state.

Unified rendering ownership:

- `eVe/domains/rendering/` owns the closed product unified rendering projection contract for eVe Atomes: disposable `RenderAtom` normalization, render-scene ordering and hit testing, bounded project/matrix canvas surfaces, hidden text service lifecycle, and the shared WebGPU render-at-time compositor entry point.
- `eVe/domains/rendering/render_atom.js` owns the disposable RenderAtom content projection and must consume the shared media source canonicalization contract before media reaches Bevy, so bare uploaded or recorded filenames become explicit `/api/uploads/...` or `/api/recordings/...` sources with owner scope instead of browser-relative URLs.
- `eVe/domains/rendering/virtual_scene_contract.js` owns the Phase 1 renderer-agnostic Virtual Scene contract: disposable `AtomeRenderNode` projection, deterministic tree construction, selected-state projection from the runtime selection table, dense render-layer assignment from the actual scene paint order, render diff operations, and dirty-flag names. It is a projection/diff contract only; it must not become an ECS, renderer, canonical Atome model, or DOM-backed state store.
- `eVe/domains/rendering/bevy_projection_adapter.js` owns the strict browser Bevy projection adapter from `AtomeRenderNode` Virtual Scene data into the `run_atome_bevy_renderer(...)` payload shape. It maps explicit id, kind, parent, logical position, logical size, paint-order layer, selected flag, fill color, text, media source, media texture, waveform peak fields, and project-audio waveform playback progress, normalizes direct CSS z-index/layer payloads to the Rust `i32` boundary when no Virtual Scene render layer exists, and rejects incomplete projection nodes instead of inventing silent defaults.
- `eVe/domains/rendering/bevy_pending_media_contract.js` owns the browser Bevy contract for source-backed media whose disposable texture is not available at spawn time. It identifies persisted video poster and waveform peak inputs that must be consumed during initial projection, requires image nodes to resolve a texture before spawn, and marks uncached video plus waveform media with transparent material so Rust never exposes its default blue shape while the same Bevy resource path generates the delayed texture.
- `eVe/domains/rendering/bevy_media_texture_resolver.js` owns disposable browser texture decoding for the Bevy web route. It converts text, raster images, SVG documents, video frames, and audio waveforms into explicit RGBA texture payloads without adding visible media DOM nodes and without rendering through a legacy project adapter; video textures seek to representative frames and prime muted frame presentation before RGBA readback, Safari/WKWebView video decode uses the shared hidden in-flow pool from `eVe/domains/media/shared/video_decode_pool_runtime.js` so frame rasterization is not starved by detached media, treats WebKit user-gesture `play()` rejection as non-fatal for frame readback, rejects transparent or all-black video readbacks as blank-frame failures instead of becoming Bevy textures, accepts the video fixtures in `tests/fixtures/media`, and decodes source-backed audio waveforms to derive real peaks before texture generation.
- `eVe/domains/rendering/bevy_surface_background_runtime.js` owns browser Bevy project-surface background delivery. It consumes the `eve:surface-background-changed` event from the user background preference path, decodes image backgrounds to cached RGBA texture payloads when needed, forwards generated textures directly, and calls `apply_atome_bevy_surface_background` so the Rust Bevy scene renders background pixels before Atomes and text. `user_background_pattern_renderer.js` owns generated background pixel production, while `user_surface_background_texture_runtime.js` owns preference-to-surface payload orchestration for `eVe/user/background.js`.
- `eVe/domains/rendering/bevy_web_renderer_runtime.js` owns browser Bevy WASM startup and diff dispatch for an existing shared project canvas. It initializes the generated `atome/src/wasm/squirrel_bevy_renderer.js` module, resolves immediately reusable image/video media textures before initial projection, keeps uncached video and waveform nodes present with transparent pending material, applies decoded video/waveform texture later through a serialized deferred resource queue, retries deferred video texture failures with bounded backoff when Safari/WKWebView has not produced a frame yet, defers spawned video/waveform textures when metadata is not immediately available, prevents starting two Bevy apps for the same canvas, refuses to adopt a started renderer state from a replaced canvas with the same selector, filters the known non-fatal WASM runner `unreachable` completion from page error reporting, applies surface-size patches through `apply_atome_bevy_surface` before queued media generation resumes, registers the Bevy surface-background runtime, applies `diffVirtualSceneTrees(...)` operations through explicit Bevy WASM exports for spawn, despawn, transform, style, reparent, layer, visibility, text metadata, resource updates, and surface background, and primes bounded WebView presentation redraws through `request_atome_bevy_redraw`; it does not own canonical Atome state or provide a legacy renderer fallback. When a project view refresh reuses the same canvas whose Bevy runtime is already started, this owner diffs the last canvas-owned virtual scene against the requested virtual scene and applies the missing render ops instead of returning a passive `already_started` result. Logout must clear project-scene visuals while preserving the shared connected canvas so the Web Bevy event loop remains attached to its real surface. The generated Web Bevy runtime in `platforms/web/bevy-renderer/src/lib.rs` uses an opaque canvas surface, requests an initial redraw before any user input, preserves wake requests made before the winit event-loop proxy is installed, then wakes the Bevy winit event loop and emits redraw requests whenever queued WASM render operations or explicit redraw requests are applied, so startup, Atome creation, mutation diffs, deferred media resource updates, surface background changes, and surface-size patches present without waiting for a pointer or keyboard event.
- `eVe/domains/rendering/surface_size_runtime.js` owns render-surface size derivation from host CSS dimensions, `devicePixelRatio`, `ResizeObserver` box data, and optional GPU texture-dimension clamping. It returns viewport/render-target measurements only and must not mutate Atome geometry.
- `eVe/domains/rendering/project_scene_runtime.js` owns active project scene projection state keyed by project id. It accepts canonical project Atome records, delegates project-record normalization/filtering to `project_scene_record_projection.js`, delegates client-coordinate hit-test and lasso rectangle collection to `project_scene_hit_testing.js`, builds the disposable Virtual Scene projection, delegates Bevy native/web renderer execution to `project_scene_bevy_projection_runtime.js`, updates the bounded project render surface, and returns projection handles instead of per-Atome DOM hosts. `eVe/intuition/runtime/tool_genesis.js` must await this projection before marking `loadProjectAtomes(...)` complete or refreshing the recent-load cache, so a project refresh cannot cache "loaded" Atomes before Bevy has accepted the scene.
- `eVe/domains/rendering/project_scene_bevy_projection_runtime.js` owns active project Bevy renderer execution. It selects the native or web Bevy runtime according to the existing capability contract, sends startup scenes or diffs, and converts native non-presentable errors into explicit projection results without selecting a Web/WASM fallback on iOS.
- Legacy active project renderer modules `render_at_time.js`, `project_scene_webgpu_adapter.js`, `image_adapter.js`, `video_adapter.js`, `waveform_adapter.js`, `text_adapter.js`, and `project_scene_selection_overlay.js` were removed once the active project route moved to Bevy. Project Atome rendering must use the Bevy Virtual Scene and media texture route, not the old WebGPU adapter family.
- Project selection visuals on the cleaned route are projected by `eVe/domains/rendering/` and drawn by the shared Atome Bevy core: `project_scene_selection_state.js` reads existing selection runtime state, `project_scene_runtime.js` marks disposable render atoms, `virtual_scene_contract.js`/`bevy_projection_adapter.js` propagate `selected` plus dense paint-order render layers, `bevy_web_renderer_runtime.js` forwards those fields in style diffs, `atome/shared/render_visual_tokens.js` owns the cross-platform design tokens, and `atome/renderers/bevy-core/src/selection_overlay.rs` draws the selected Atome as a light-gray dotted contour with a progressively faded 12 px shadow blur just above the selected entity and below the next paint layer inside the same project canvas. No per-Atome DOM outline, host class, selection overlay DOM, or legacy WebGPU selection bitmap is allowed on the active project route.
- `eVe/domains/rendering/project_scene_runtime.js` owns active project scene orchestration, resize, drag, generic scene-intent commits, and synchronous disposable scene refresh when project-visible records are inserted before the async Bevy frame completes. It delegates live drag/resize frame coalescing to `eVe/domains/rendering/project_scene_gesture_runtime.js`, so move bursts update disposable scene records immediately while WebGPU rerenders and realtime `gesture_frame` commits are batched to animation frames. Text editing is delegated to `eVe/domains/rendering/project_scene_text_runtime.js`, active edit ownership is tracked outside the DOM by `eVe/domains/rendering/project_scene_text_edit_state.js`, hidden keyboard capture is owned by `eVe/domains/rendering/hidden_text_service_runtime.js`, direct Bevy transform patches are owned by `eVe/domains/rendering/project_scene_direct_transform_runtime.js`, and selection/video/audio invalidation listeners are owned by `eVe/domains/rendering/project_scene_invalidation_runtime.js`. Text commit and gesture end still persist `set` events through the canonical Atome commit boundary.
- `eVe/domains/rendering/surface_runtime.js` owns centralized project-surface pointer routing for select, drag, resize, native double-click text edit re-entry, caret placement, and text drag-selection gestures. It also owns render-surface host attachment, logical size tracking, and client-to-logical coordinate conversion when the visible canvas rect is scaled relative to the render surface. `surface_text_pointer_runtime.js` owns text-specific pointer routing helpers and active-edit guards; active text gives caret/selection precedence over resize except on the bottom-right resize corner. `project_scene_hit_testing.js` owns project-scene client-point and lasso-rect queries against the disposable scene. Resize is resolved through scene hit-testing and logical edge handles on the canvas, not visible per-Atome resize DOM.
- `eVe/domains/rendering/surface_pointer_runtime.js` owns active project resize geometry for single and multi-selection gestures. Resize is homothetic by default: one uniform scale is derived from the active logical handle and applied to width and height for every selected scene target before the final canonical `set` commit. For inactive text Atomes it recalculates `text_style.font_size` from that scale so Bevy redraws crisp text; for actively edited text it changes only the bounding box. The resize hit band is an internal logical-canvas band on the right and bottom edges with 5 px of additional inward tolerance; it must not be represented by DOM handles or mutate canonical Atome bounds.
- `eVe/core/atome_events/project_layer_runtime.js` owns project background and lasso gestures. On the cleaned canvas route it must ask `project_scene_runtime.js` for scene hit-tests before arming lasso, and lasso rectangle selection must use scene Atome ids when no per-Atome DOM hosts exist.
- `eVe/intuition/runtime/project_scene_render_bridge.js` owns the `tool_genesis.js` bridge from bounded project shell parents to the project scene runtime. It prevents the active project visual path from depending on `HTMLElement` Atome hosts while leaving non-project tool/system UI rendering intact.
- `eVe/intuition/runtime/atome_description_frame_runtime.js` owns description-derived frame memory for legacy non-project host synchronization and project bridge bookkeeping. `tool_genesis.js` consumes this owner instead of storing the frame registry inline.
- `eVe/intuition/runtime/panel_open_settle_runtime.js` owns the prepared-panel open lifecycle: panel visibility snapshots, hide-until-prepared, settle (layer attach + placement + reveal), and post-open floating placement scheduling. `eVeIntuition.js` injects its placement primitives (layer attach, near-tool positioning, placement observers, docked-mtrack detection) and consumes the returned API; the settle semantics must not be re-owned inline.
- `eVe/intuition/runtime/media_integrity_runtime.js` owns non-project legacy media host integrity state: media kind hints, integrity history, text-patch key classification, and media-host repair observers. `tool_genesis.js` may wire the runtime with Atome lookup and media URL dependencies, but must not re-own the media integrity registries inline.
- `eVe/intuition/runtime/shape_svg_runtime.js` owns non-project legacy SVG shape detection, SVG data-url decoding, protected SVG fetch, and host mounting. `tool_genesis.js` may inject platform/media credential helpers and Atome lookup callbacks, but SVG parsing and mounting must not be reintroduced inline.
- `eVe/intuition/runtime/group_visual_runtime.js` owns non-project legacy group host visual projection: group placeholder layers, preview mounting, member visibility state, group-step visual synchronization, and group refresh. It must keep canonical group state in Atome/runtime state and must not become the active project scene path; project-visible group Atomes remain `RenderAtom` entries in `project_scene_runtime.js`.
- `eVe/intuition/runtime/media_source_runtime.js` owns media URL/source resolution for the legacy `tool_genesis.js` path: bundled assets, upload/recording inference, protected API route normalization, direct renderability checks, persisted group/timeline media source normalization, and local/Tauri credential decisions. It reuses shared media source/identifier helpers and must not mount media or own canonical media state.
- `eVe/intuition/runtime/media_hydration_runtime.js` owns protected media hydration for the legacy projection path: local availability checks, Tauri streaming attachment, authenticated blob fetch, hydrated blob lifecycle, and media projection source state updates. It must not decide canonical media records or active project scene rendering.
- `eVe/intuition/runtime/media_mount_runtime.js` owns legacy media API visual mounting through `ensureMoleculeMediaRuntime()`: old media child cleanup, Molecule `mountVisual()` calls, projection error updates, video poster application, and preview scrub dispatch. It is projection plumbing only; active project media remains scene-rendered.
- `eVe/intuition/runtime/atome_host_registry_runtime.js` owns the legacy non-project Atome host registry: rendered-host cache, host rebinding, rendered checks, cache clearing, and DOM host removal with media resource cleanup. It must remain projection lifecycle only and must not decide canonical project membership or render active project Atomes.
- `eVe/intuition/runtime/project_atome_index_runtime.js` owns project Atome index bookkeeping for `tool_genesis.js`: remembered project snapshots, active load de-duplication, recent-load cache reads, and scoped project cleanup. It tracks projection/cache lifecycle only and must not become canonical Atome state or a project scene renderer.
- `eVe/intuition/runtime/shared_project_override_runtime.js` owns shared Atome project override bookkeeping for `tool_genesis.js`: owner-scoped local override persistence, Fastify Atome fetch de-duplication, shared record hydration back into the target project, and stale override pruning. It is a bridge/cache owner only and must not become canonical project membership state.
- `eVe/intuition/runtime/implicit_gesture_commit_runtime.js` owns implicit project gesture commit routing for `tool_genesis.js`: gesture event classification, short-window phase de-duplication, realtime self-patch dedupe marks, tool-gateway dispatch, and fallback to `window.Atome.commitBatch` for non-gesture batches. It is an event-routing bridge only and must not own durable gesture state.
- `eVe/intuition/runtime/realtime_atome_events_runtime.js` owns `tool_genesis.js` realtime event binding and media patch sanitation: event-bus update/delete routing, DOM realtime event routing, textual media patch stripping, and media integrity diagnostics. It must emit/consume canonical update intents through injected callbacks and must not store durable Atome state.
- `eVe/intuition/runtime/persistence_diag_runtime.js` owns temporary persistence diagnostics behind `tool_genesis.js`: diagnostic-gated bridge logging and compact record summaries for load/render traces. It must remain observability-only and must not influence project membership, rendering, or mutation ordering.
- `eVe/intuition/runtime/info_panel_sync_runtime.js` owns legacy info panel synchronization callbacks behind `tool_genesis.js`: position/resize projection payloads and optional right/bottom derived values. It may notify the panel, but it must not mutate canonical Atome state or infer project membership.
- `eVe/intuition/matrix/core/preview.js` consumes the unified `createMatrixPreviewRenderer()` and project scene records for Matrix thumbnails. It must not use DOM capture paths such as `html2canvas`, SVG `foreignObject`, cloned project DOM, or symbolic Atome DOM scanning.
- `eVe/intuition/matrix/ui/matrix_interaction_runtime.js` owns Matrix tile interaction routing through a single scroll-surface gesture binding and scene hit testing. `eVe/intuition/matrix/ui/view.js` owns bounded shell tile DOM only and must not attach per-tile preview/open/rename/menu listeners.
- Project restore, info assignment, shared-Atome hydration, and timeline replay paths update `project_scene_runtime.js` for project-visible records. They must not call `renderAtomeRecord()` as a project visual fallback or require an `HTMLElement` render return.
- `RenderAtom` data is runtime-only and derived from canonical Atome records. It must not be written into DOM attributes, persisted as business state, or used as a second writable source of truth.
- Project audio waveform Atomes now publish waveform render metadata into the Atome runtime registry and Bevy texture route instead of creating per-Atome visible waveform DOM or SVG nodes. Project-only audio playback progress is owned by `eVe/domains/media/project_audio_playback_progress_runtime.js`, projected at a bounded runtime cadence as disposable `playback_progress` Virtual Scene style data, and rendered by Bevy as a waveform playhead overlay inside the existing project canvas; Molecule, sequencer, timeline, and direct API audio playback paths must not consume this project playhead runtime. Browser/WASM Bevy coalesces queued progress-only style ops per Atome and `bevy_web_renderer_runtime.js` uses a single redraw request for progress-only diffs so audio playback cannot starve the renderer queue. Direct audio/video recording APIs must render the committed media Atome through `project_media_atome_renderer.js` so the canonical project source Atome appears on the current project canvas. Browser audio recordings must persist canonical `audio_recording` kind plus waveform peak arrays on the project Atome before Bevy texture generation; pending recording Atomes without a renderable media source must stay out of the Bevy projection until the committed media source is available.

### Tests

Path: `tests/`.

Role: Validation for framework, eVe runtime, probes, server, UI scenarios, media, security, and governance.

Fixtures:

- `tests/fixtures/media/` contains Git-tracked media fixtures used by media, Molecule, and MTraX probes.
- Runtime probes should prefer `ATOME_MEDIA_TEST_DIR` when supplied and fall back to `tests/fixtures/media/`.
- `tests/fixtures/dom/maintained_projection.dom` is the maintained clean DOM projection fixture scanned by the default DOM projection guardrail.
- `tests/eve/media_fixture_restore_contract.test.mjs` guards the fixture-driven project media persistence contract for every maintained audio/video fixture and verifies canonical properties survive DOM teardown reconstruction without reading DOM state.
- `tests/eve/project_dom_teardown_reconstruction.test.mjs` guards project reconstruction from serialized canonical records after DOM teardown across normal Atomes, grouped Atomes, media Atomes, timeline tracks, clips, waveform refs, and thumbnail refs.

Main entry points:

- `npm run check:syntax`
- `npm run check:no-fallbacks`
- `npm run check:palette-ssot`
- `npm run check:tauri-fs-boundary`
- `npm run check:molecule-guardrails`
- `npm run test:run`
- Targeted `node --test ...` commands for persistent regression coverage. New persistent tests must be placed under `tests/`; temporary probes belong under `temp/`.
- `tests/scripts/check_mutation_ownership_guardrails.test.mjs` guards the mutation ownership checker that prevents direct client/runtime writes to `state_current` and direct event-commit transport bypasses outside the canonical owners.
- `tests/scripts/check_squirrel_dom_adapter_guardrails.test.mjs` guards Squirrel Atome DOM adapter containment: `this.element` and local `element` projections must not receive canonical business state properties or serialized model payloads.
- `database/adole.event_projection_invariants.test.mjs` guards event/particle/`state_current` projection coherence: append-only event dedupe, projection versioning, sanitized reserved fields, and matching particle/state properties.
- `database/adole.snapshot_restore_invariants.test.mjs` guards controlled state snapshot restoration through event replay instead of direct DOM or projection writes.
- `tests/probes/mtrax_play_resume_position.test.mjs` guards the MTraX transport contract that `playTimeline()` starts from the current playhead and does not rewind at play start.
- `tests/probes/mtrax_group_reload_preserve_playhead.test.mjs` guards same-group MTraX timeline reloads so play-triggered reloads do not issue stop before play and preserve the current playhead.
- `tests/probes/mtrax_keyboard_space_toggle_resume.test.mjs` guards the Molecule space-key shortcut cycle so it calls play, pause, then play again without resetting the playhead.
- `tests/probes/molecule_session_history.test.mjs` guards Molecule session undo/redo, append-only history events, and persistence of restored timeline snapshots.
- `tests/probes/media_api_suite_probe.test.mjs` guards the project media import DOM projection contract for image, SVG, video, and audio Atomes. It fails when final Atome DOM contains forbidden Atome `data-*` attributes, runtime/custom attributes, empty `class=""`, disguised runtime classes such as `eve-system-layer-*`, forbidden selection classes, `border: medium`, inline outline without `is-selected`, or renderer state stored in DOM instead of runtime state.
- `tests/strangler_v2/_env.mjs` owns the maintained mock browser fixture for colocated eVe Intuition runtime tests.
- `tests/strangler_v2/palette_ssot_guard.test.mjs` guards the menu/palette source-of-truth contract by preventing legacy example entrypoints from mutating `new_menu_v2` directly.
- `tests/probes/user_panel_content_contract.test.mjs` verifies the home/user panel module still mounts non-empty auth and profile dialog bodies from the canonical panel controls, and keeps authenticated account actions in the scrollable user body directly below Preferences.

Status: Verified by current tree inspection.

### Temporary Artifacts

Path: `temp/`

Role: Only approved location for temporary probes, debug scripts, reports, generated test outputs, and transient diagnostics.

Rules:

- Do not create temporary files in source, root, tool, or documentation directories.
- Remove temporary probes when no longer needed.

Status: Verified by current tree inspection.

## Atome Areas

### Atome Documentation

Path: `atome/documentations/`

Owner: Atome open layer.

Purpose: Existing Atome-specific documentation, API notes, audio documentation, server setup, sync protocol, security architecture, and historical troubleshooting notes.

Main files:

- `atome/documentations/AI.md`
- `atome/documentations/AUv3_API_Reference.md`
- `atome/documentations/CRUD_apis.md`
- `atome/documentations/media_capture_apis.md`
- `atome/documentations/security_architecture.md`
- `atome/documentations/sync_protocol.md`
- `atome/documentations/tools_api_and_coding.md`
- `atome/documentations/using_squirrel.md`

Reusable logic exposed: No runtime logic. Use as source material only after validating against code.

Should be extended by:

- Atome-specific user or developer documentation.

Should not be duplicated by:

- Framework maps. Cross-layer maps belong in `maps/`.

Status: Verified.

### Atome Security

Path: `atome/security/`

Owner: Atome open layer.

Purpose: Product-neutral security, cloud sync, server verification, trusted key metadata, and offline sync queue primitives.

Main files:

- `atome/security/cloudSync.js`
- `atome/security/serverVerification.js`
- `atome/security/serverVerificationCrypto.js`
- `atome/security/serverVerificationState.js`
- `atome/security/syncQueue.js`
- `atome/security/sync_queue_constants.js`
- `atome/security/sync_queue_storage.js`
- `atome/security/sync_queue_items.js`
- `atome/security/sync_queue_credentials.js`
- `atome/security/trusted_keys.js`

Reusable APIs:

- Trusted server lookup and fingerprint matching.
- Server verification orchestration, cryptographic challenge helpers, status presentation, and cache control.
- Sync queue action lifecycle and retry processing.
- Cloud sync status and conflict resolution entry points.

Primary dependencies:

- `atome/src/squirrel/apis/serverUrls.js` for server URL resolution in cloud sync.
- Browser storage and fetch-like runtime services. Status: To verify before mutation.

Should be extended by:

- Open security checks, trusted server policy, sync queue behavior, and framework-level verification.

Should not be duplicated by:

- eVe product security surfaces. Product flows should call or wrap explicit Atome security contracts, not reimplement trust checks.

Known risks:

- `syncQueue.js` owns sync execution and scheduler orchestration; queue constants, storage obfuscation, item operations, and auto-sync metadata are split into focused `sync_queue_*` modules.
- Security phase must audit secrets, token storage, bridge permissions, and command injection surfaces.

### Atome Shared Contracts

Path: `atome/src/shared/`

Owner: Atome open layer.

Purpose: Product-neutral framework contracts shared by browser, server, and database layers.

Main files:

- `atome/src/shared/atome_contract.js`
- `atome/src/shared/atome_universal_contract.js`
- `atome/src/shared/atome_contract_errors.js`
- `atome/shared/atome_contract.js` re-exports the browser-served contract for Node and server consumers.

Reusable APIs:

- Canonical Atome envelope normalization through `normalizeCanonicalAtome`.
- Universal Atome envelope normalization through `normalizeCanonicalAtome(..., { universal: true })`, including `schema_version`, capabilities, interfaces, composition, policy, and lifecycle defaults.
- Boundary-only alias normalization for `atome_id`, `atome_type`, `particles`, and `data`.
- Canonical Atome property sanitization with reserved-key rejection and schema hooks.
- Minimal Atome type registration through `registerAtomeType`, `getAtomeType`, and `listAtomeTypes`.
- Tool contract projection through `toolToUniversalAtome`, while keeping tool compatibility data inside a property subtree instead of turning tool fields into envelope fields.
- Reserved envelope-field rejection for durable property writes.
- Canonical Atome envelope formatting for tolerant server/database responses.
- No public `fromLegacy...` or `toLegacy...` Atome adapter is allowed; historical shapes are input-boundary concerns only, and SQL storage serialization must not circulate as an Atome format.

Should be extended by:

- Open Atome description, validation, history, and persistence contracts needed across client/server/database boundaries.

### ADOLE Storage Projection

Purpose: Convert SQL storage rows into canonical Atome envelopes at the database boundary without creating a public legacy format.

Main file:

- `database/adole_storage_projection.js`

Reusable APIs:

- `projectStoredAtome` projects rows from `atomes` plus particle properties into universal canonical Atomes.
- `projectStoredStateCurrent` projects `state_current` rows into universal canonical Atomes.
- `projectStoredEvent` parses event rows while preserving append-only event identity.

Used by:

- `database/adole.js` for canonical `getAtome`, `getStateCurrent`, and `listStateCurrent` outputs.

Must not be extended with:

- public `fromLegacy...` or `toLegacy...` APIs;
- runtime compatibility shims;
- application-level propagation of SQL column names as Atome format.

### ADOLE Schema Migrations

Purpose: Keep additive ADOLE schema migrations outside the oversized data-layer runtime.

Main file:

- `database/adole_schema_migrations.js`

Reusable APIs:

- `runAdoleSchemaMigrations` applies permissions, snapshots, events, and `state_current` additive migration checks during `database/adole.js` initialization.

Should not be duplicated by:

- Server route formatters, ADOLE client helpers, database property writers, or eVe product tools.

Status: Added for Atome sanitization.

Status: Verified.

### ADOLE Permissions

Purpose: Own ADOLE permission writes, condition evaluation, and can-read/write/delete/share/create checks outside the oversized persistence runtime.

Main file:

- `database/adole_permissions.js`

Reusable APIs:

- `createAdolePermissionApi` binds the SQL query boundary plus canonical Atome accessors and returns permission mutation/check functions consumed by `database/adole.js`.

Used by:

- `database/adole.js` for the public ADOLE permission exports.

Must not be duplicated by:

- server sharing services, route handlers, client adapters, or direct permission SQL checks that bypass the canonical ADOLE permission API.

### Atome Shared Utilities

Path: `atome/shared/`

Owner: Atome open layer.

Purpose: Shared product-neutral utility contracts.

Main files:

- `atome/shared/logging.js`
- `atome/shared/recipient_access.js`

Reusable APIs:

- Structured log envelope building, coercion, validation, and serialization.
- Recipient access classification and summary helpers.

Should be extended by:

- Generic framework helpers with stable ownership and reuse beyond eVe.

Should not contain:

- eVe-specific i18n, UI, tool, or workflow helpers.

Status: Verified.

### Atome Browser Application Shell

Path: `atome/src/`

Owner: Atome open layer with product bootstrap touchpoints.

Purpose: Web entrypoint, static runtime assets, framework bootstrap, bundled third-party browser libraries, and WASM assets.

Main files:

- `atome/src/index.html`
- `atome/src/application/index.js`
- `atome/src/squirrel/spark.js`
- `atome/src/squirrel/apis/loadServerConfig.js`
- `atome/src/squirrel/apis/loadServerConfigDebug.js`
- `atome/src/squirrel/apis/loadServerConfigDefaults.js`
- `atome/src/squirrel/apis/loadServerConfigWs.js`
- `atome/src/squirrel/kickstart.js`
- `atome/src/squirrel/squirrel.js`
- `atome/src/squirrel/apis.js`
- `atome/src/version.json`

Primary dependencies:

- `atome/src/js/` for bundled browser libraries.
- `atome/src/wasm/` for generated audio WASM artifacts and generated `squirrel_bevy_renderer*` Bevy WebGPU renderer artifacts.
- Server config loading is split between runtime fetch/exposure in `loadServerConfig.js`, debug flag application in `loadServerConfigDebug.js`, generated defaults in `loadServerConfigDefaults.js`, and WebSocket URL construction in `loadServerConfigWs.js`.
- eVe bootstrap/version product references still exist in `atome/src/application/index.js` and `atome/src/squirrel/kickstart.js`.
- `atome/src/application/examples/user.js` is legacy product-bootstrap rendering debt and must use the shared eVe media source canonicalization contract for media atome sources instead of reconstructing recording or upload paths locally.
- Legacy application example menu files under `atome/src/application/examples/`, `atome/src/application/vie/`, `atome/src/application/lyrix/`, and `atome/src/application/jeezs/` must not mutate `window.new_menu_v2` content or theme. The eVe Intuition menu is owned by `eVe/intuition/`; app-specific menu replacement requires an explicit product runtime boundary.
- `atome/src/application/jeezs/demo.js` owns only the Jeezs demo mounting/runtime menu synchronization; `demo_messages.js` owns localized demo copy, and `demo_blocks.js` owns demo block payload construction.

Should be extended by:

- Framework bootstrap and open runtime composition.

Should not be extended by:

- Closed product UI or product-only tool workflows.

Known risks:

- Product bootstrap references need targeted verification during architecture map work.
- The legacy examples user renderer is above the normal file-size threshold and remains critical boundary debt; media behavior changes there must stay narrowly scoped and validated against the shared media route contract.
- `atome/src/js/` contains vendored/minified assets and should not be edited manually unless regenerating assets through the owning build process.

Status: Verified.

### Atome Audio Runtime

Path: `atome/src/application/audio_runtime/`

Owner: Atome open layer.

Purpose: Public audio/video runtime contracts, Kira command normalization, play/record core, backend resolution, AV contracts, playback and recording API facades.

Main files:

- `audio.facade.js`
- `audio_playback_api.js`
- `audio_recording_api.js`
- `av_contracts.js`
- `backend.kira.js`
- `kira_audio_commands.js`
- `play_record_contract.js`
- `play_record_core.js`
- `play_record_media_source.js`
- `record_audio_api.js`
- `runtime_audio_backend.js`
- `auv3_host_playback.js`
- `stt_api.js`

Reusable APIs:

- `getPlayRecordCore()`
- `PLAY_RECORD_API_CONTRACT`
- `canonicalizePlayRecordMediaSource()`
- Kira payload normalization and command invocation helpers.
- Runtime audio backend resolution.
- AUv3 host-routed media playback commands and source-to-native-path resolution.
- Audio playback and recording API facades.

Tests:

- `play_record_core.test.mjs`
- `runtime_audio_backend.strict_native.test.mjs`
- `auv3_host_playback.test.mjs`
- `av_api_boundaries.test.mjs`

Should be extended by:

- Open audio playback, recording, STT, and backend boundary work.

Should not be duplicated by:

- eVe media domains or MTraX runtime. Product code should depend on these contracts where possible.

Known risks:

- `play_record_core.js` owns the PlayRecordCore class and delegates public contract constants and media source canonicalization to focused runtime modules.
- `av_api_boundaries.test.mjs` still has eVe integration context and belongs to later AV boundary cleanup.

Status: Verified.

### Squirrel Public API Surface

Path: `atome/src/squirrel/apis/`

Owner: Atome open layer.

Purpose: Core Squirrel APIs and unified ADOLE API modules.

Main files:

- `atome/src/squirrel/apis.js`
- `apis/essentials.js`
- `apis/utils.js`
- `apis/shortcut.js`
- `apis/dragdrop.js`
- `apis/loader.js`
- `apis/serverUrls.js`
- `apis/svg_utils.js`
- `apis/update_atome.js`
- `apis/unified/adole.js`
- `apis/unified/adole_apis.js`
- `apis/unified/adole_api/*.js`
- `apis/unified/realtime_dedupe.js`
- `apis/unified/text_dom.js`

Reusable APIs:

- Essential wait/runtime helpers.
- Platform and server URL utilities.
- ADOLE auth, session, projects, storage, sharing, activities, atomes, and runtime modules.
- `adole_api/session.js`, `projects.js`, and `auth.js` jointly own durable current-project restoration across WebView reloads: the cache is stored in `squirrel_current_project_v2` with `userId`, restored only for the same authenticated user, and preserved through login/register only when `transferOwner` successfully migrates the previous pre-auth workspace.
- `eVe/intuition/tools/project_bootstrap.js` may recover from a stale empty current project by selecting the single renderable `project_id` already owned by the authenticated user in `state_current`; it must not select from another owner or from DOM state. If `squirrel:user-logged-in` arrives while a project bootstrap is already in flight, it queues a forced authenticated re-bootstrap so the newly authenticated user's project and atomes load without requiring a browser refresh.
- ADOLE atome project-state reads keep Tauri loopback state authoritative and avoid secondary cross-origin loopback Fastify `/api/state_current` fetches.
- Realtime dedupe and text DOM contracts.

Should be extended by:

- Open Squirrel APIs and product-neutral backend contracts.

Should not be duplicated by:

- eVe product APIs. eVe should call open Squirrel APIs or create closed adapters only when product-specific behavior is required.

Status: Verified.

### Squirrel Atome / MCP Surface

Path: `atome/src/squirrel/atome/`

Owner: Atome open layer.

Purpose: Atome object integration and MCP-facing platform, communication, security, and runtime bridge surfaces.

Main files:

- `atome.js`
- `mcp.js`
- `runtime_tool_resolution.js`

Tests:

- `mcp.communication_surface.test.mjs`
- `mcp.platform_surface.test.mjs`
- `mcp.runtime_bridge.test.mjs`
- `mcp.security_surface.test.mjs`

Should be extended by:

- MCP-compatible Atome public contracts.

Should not be duplicated by:

- eVe hidden tool bridges or direct runtime mutations.

Status: Verified.

### Squirrel AI Runtime

Path: `atome/src/squirrel/ai/`

Owner: Atome open layer.

Purpose: AI gateway, trace policy, provider/model catalog, memory, quota, proactive scheduling, offline mutation queue, and runtime profile loading.

Main files:

- `agent_gateway.js`
- `default_tools.js`
- `model_catalog_cache.js`
- `model_catalog_refresh.js`
- `model_catalog_registry.js`
- `offline_mutation_queue.js`
- `persistent_memory.js`
- `proactive_scheduler.js`
- `proactive_state_store.js`
- `profile_loader.js`
- `provider_client.js`
- `quota_tracker.js`
- `trace_store.js`

Reusable APIs:

- `AgentGateway`
- Tool status, policy, and risk constants.
- Model catalog cache and refresh contracts.
- Provider client and runtime profile loading.
- Trace store and persistent memory stores.
- Offline mutation queue.

Should be extended by:

- Product-neutral AI/MCP contracts and deterministic AI execution policies.

Should not be duplicated by:

- eVe product AI tools. eVe tools should integrate through explicit tool or gateway contracts.

Known risks:

- `agent_gateway.js` is above the hard threshold and must be reduced before feature growth.

Status: Verified.

### Squirrel Communication Domains

Path: `atome/src/squirrel/{mail,contacts,calendar,bank}/`

Owner: Atome open layer.

Purpose: Product-neutral service/bootstrap/contracts for communication and account-adjacent domains.

Main files:

- `mail/bootstrap.js`, `mail/service.js`, `mail/connector_contract.js`, `mail/icloud_connector.js`, `mail/icloud_connector_normalization.js`, `mail/node_protocol_clients.js`
- `contacts/bootstrap.js`, `contacts/service.js`, `contacts/service_contact_utils.js`, `contacts/connector_contract.js`, `contacts/icloud_connector.js`, `contacts/local_source.js`, `contacts/macos_source.js`
- `calendar/bootstrap.js`, `calendar/service.js`, `calendar/calendar_api_source.js`, `calendar/node_protocol_clients.js`
- `bank/bootstrap.js`, `bank/service.js`, `bank/connector_contract.js`, `bank/local_index.js`

Reusable APIs:

- Bootstrap installers for runtime registration.
- Service contracts and connector contracts.
- Local, iCloud, macOS, and protocol client adapters.
- iCloud mail connector normalization for config, mailbox names, read payloads, and connector records.

Should be extended by:

- Open domain contracts and service logic.

Should not be duplicated by:

- eVe UI panels, tools, or voice routing. Product code should route through these services.

Status: Verified.

### Squirrel Components

Path: `atome/src/squirrel/components/`

Owner: Atome open layer.

Purpose: Generic Squirrel component builders and product-neutral component contracts.

Main files:

- `button_builder.js`
- `editor_builder.js`
- `input_builder.js`
- `matrix_builder.js`
- `menu_builder.js`
- `slider_builder.js`
- `tool_slider_builder.js`
- `table_builder.js`
- `table_visual_contract.js`

Reusable APIs:

- Component builders for common Squirrel UI structures.
- `table_builder.js` owns table runtime creation and interactions; `table_visual_contract.js` owns the product-neutral table templates and style variants.
- Canonical Squirrel system control builders now include Button, Slider, ToolSlider, Input, and Console via the spark bootstrap registry.

Should be extended by:

- Product-neutral component builders.

Should not be duplicated by:

- eVe product UI components when the generic builder or tool-slider runtime can be reused.

Known risks:

- Some builder implementations may still use DOM patterns that need later WebGPU/Squirrel policy review.

Status: Verified for placement, To verify for rendering policy compliance.

### Squirrel Voice Runtime

Path: `atome/src/squirrel/voice/`

Owner: Atome open layer for semantic contracts and voice orchestration.

Purpose: Voice service, semantic request contracts, AI planner, orchestrator, STT normalization, tool routing, session runtime, identity resolution, working memory, telemetry, and runtime bridges.

Main files:

- `semantic_contract.js`
- `service.js`
- `orchestrator.js`
- `tool_router.js`
- `ai_planner.js`
- `ai_planner_runtime_context.js`
- `main_handle_bridge.js`
- `session_runtime.js`
- `stt_normalizer.js`
- `working_memory.js`
- `home_surface.js`
- `panel.js`

Reusable APIs:

- Structured mail, contacts, calendar, and Atome semantic requests.
- Structured result contracts.
- Voice orchestration and tool routing.
- STT normalization and VAD helpers.

Should be extended by:

- Open semantic and voice contracts.

Should not contain:

- Closed eVe product panels. `eve/voice/aVa_panel.js` owns the moved closed Dilas panel.

Known risks:

- `home_surface.js` and `tool_router.js` need line-count review before feature growth.
- UI-related voice modules need targeted ownership verification during API and architecture map work.

Status: Verified.

## eVe Areas

### eVe Product Bootstrap

Path: `eve/`

Owner: eVe closed layer.

Purpose: Product entrypoint, closed bootstrap, concepts, defaults, and versioning.

Main files:

- `eve/eVe.js`
- `eve/README.md`
- `eve/version.txt`
- `eve/default/shortcuts.js`
- `eve/default_data/default_project.js`

Should be extended by:

- Product composition and closed bootstrapping.

Should not be duplicated by:

- Atome open framework bootstrap.

Status: Verified.

### eVe Core Runtime And Stores

Path: `eve/core/`

Owner: eVe closed layer.

Purpose: Product event commits, timelines, media engine, and project security. Persistence is owned by the local-first servers (Axum/AiS) and Fastify through the commit boundary — no client-side store layer (atome_concepts.md §7.5, §21.1).

Main files:

- `atome_commit.js`
- `atome_commit_gesture_trace.js`
- `atome_events.js`
- `atome_timeline.js` owns timeline event replay, preview, undo/redo, and backend apply. It remains an oversized legacy module after the DOM-baseline removal; the active reduction plan is to split pure replay snapshot construction, DOM preview projection, backend apply, and transport controls into cohesive modules before adding new timeline feature scope.
- `event_bus.js`
- `project_security.js`
- `media_engine/*`

Reusable APIs:

- eVe commit and event runtime.
- `atome_commit.js` reuses the canonical Squirrel runtime detector from `atome/src/squirrel/apis/unified/adole_api/runtime.js`; localhost port 3000 is Tauri/Axum for backend selection, preventing startup `state_current` refreshes from falling through to Fastify HTTP.
- `atome_commit.js` owns Fastify bearer invalidation for commit and `state_current` requests: a 401 with a bearer token clears the stored cloud token and stops repeated invalid-signature retries.
- `atome_commit.js` caches Fastify `state_current` 404 results as bounded missing ids, returning canonical `null` without repeated absent-id GETs during UI refresh loops.
- `eVe/core/atome_events/text_creation_session.js` owns the synchronous provisional text-edit surface used during background text creation; it must keep focus behavior and pointer-origin geometry aligned with the canonical text Atome creation path.
- `eVe/core/atome_events/text_fit_runtime.js` owns automatic text host sizing for editable text Atomes; empty point-origin text starts from the described one-pixel origin instead of deriving geometry from DOM projection padding.
- Local gesture trace recording for commit diagnostics is owned by `atome_commit_gesture_trace.js`; `atome_commit.js` may call it but must not own trace-store internals.
- `scripts/check_mutation_ownership_guardrails.mjs` owns the persistent mutation ownership guardrail for source scans: `state_current` remains read/projection-only outside server route owners, event commit transport calls stay inside `eVe/core/atome_commit.js`, Adole adapter ownership, or server route definitions, timeline replay baselines must not be rebuilt from DOM projection state, and timeline preview/replay code must not combine DOM projection reads with backend commits.
- `scripts/check_squirrel_dom_adapter_guardrails.mjs` owns the Squirrel Atome DOM adapter containment scan: legacy `this.element` remains a renderer adapter only and must not receive `properties`, `state`, `model`, `timeline`, media source/ref/url, waveform, thumbnail, group state, sync, permission, or serialized dataset payloads as canonical state.
- `scripts/check_dom_projection_guardrails.mjs` owns maintained DOM projection scans and audit reporting. The default scan targets `tests/fixtures/dom`, emits measurable DOM size/node/tag/data/style/id/root/media metrics plus repeated `data-atome-id` projection contexts, inline style ratio/property summaries, data URI/base64/preview-signature counters, source-attribute leak checks, and canvas role distribution, and enforces forbidden model-shaped `data-*` state, durable media error attributes, duplicate ids, subtree document-root rejection for `.dom` exports, nested document roots in full documents, local source leaks, oversized attributes, repeated Atome projection model-data duplication, named canvas renderer surfaces, node-count thresholds, inline-style thresholds, and canvas/video thresholds.
- `scripts/export_dom_subtrees.mjs` owns offline extraction from full DOM captures into maintained subtree fixtures. Matrix, project, and timeline exports select one canonical root per file; media-host exports deduplicate by `data-atome-id`; full-app captures are written as `.snapshot` diagnostics under `temp/` and are not treated as maintained `.dom` fixtures.
- `tests/probes/tool_genesis_create_atome_order.test.mjs` guards the `toolBase.createAtome` orchestration boundary: commit must precede state refresh, render must follow canonical state refresh, `render:false` must stay available, and `createAtome` must not allocate DOM or write render caches directly.
- `database/adole.js` owns server-side event-to-projection application. `appendEvent` and `appendEvents` must sanitize event patches before writing both `particles` and `state_current.properties`; envelope fields belong in `atomes`, event metadata, or projection columns, not in durable properties.
- `database/adole.js` exposes `restoreStateSnapshot` as the controlled state snapshot restore path: snapshot records are normalized into `set` events and replayed through `appendEvents`; legacy `restoreSnapshot` remains migration debt.
- Shared Atome property sanitization for eVe commit and project Atome creation boundaries.
- Event, media, and project store APIs with memory adapters.
- Platform-specific storage backends.
- Molecule engine, command catalog, API, native audio, and WebGPU renderer.
- Molecule media image mounting owns alpha-preserving WebGPU canvas projection for raster images. SVG sources must remain on the vector shape renderer path and must not be rasterized by the Molecule image canvas.

Should be extended by:

- Closed product persistence and media engine workflows.

Should not be duplicated by:

- New product stores outside `eve/core/*_store/`.

Known risks:

- Molecule engine files include large cohesive runtimes and must be reduced when touched.
- Store adapters need API map coverage before new storage features.

Status: Verified.

### eVe Domains

Path: `eve/domains/`

Owner: eVe closed layer.

Purpose: Product-specific domain logic for Atome genesis, media, user profile, and MTraX/Molecule workflows.

Main areas:

- `eve/domains/atome/`
- `eve/domains/media/`
- `eve/domains/mtrax/`
- `eve/domains/user/`

Reusable APIs:

- Media API facades, persistence service, diagnostics, media source and identifier helpers.
- Media source and identifier helpers own canonical `/api/uploads` and `/api/recordings` route resolution for product media playback paths, including timestamped recording filenames before renderer handoff and Tauri-local canonicalization away from loopback Fastify media URLs.
- SVG uploads are editable Atome `shape` objects: `eVe/domains/media/asset_box.js` must keep SVG shape uploads out of MTraX import grouping, and `eVe/intuition/runtime/tool_genesis.js` must not convert SVG shape specs into `group/mtrax_media`.
- `eVe/domains/media/media_diagnostics.js` validates renderer-owned media projections by reading canonical media state plus lightweight host visibility/renderer summaries. Static image/SVG/video/audio imports can pass diagnostics through visible project projection evidence when minimal DOM hosts intentionally do not expose native media tags.
- `eVe/domains/media/shared/media_projection_state.js` owns disposable host-side media projection source, identifier, and runtime error state. Renderers may use it to bind playback resources and transient mount failures to DOM hosts, but must not serialize media URLs, recording identifiers, local paths, user-scoped media query state, or durable `data-media-api-error` values into `data-*` attributes.
- `eVe/domains/media/shared/media_atom_integrity.js` owns the closed product media Atome integrity contract for persisted project media: stable source, duration for audio/video, visual refs, and pending visual status before commit/render.
- Fixture-driven media restoration coverage for this contract lives in `tests/eve/media_fixture_restore_contract.test.mjs`; browser playback probes remain higher-level acceptance coverage and must not be the only guard for persisted media Atome integrity.
- DOM teardown reconstruction coverage lives in `tests/eve/project_dom_teardown_reconstruction.test.mjs`; it verifies grouped timeline/step state and media visual refs are restored from canonical properties, not from stale `data-*` payloads.
- MTraX panel close is the canonical runtime cleanup boundary: pending audio/media work is awaited with bounded close tasks, transient clip/runtime state is cleared after dormant metadata is preserved, and expensive timeline verification/prewarm/preview export work must not run synchronously for `panel_close`.
- Browser video recording owns a single persisted project atome: the `video_recording_*` atome created during recording persistence is reused and rendered on the project surface after stop. Reusing that recording atome still requires a canonical `set` commit with the active project id so `state_current`, project listing, refresh, and WebGPU scene reconstruction all agree. `ensureProjectMediaAtome` remains for media paths that do not already return a recording atome, such as native/file-only captures and image capture.
- `eVe/domains/media/shared/media_video_poster_runtime.js` owns reusable video frame poster capture for project-visible video media and molecule previews; it uses `eVe/domains/media/shared/video_decode_pool_runtime.js` before seek/play/readback and rejects transparent WebKit readbacks instead of persisting blank posters. `video_decode_pool_runtime.js` also owns shared frame-presentation waiting and non-fatal WebKit `play()` rejection handling, so poster capture and Bevy texture readback cannot drift. Normal video atomes and group previews must consume it instead of duplicating video seek/canvas capture logic.
- `eVe/intuition/shared/capture_video_poster_runtime.js` owns live capture-tool poster extraction from the active preview overlay, persistence of poster fields, and DOM mounting for recorded video atomes; `capture.js` may only wire this shared runtime into UI stop paths.
- Recorded video atome creation must carry the recording owner into `resolveMediaUrl` and persist owner/media-user particles so the first load uses the user-scoped recordings route.
- Atome double-click to MTraX timeline resolution must merge persisted state owner metadata before normalizing recording sources, including older atomes whose properties lack owner fields.
- Atome-triggered Molecule opening is intentionally routed through `requestMtrackOpenForAtome` and the `atome_mtrack_open_request` source layer. Double-click is only the current UI trigger; Molecule open handling must stay movable to another event/context by preserving the source-layer request contract.
- Project-visible media Atomes on the cleaned canvas route may not have visible Atome DOM hosts. Molecule opening and media diagnostics must resolve those Atomes from canonical state and `project_scene_runtime` records, then build timeline payloads without requiring `[data-atome-id]` hosts.
- `eVe/domains/media/selected_project_media_playback_runtime.js` owns selected active-project media transport for the cleaned canvas route. It resolves selected media records from `project_scene_runtime`, sends audio and extracted video-audio through the existing `Squirrel.av.audio`/Kira facade, preserves runtime-only Audio Atome pause/resume position across play-tool toggles through Kira voice start offsets, and projects live video frames back through disposable project-scene record updates for Bevy/WebGPU without creating visible per-Atome media DOM hosts or a second media engine.
- Audio/video recording persistence uses `record_capture_runtime.js` -> `add_clip_runtime.js` -> media Atome creation with the current project id. Suppressing source Atome creation for stopped recordings is invalid because the project-visible source Atome is the canonical object shown on the current project.
- Video preview renderers and preview panel services.
- `eVe/intuition/shared/group_video_poster_runtime.js` owns conversion of project-visible video molecule previews into persisted image posters, so imported or recorded video molecules do not render live black video placeholders in the project grid.
- MTraX transport, clips, tracks, timeline, media, preview, project, automation, SVG, text, and recording runtime modules.
- `eVe/domains/mtrax/timeline/ruler_canvas_runtime.js` owns canvas-backed ruler tick rendering and visible tick-window calculation. `ruler_render_runtime.js` keeps interactive loop and marker zones in DOM, but repeated tick marks and labels should render through the canvas surface when available.
- MTraX local file drops create linked video/audio clip pairs through `eVe/domains/mtrax/clips/add_clip_runtime.js` and `linked_video_audio_drop_runtime.js`; the audio side must keep the existing `video_audio` descriptor path so server/native extraction and conversion remain centralized.
- MTraX preview frame dispatch owns visual track priority: during playback and transport scrub, video/image clips are resolved by top visible track order; paused editing may temporarily promote selected clips for manipulation, while audio clips remain outside visual priority filtering.
- MTraX molecule poster capture is split between `preview_poster_capture_runtime.js` for media/source selection and `preview_poster_canvas_runtime.js` for canvas drawing, image-detail validation, and poster encoding; project-visible molecule posters must reject flat empty preview surfaces before persisting.
- MTraX clip preview metadata owns source-window rendering for audio waveforms and video thumbnails, so split/crop edits must preserve the source `in`/`out` interval visually instead of resampling the full media source. Preview render payloads are registered through `eVe/domains/mtrax/preview/preview_registry_runtime.js`; timeline DOM hosts may expose only short `data-preview-id` references, never `data-preview-signature`, waveform arrays, thumbnail data URLs, or serialized preview payloads. Hidden media elements used for MTraX duration probing must remain detached runtime resources, while Molecule raster-pool videos must mount under the closed raster-pool shadow root so upload URLs and `media_user_id` query state do not enter the product DOM.
- MTraX clip split/join editing is split by responsibility: `split_join_runtime.js` owns split execution and selected-target filtering, while `join_runtime.js` owns join segment construction and replacement. Split targets are explicit clip inputs, selected clips at the playhead, or clips on selected tracks at the playhead; linked audio/video companions are never auto-added by split.
- MTraX clip deletion is split by responsibility: `deletion_runtime.js` owns selected clip/track deletion and source cleanup, while `loop_cell_deletion_runtime.js` owns loop-cell range deletion and intra-cell split preservation. Interactive clip deletion uses the same selected clip/track scope model as split and must not auto-expand through linked audio/video metadata or `sync_group_id`.
- MTraX clip selection API ownership lives in `selection_context_runtime.js`: selection reads expose runtime clip ids, selection/persistence ids, and per-clip descriptors; selection writes resolve incoming clip identifiers through the existing clip target resolver before mutating `selectedClipIds`.
- MTraX clip crop preview masking lives in `eVe/domains/mtrax/clips/crop_preview_mask_runtime.js`; crop gestures use it for live visual feedback while the final preview metadata redraw remains owned by `preview_metadata_runtime.js`.
- MTraX karaoke detail is split by responsibility: `karaoke/detail_runtime.js` owns detail state and mutation application, while `karaoke/detail_record_schedule_state.js` owns selection-only record-schedule detail projection.
- User profile API.

Should be extended by:

- Product-specific media and MTraX features.

Should not be duplicated by:

- Intuition tools when a domain runtime already owns the behavior.
- Atome open APIs unless the behavior is product-neutral and explicitly promoted.

Known risks:

- `eve/domains/media/asset_box.js` is critically oversized and must be split before feature growth.
- MTraX still has legacy aliases and naming (`mtrack`, `mtrax`, `hmtracks`) pending Molecule stabilization and rename phase.

Status: Verified.

### eVe Intuition UI

Path: `eve/intuition/`

Owner: eVe closed layer.

Purpose: Product UI shell, tools, panels, matrix, menu, ribbon, flower menu, projection, runtime, contracts, and shared closed UI helpers.

Main areas:

- `eve/intuition/eVeIntuition.js`
- `eve/intuition/bootstrap.js`
- `eve/intuition/panel_definitions.js`
- `eve/intuition/contracts/`
- `eve/intuition/runtime/`
- `eve/intuition/tools/`
- `eve/intuition/panels/`
- `eve/intuition/menu/`
- `eve/intuition/matrix/`
- `eve/intuition/flower/`
- `eve/intuition/ribbon/`
- `eve/intuition/shared/`

Reusable APIs:

- Command bus and tool gateway.
- Tool registry and interaction runtime.
- `PANEL_SURFACE_DEFINITIONS` as the single source of truth for panel ids, module keys, open/close function names, TTL policy, and pointer-toggle behavior.
- `buildPanelRuntimeConfigByToolId()` derives tool-runtime panel config from `PANEL_SURFACE_DEFINITIONS`; do not add a second panel config table in tool runtime code.
- `panelCreatorV2` owns panel lifecycle registration, lazy loading, attach-to-layer, open/close, destroy policy, and panel bounds mode.
- `eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js` owns eVeIntuition panel surface registration, window-function payload normalization, surface id lookup, and PanelCreatorV2 open/close bridging.
- `eVe/intuition/runtime/eve_intuition/tool_latched_state_runtime.js` owns eVeIntuition tool latched-state cache, menu sync, surface-state/dialog-close listeners, and panel tool-state event emission.
- `eVe/intuition/runtime/eve_intuition/debug_runtime.js` owns the eVeIntuition `window.__DEBUG__` diagnostic facade, deterministic test-mode style injection, footer/selection/timeline debug readers, and project persistence diagnostics.
- Panel API, panel layout policy, layer contract, layer ownership, selection, latched state.
- Layer contract owns the global stack order and its distinct HTML layer nodes: project tools, floating project palettes, Molecules, component/docked palettes, panels/dialogs, main ribbon, active drag.
- `project_drop.js` owns project-layer native file drop routing, including document-level drops that resolve back to a `project_view_*` surface before entering the product media import path, plus project tool shortcut drag intent routing back to the main ribbon trash target for canonical soft-delete handling.
- Project-drop diagnostic logging was removed after the project import path was validated. `eVe/intuition/tools/project_drop.js` now keeps the creator/drop path without the temporary debug ring buffer or console emission module.
- `tool_runtime.js` owns protected system-tool contract reconciliation before gateway execution, including `ui.creator` recovery when persisted registry state has a stale execution mode.
- Shared media types, DOM utilities, SVG runtime, color values, group state, slider content, slider DOM/data-role selectors, shared slider direct-drag control, and tool drag.
- IntuitionX projection tool DOM is created by `eVe/intuition/projection/button.js` and projected through `eVe/intuition/projection/tool_strip.js`; static projection visuals live in `eVe/elements/eVe_look.js`, while `eVe/intuition/core/dom.js` prevents projection surface color/shadow constants from being rewritten inline.
- `eVe/intuition/ribbon/menu.js` creates the main ribbon tool roots and must attach the shared `.eve-intuitionx-projection-tool` visual class so those buttons use the projection reset instead of browser-native borders.
- `eVe/intuition/shared/group_state_runtime.js` owns disposable host-side group projection state for group steps, timelines, and previews. Group renderers may keep cloned runtime values on host object properties, but must not serialize group timelines, steps, members, media sources, or previews into `data-*` attributes as canonical state.
- `eVe/intuition/shared/tool_children_projection_state.js` owns disposable host-side palette child projection state for Intuition tool buttons and tool-instance hosts. Tool renderers may use it to bind palette expansion behavior to DOM hosts, but must not serialize palette child lists into `data-tool-children` or `data-source-tool-children`.
- `eVe/intuition/shared/dom_utils.js` owns reusable DOM style helpers, including `toPx`, `applyStyleObject`, `toKebabCase`, and `buildCssRule`; feature tools must consume these helpers instead of cloning CSS serialization logic.
- `eVe/intuition/shared/dom_utils.js` also owns reusable CSS declaration/rule serialization through `serializeCssDeclarations()` and `serializeCssRule()`; generated style modules such as toolbox visual CSS must consume those helpers instead of local serializers.
- Finder tool drops create `tool_instance` projection hosts through `project_drop.js` and `tool_instances.js`; they must not create persisted `shape` atomes or `tool_shortcut` DOM hosts.
- `eVe/intuition/tools/map.js` owns the Finder `place` scope Leaflet integration: container lifecycle, Nominatim search dispatch, map marker focus, responsive Leaflet size invalidation, and passive in-app attribution handling. Do not edit vendored Leaflet files or move map behavior into `finder.js`.
- `eVe/intuition/tools/visual/atome_editor_runtime_style.js` owns Atome editor footer/fullscreen generated runtime style rules; `eVeIntuition.js` may install the style node but must not own the rule construction.
- `eVe/intuition/tools/clipboard/` owns shared copy/paste clipboard state, Atome record normalization for clipboard payloads, system clipboard writes, and paste event generation. `copy.js` and `paste.js` remain product tool entrypoints and panel/action registration surfaces.
- `eVe/intuition/flower/menu.js` owns flower menu DOM orchestration; `menu_layout.js` owns radial geometry, `menu_items.js` owns item/icon normalization, `context_target.js` owns context target resolution including lazy project-canvas Atome hit testing, `context_selection.js` owns active-selection and mixed-kind menu strategy, and `context_pointer_lock.js` owns flower pointer locks.
- `eVe/intuition/matrix/ui/view.js` owns Matrix root/project-view/tile DOM orchestration; `eVe/intuition/matrix/ui/matrix_layout.js` owns Matrix viewport fitting, toolbar-aware row/column sizing, scroll positioning, and layout observers.
- `eVe/intuition/matrix/core/project_dom_state.js` stores Matrix/project DOM projection metadata outside attributes and is consumed by Matrix runtime, project bootstrap, user project surfaces, and project drop/tool projection paths.
- `eVe/intuition/matrix/ui/matrix_virtual_slots.js` owns Matrix logical slot virtualization: it maps projects to collision-free logical slots and keeps repeated empty slots out of the DOM, leaving only project tiles and the first actionable empty creation tile.
- `eVe/intuition/ribbon/disconnected_handle_logo.js` owns the shared disconnected Atome handle pulse style used by the initial main handle and the login validation control.
- `eVe/intuition/tools/user_login_sequence.js` owns the unauthenticated initial login collection UI. `eVe/intuition/tools/user.js` opens this full-screen sequence instead of showing the legacy compact auth dialog, while `executeLoginFlow` calls the atomic `AdoleAPI.auth.bootstrap` contract so existing-phone attempts verify the password and unknown-phone attempts create through the backend-owned protocol. `eVe/intuition/eVeIntuition.js` opens the home panel once the initial auth gate reports an unauthenticated user, so first display lands directly on the phone request instead of the disconnected main handle.
- Tool definition SSOT and tool instances.

Should be extended by:

- Closed product tools, panels, and interaction flows.

Should not be duplicated by:

- New unmanaged UI systems.
- Direct DOM product tools when an Intuition runtime API already exists.

Known risks:

- Several UI/tool runtime files exceed size thresholds and require reduction when touched.
- `eVe/intuition/runtime/tool_genesis.js` remains a critical legacy owner for project group visual mounting. New group-preview behavior must be extracted into shared modules and only wired there until group visual rendering is split out; the intended reduction path is to move group host preview rendering, project-layer refresh, and persisted-preview mounting into focused Intuition group visual runtime modules. Group placeholder creation must use the existing `ensureGroupPlaceholderLayer` helper instead of feature-local DOM duplication.
- `eVe/intuition/runtime/tool_genesis.js` owns the public `toolBase.createAtome` orchestration boundary: raw specs are converted into internal create commands, committed through `window.Atome.commit`, refreshed from `state_current` when available, and only then projected through `renderAtomeRecord`. `createAtome(..., { render: false })` must remain canonical-only and must not emit a DOM projection event.
- `eVe/intuition/runtime/mtrack_debug_snapshot.js` owns MTraX panel debug snapshot DOM cloning. `eVe/intuition/eVeIntuition.js` may request snapshots, but must not own the snapshot DOM construction.
- Direct DOM helpers exist in this layer; compliance with the WebGPU/Squirrel rendering policy needs targeted review before broad UI rewrites.
- Slider styling still relies on toolbox/editor compatibility classes in visual token modules, even though behavioral readers now target the canonical slider data-role contract.

Status: Verified.

### eVe Design System And i18n

Path: `eVe/elements/`, `eVe/i18n/`

Owner: eVe closed layer.

Purpose: Product design tokens, panel chrome, dialog runtime, presets, i18n bindings, messages, and system UI tokens.

Main files:

- `eVe/elements/design.js`
- `eVe/elements/eVe_look.js`
- `eVe/elements/design/panel_chrome.js`
- `eVe/elements/design/panel_chrome_tokens.js`
- `eVe/elements/design/dialog_runtime.js`
- `eVe/elements/design/dialog_drag_runtime.js`
- `eVe/elements/design/dialog_geometry_runtime.js`
- `eVe/elements/design/dialog_reveal_runtime.js`
- `eVe/elements/design/dialog_viewport_runtime.js`
- `eVe/elements/system_ui_tokens.js`
- `eVe/i18n/i18n.js`
- `eVe/i18n/languages.js`

Reusable APIs:

- `eveT`, `eveTList`, locale helpers.
- Panel chrome contracts without injected scroll overflow arrow indicators.
- Dialog bounds/fullscreen runtime, including viewport resize reflow while fullscreen is active. Fullscreen dialogs use exact container edges and stop at the main toolbar top; no margin-based viewport constraint helper owns this geometry.
- Shared footer title placement belongs to `eVe/elements/design/panel_chrome.js`: titles stay centered in the footer across resize/fullscreen changes, while the invisible bottom-right resize grip remains interactive.
- Fullscreen double-click is limited to explicit panel chrome handles so tool/body double-clicks stay context-owned.
- Preset and token APIs.

Should be extended by:

- Product-visible text through i18n keys only.
- Product design tokens and panel chrome behavior.

Should not be duplicated by:

- Hardcoded visible labels in tools or panels.
- New local styling systems outside the existing design token structure.

Known risks:

- `design.js`, `eVe_look.js`, and `languages.js` are critically oversized and must be reduced when touched.

Status: Verified.

### eVe Voice Product UI

Path: `eve/voice/`

Owner: eVe closed layer.

Purpose: Closed product voice UI modules moved out of Atome.

Main files:

- `eve/voice/aVa_panel.js`

Should be extended by:

- Closed eVe voice panels and product-facing voice UI.

Should not be duplicated by:

- Atome open voice contracts.

Status: Verified.

### eVe Documentation

Path: `eve/documentations/`

Owner: eVe closed layer.

Purpose: Product documentation, persistence contracts, security/sharing notes, realtime sync architecture, runtime AI/MCP entrypoints, and product manual validation checklists.

Main files:

- `runtime_ai_mcp_entrypoints.md`
- `atome_persistence_contract.md`
- `realtime_sync_architecture.md`
- `Security_and_sharing.md`
- `tools.md`
- `tools_cahier_des_charges.md`
- `eve_structure_audit.md`

Reusable logic exposed: No runtime logic. Use as source material only after validating against code.

Should not be duplicated by:

- Cross-layer framework maps under `maps/`.

Status: Verified.

## Server And Platform Areas

### Fastify Server

Path: `server/`

Owner: Open server infrastructure unless product-specific ownership is later narrowed.

Purpose: Fastify server, authentication, realtime state, routes, mail routes, notifications, sharing, file storage, sync watcher, shell, and WebSocket send/state APIs.

Main files:

- `server/server.js`
- `server/auth.js`
- `server/atomeRoutes.orm.js`
- `server/atomeCrudRoutes.js`
- `server/atomeEventRoutes.js`
- `server/atomeRouteContract.js`
- `server/atomeSyncRuntime.js`
- `server/atomeRealtime.js`
- `server/sharingAtomeAccessors.js`
- `server/sharingPermissionService.js`
- `server/wsApiState.js`
- `server/wsSend.js`
- `server/ws_api_schema.js`
- `server/sharing.js`
- `server/notificationStack.js`
- `server/fileStorage.js`
- `server/mailRoutes.js`
- `server/userFiles.js`
- `server/userHome.js`

Should be extended by:

- Server-side source-of-truth behavior, websocket communication, auth, sharing, sync, and file APIs.
- Atome route changes through the split route owners: orchestration and event commit helpers in `server/atomeRoutes.orm.js`, CRUD route handlers in `server/atomeCrudRoutes.js`, event/state/snapshot routes in `server/atomeEventRoutes.js`, route-boundary formatting in `server/atomeRouteContract.js`, and sync side effects in `server/atomeSyncRuntime.js`.
- Sharing changes through the split sharing owners: message orchestration in `server/sharing.js`, ACL primitives in `server/sharingPermissionService.js`, and canonical Atome field accessors in `server/sharingAtomeAccessors.js`.

Should not be duplicated by:

- Browser-side REST/polling fallbacks or parallel communication systems.

Status: Verified for file ownership, To verify for open/closed boundary and API map.

### Native And Platform Runtimes

Path: `platforms/`

Owner: Cross-platform runtime layer.

Purpose: Tauri desktop, iOS/AUv3, web audio WASM, and AtomeOS platform assets.

Main areas:

- `platforms/desktop-tauri/`
- `platforms/ios/atome-auv3/`
- `platforms/web/audio-wasm/`
- `platforms/web/bevy-renderer/`
- `platforms/atomeOS/`

Verified desktop Bevy renderer owner:

- `platforms/desktop-tauri/Cargo.toml` declares optional Bevy dependency `0.18.1` behind `bevy_backend` and explicit renderer feature groups `bevy_renderer_core` and `bevy_renderer_native`. Renderer features enable Bevy WebGPU/window/render/sprite/camera crates without enabling `bevy_audio`, so Kira remains the single Atome audio engine.
- `atome/renderers/bevy-core/` owns the open Atome Bevy renderer core shared by browser/WASM and native/Tauri wrappers. It contains the Atome render scene/types, ECS components, spawn/render-op projection, texture handling, render math, and selection overlay drawing.
- `platforms/desktop-tauri/src/bevy_backend/mod.rs` owns the native Atome-to-Bevy backend surface. With `bevy_backend` it re-exports the shared Atome Bevy core and native power contracts; with `bevy_renderer_core` it also exposes the embedded native Bevy scene/ops entry point used by Tauri IPC. It must not become canonical Atome state, a DOM path, a canvas-per-Atome path, or a parallel scene model.
- `platforms/desktop-tauri/src/bevy_backend/bridge.rs` owns the Tauri native Bevy command bridge. It accepts already-normalized disposable Bevy projection scenes and render ops from the eVe rendering runtime, starts an embedded `bevy_renderer_core` Bevy App with the shared Atome Bevy core, runs the Startup scene schedule without installing Bevy `WindowPlugin` or a nested winit/render loop from IPC, applies later render ops in native Rust, rejects ECS-only `bevy_backend` startup as non-presentable, and returns `presentable:false` diagnostics until a real native presenter is wired to the project surface.
- `platforms/desktop-tauri/permissions/bevy-native-renderer.toml` owns the Tauri capability permission set for `bevy_native_start`, `bevy_native_apply_ops`, and `bevy_native_resize`; `platforms/desktop-tauri/capabilities/default.json` must include this set for the main webview so native Bevy startup cannot fail at the IPC authorization layer.
- `platforms/desktop-tauri/src/bevy_backend/power.rs` owns the native Bevy power-policy contract. It defines `ATOME_POWER_PROFILE=eco|balanced|performance`, defaults to low-power idle behavior, keeps continuous/game mode opt-in, tracks explicit redraw requests, rejects idle transform writes without a dirty cause, and converts Atome power policy into real Bevy `WinitSettings`, `UpdateMode`, and `PresentMode` when renderer features are enabled.
- `platforms/desktop-tauri/src/bevy_backend/renderer.rs` owns both Bevy App construction modes. `build_atome_bevy_embedded_app(...)` is the Tauri IPC-safe scene/ops engine and does not install Bevy window/render plugins; `build_atome_bevy_app(...)` and `run_atome_bevy_native(...)` remain gated behind `bevy_renderer_native` for standalone Bevy/winit presentation. Both modes install `atome_bevy_renderer_core::AtomeBevyRendererPlugin` instead of duplicating projection, spawn, or selection rendering.
- `platforms/ios/bevy-renderer/` owns the iOS C ABI staticlib wrapper around the shared Atome Bevy renderer core. Xcode builds it for iPhoneOS/iPhoneSimulator targets before Swift links, exposes `atome_ios_bevy_renderer_status(...)` and `atome_ios_bevy_scene_probe(...)`, and lets Swift report `linked_no_presenter` after Rust validates the native scene while the real native Metal/Bevy presenter is still being connected to the iOS project surface. The paired `platforms/ios/build_bevy_renderer.sh` build owner compiles this Rust staticlib with aborting panics, stripped debuginfo, and no forced unwind tables so the app and AUv3 Xcode targets do not overflow ld compact-unwind encoding with Bevy/Rust `__eh_frame` data.
- `platforms/web/bevy-renderer/` owns the browser/WASM Bevy WebGPU renderer surface. It consumes an explicit `AtomeRenderScene` JSON/wasm-bindgen input, binds Bevy to a caller-owned canvas selector, and exports `run_atome_bevy_renderer(...)`, `request_atome_bevy_redraw()`, plus explicit diff/resource/surface update exports without implementing a DOM renderer, canvas-per-Atome path, or fallback renderer. Supported browser projections now include Bevy sprite shapes, visible pending media sprites, and Bevy RGBA texture sprites for text/raster images/SVG/video frames/audio waveforms.
- Browser/WASM Bevy rendering stays in the web-owned crate rather than the desktop Tauri crate, because the desktop crate owns Axum/Tauri/native dependencies that do not compile for `wasm32-unknown-unknown`.
- `eVe/domains/rendering/bevy_native_renderer_runtime.js` owns the eVe-side native Bevy dispatch path. Browser mode uses `bevy_web_renderer_runtime.js`; Tauri WebView project surfaces use the visible Bevy/WebGPU canvas unless the host explicitly declares `window.__ATOME_NATIVE_BEVY_PRESENTABLE__ === true`. iOS/AUv3 project surfaces always select the native Bevy bridge when `window.__ATOME_IOS_NATIVE_INVOKE` is available, while the WebView remains the application shell and host surface. The native path maps Virtual Scene nodes directly into source/text/peak payloads and must not call the browser RGBA media texture resolver before Swift/Rust receives the scene.
- `platforms/ios/atome-auv3/Common/AppNativeBevyRendererController.swift` owns the current iOS native Bevy command boundary. It calls the Rust staticlib status and scene-probe ABI so Xcode logs prove the shared Bevy core is compiled and linked, returns `ios_bevy_native_not_presentable` with `renderer_mode=linked_no_presenter` while the Rust/Metal presenter is absent, and keeps `presentable=0` diagnostics visible in Xcode. iOS must not silently use the browser/WASM main-canvas renderer.
- `setup.sh` and `scripts/setup/bootstrap.sh` own clean-clone setup for Rust/Cargo metadata resolution. They verify the Rust toolchain and resolve Cargo metadata without installing any global Bevy binary.

Verified iOS/AUv3 native owners:

- `platforms/ios/atome-auv3/Common/FileSyncCoordinator.swift` owns file sync scheduling, safe-mode gating, tombstone state, move/deletion tracking, and the core newest-wins sync pass.
- `platforms/ios/atome-auv3/Common/FileSyncCoordinatorFileOperations.swift` owns visible/App Group/iCloud root discovery, syncable file inventory, file copy/delete helpers, and cleanup of leaked or duplicated sync artifacts.
- `platforms/ios/atome-auv3/Common/MIDIController.swift` owns MIDI client lifecycle, input monitoring, source discovery, notifications, and parsed input logging.
- `platforms/ios/atome-auv3/Common/MIDIOutputSender.swift` owns JS-to-MIDI packet output to host destinations.
- `platforms/ios/atome-auv3/auv3/AUv3Recorder.swift` owns AUv3 recording session state, source start/stop, mic engine lifecycle, render buffer capture, and browser event emission.
- `platforms/ios/atome-auv3/auv3/AUv3RecorderAnalysis.swift` owns recorded WAV metadata analysis for peak and first-peak frame reporting after capture stops.

Verified desktop audio native owners:

- `platforms/desktop-tauri/src/audio_engine/recorder.rs` owns desktop recorder session state, CPAL input stream setup, capture callbacks, ring buffer production, and public recorder controls.
- `platforms/desktop-tauri/src/audio_engine/recorder_wav.rs` owns desktop recorder WAV output format selection, CPAL buffer-size hints, sample conversion, file creation, and writer-thread draining/finalization.

Should be extended by:

- Platform-specific native runtime boundaries, not product UI.

Should not be duplicated by:

- Browser-side filesystem or audio shortcuts that bypass the native boundary.

Known risks:

- AV phase has explicit pending work around Rust bridge extraction, CPAL callback disk writes, callback allocations, Swift debug paths, and legacy recorder FFI.

Status: Verified.

### Scripts And Tooling

Path: `scripts/`, `scripts_utils/`, `tools/`

Owner: Development and validation tooling.

Purpose: Build scripts, setup workflows, syntax/fallback guardrails, Tauri boundary checks, Molecule guardrails, Fastify runner, static server, publishing scripts, and live smoke/probe suites.

Main files:

- `scripts/check_no_fallbacks.mjs`
- `scripts/check_tauri_fs_boundary.mjs`
- `scripts/check_molecule_guardrails.mjs`
- `scripts/check_eve_ai_guardrails.mjs`
- `scripts/check_dom_projection_guardrails.mjs`
- `scripts/export_dom_subtrees.mjs`
- `scripts/setup/bootstrap.sh`
- `scripts/static_file_server.mjs`
- `scripts/run_fastify.sh`
- `scripts/rollup.config.cdn.js`
- `scripts/rollup.config.npm.js`

Should be extended by:

- Persistent validation and build tooling.

Should not contain:

- Temporary probes. Use `temp/` for disposable diagnostics.

Status: Verified.

## Reuse Rules By Task Type

### New API

Start with:

- `atome/src/squirrel/apis/` for open framework APIs.
- `atome/src/squirrel/atome/mcp.js` for MCP-facing Atome surfaces.
- `eve/domains/*/api/` for closed product domain APIs.
- `eve/intuition/runtime/` for closed UI/tool runtime APIs.

Do not create:

- Parallel API facades without checking existing domain API modules.
- Hidden effectful paths bypassing command bus, policy, capability validation, audit, idempotency, or history.

Status: Initial rule, to be refined by `maps/API_MAP.md`.

### New Tool Or Panel

Start with:

- `eve/intuition/tools/core/tool_definition_ssot.js`
- `eve/intuition/tools/core/tool_registry.js`
- `eve/intuition/tools/core/tool_runtime.js`
- `eve/intuition/runtime/tool_gateway.js`
- `eve/intuition/runtime/panel_api.js`
- `eve/elements/design/panel_chrome.js`

Do not create:

- Unregistered tools.
- New panel chrome systems.
- User-visible strings outside `eve/i18n/`.

Status: Verified.

### New Media Or MTraX Feature

Start with:

- `eve/domains/media/api/`
- `eve/domains/media/shared/`
- `eve/domains/mtrax/`
- `eve/core/media_engine/`
- `atome/src/application/audio_runtime/` when the feature touches open audio contracts.

Do not create:

- Duplicate preview, media source, timeline, track, transport, or playback layers.
- New native audio boundaries without checking Kira and PlayRecord contracts.

Status: Verified.

### New Voice / AI / MCP Feature

Start with:

- `atome/src/squirrel/ai/`
- `atome/src/squirrel/voice/`
- `atome/src/squirrel/atome/mcp.js`
- `eve/documentations/runtime_ai_mcp_entrypoints.md` as source material, then verify in code.
- `eve/voice/` only for closed product UI.

Do not create:

- Direct runtime mutation from AI.
- Voice actions outside semantic request/tool routing.
- MCP shortcuts with hidden side effects.

Status: Verified.

### New Communication / Mail / Contacts / Calendar Feature

Start with:

- `atome/src/squirrel/mail/`
- `atome/src/squirrel/contacts/`
- `atome/src/squirrel/calendar/`
- `server/mailRoutes.js` and WebSocket server modules when server behavior is involved.

Do not create:

- Product-level duplicate mail/contact/calendar state models before checking these services.
- HTTP polling or REST fallback transport paths.

Status: Verified.

### New Security Or Sharing Feature

Start with:

- `atome/security/`
- `atome/src/squirrel/security/`
- `server/auth.js`
- `server/sharing.js`
- `eve/core/project_security.js`
- `eve/documentations/Security_and_sharing.md` as source material, then verify in code.

Do not create:

- Silent permission bypasses.
- Token storage outside the existing security/token surfaces without explicit architecture review.

Status: Verified.

## Duplication And Cleanup Risks

Recent rendering and persistence fixes:

- `eVe/domains/media/api/media_persistence_service.js`: recording Atome reuse must commit the active `project_id` before rendering; reusing an existing `video_recording_*` / `audio_recording_*` without this association leaves project reload and list results inconsistent.
- `atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js`: `state_current.meta.project_id` is part of the client projection contract and must survive reload into both top-level `project_id` and `meta.project_id`.
- `eVe/domains/rendering/project_scene_runtime.js`: Bevy projection must skip stale media records that have no renderable source; old source-less `audio_recording_*` records must not abort WebGPU scene startup.
- `eVe/domains/rendering/bevy_web_renderer_runtime.js`: initial Bevy startup and later spawn diffs record unrecoverable media texture decode failures as skipped nodes instead of rejecting the whole scene or diff batch; valid nodes must still start. Uncached video and audio-waveform nodes remain present as Bevy entities and receive textures later through one-at-a-time resource updates; video frame failures and blank transparent/black readbacks are retried with bounded backoff before being marked skipped, so Safari/WKWebView frame timing cannot make Atomes disappear or leave a refresh-time video permanently transparent after one early miss.
- `platforms/web/bevy-renderer/src/lib.rs`: layer depth is clamped for Bevy sprites so timestamp-like z-index values remain inside the camera range while preserving the canonical `AtomeLayer`.
- Durable media cache reuse is owned by the existing projection path, not by a new renderer cache layer: `render_atom.js` exposes persisted video poster data URLs and waveform peaks, `bevy_media_texture_resolver.js` consumes persisted video posters before decoding a source video frame, and `project_audio_waveform_renderer.js` consumes persisted waveform peaks before requesting metadata or decoding audio. Full RGBA/GPU textures remain disposable derived renderer resources.

High priority risks:

- Oversized files: `eve/domains/media/asset_box.js`, `eve/elements/design.js`, `eve/elements/eVe_look.js`, `eve/i18n/languages.js`, `atome/src/squirrel/ai/agent_gateway.js`, `atome/src/application/jeezs/index.js`, `atome/src/application/audio_runtime/play_record_core.js`.
- Legacy naming overlap: `mtrack`, `mtrax`, `hmtracks`, and `Molecule` remain mixed pending the Molecule rename phase.
- Product bootstrap references still exist in Atome bootstrap paths and need architecture-map treatment.
- Direct DOM helper modules exist in eVe Intuition and need targeted policy review before UI expansion.
- Server ownership is likely open infrastructure, but exact product/open boundary needs explicit architecture-map verification.

General risks:

- Avoid adding logic to vendored/minified assets under `atome/src/js/`.
- Avoid creating new temporary scripts outside `temp/`.
- Avoid creating new maps under `docs/`; use `maps/`.

## Areas Marked To Verify

- Exact API stability and public/semi-public/internal classification. To be mapped in `maps/API_MAP.md`.
- Exact high-level runtime flow and command/history/source-of-truth rules. To be mapped in `maps/ARCHITECTURE_MAP.md`.
- Server open/closed ownership details.
- Rendering policy compliance across existing DOM-centric UI helpers.
- Product bootstrap references from Atome into eVe.
- Which legacy MTraX/Molecule aliases are public boundary aliases and which are internal debt.

## Search Keywords

Atome:

- `squirrel`, `adole`, `mcp`, `agent_gateway`, `semantic_contract`, `voice`, `provider_client`, `play_record`, `kira`, `serverVerification`, `syncQueue`, `token_vault`.

eVe:

- `intuition`, `tool_registry`, `tool_gateway`, `panel_api`, `panel_chrome`, `molecule`, `mtrax`, `hmtracks`, `eveT`, `layer_contract`.

Server/platform:

- `Fastify`, `websocket`, `sharing`, `auth`, `wsSend`, `Tauri`, `Axum`, `AUv3`, `WebGPU`, `Kira`, `Symphonia`.
