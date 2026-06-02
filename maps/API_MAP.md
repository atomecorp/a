# Atome / eVe API Map

Status: Initial API map after the Atome open / eVe closed boundary validation.

Purpose:

- Identify verified API families, ownership, and stable entry points.
- Make the Atome open / eVe closed boundary explicit before new implementation work.
- Provide an orientation map. The exhaustive public, semi-public, and internal API list is a separate execution task.

Mandatory Use:

- Before adding or changing an API, consult this file and `maps/CODEMAP.md`.
- Verify the referenced source module directly before relying on a method or route.
- Update this map when ownership, exposure, route shape, or boundary status changes.
- Do not promote an eVe closed API into Atome without an explicit open contract.

## Mandatory Pre-Implementation Gate

No API, route, runtime global, MCP capability, tool exposure, store contract, persistence path, service facade, or exported method may be added or changed until the relevant maps have been consulted:

- Use `maps/CODEMAP.md` first to locate the owning source area and verify that no reusable implementation already exists.
- Use this file to classify the surface as public open, semi-public closed, internal, or `Status: To verify`.
- Use `maps/DESIGN_MAP.md` when the API affects product UI, visual factories, panel behavior, tool visuals, generated styling, or design tokens.
- Use `maps/ARCHITECTURE_MAP.md` when the API affects dependency direction, command/history flow, effectful operations, lifecycle, sync, security, or cross-layer access.

Implementation may proceed only after the API owner, visibility, boundary status, effect model, and required map updates are known.

## Boundary Rules

Atome open APIs live under `atome/`, `server/`, and `database/` when they are product-neutral. They own core Squirrel APIs, authenticated storage, Atome object/event/state contracts, product-neutral communication services, security, AI/MCP, voice, audio, sync, server routes, and database adapters.

eVe closed APIs live under `eVe/`. They own product UI, private tools, product stores, Molecule/MTraX workflows, media editing runtimes, panels, branding, and product composition.

Atome must not contain eVe UI, private product workflows, or product-only tool composition. eVe must not duplicate generic Atome security, server, sync, or cross-platform contracts.

## Explicit Open / Closed API Contract

API classification is mandatory before an API is reused, exposed, moved, or extended:

- Public open APIs are product-neutral Atome, server, or database contracts intended for framework use, AI/MCP access, durable state mutation, synchronization, or platform runtime behavior.
- Semi-public closed APIs are eVe product runtime contracts that may be reused inside eVe and by approved Atome AI/MCP boundary calls only through capability checks, runtime registration, or explicit injection.
- Internal APIs are implementation details of their owning layer and must not be imported across the Atome/eVe boundary.
- `Status: To verify` means the source exists but its boundary stability is not established; new work must inspect the source module before depending on it.

Cross-boundary API rules:

- Atome may call eVe capabilities only through registered runtime tools, injected callbacks, or documented boundary modules.
- eVe may call Atome APIs directly when the Atome API is product-neutral and documented here.
- eVe product stores, panels, tools, Molecule/MTraX runtimes, and design factories must not become implicit Atome APIs because they are exported or attached to `window`.
- Product-named server routes are open infrastructure only after route ownership, security, naming, and replay semantics are reviewed; until then they remain boundary debt.
- Promotion from eVe closed to Atome open requires an explicit contract, deterministic mutation path, MCP compatibility when relevant, tests, and updates to `maps/CODEMAP.md`, this file, and `maps/ARCHITECTURE_MAP.md`.

## Verified API Families

### Squirrel Utility API

Ownership: Atome open.

Primary sources: `atome/src/squirrel/apis.js`, `atome/src/squirrel/apis/essentials.js`, `atome/src/squirrel/apis/utils.js`, `atome/src/squirrel/apis/loader.js`, `atome/src/squirrel/apis/dragdrop.js`, `atome/src/squirrel/apis/loadServerConfig.js`, `atome/src/squirrel/apis/loadServerConfigDebug.js`, `atome/src/squirrel/apis/loadServerConfigDefaults.js`, `atome/src/squirrel/apis/loadServerConfigWs.js`.

Exposure: JavaScript module exports and default `Apis` object.

Verified entry points: `wait`, `current_platform`, `dataFetcher`, `render_svg`, `fetch_and_render_svg`, `resize`, `strokeColor`, `fillColor`, `sanitizeSVG`, `DragDrop.createDropZone`, `DragDrop.collectFilesFromDataTransfer`, `DragDrop.summarizeFiles`, `loadServerConfigOnce`, `getServerConfigSync`.

Boundary status: Open framework helpers. Keep product-neutral.

### Squirrel Bootstrap and Component Registry API

Ownership: Atome open.

Primary sources: `atome/src/squirrel/spark.js`, `atome/src/squirrel/components/button_builder.js`, `atome/src/squirrel/components/slider_builder.js`, `atome/src/squirrel/components/tool_slider_builder.js`, `atome/src/squirrel/components/input_builder.js`, `atome/src/squirrel/components/console_builder.js`, `atome/src/squirrel/components/table_builder.js`, `atome/src/squirrel/components/table_visual_contract.js`.

Exposure: runtime bootstrap through the Squirrel component registry installed by `spark.js`.

Verified responsibilities:

- Load and register canonical Squirrel system controls.
- Expose the canonical registry to runtime consumers through the Squirrel bootstrap globals.
- Provide the current canonical Atome-owned control set for Button, Slider, ToolSlider, Input, and Console.
- Provide the generic Table builder and table visual contract for product-neutral tabular UI.

Boundary status: Open framework component contract. eVe wrappers may compose these controls but should not redefine their core system-control contract in parallel.

### Adole Browser API

Ownership: Atome open.

Primary sources: `atome/src/squirrel/apis/unified/adole_apis.js`, `atome/src/squirrel/apis/unified/adole.js`, `atome/src/squirrel/apis/unified/adole_api/`.

Exposure: `AdoleAPI` module export and browser/global use where bootstrap installs it.

Verified namespaces: `auth`, `projects`, `activities`, `atomes`, `sharing`, `sync`, `machine`, `security`.

Boundary status: Open application/data API. eVe tools may consume it, but must not replace its auth, project, object, or sync semantics with product-local fallbacks.

Known constraints: `atome/src/squirrel/apis/unified/adole.js` is a large legacy surface and requires targeted verification before mutation.

Atome mutation rule: `AdoleAPI.atomes.create` and `AdoleAPI.atomes.alter` are public compatibility method names, but their framework implementation must emit canonical event commits through `adapter.atome.commit`. Direct adapter-level `atome.create` / `atome.alter` calls are legacy WebSocket protocol adapters only and must not be used as durable framework write paths.

Atome browser projection owner: `atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js` owns browser-side normalization of Atome API records and state-current results into canonical `{ id, type, kind, renderer, meta, traits, properties }` records at network/runtime boundaries. Historical transport aliases may be read only at that boundary and must not be re-emitted as a public Atome format.

### Server HTTP and WebSocket APIs

Ownership: Atome open server layer.

Primary sources: `server/server.js`, `server/auth.js`, `server/atomeRoutes.orm.js`, `server/atomeCrudRoutes.js`, `server/atomeEventRoutes.js`, `server/atomeRouteContract.js`, `server/atomeSyncRuntime.js`, `server/mailRoutes.js`, `server/sharing.js`, `server/userFiles.js`, `server/visio.js`, `server/wsApiState.js`, `server/wsSend.js`, `server/serverIdentity.js`.

Verified route families:

- Health and diagnostics: `/health`, `/healthz`, `/__whoami`, `/dev/state`, `/dev/client-log`, `/client-log`, `/dev/snapshot`.
- Authentication and identity: `/api/auth/*`, `/api/server/identity`, `/api/server/verify`, `/api/server/status`.
- Atome object and state: `/api/atome/*`, `/api/events`, `/api/events/commit`, `/api/events/commit-batch`, `/api/state_current`, `/api/snapshots`.
- Uploads and protected files: `/api/uploads`, `/api/uploads/chunk`, `/api/uploads/complete`, `/api/uploads/:file`, `/api/files/*`, `/api/recordings/:file`, `/api/extract-audio/:file`.
- Mail gateway: `/api/eve/mail/sync`, `/api/eve/mail/send`, `/api/eve/mail/mark-read`, `/api/eve/mail/archive`, `/api/eve/mail/delete`.
- Admin/database/visio: `/api/admin/users/export`, `/api/admin/users/import`, `/api/db/status`, `/api/db/stats`, `server/visio.js` routes, `/ws/visio`.
- WebSocket APIs: `/ws/api`, `/ws/sync`.

Boundary status: Open server infrastructure. Route names containing `eve` currently exist for product mail integration and must be reviewed before being treated as stable open API names.

Atome route ownership: `server/atomeRoutes.orm.js` owns route orchestration, authentication, and event commit helpers; CRUD HTTP routes are owned by `server/atomeCrudRoutes.js`; event/state/snapshot routes are owned by `server/atomeEventRoutes.js`; boundary formatting lives in `server/atomeRouteContract.js`; WebSocket sync side effects live in `server/atomeSyncRuntime.js`.

Sharing API ownership: `server/sharing.js` owns WebSocket message orchestration and route registration, `server/sharingPermissionService.js` owns permission creation/revocation/check/list APIs, and `server/sharingAtomeAccessors.js` owns canonical Atome field reads used by sharing code.

Known constraints: `server/server.js`, `server/auth.js`, and `server/sharing.js` are oversized legacy files. Do not expand them without reduction ownership.

### Database and Object Persistence API

Ownership: Atome open data layer.

Primary sources: `database/adole.js`, `database/adole_permissions.js`, `database/adole_schema_migrations.js`, `database/driver.js`, `database/index.js`.

Exposure: JavaScript module exports for database adapters and object persistence helpers.

Verified entry points:

- Driver lifecycle: `connect`, `getDatabase`, `getDriverType`, `isSqlite`, `isLibsql`, `closeDatabase`.
- Serialization: `serializeJson`, `deserializeJson`.
- Object aliases: `createObject`, `getObject`, `getObjectById`, `getObjectsByOwner`, `getObjectChildren`, `updateObject`, `deleteObject`.
- Property aliases: `setProperty`, `setProperties`, `getProperty`, `getProperties`, `deleteProperty`, `getPropertyHistory`, `restorePropertyVersion`.
- Data source access: `getDataSourceAdapter`.
- Deferred reference repair: `resolvePendingOwners` resolves pending owner and parent references in `atomes` and keeps the corresponding `state_current` projection metadata coherent.
- Schema migration owner: `database/adole_schema_migrations.js` owns additive ADOLE schema migrations invoked during `initDatabase`.
- Permission owner: `database/adole_permissions.js` owns ADOLE permission writes, condition evaluation, and permission flag checks consumed through `database/adole.js` exports.

Boundary status: Open persistence contract. eVe closed stores may use it through explicit adapters, not by duplicating persistence rules.

Known constraints: `database/adole.js` is a critical oversized legacy file and must be reduced before feature growth.

### Atome Contract Helper API

Ownership: Atome open shared layer.

Primary sources:

- `atome/src/shared/atome_contract.js`
- `atome/src/shared/atome_universal_contract.js`
- `atome/src/shared/atome_contract_errors.js`

Compatibility export: `atome/shared/atome_contract.js` re-exports the same contract for server and Node tests.

Exposure: JavaScript module exports consumed by the ADOLE client API, Fastify Atome routes, and database persistence.

Verified entry points: `normalizeCanonicalAtome`, `sanitizeAtomeEnvelope`, `sanitizeAtomeProperties`, `assertCanonicalPropertyKey`, `resolveCanonicalProperties`, `formatCanonicalAtome`, `registerAtomeType`, `getAtomeType`, `listAtomeTypes`, `toolToUniversalAtome`, `AtomeContractError`.

Boundary rules:

- `normalizeCanonicalAtome` is the strict contract entry point. Transitional aliases such as `atome_id`, `atome_type`, `particles`, and `data` are accepted only when called with an explicit boundary-adapter option.
- `normalizeCanonicalAtome(..., { universal: true })` emits the enriched Atome envelope with `schema_version`, `capabilities`, `interfaces`, `composition`, `policy`, and `lifecycle`.
- `formatCanonicalAtome` remains a tolerant server/database response formatter and emits only the canonical envelope.
- No public `fromLegacy...` or `toLegacy...` adapter API is allowed. Historical input shapes may be normalized only at explicit boundaries; SQL serialization must be named as storage serialization, not as a legacy Atome format.
- Browser-served modules under `atome/src/` and `eVe/` must import `atome/src/shared/atome_contract.js`; `atome/shared/atome_contract.js` remains a Node/server compatibility export and must not be imported by browser-served modules.

Boundary status: Open framework contract helper. It owns reserved Atome envelope-field filtering and canonical envelope formatting so route, client, and database layers do not define competing schemas.

### ADOLE Storage Projection API

Ownership: Database storage boundary.

Primary source: `database/adole_storage_projection.js`.

Exposure: Internal JavaScript module consumed by `database/adole.js`.

Verified entry points: `projectStoredAtome`, `projectStoredStateCurrent`, `projectStoredEvent`.

Boundary rules:

- SQL column names such as `atome_id`, `atome_type`, `owner_id`, `parent_id`, and serialized `properties` are storage facts only.
- `getAtome`, `getStateCurrent`, and `listStateCurrent` must expose canonical Atome envelopes, not storage rows.
- This module is not a legacy adapter and must not expose public `fromLegacy...` or `toLegacy...` APIs.

### eVe Atome Commit Boundary

Ownership: eVe closed client mutation boundary over the open Atome event API.

Primary sources:

- `eVe/core/atome_commit.js`
- `eVe/core/atome_commit_gesture_trace.js`
- `atome/src/shared/atome_contract.js`

Exposure: `window.Atome.commit`, `window.Atome.commitBatch`, and the injected `__atomeCommitApi` test/runtime surface.

Boundary rules:

- Client mutations must enter through `commit` or `commitBatch`; direct durable Atome state mutation from tools, media helpers, Molecule, or MTraX runtimes is not a valid source of truth.
- `window.eveToolBase.createAtome` is a product runtime creation API over this commit boundary. Its return contract includes `id`/`atomeId`, `canonicalState`, nullable `view`, `committed`, and `rendered`; callers that need model-only creation must pass `{ render: false }`, which keeps DOM projection disabled after the canonical commit.
- `scripts/check_mutation_ownership_guardrails.mjs` is the guardrail entry point for this API boundary. It rejects direct client/runtime mutation of `state_current` and direct event-commit transport calls outside canonical commit/server owners.
- `scripts/check_squirrel_dom_adapter_guardrails.mjs` is the guardrail entry point for the legacy Squirrel Atome DOM adapter boundary. `this.element` may remain a projection handle, but model/business state must stay on Atome instance data or canonical persistence surfaces.
- Database event projection APIs: `database/adole.js` exposes `appendEvent`, `appendEvents`, `getStateCurrent`, `listStateCurrent`, and `restoreStateSnapshot`. Event projection must sanitize reserved Atome envelope keys before writing `state_current.properties`, keeping `state_current` coherent with `particles`; controlled state snapshot restore must replay through `appendEvents` instead of writing `state_current` or DOM state directly.

### eVe Atome DOM Projection Runtime

Ownership: eVe closed projection/runtime boundary.

Primary source: `eVe/core/atome_dom_id.js`.

Exposure: Browser-served JavaScript module exports consumed by eVe projection, interaction, selection, media, MTRAX, and diagnostic runtimes.

Verified entry points: `ATOME_DOM_PREFIX`, `toDomId`, `fromDomId`, `getAtomeElement`, `closestAtomeElement`, `getAtomeIdFromElement`, `getAtomeIdFromEventTarget`, `registerAtomeElement`, `updateAtomeRuntimeState`, `getAtomeRuntimeState`, `getAtomeKindFromElement`, `queryAtomeElements`, `escapeCssValue`.

Boundary rules:

- `toDomId` and `fromDomId` are the only canonical conversion points between Atome ids and final DOM host ids.
- `getAtomeElement` and nearest-host helpers are projection lookup helpers only; they must not make the DOM a source of truth.
- `registerAtomeElement` and `updateAtomeRuntimeState` store ephemeral projection/runtime metadata outside DOM attributes through the runtime registry/WeakMap contract.
- Matrix/project projection metadata is held by `eVe/intuition/matrix/core/project_dom_state.js` through `registerProjectElement`, `getProjectIdFromElement`, and `findProjectTileElement`; project runtime routing must not depend on `data-project-id`.
- Event routing must use the DOM id only to recover `atome_id`, then consult Atome/runtime/domain registries to decide behavior.
- This API must not be used to persist, replay, synchronize, serialize, or audit Atome facts.

Forbidden API pattern: adding new Atome `data-*` attributes or reading behavior decisions from Atome `data-*` attributes in final rendered Atome DOM. Legacy read-only fallbacks are temporary migration debt and must not become new contracts.
- `props`, `properties`, `patch`, and `delta` are normalized into `payload.props` before transport.
- `atome/src/shared/atome_contract.js` owns removal of reserved Atome envelope fields from durable property payloads; project Atome creation code and commit code must consume this shared contract rather than maintaining local sanitizer modules or parallel reserved-key lists.
- Reserved envelope fields such as `id`, `type`, `owner_id`, `project_id`, `parent_id`, timestamps, sync fields, selection fields, and media render aliases such as `media_type` or `visualType` must not be emitted as durable properties.
- Top-level event fields such as `atome_id`, `project_id`, `parent_id`, `actor`, transaction id, and gesture id remain event envelope fields.

Boundary status: Closed product adapter over an open Atome event contract. It mirrors the canonical server/database property boundary without importing `atome/shared/atome_contract.js` into browser-served eVe modules.

### eVe Unified Rendering Projection API

Ownership: eVe closed rendering projection boundary.

Primary sources: `eVe/domains/rendering/render_atom.js`, `eVe/domains/rendering/virtual_scene_contract.js`, `eVe/domains/rendering/bevy_projection_adapter.js`, `eVe/domains/rendering/bevy_media_texture_resolver.js`, `eVe/domains/rendering/bevy_web_renderer_runtime.js`, `eVe/domains/rendering/scene_graph.js`, `eVe/domains/rendering/surface_size_runtime.js`, `eVe/domains/rendering/surface_runtime.js`, `eVe/domains/rendering/webgpu_compositor.js`, `eVe/domains/rendering/project_scene_runtime.js`, `eVe/domains/rendering/project_scene_gesture_runtime.js`, `eVe/domains/rendering/matrix_preview_renderer.js`, `eVe/intuition/runtime/project_scene_render_bridge.js`, `eVe/intuition/runtime/atome_description_frame_runtime.js`, `eVe/intuition/runtime/media_integrity_runtime.js`, `eVe/intuition/runtime/shape_svg_runtime.js`, `eVe/intuition/runtime/group_visual_runtime.js`, `eVe/intuition/runtime/media_source_runtime.js`, `eVe/intuition/runtime/media_hydration_runtime.js`, `eVe/intuition/runtime/media_mount_runtime.js`, `eVe/intuition/runtime/atome_host_registry_runtime.js`, `eVe/intuition/runtime/project_atome_index_runtime.js`, `eVe/intuition/runtime/realtime_atome_events_runtime.js`, `eVe/intuition/runtime/persistence_diag_runtime.js`, `eVe/intuition/runtime/info_panel_sync_runtime.js`.

Exposure: JavaScript module exports consumed by eVe project, Matrix, media, text, export, and compositor runtimes.

Verified entry points: `normalizeRenderAtom`, `normalizeRenderAtoms`, `buildTextureCacheKey`, `buildTextCacheKey`, `buildWaveformCacheKey`, `normalizeAtomeRenderNode`, `createVirtualSceneTree`, `diffVirtualSceneTrees`, `VIRTUAL_SCENE_DIFF_TYPES`, `VIRTUAL_SCENE_DIRTY_FLAGS`, `mapVirtualSceneNodeToBevyPayload`, `mapVirtualSceneTreeToBevyPayload`, `mapVirtualSceneTransformToBevyPatch`, `mapVirtualSceneStyleToBevyPatch`, `mapVirtualSceneLayerToBevyPatch`, `parseBevyProjectionColor`, `createBrowserBevyMediaTextureResolver`, `startBevyWebRenderer`, `applyBevyWebRendererDiffs`, `applyBevyWebRendererSurfaceResize`, `readBevyWebRendererState`, `createRenderScene`, `hitTestRenderScene`, `createSurfaceEventRouter`, `resolveRenderSurfaceSize`, `renderSurfaceSizesMatch`, `ensureRenderSurface`, `readRenderSurfaceSize`, `updateRenderSurfaceScene`, `getRenderSurfaceState`, `ensureHiddenTextServiceRoot`, `mountActiveTextEditor`, `unmountActiveTextEditor`, `getTextServiceState`, `createUnifiedWebGPUCompositor`, `createMatrixPreviewRenderer`, `renderProjectScene`, `updateProjectSceneRecord`, `updateProjectSceneRecordByAtomeId`, `findProjectSceneByAtomeId`, `getProjectSceneState`, `hitTestProjectSceneAtClientPoint`, `collectProjectSceneAtomsInClientRect`, `beginProjectSceneTextEdit`, `commitProjectSceneTextEdit`, `cancelProjectSceneTextEdit`, `emitProjectSceneIntent`, `resizeProjectSceneRecord`, `clearProjectScene`, `clearAllProjectScenes`, `projectIdFromProjectLayer`, `isProjectSceneParent`, `renderProjectSceneRecord`, `rememberAtomeDescriptionFrame`, `resolveAtomeFrame`, `readAtomeFrameState`, `clearAtomeDescriptionFrames`, `createMediaHostIntegrityRuntime`, `rememberMediaIntegrityKindHint`, `readMediaIntegrityKindHint`, `forgetMediaIntegrityKindHint`, `isMediaIntegrityKind`, `isMediaTextualPatchKey`, `logMediaIntegrityEvent`, `createShapeSvgRuntime`, `isSvgShapeSpec`, `createGroupVisualRuntime`, `computeGroupSize`, `readGroupStepsFromProperties`, `createMediaSourceRuntime`, `isProtectedMediaUrl`, `isDirectRenderableMediaUrl`, `inferMediaSourceFromProperties`, `createMediaHydrationRuntime`, `createMediaMountRuntime`, `createAtomeHostRegistryRuntime`, `createProjectAtomeIndexRuntime`, `createRealtimeAtomeEventsRuntime`, `createPersistenceDiagRuntime`, `createInfoPanelSyncRuntime`.

Boundary rules:

- The API consumes canonical Atome records and returns disposable render projections only.
- `virtual_scene_contract.js` is the Phase 1 bridge contract for future Bevy integration. It may describe hierarchy, diffs, and dirty flags, but it must remain renderer-agnostic and must not own canonical Atome state or duplicate Bevy ECS responsibilities.
- `render_atom.js` normalizes media source projection through `eVe/domains/media/shared/media_source.js` before Virtual Scene and Bevy mapping, so upload and recording sources are explicit API routes instead of relative browser paths; it also projects persisted poster data and waveform peaks as disposable render inputs without making them renderer-owned state.
- `bevy_projection_adapter.js` is the strict one-way bridge from Virtual Scene data into browser Bevy payloads. Missing ids, kinds, positions, sizes, layers, required media sources, required textures, or invalid fill colors are explicit errors. Browser text, raster image, SVG, video-frame, and audio-waveform projection data use explicit RGBA texture payloads instead of a legacy project renderer; video-frame textures consume persisted poster data URLs before representative video seek/decode, audio-waveform textures may be generated from persisted peaks or from decoded source audio, and CSS layer values are clamped to the Rust `i32` boundary before wasm-bindgen deserialization.
- `bevy_web_renderer_runtime.js` starts the generated browser Bevy WASM renderer against the existing shared canvas, keeps one Bevy app per canvas, filters the known non-fatal WASM runner `unreachable` completion from page error reporting, keeps uncached video/audio nodes visible while texture generation completes, serializes deferred media texture generation so surface-size patches remain responsive, defers spawned video/audio textures instead of rejecting diffs when metadata is not immediately available, and applies Virtual Scene diffs plus surface-size patches through the generated Bevy WASM exports `apply_atome_bevy_spawn`, `apply_atome_bevy_despawn`, `apply_atome_bevy_transform`, `apply_atome_bevy_style`, `apply_atome_bevy_reparent`, `apply_atome_bevy_layer`, `apply_atome_bevy_visibility`, `apply_atome_bevy_text_metadata`, `apply_atome_bevy_resource`, and `apply_atome_bevy_surface`.
- Effectful project drag, resize, and text mutations enter as scene intents and must pass through `window.Atome.commit` or `window.Atome.commitBatch`; move frames use `gesture_frame` for realtime sharing, final drag/resize/text commits persist durable `set` state, and live drag/resize visual feedback may update disposable scene records before the durable final commit. `surface_runtime.js` converts client coordinates into render-surface logical coordinates before hit-testing so scaled canvases do not shift drag targets. `surface_pointer_runtime.js` computes resize target props with a uniform scale so active project resizes preserve aspect ratio for single Atomes and selected groups; resize hit-testing includes 5 logical px of extra inward tolerance on the right and bottom edge band without adding DOM handles. `project_scene_gesture_runtime.js` coalesces move-frame scene updates, WebGPU rerenders, and realtime `gesture_frame` commits to animation-frame cadence without becoming canonical state.
- Render surfaces are bounded by zone (`project`, `matrix`) and must not create one canvas per Atome. `readRenderSurfaceSize` exposes logical host dimensions, drawing-buffer dimensions, raw device-pixel dimensions, DPR, and optional texture clamp status separately; compositor targets must not confuse device-pixel buffer dimensions with scene coordinates.
- Project selection is transient runtime state read by `project_scene_runtime.js`, marked on disposable projection records, and sent through Bevy diffs on the same project canvas. It must not be serialized into Atome properties or projected as per-Atome DOM.
- Text DOM is limited to one hidden service root and one active editor. Project text editing is exposed through project-scene text APIs, not `.eve-atome-text` hosts.
- Project media diagnostics and Molecule open requests may resolve project-visible media through canonical Atome state plus `project_scene_runtime` records when the cleaned project route intentionally has no per-Atome DOM host.

Boundary status: Semi-public closed product API. It is not an Atome open framework contract until a product-neutral renderer contract is explicitly promoted.

### Native Bevy Backend Renderer API

Ownership: Tauri native platform renderer boundary.

Primary sources: `platforms/desktop-tauri/Cargo.toml`, `platforms/desktop-tauri/src/bevy_backend/mod.rs`, `platforms/web/bevy-renderer/src/lib.rs`.

Exposure: Rust library module exported when Cargo feature `bevy_backend` is enabled; renderer entry points are additionally exported by `bevy_renderer_core` and native runtime entry points by `bevy_renderer_native`. Browser exposure is the `squirrel-bevy-renderer` WASM module and its `run_atome_bevy_renderer(canvas_selector, width, height, initial_nodes)` export.

Verified entry points: `AtomeBevyNode`, `AtomeBevyLogicalSize`, `AtomeBevyLayer`, `AtomeBevyProjection`, `AtomeBevyMapping`, `atome_transform_for_node`, `atome_size_for_node`, `atome_layer_for_node`, `spawn_atome_node`, `AtomePowerProfile`, `AtomeRenderActivity`, `AtomeWinitSettings`, `AtomeUpdateMode`, `AtomePresentMode`, `AtomeRedrawRequest`, `AtomeFrameCounter`, `AtomeBevyPowerState`, `parse_atome_power_profile`, `atome_power_profile_from_env`, `atome_winit_settings_for_profile`, `atome_winit_settings_for_activity`, `atome_present_mode_for_profile`, `bevy_winit_settings_for_profile`, `bevy_present_mode_for_profile`, `apply_atome_power_activity`, `request_atome_redraw`, `should_write_transform`, `trace_is_idle_mutation`, `expected_updates_per_minute`, `AtomeBevyRendererConfig`, `AtomeBevyRendererPlugin`, `build_atome_bevy_app`, `run_atome_bevy_native`.

Boundary rules:

- The API consumes explicit projection data derived from canonical Atome records.
- It may map logical position to Bevy `Transform` and logical size/layer to native projection components.
- It may expose low-power Bevy policy values for `ATOME_POWER_PROFILE=eco|balanced|performance`; eco is the default, balanced mirrors desktop-app behavior, and performance/continuous behavior is opt-in.
- Renderer features may create a Bevy window/surface as the active native rendering surface. That surface must consume projection data from canonical Atome records and must not run alongside another renderer for the same Atomes.
- Bevy audio features remain disabled; Atome Kira remains the single audio engine and may be exposed later through an explicit resource/event bridge instead of a second playback engine.
- WASM/browser Bevy APIs live in `platforms/web/bevy-renderer/` rather than the desktop Tauri crate, because the desktop crate includes native server/runtime dependencies that are not valid for `wasm32-unknown-unknown`.
- Browser Bevy projection currently supports shape, text, raster image, SVG, video-frame, and audio waveform projection data. Browser text/media payloads may include explicit RGBA texture data; the WASM renderer turns that data into Bevy `Image` assets.
- Redraw requests must be explicit and transform writes must be gated by dirty interaction, animation, resize, or external state causes rather than idle timers.
- It must not own canonical Atome state, mutation ordering, persistence, replay, sync, or renderer selection.
- Browser/WASM bridging must consume `eVe/domains/rendering/virtual_scene_contract.js` projection data rather than duplicating a second virtual scene owner.

Boundary status: Internal feature-gated Rust renderer API.

### eVe Clipboard Tool APIs

Ownership: eVe closed product tools over the Atome commit boundary.

Primary sources: `eVe/intuition/tools/copy.js`, `eVe/intuition/tools/paste.js`, and `eVe/intuition/tools/clipboard/`.

Exposure: registered UI actions `ui.copy.action` and `ui.paste.action`, plus existing runtime globals `window.eve_copy_selection`, `window.eve_paste_selection`, and `window.eveClipboardStore`.

Verified responsibilities: clipboard group state, persisted clipboard Atome payloads, record normalization for copy/paste, optional system clipboard writes for user-owned Atomes, paste event generation, and paste panel selection/drag-drop integration.

Boundary rules:

- Durable clipboard persistence must use `window.Atome.commit`.
- Pasted Atome creation must use `window.Atome.commitBatch`.
- Clipboard payloads must keep project, parent, type, owner, selection, and media render aliases out of durable `props`.

Boundary status: Closed product tool API. It consumes the eVe Atome commit boundary and must not duplicate open server/database persistence contracts.

### eVe Project Media Import Runtime API

Ownership: eVe closed product runtime over the project drop and Atome commit boundaries.

Primary source: `eVe/intuition/runtime/project_media_import_runtime.js`.

Exposure: JavaScript module exports consumed by eVeIntuition flower-menu import and the capture import tool.

Verified entry points: `invokeProjectMediaImport`, `requestProjectImportFiles`, `resolveCurrentProjectImportTarget`, `buildProjectImportAnchorEvent`.

Boundary rules:

- File selection is UI intent collection only; durable media creation is delegated to `eVe/intuition/tools/project_drop.js` through `importFilesToProjectViaCreator`.
- The runtime may use the native iOS/AUv3 document picker, browser file picker, or hidden input picker only as file-selection surfaces.
- It must not persist Atome state, upload files, or render media directly.
- The delegated media creation path must preserve the selected project id through the canonical commit envelope and project scene records, not DOM parent inference.

Boundary status: Closed product runtime API. It centralizes project media import intent collection for eVe UI tools and preserves the canonical project drop creation path.

### Security and Sync APIs

Ownership: Atome open.

Primary sources: `atome/security/trusted_keys.js`, `atome/security/serverVerification.js`, `atome/security/serverVerificationCrypto.js`, `atome/security/serverVerificationState.js`, `atome/security/cloudSync.js`, `atome/security/syncQueue.js`, `atome/security/sync_queue_constants.js`, `atome/security/sync_queue_storage.js`, `atome/security/sync_queue_items.js`, `atome/security/sync_queue_credentials.js`, `atome/src/squirrel/security/bootstrap.js`, `atome/src/squirrel/security/token_vault.js`.

Verified responsibilities: trusted server metadata, fingerprint lookup, server verification, cloud sync status, sync queue behavior, token vault bootstrap, and token vault tests.

Boundary status: Open framework security. eVe may call these contracts but must not own product-specific bypasses.

### Communication Service APIs

Ownership: Atome open services with eVe closed UI consumers.

Primary sources: `atome/src/squirrel/mail/bootstrap.js`, `atome/src/squirrel/mail/service.js`, `atome/src/squirrel/mail/icloud_connector.js`, `atome/src/squirrel/mail/icloud_connector_normalization.js`, `atome/src/squirrel/contacts/bootstrap.js`, `atome/src/squirrel/contacts/service.js`, `atome/src/squirrel/contacts/service_contact_utils.js`, `atome/src/squirrel/calendar/bootstrap.js`, `atome/src/squirrel/calendar/service.js`, `atome/src/squirrel/bank/bootstrap.js`, `atome/src/squirrel/bank/service.js`.

Exposure: `createGlobalMailApi`, `bootstrapGlobalMail`, `createGlobalContactsApi`, `bootstrapGlobalContacts`, `createGlobalCalendarApi`, `bootstrapGlobalCalendar`, `createGlobalBankApi`, `bootstrapGlobalBank`, plus runtime globals installed on the provided environment.

Verified mail methods: `ingest`, `list`, `read`, `markRead`, `markUnread`, `search`, `nextUnread`, `summarize`, `replyDraft`, `composeDraft`, `getDraft`, `configureIcloudConnector`, `connectorStatus`, `archive`, `delete`, `send`, `syncApply`, `syncInitial`, `syncIncremental`, `syncPull`, `ensureReady`, `syncStatus`, `buildReadout`, `voiceReadout`.

Verified contacts methods: `registerSource`, `unregisterSource`, `sources`, `configureMacosSource`, `ensureMacosSource`, `importSource`, `importMacosContacts`, `configureIcloudConnector`, `importIcloudContacts`, `pushContactToIcloud`, `ensureReady`, `list`, `createLocalContact`, `updateLocalContact`, `deleteLocalContact`, `search`, `read`, `syncInitial`, `syncIncremental`, `syncPull`, `syncStatus`, `openPanel`, `closePanel`.

Verified calendar methods: `registerSource`, `unregisterSource`, `sources`, `sync`, `syncInitial`, `syncIncremental`, `syncPull`, `syncStatus`, `search`, `today`, `next`, `read`, `create`, `update`, `delete`, `openPanel`, `closePanel`.

Verified bank methods: `ingestAccounts`, `ingestTransactions`, `accounts`, `balance`, `transactions`, `summary`, `searchTransactions`, `findPayer`, `spendingByPeriod`, `topMerchants`, `recurringPayments`.

Boundary status: Open service contracts. eVe panels are closed consumers and should stay replaceable.

### AI and MCP APIs

Ownership: Atome open.

Primary sources: `atome/src/squirrel/ai/agent_gateway.js`, `atome/src/squirrel/ai/default_tools.js`, `atome/src/squirrel/ai/model_catalog_registry.js`, `atome/src/squirrel/ai/model_catalog_refresh.js`, `atome/src/squirrel/ai/provider_client.js`, `atome/src/squirrel/ai/trace_store.js`, `atome/src/squirrel/atome/mcp.js`, `atome/src/squirrel/atome/runtime_tool_resolution.js`.

Exposure: `AtomeAI` tool registration, MCP protocol runtime, model catalog, provider client, trace store, and default tools bridge to Adole, communication services, and eVe runtime tools.

Verified responsibilities: tool registry, audit log, proposals, idempotency, risk tiers, toolchain limits, output schemas, parameter validation, MCP events, operations, confirmations, proposals, rate limits, sandbox profiles, and security journal.

Boundary status: Open orchestration contract. Calls into eVe tool runtime must go through registered runtime capability boundaries.

### Voice APIs

Ownership: Atome open voice runtime.

Primary sources: `atome/src/squirrel/voice/bootstrap.js`, `atome/src/squirrel/voice/service.js`, `atome/src/squirrel/voice/orchestrator.js`, `atome/src/squirrel/voice/tool_router.js`, `atome/src/squirrel/voice/ai_planner.js`, `atome/src/squirrel/voice/ai_planner_runtime_context.js`, `atome/src/squirrel/voice/main_handle_bridge.js`, `atome/src/squirrel/voice/home_surface.js`.

Exposure: voice bootstrap modules, runtime services, tool router, communication surfaces, AI planner, main handle bridge, and home surface contract.

Boundary status: Open voice orchestration with closed eVe surfaces injected where product UI is required. Voice mutations must route through tool/runtime contracts, not direct state mutation.

### Audio and AV Runtime APIs

Ownership: Atome open.

Primary sources: `atome/src/application/audio_runtime/audio.facade.js`, `atome/src/application/audio_runtime/audio_playback_api.js`, `atome/src/application/audio_runtime/audio_recording_api.js`, `atome/src/application/audio_runtime/av_contracts.js`, `atome/src/application/audio_runtime/play_record_contract.js`, `atome/src/application/audio_runtime/play_record_core.js`, `atome/src/application/audio_runtime/play_record_media_source.js`, `atome/src/application/audio_runtime/runtime_audio_backend.js`, `atome/src/application/audio_runtime/auv3_host_playback.js`, `atome/src/application/audio_runtime/stt_api.js`.

Exposure: `Squirrel.av.audio`, `Squirrel.av.devices`, `Squirrel.av.codec`, `Squirrel.av.graph`.

Verified facade methods: `on`, `off`, `set_backend`, `get_backend`, `get_runtime`, `detect_and_set_backend`, `create_clip`, `destroy_clip`, `play`, `play_instance`, `stop`, `stop_instance`, `stop_clip`, `jump`, `set_param`, `map_midi`, `add_marker`, `remove_marker`, `set_marker_follow_actions`, `clear_marker_follow_actions`, `query_clip`, `createRecordingSession`, `prepareRecordingSession`, `armRecordingSession`, `startRecordingSession`, `stopRecordingSession`, `listAudioInputs`, `listAudioOutputs`, `selectAudioInput`, `selectAudioOutput`, `createAudioProfile`, `createAudioNode`.

Verified AUv3 host playback methods: `shouldUseAuv3HostPlayback`, `auv3PlayMedia`, `auv3StopMedia`, `auv3StopSlot`, `auv3ClearAuxSlots`, `auv3StopNode`.

Boundary status: Open media runtime contract. eVe media and MTraX code should consume this facade for product playback/recording instead of owning engine semantics.

Known constraints: `play_record_core.js` must stay focused on runtime orchestration; public contract constants and source canonicalization are owned by dedicated modules.

### eVe Tool Runtime APIs

Ownership: eVe closed.

Primary sources: `eVe/intuition/tools/core/tool_registry.js`, `eVe/intuition/tools/core/tool_runtime.js`, `eVe/intuition/tools/core/tool_instances.js`, `eVe/intuition/tools/core/tool_definition_ssot.js`, `eVe/intuition/tools/core/tool_interaction.js`, `eVe/intuition/tools/index.js`, `eVe/intuition/runtime/shared_project_override_runtime.js`, `eVe/intuition/runtime/implicit_gesture_commit_runtime.js`, `atome/src/squirrel/components/tool_slider_builder.js`, `eVe/intuition/shared/slider_tool_content.js`, `eVe/intuition/shared/slider_tool_dom.js`, `eVe/intuition/shared/slider_direct_drag.js`, `eVe/intuition/projection/button.js`, `eVe/intuition/tools/ui/tool_button_factory.js`.

Exposure: closed product runtime installed under `window.atome.tools`, plus tool registry/runtime module exports.

Verified responsibilities: tool definition registration/update, protected system-tool contract reconciliation, tool invocation, action routing, tool instance creation, persistence flows, Finder/tool projection helpers, latch, selection propagation, interaction routing, and consumption of the canonical Atome-owned product-tool slider runtime.

Verified shared slider runtime responsibilities:

- `atome/src/squirrel/components/tool_slider_builder.js` exports the canonical slider DOM/data-role selector contract, shared direct-drag controller, and expanding-square slider-tool runtime behavior.
- `eVe/intuition/shared/slider_tool_content.js` is the product wrapper that injects ribbon text tokens into the Atome-owned tool-slider runtime.
- `eVe/intuition/shared/slider_tool_dom.js` and `eVe/intuition/shared/slider_direct_drag.js` are compatibility re-export surfaces for existing eVe imports.

Verified shared project override entry points: `createSharedProjectOverrideRuntime`, `fetchSharedOverrideAtomes`, `setSharedProjectOverride`, `getSharedProjectOverride`, `removeSharedProjectOverride`, `listSharedOverrideIdsForProject`, `resetSharedOverrides`.

Verified implicit gesture commit entry points: `createImplicitGestureCommitRuntime`, `emitCommitBatch`, `resolveImplicitGestureDispatch`, `shouldSkipImplicitGesturePhase`.

Boundary status: Closed product API. Atome AI/MCP may invoke it only through explicit runtime tool resolution and capability checks.

Known constraints: `tool_runtime.js` is a critical oversized legacy file. Do not expand it without reduction ownership.

### eVe Store APIs

Ownership: eVe closed product persistence layer.

Primary sources: `eVe/core/event_store/`, `eVe/core/project_store/`, `eVe/core/media_store/`, `eVe/core/browser_store/`, `eVe/core/tauri_store/`, `eVe/core/ios_store/`.

Verified entry points: `createEventStore`, `createMemoryEventAdapter`, `createProjectStore`, `createMemoryProjectAdapter`, `createMediaStore`, `createMemoryMediaAdapter`, `buildMediaRef`, `validateProbe`, `validateRuntimeAssets`.

Boundary status: Closed product stores unless a product-neutral persistence contract is explicitly promoted into Atome.

### eVe Molecule and MTraX APIs

Ownership: eVe closed.

Primary sources: `eVe/core/media_engine/`, `eVe/intuition/tools/molecule/`, `eVe/domains/mtrax/api/`, `eVe/domains/mtrax/clips/`, `eVe/domains/mtrax/preview/`, `eVe/domains/mtrax/audio/`, `eVe/domains/mtrax/timeline/`, `eVe/domains/mtrax/karaoke/`.

Exposure: `window.Molecule`, `window.eveMediaApi`, `window.eveMtrackApi`, `window.open_mtrack_panel`, `window.close_mtrack_panel`, and JavaScript module exports for internal runtimes.

Atome-to-Molecule open requests are routed through a source-layered request path (`atome_mtrack_open_request`) rather than being semantically bound to the originating double-click event. The current UI trigger may still be double-click, but downstream MTraX/Molecule open handling must key on the request source layer so the trigger can be moved later without changing panel/runtime semantics.

Verified entry points:

- Molecule engine/API: `createMoleculeEngine`, `ensureMoleculeEngine`, `getMoleculeCommandCatalog`, `createMoleculeApi`, `ensureMoleculeApi`, `ensureMoleculeMediaRuntime`.
- Molecule tool modules: timeline schemas, reducers, session registry, persistence controller, media resolver, panel runtime, gestures, recording, nesting, and multi-instance controllers.
- MTraX window API: `createMtrackWindowApiRuntime`, `createWindowApiBridgeRuntime`, transport, recording, clip move/crop, track record source, misc, and record-state runtimes.
- MTraX ruler rendering helpers: `ruler_canvas_runtime.js` exposes internal major-step and visible tick-window helpers for canvas-backed ruler rendering. This is a rendering implementation boundary, not a public timeline API.
- DOM projection guardrails: `npm run check:dom-projection-guardrails` scans maintained DOM fixtures under `tests/fixtures/dom` by default; pass `--paths` to audit explicit legacy/debug captures.
- Media projection helpers: `eVe/domains/media/shared/media_projection_state.js` exposes internal host-local media source and identifier readers/writers for renderer binding. This is not a durable media API and must not replace Atome properties, media stores, or persistence services.
- Media Atome integrity helpers: `eVe/domains/media/shared/media_atom_integrity.js` exposes internal validation and normalization for project media Atomes before persistence/rendering. It enforces stable source, audio/video duration, visual refs, and pending visual status while preserving the separation between Atome `kind` and renderable `media_kind`.
- Preview registry helpers: `eVe/domains/mtrax/preview/preview_registry_runtime.js` exposes the internal derived-cache API used by clip preview renderers (`register`, `get`, `release`, `has`, `rebuildFromState`). The API returns opaque `preview_*` identifiers for DOM projection and must not be treated as canonical media state.
- Group projection state helpers: `eVe/intuition/shared/group_state_runtime.js` exposes host-local group steps, timeline, and preview readers/writers for renderers. These helpers are an internal projection boundary only; durable group data must still come from Atome properties and timeline persistence APIs.
- MTraX karaoke detail: `detail_runtime.js` owns detail state and mutation application; `detail_record_schedule_state.js` owns the selection-only record-schedule detail projection.
- MTraX dropped-video import: `addClipFromEntry` keeps the public drop entry point and delegates linked audio creation to the existing descriptor media resolver with `audio_source_role: video_audio`.
- Recording persistence and dropped/recorded clip imports must forward the active project id into media Atome creation when they create or reuse a source Atome, so audio/video recordings appear on the current project through the canonical commit/render path. Direct audio/video recording facades must also project the committed recording Atome through `project_media_atome_renderer.js`; pending source-less recording Atomes are not Bevy-projected until a renderable source exists. Browser and Tauri WAV recording store canonical waveform peaks on `audio_recording` Atome properties before Bevy texture generation; imported audio can derive waveform peaks by decoding its normalized source.

Transport contract: Molecule `play()` resumes from the current transport position when no explicit `startSeconds` value is supplied. MTraX `playTimeline()` starts from the current playhead and must not rewind at play start. Same-group timeline reloads triggered as part of play preserve the current playhead and must not issue an internal stop before play. `startSeconds: 0` remains an explicit Molecule rewind request, while user-visible `stop()` is the transport command that resets position to zero.

Boundary status: Closed product media workflow. Public promotion requires a deliberate Atome media contract and tests.

Known constraints: MTraX/Molecule naming remains transitional and is tracked in later execution tasks.

## Public, Semi-Public, and Internal API Inventory

Classification rules:

- Public: intended runtime, server, framework, MCP, or product-facing entry point. These APIs may be called across ownership boundaries when their boundary status allows it.
- Semi-public: exported or globally installed for a specific subsystem, integration, test harness, or product runtime. These APIs are reusable only inside the documented owner and must not be treated as stable framework contracts without promotion.
- Internal: helpers, adapters, implementation classes, test utilities, debug probes, generated diagnostics, or feature-local runtimes. These APIs must be used only through their owning public or semi-public facade.
- Status: To verify: visible surface exists, but stability, ownership, or intended callers require targeted review before use.

### Public APIs

#### Atome Squirrel Module API

Visibility: Public.

Evidence: module exports in `atome/src/squirrel/apis.js`.

Public entry points:

- `wait`
- `current_platform`
- `dataFetcher`
- `render_svg`
- `fetch_and_render_svg`
- `resize`
- `strokeColor`
- `fillColor`
- `sanitizeSVG`
- default `Apis` object containing the same entries.

Owner: Atome open.

Use before creating: product-neutral framework utility helpers.

Do not duplicate in: eVe product helpers or local tool utility modules.

#### Selection Runtime API

Visibility: Public runtime surface.

Evidence: `window.SelectionAPI` is created by `atome/src/squirrel/apis/essentials.js`; eVe reads it through `eVe/intuition/runtime/selection.js` and `eVe/intuition/runtime/selection_snapshot.js`.

Verified entry points: `select`, `clear`, `selected`, `last`, `isSelected`, and selectable object helpers installed by `enhanceSelectable`.

Owner: Atome open runtime surface with eVe closed consumers.

Use before creating: selection state readers or writers for UI/tool flows.

Status: To verify before mutation because selection is shared by product UI and runtime tools.

#### Public Adole Browser API Details

Visibility: Public runtime API.

Evidence: `AdoleAPI` module/global use in `atome/src/squirrel/apis/unified/adole_apis.js` and eVe consumers.

Public namespaces:

- `auth`
- `projects`
- `activities`
- `atomes`
- `sharing`
- `sync`
- `machine`
- `security`

Runtime rule: in Tauri, Adole `atomes` project-state reads must not issue secondary `/api/state_current` fetches to a loopback Fastify origin that differs from the page origin; local state remains authoritative and cloud/non-loopback Fastify reads remain explicit.

Owner: Atome open.

Use before creating: authenticated user, project, activity, atome, sharing, sync, machine, or security browser calls.

Do not duplicate in: eVe tool modules or product stores.

Status: Public, with route details and legacy breadth to verify before mutation.

#### Atome Commit and Current-State Runtime API

Visibility: Public runtime API.

Evidence: `eVe/core/atome_commit.js` attaches methods to `window.Atome` and `window.__atomeCommitApi`; `atome/src/shared/atome_contract.js` owns property payload sanitization.

Public entry points:

- `window.Atome.commit`
- `window.Atome.commitBatch`
- `window.Atome.snapshot`
- `window.Atome.getStateCurrent`
- `window.Atome.listStateCurrent`
- `window.Atome.listEvents`
- `window.Atome.eventBus`
- `window.__atomeCommitApi` mirrors the same commit/state/event methods for bootstrap access.

Owner: Canonical Atome mutation boundary installed from the eVe closed runtime bootstrap.

Use before creating: any durable Atome mutation, snapshot, current-state read, or event-list read from product runtime code.

Runtime rule: Tauri/local-Axum commit and current-state requests must not target cross-origin loopback Fastify for `/api/events/commit*` or `/api/state_current*`; the fetch boundary rewrites those protected routes to the local backend to avoid Safari CORS timing races.

Adole rule: detached WebSocket adapters expose `adapter.atome.commit` and `adapter.atome.commitBatch` for event writes. Profile, sharing, and Atome API synchronization code must use those event methods instead of direct `create` / `alter` adapter writes.

Do not duplicate in: UI components, panels, tools, import handlers, media runtimes, or product stores.

Status: Public runtime boundary; implementation ownership should be revisited during open/closed boundary cleanup because the installer currently lives under eVe.

#### Server HTTP and WebSocket API

Visibility: Public server API for runtime clients and infrastructure, except product-named route families marked to verify.

Evidence: Fastify route declarations in `server/server.js`, `server/auth.js`, `server/atomeRoutes.orm.js`, `server/mailRoutes.js`, and `server/visio.js`.

Public route families:

- Health and config: `GET /health`, `GET /healthz`, `GET /__whoami`, `GET /server_config.json`, `GET /api/server-info`.
- Authentication and account: `/api/auth/check-phone`, `/api/auth/users`, `/api/auth/register`, `/api/auth/sync-register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/update`, `/api/auth/request-otp`, `/api/auth/reset-password`, `/api/auth/change-password`, `/api/auth/request-phone-change`, `/api/auth/verify-phone-change`, `/api/auth/delete-account`, `/api/auth/refresh`.
- Server identity and verification: `/api/server/identity`, `/api/server/verify`, `/api/server/status`.
- Atome object routes: `/api/atome/create`, `/api/atome/list`, `/api/atome/:id`, `/api/atome/:id/alter`, `/api/atome/:id/history`, `/api/atome/:id/snapshot`.
- Event and projection routes: `/api/events/commit`, `/api/events/commit-batch`, `/api/events`, `/api/state_current/:id`, `/api/state_current`, `/api/snapshots`, `/api/snapshots/:id`.
- File and upload routes: `/api/uploads`, `/api/uploads/chunk`, `/api/uploads/complete`, `/api/uploads/:file`, `/api/files/my-files`, `/api/files/accessible`, `/api/files/share`, `/api/files/unshare`, `/api/files/visibility`, `/api/files/stats`, `/api/recordings/:file`, `/api/extract-audio/:file`.
- Admin and database routes: `/api/admin/users/export`, `/api/admin/users/import`, `/api/admin/apply-update`, `/api/admin/batch-update`, `/api/admin/sync-from-zip`, `/api/admin/sync-clients`, `/api/db/status`, `/api/db/stats`.
- WebSocket routes: `/ws/api`, `/ws/sync`, `/ws/visio`.
- Visio routes: `/contacts/request`, `/contacts/respond`, `/contacts`, `/rooms`, `/rooms/:room_id`, `/rooms/:room_id/invite`, `/rooms/:room_id/join`.

Owner: Atome open server infrastructure when product-neutral.

Status: Public server surface, but `/api/eve/mail/*` and route families with product naming remain `Status: To verify` before being declared stable open API names.

#### Database and Persistence API

Visibility: Public server/database module API.

Evidence: exports in `database/index.js`, `database/adole.js`, and `database/driver.js`.

Public entry points:

- Lifecycle and driver: `initDatabase`, `withTransaction`, `getDatabase`, `closeDatabase`, `connectDriver`, `getDriverDatabase`, `isDriverSqlite`, `isDriverLibsql`.
- Atome objects: `createAtome`, `getAtomeById`, `getAtome`, `getAtomesByOwner`, `getAtomesAccessibleToUser`, `getAtomeChildren`, `updateAtomeMetadata`, `updateAtome`, `deleteAtome`, `listAtomes`.
- Particles/properties: `setParticle`, `setParticles`, `getParticle`, `getParticles`, `deleteParticle`, `getParticleHistory`, `restoreParticleVersion`.
- History and projection: `appendEvent`, `appendEvents`, `listEvents`, `getEvent`, `getStateCurrent`, `listStateCurrent`, `createStateSnapshot`, `listStateSnapshots`, `getStateSnapshot`.
- Snapshots: `createSnapshot`, `getSnapshots`, `restoreSnapshot`.
- Permissions: `setPermission`, `canRead`, `canWrite`, `canDelete`, `canShare`, `canCreate`.
- Sync: `getSyncState`, `updateSyncState`, `enqueueSyncOperation`, `listSyncQueue`, `markSyncQueueSyncing`, `markSyncQueueError`, `markSyncQueueDone`, `getPendingForSync`, `markAsSynced`.
- Compatibility aliases: `createObject`, `getObject`, `getObjectById`, `getObjectsByOwner`, `getObjectChildren`, `updateObject`, `deleteObject`, `setProperty`, `setProperties`, `getProperty`, `getProperties`, `deleteProperty`, `getPropertyHistory`, `restorePropertyVersion`.
- Diagnostics: `getTableNames`, `getTableCounts`.

Owner: Atome open data layer.

Use before creating: any server-side Atome persistence behavior.

Do not duplicate in: route modules, eVe stores, or UI/product code.

Status: Public server/database module API; direct UI use is forbidden.

#### Atome Security and Sync APIs

Visibility: Public framework APIs.

Evidence: exports in `atome/security/trusted_keys.js`, `atome/security/serverVerification.js`, `atome/security/cloudSync.js`, and `atome/security/syncQueue.js`.

Public entry points:

- Trusted server lookup: `TRUSTED_SERVERS`, `VERIFICATION_SETTINGS`, `getTrustedServer`, `findServerByFingerprint`, `findServerByUrl`, `getServersByEnvironment`, `isDevelopmentMode`.
- Verification: `verifyServer`, `getVerificationStatus`, `clearVerificationCache`, `requiresVerification`, `getStatusMessage`, `getStatusIcon`.
- Cloud sync: `SyncState`, `SyncResult`, `syncToCloud`, `getSyncStatus`, `resolveConflict`.
- Sync queue: `SyncAction`, `ActionStatus`, `getQueue`, `addToQueue`, `removeFromQueue`, `updateActionStatus`, `getPendingActionsForUser`, `getAllPendingActions`, `cleanupOldActions`, `storeCredentialsForSync`, `getCredentialsForUser`, `removeCredentials`, `isAutoSyncEnabled`, `getSyncConfig`, `saveSyncConfig`, `isCloudServerAvailable`, `processAction`, `processAllPendingActions`, `startAutoSync`, `stopAutoSync`, `initSyncQueue`.

Owner: Atome open security/sync layer.

Use before creating: trusted server, cloud sync, sync queue, or verification behavior.

Status: Public framework surface; security phase must audit credentials, storage, and bridge assumptions before expansion.

#### Public Communication Service API Details

Visibility: Public framework service APIs.

Evidence: exports in `atome/src/squirrel/{mail,contacts,calendar,bank}/index.js`, `bootstrap.js`, and `service.js`.

Public entry points:

- Mail: `createGlobalMailApi`, `bootstrapGlobalMail`, `createMailService`, `createMailIndex`, `createMailSyncState`, `createMailConnectorContract`, `createIcloudMailConnector`, `normalizeIcloudMailConnectorConfig`, `normalizeIcloudMailRecord`, `createNodeIcloudImapClient`, `createNodeIcloudSmtpClient`.
- Contacts: `createGlobalContactsApi`, `bootstrapGlobalContacts`, `createContactsService`, `createContactsConnectorContract`, `createLocalContactsSource`, `createMacosContactsSource`, `createIcloudContactsConnector`, `createNodeCarddavClient`.
- Calendar: `createGlobalCalendarApi`, `bootstrapGlobalCalendar`, `createCalendarService`, `createCalendarConnectorContract`, `createCalendarApiSource`, `normalizeCalendarApiEvent`, `createCalendarSyncState`, `createNodeCaldavClient`, `parseCalendarData`.
- Bank: `createGlobalBankApi`, `bootstrapGlobalBank`, `createBankService`, `createBankIndex`, `createBankConnectorContract`.

Runtime globals consumed by MCP/AI where installed:

- `globalThis.atome.mail` or `window.atome.mail`
- `globalThis.atome.contacts` or `window.atome.contacts`
- `globalThis.atome.calendar` or `window.atome.calendar`
- `globalThis.atome.bank` or `window.atome.bank`
- `Squirrel.mail`, `Squirrel.contacts`, `Squirrel.calendar`, `Squirrel.bank` where bootstrap exposes them.

Owner: Atome open communication services.

Use before creating: mail, contacts, calendar, or bank service behavior.

Status: Public service contracts; provider/client internals remain semi-public or internal as listed below.

#### Atome AI and MCP APIs

Visibility: Public framework and MCP-facing APIs.

Evidence: exports and globals in `atome/src/squirrel/ai/agent_gateway.js`, `atome/src/squirrel/ai/default_tools.js`, and `atome/src/squirrel/atome/mcp.js`.

Public entry points:

- `AgentGateway`
- `TOOL_STATUS`
- `POLICY_DECISION`
- `RISK_TIERS`
- `globalThis.AtomeAI`
- `AtomeAI.registerTool`
- `AtomeAI.unregisterTool`
- `AtomeAI.getTool`
- `AtomeAI.listTools`
- `AtomeAI.validateToolchain`
- `AtomeAI.callTool`
- `AtomeAI.executeToolchain`
- `AtomeAI.setPolicyEngine`
- `AtomeAI.proposal.create`
- `AtomeAI.proposal.get`
- `AtomeAI.proposal.approve`
- `AtomeAI.proposal.reject`
- `AtomeAI.proposal.execute`
- `AtomeAI.audit.list`
- MCP runtime operations in `atome/src/squirrel/atome/mcp.js`.

Owner: Atome open AI/MCP layer.

Use before creating: AI-callable tool registration, policy, proposal, audit, toolchain, or MCP bridge behavior.

Do not duplicate in: eVe product tool modules. eVe capabilities must register through runtime tools or capability boundaries.

Status: Public orchestration surface; individual default tool names should be regenerated from `default_tools.js` before building a formal registry.

#### Public Voice API Details

Visibility: Public framework service APIs.

Evidence: exports in `atome/src/squirrel/voice/index.js`, `bootstrap.js`, `service.js`, `orchestrator.js`, `tool_router.js`, `ai_planner.js`, `ai_planner_runtime_context.js`, `session_runtime.js`, `working_memory.js`, `semantic_contract.js`, `telemetry.js`, and `vad.js`.

Public entry points:

- `createGlobalVoiceApi`
- `bootstrapGlobalVoice`
- `createVoiceService`
- `createVoiceOrchestrator`
- `VoiceOrchestrator`
- `createToolRouter`
- `createVoiceAiPlanner`
- `createVoiceSessionRuntime`
- `VoiceSessionRuntime`
- `createWorkingMemory`
- `createStructuredRequest`
- `createMailRequest`
- `createContactsRequest`
- `createCalendarRequest`
- `createAtomeRequest`
- `createStructuredResult`
- `bootstrapMainHandleVoiceEntry`
- `createVoiceLatencyTelemetry`
- `createVoiceActivityDetector`

Owner: Atome open voice runtime.

Use before creating: voice orchestration, semantic contracts, session memory, latency telemetry, or VAD behavior.

Status: Public framework surface, with closed eVe panels injected only through product boundary modules.

#### Public Audio and AV Runtime API Details

Visibility: Public framework runtime API.

Evidence: exports in `atome/src/application/audio_runtime/*` and `window.Squirrel.av` installation in `audio.facade.js`.

Public entry points:

- `AudioPlaybackAPI`
- `AudioRecordingAPI`
- `PlayRecordCore`
- `PLAY_RECORD_API_VERSION`
- `PLAY_RECORD_API_CONTRACT`
- `canonicalizePlayRecordMediaSource`
- `getPlayRecordCore`
- `KIRA_AUDIO_COMMANDS`
- `normalizeKiraPlayInstancePayload`
- `normalizeKiraStopInstancePayload`
- `buildTauriKiraAudioPayload`
- `buildFacadeKiraAudioPayload`
- `resolveKiraFacadeMethod`
- `invokeTauriKiraAudioCommand`
- `invokeKiraAudioCommand`
- `AV_API_SCHEMA_VERSION`
- `AVTypedError`
- `AVClock`
- `AVClockRegistry`
- `createUnsupportedCapabilityError`
- `createAVLifecycleObject`
- `AVMemoryObjectStore`
- `AVAtomeObjectStore`
- `AVMonitoringStore`
- `AVDeviceRegistry`
- `AVLatencyRegistry`
- `AVCodecRegistry`
- `AVGraphRegistry`
- `AVVideoMetricsStore`
- `AVExportAPI`
- `installSharedAVContracts`
- `Squirrel.av.audio`, `Squirrel.av.devices`, `Squirrel.av.codec`, and `Squirrel.av.graph` runtime namespaces.

Owner: Atome open audio/AV runtime.

Use before creating: playback, recording, device, codec, graph, AV store, or backend bridge behavior.

Status: Public framework API; `play_record_core.js` owns orchestration while `play_record_contract.js` and `play_record_media_source.js` own extracted public helpers.

### Semi-Public APIs

#### Server Module APIs

Visibility: Semi-public infrastructure modules.

Evidence: module exports in server files.

Entry points:

- `commitAtomeEvent`, `commitAtomeEvents`, `syncAtomeViaWebSocket` in `server/atomeRoutes.orm.js`.
- `registerSharingWebSocket`, `registerSharingRoutes` in `server/sharing.js`.
- `registerFileUpload`, `getFileMetadata`, `getUserFiles`, `getAccessibleFiles`, `canAccessFile`, `setFilePublic`, `deleteFile`, `getFileStats`, `handleFileMessage`, `registerFileWebSocket`, `initUserFiles`, `shareFile`, `unshareFile` in `server/userFiles.js`.
- `normalizeUserRelativePath`, `sanitizeFileName`, `ensureUserDownloadsDir`, `resolveUserUploadPath`, `resolveUserAssetPath`, `resolveUserFilePath`, `ensureSharedFileLink`, `removeSharedFileLink` in `server/fileStorage.js`.
- `buildUserExportZip`, `inspectUserExportZip`, `importUserExportZip` in `server/userExportImport.js`.
- `createVisioService` in `server/visio.js`.
- `initServerIdentity`, `signChallenge`, `getServerIdentity`, `verifySignature`, `isConfigured` in `server/serverIdentity.js`.
- `startFileSyncWatcher`, `getSyncEventBus` in `server/sync/fileSyncWatcher.js`.
- `normalizeWsApiRequest` in `server/ws_api_schema.js`.

Owner: Atome open server infrastructure.

Use only from: server bootstrap, route modules, tests, or explicitly documented infrastructure integrations.

Status: Semi-public because these are module APIs, not browser/product APIs.

#### Semi-Public eVe Tool Runtime APIs

Visibility: Semi-public closed product runtime APIs.

Evidence: exports and global installs in `eVe/intuition/runtime/tool.js`, `eVe/intuition/tools/index.js`, `eVe/intuition/tools/core/tool_registry.js`, `tool_instances.js`, and `tool_runtime.js`.

Entry points:

- `registerTool`
- `registerUiAction`
- `registerAtomeTool`
- `registerToolHandler`
- `ToolRegistryV2`
- `toolRegistryV2`
- `ToolProjectionStoreV2`
- `toolProjectionStoreV2`
- `ToolRuntimeV2`
- `toolRuntimeV2`
- `bootstrapV2Tools`
- `window.atome.tools.registry`
- `window.atome.tools.handlers`
- `window.atome.tools.v2Registry`
- `window.atome.tools.v2Runtime`
- `window.atome.tools.v2ProjectionStore`
- `window.registerTool`
- `window.registerUiAction`
- `window.registerAtomeTool`
- `window.registerToolHandler`
- `CANONICAL_SLIDER_TOOL_SHELL_SELECTOR`
- `CANONICAL_SLIDER_TOOL_HITZONE_SELECTOR`
- `CANONICAL_SLIDER_TOOL_INPUT_SELECTOR`
- `CANONICAL_SLIDER_TOOL_VALUE_SELECTOR`
- `CANONICAL_SLIDER_TOOL_VALUE_INPUT_SELECTOR`
- `mountIntuitionXSliderToolContent`

Panel runtime contract:

- `eVe/intuition/panel_definitions.js` owns `PANEL_SURFACE_DEFINITIONS` and exports `buildPanelRuntimeConfigByToolId()`.
- `eVe/intuition/tools/core/tool_runtime.js` must derive panel open/close routing from that exported config rather than declaring a parallel `tool_id -> panel` table.
- Runtime panel open/close calls continue through `eVe/intuition/runtime/panel_api.js`, which delegates to `panelCreatorV2` after product bootstrap registers the API.

Owner: eVe closed.

Use only from: eVe product tools, runtime tool resolution, MCP bridge through approved capability checks, and targeted tests.

Status: Semi-public closed product API. It is not an Atome open API.

#### eVe Command, Selection, Panel, and Layer Runtime APIs

Visibility: Semi-public closed product runtime APIs.

Evidence: exports in `eVe/intuition/runtime/index.js`, `command_bus.js`, `panel_api.js`, `layer_contract.js`, `selection.js`, `selection_snapshot.js`, `tool_gateway.js`, `history_policy.js`, `in_flight_lock.js`, `group_timeline_api.js`, and related runtime modules.

Entry point families:

- Command bus: `commandBusV2` and command-bus exports from `command_bus.js`.
- Tool gateway: `invokeToolGateway`, `readExplicitLatched`, `resolveStranglerFlags`, `warmupToolGatewayRuntime`.
- Panel API: `openPanelSurface`, `closePanelSurface`, and panel surface exports from `panel_api.js`; eVeIntuition-specific surface registration and PanelCreatorV2 bridging live in `runtime/eve_intuition/panel_surface_runtime.js`.
- Diagnostics: `window.__DEBUG__` is installed by `runtime/eve_intuition/debug_runtime.js` and remains an internal eVe diagnostic facade for app snapshots, footer state, selection state, project-layer state, persistence diagnostics, and deterministic test mode.
- Layer contracts: exported layer ids, layer ownership helpers, z-index constants, and panel layer contracts.
- Selection: selection prefix constants, selection readers, snapshot normalization, and selection application helpers.
- History policy: history and recording mode resolution.
- Group timeline: group timeline API exports.
- Locks: `createInFlightLock`.

Owner: eVe closed.

Use only from: eVe UI, tools, panels, Matrix, Molecule/MTraX, and approved runtime bridge points.

Status: Semi-public inside eVe closed. Verify exact exports in the owning module before use.

#### eVe UI and Design Factory APIs

Visibility: Semi-public closed product design APIs.

Evidence: exports in `eVe/elements/design.js`, `eVe/elements/eVe_look.js`, `eVe/elements/system_ui_tokens.js`, `eVe/elements/design/panel_chrome.js`, `panel_chrome_tokens.js`, `panel_overflow_indicators.js`, and the `dialog_runtime.js` facade over dialog drag, geometry, reveal, and viewport runtimes; `window.eveUI` install in `design.js`.

Entry point families:

- Dialog and panel factories: `createEveDialog`, `revealEveDialog`, `createEveCloseControl`, panel chrome helpers, bounds helpers, fullscreen helpers with viewport resize tracking only while fullscreen is active, chrome-scoped fullscreen double-click handles, overflow indicators.
- UI primitives: rows, buttons, inputs, editable text, text helpers, and `eveUI` namespace.
- Tokens and presets: system UI tokens, eVe tokens, CSS variable application, base style installation, panel chrome tokens and metrics.
- i18n binding helpers for visible text.

Owner: eVe closed design layer.

Use only from: eVe product UI and closed panels/tools.

Status: Semi-public product design API. Exact function names must be verified in `design.js` before use because the file is large and exports many helpers.

#### Semi-Public eVe Store APIs

Visibility: Semi-public closed product persistence APIs.

Evidence: exports in `eVe/core/event_store/index.js`, `project_store/index.js`, `media_store/index.js`, `browser_store/indexeddb_backend.js`, `tauri_store/tauri_sqlite_backend.js`, `ios_store/ios_sqlite_backend.js`, and `molecule_store_bootstrap.js`.

Entry points:

- Event store: `createEventStore`, `createMemoryEventAdapter`, `EventStoreError`.
- Project store: `createProjectStore`, `createMemoryProjectAdapter`, `ProjectStoreError`.
- Media store: `createMediaStore`, `createMemoryMediaAdapter`, `buildMediaRef`, `validateProbe`, `validateRuntimeAssets`, `MediaStoreError`.
- Store backends: `createMemoryIndexedDbBackend`, `createTauriSqliteBackend`, `createIosSqliteBackend`.
- Molecule store bootstrap: `MOLECULE_STORE_PLATFORMS`, `MoleculeStoreBootstrapError`, `createBrowserMoleculeStores`, `createTauriMoleculeStores`, `createIosMoleculeStores`, `detectMoleculeStorePlatform`.

Owner: eVe closed product store layer.

Use only from: eVe product runtime and Molecule/MTraX store composition.

Status: Semi-public closed product API. Do not use for generic Atome persistence.

#### Molecule and MTraX Runtime APIs

Visibility: Semi-public closed product APIs.

Evidence: module exports and globals in `eVe/core/media_engine/`, `eVe/domains/mtrax/api/`, and MTraX integration modules.

Entry points:

- Molecule engine/API: `createMoleculeEngine`, `ensureMoleculeEngine`, `getMoleculeCommandCatalog`, `createMoleculeApi`, `ensureMoleculeApi`, `ensureMoleculeMediaRuntime`.
- Molecule globals: `window.Molecule.engine`, `window.Molecule.api`, `window.Molecule.media`, `window.Molecule.createSession`, `window.Molecule.getSession`, `window.Molecule.disposeSession`, `window.Molecule.describeApi`, `window.Molecule.execute`, `window.Molecule.listCommands`, `window.eveMediaApi`.
- Molecule session history: `createMoleculeSession` exposes `undo`, `redo`, `canUndo`, `canRedo`, and `getHistory`; persistence and multi-instance controllers expose timeline-scoped undo/redo helpers so molecule edits do not depend on global Atome selection.
- MTraX window API creators: `createMtrackWindowApiRuntime`, `createWindowApiBridgeRuntime`.
- MTraX globals: `window.open_mtrack_panel`, `window.close_mtrack_panel`, `window.eveMtrackApi`.
- MTraX runtime families exposed under `window.eveMtrackApi`: transport, project automation, record state, record media, track record source, clip move/crop/split/join, SVG layer control, timeline export, preview export, renderer/WebGPU diagnostics, selection context, and group timeline loading.
- MTraX clip split target resolution: explicit clip inputs keep highest precedence for programmatic calls. Interactive `ui.split` resolves selected clips at the playhead first, then clips on selected tracks at the playhead, and never expands to linked audio/video companions. Non-selected clips under the playhead are not split.
- MTraX clip selection APIs: `getSelectionContext` reads selected clips with `selected_clip_ids`, `selected_clip_selection_ids`, `selected_clip_runtime_ids`, and `selected_clips`; `setClipSelection` / `selectClips` resolves incoming `clip_id`, `clip_ids`, or `selection_ids` through the clip target resolver before writing runtime selection. MCP-facing `ui.mtrack.clip_selection` uses the same read/write path.
- MTraX clip deletion target resolution: interactive delete and `deleteSelection` remove only currently selected clips, or clips on selected tracks when no clips are selected. The operation does not expand selected clips through linked audio/video metadata or shared `sync_group_id`; linked companion deletion must be represented by explicit clip selection.

Owner: eVe closed product media workflow.

Use only from: Molecule/MTraX product UI, product tools, runtime bridge, and targeted diagnostics.

Status: Semi-public closed product API. Debug methods and WebGPU probes are internal diagnostics even when reachable from `window.eveMtrackApi`.

#### eVe Media Domain APIs

Visibility: Semi-public closed product APIs.

Evidence: exports in `eVe/domains/media/api/` and `eVe/domains/media/media_diagnostics.js`.

Entry point families:

- Media API shared helpers and media source normalization.
- Shared media source normalization is the required route canonicalization contract for MTraX/WebGPU media playback before any browser media element receives a source, including timestamped recording names that arrive as bare, root-relative, or loopback Fastify API paths in Tauri.
- Legacy Atome product-bootstrap renderers that still mount media atomes must also call this contract before assigning `src` attributes; they must not synthesize `/assets/shared` media paths for persisted recordings.
- Video recording atome creation must persist owner metadata (`owner_id` / `media_user_id`) and resolve `/api/recordings/:file` URLs with that owner before the first browser media request.
- Existing recording Atome reuse is still effectful: the media persistence API must issue the canonical Atome `set` commit with the active `project_id` before rendering so `AdoleAPI.atomes.list({ projectId })`, `state_current`, and project scene reload agree.
- Client Atome projection APIs must preserve `meta.project_id` from `state_current`; dropping it makes persisted media look projectless after refresh.
- Media persistence must preserve lightweight render cache fields that are part of the media Atome contract, including video poster data/refs and waveform peaks/refs, so project reload can reuse generated visuals without expensive regeneration. These fields are cache inputs for RenderAtom/Bevy, not a public GPU texture persistence API.
- Audio API and video API product facades.
- `VideoRecordingAPI` and `VideoPlaybackAPI` from `video_facade.js`.
- Media persistence service exports.
- `createMediaDiagnosticsRuntime`.
- Native frame preview renderer factory.

Owner: eVe closed media domain.

Use only from: eVe media tools, MTraX, product import/preview flows, and targeted diagnostics.

Status: Semi-public closed product API. Generic playback/recording belongs to Atome AV runtime first.

### Internal APIs

#### Internal Atome Framework Helpers

Visibility: Internal or implementation-specific.

Examples verified by exports:

- `createOfflineMutationQueue`
- `createAiQuotaTracker`
- `createPersistentMemoryStore`
- `createAiTraceStore`
- `createProactiveStateStore`
- `buildStartupBriefing`
- `evaluateProactiveNotifications`
- `coalesceProactiveNotifications`
- `loadRuntimeUserProfile`
- connector internals and local indexes below their service facades when used outside the owning communication service.

Owner: Atome open implementation modules.

Use through: public AI, MCP, communication, voice, or service facades.

Status: Internal unless a future registry promotes a specific helper.

#### Internal eVe Product Helpers

Visibility: Internal closed product implementation.

Examples verified by exports:

- MTraX project runtimes such as `createProjectAutomationSessionRuntime`, `createProjectPlaybackTimelineRuntime`, `createProjectAutomationPatchRuntime`, `createProjectLocalDragRuntime`, `createProjectPlaybackPatchRuntime`, `createProjectAtomeTimelineRuntime`, `createProjectPlaybackMirrorRuntime`, `createProjectAtomeDropRuntime`, `createProjectRecordTimingRuntime`, `createProjectTargetAutomationRuntime`, `createProjectRecordHostRuntime`, `createProjectAutomationBootstrapRuntime`, `createProjectPlaybackAutomationBundleRuntime`, `createMtrackCommitBridgeRuntime`, `createProjectRecordBridgeRuntime`, `createProjectRecordSessionRuntime`, `createProjectPlaybackTargetRuntime`.
- MTraX shared helpers such as `waitMs`, `dedupeIdsBy`, `cloneData`, `stableStringify`, primitive coercion helpers, loop cell keys, timeline timing helpers, and media detection helpers.
- Tool core implementation helpers such as SVG draw model functions, latch aliases, palette behavior, finder projection helpers, record action state helpers, and MTraX renderer adapters.
- `__moleculeTestUtils`, `__moleculeApiTestUtils`, and other `__*TestUtils` exports.
- Debug and benchmark methods exposed from `window.eveMtrackApi` whose names begin with `debug*`, `verify*`, or probe-specific labels.

Owner: eVe closed implementation modules.

Use through: eVe semi-public runtime APIs, MTraX window API, Molecule API, or tests.

Status: Internal. Do not treat these as stable API contracts.

#### Generated, Vendored, Test, and Example APIs

Visibility: Internal or out of active API contract.

Examples:

- APIs in `atome/src/application/examples/`.
- Test-only exports and probe utilities.
- Vendored browser libraries under `atome/src/js/`.
- Generated distribution artifacts under `dist/`.
- Temporary diagnostics under `temp/`.

Owner: their owning test/example/vendor/build context.

Status: Not part of the maintained public/semi-public API inventory.

## Required Follow-Up Work

The next execution tasks must refine this map by:

- Making map consultation mandatory before future implementation.
- Adding automated validation for map/source consistency where practical.
