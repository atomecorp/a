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

### eVe Dashboard Runtime API

Ownership: eVe closed.

Primary sources:

- `eVe/domains/dashboard/dashboard_runtime.js`
- `eVe/domains/dashboard/dashboard_actions.js`
- `eVe/domains/dashboard/dashboard_data_adapters.js`
- `eVe/domains/dashboard/dashboard_render_scheduler.js`
- `eVe/domains/rendering/surface_runtime.js`

Exposure:

- JavaScript module exports: `createDashboardRuntime`, `getDashboardRuntime`, `openDashboardRuntime`, `closeDashboardRuntime`, `toggleDashboardRuntime`; runtime instances also expose `refresh()` and `invalidateCache(...)` for explicit dashboard-cache invalidation.
- Runtime global: `window.eveDashboardRuntime`, installed by the dashboard runtime for product runtime access.
- Surface interaction hook: `setRenderSurfaceInteractionInterceptor(zone, interceptor)` in `surface_runtime.js`.
- Project scene UI-intent hook: `setProjectSceneUiIntentHandler(handler)` in `project_scene_runtime.js`, registered by eVe boot so canvas double-click footer open works across all project render/update paths.
- Tool ids: `tool.dashboard.news`, `tool.dashboard.monitor`, `tool.dashboard.goals`, and hidden future `tool.dashboard.store`.
- Entry points: the main Atome handle tap (`button[data-role="eve_intuitionx-handle"]`) toggles the dashboard in active workspaces; successful authenticated and anonymous workspace openings route through `eVe/intuition/tools/user_workspace_surface_runtime.js`, which starts `window.eveToolBase.loadProjectAtomes(projectId, { staleFirst: true, resolveOnFirstPaint: true })`, requires the canonical `eve_surface_project` canvas, opens `window.eveDashboardRuntime.open({ projectId })` on that resolved project, verifies dashboard Bevy scene records directly after open, then reveals the existing main ribbon; direct `tool.main.home` gateway calls remain the `ui.home.panel` user/Home panel route.
- Atome footer project-scene bridge: `window.eveAtomeEditFooterApi.openForProjectSceneAtome({ atomeId, kind, anchorRect })` opens the existing footer from Bevy canvas hit-test geometry without creating visible per-Atome DOM hosts.

Boundary status: Semi-public closed eVe product runtime. Dashboard item lists are read-only projections; Calendar, Contacts, and Projects are reached through their existing APIs/adapters. Store is an explicit no-op until its domain is defined.

Effect model:

- Open/close/render are ephemeral Bevy projection operations over the current project surface. Opening includes project-veil, violet reserved-band-fill, and bottom-shadow records below the dashboard foreground; closing clears any dashboard scene effects and removes those records through the same dashboard diff/teardown path so the project returns to its normal presentation without DOM state, CSS filters, or a second renderer. `backdrop_blur` remains an internal scene-effect contract for later renderer work but is disabled by default.
- Dashboard render calls keep an internal record cache and use `dashboard_render_scheduler.js` to emit changed records plus removed ids to `updateProjectSceneRecords(...)`; pointermove, wheel, and inertial scroll are coalesced through `requestAnimationFrame`, while open/close and item-detail paths render immediately.
- `dashboard_data_adapters.js` exposes read-only `list(category)` and `listMany(categories)` for grouped category reads; `generic_record` categories share one `state_current` read and are split by `source_domain: "eve.dashboard"` plus `category_id`. Calendar lists only dated, non-deleted, unique `CalendarAPI.listEvents()` items. Contacts list the canonical `collectPeopleDirectory()` entries first, then the local contacts API if the directory is empty.
- `dashboard_actions.js` owns effectful dashboard interactions: no-op plus actions for News, Store, Monitor, and Goals; panel opening for Calendar and Contacts through the canonical eVe panel definitions; project creation/opening through shared Matrix project helpers. Project item clicks close the dashboard and activate/load that project as the Bevy desktop.
- `dashboard_runtime.js` caches derived dashboard item lists by `projectId + categoryId` and reuses them on Atom-dashboard toggles. Cache invalidation is explicit through refresh, project-change lifecycle, logout, and focused-category forced reloads. Clicking an already active header clears focus and returns to the base dashboard overview.
- `renderProjectScene(..., { preserveEphemeralRecords: true })` is an internal rendering extension for late project reconciliation; it preserves only explicit ephemeral Bevy overlay records (`__eve_dashboard_`, `mol:lane:`, `mol:clip:`, `mol:kf:`, `mol:playhead`) from the current runtime map.
- Runtime layout, hit-testing, and dashboard render records stay in the same logical project coordinates used by active Atomes. DPR/backing-buffer sizing remains a canvas storage concern and must not pre-scale the Virtual Scene, dashboard records, or hit-test geometry.
- Fullscreen item detail is an immediate runtime-only projection; the durable item payload is not mutated by dashboard detail state.
- Generic News, Monitor, and Goals record creation is no longer owned by the dashboard `+` action.
- Calendar dashboard listing consumes the existing `CalendarAPI.listEvents()` item-list response (`items` or legacy `events`) and rejects invalid or explicit error responses instead of silently rendering an empty category.
- Generic News, Monitor, and Goals records use the open Atome `record` type with `source_domain: "eve.dashboard"` and a generic `category_id`; no product-specific Atome type is introduced for these domains in v1.
- Calendar and Contacts `+` actions open their existing eVe panels and do not create records.
- Project `+` creation delegates to shared Matrix/Adole project helpers and project activation; dashboard does not duplicate Matrix project creation or selection logic.

### Bevy Shape Projection Style API

Ownership: Atome open, product-neutral rendering contract.

Primary sources:

- `eVe/domains/rendering/render_atom.js`
- `eVe/domains/rendering/virtual_scene_contract.js`
- `eVe/domains/rendering/bevy_projection_adapter.js`
- `eVe/domains/rendering/bevy_projection_style.js`
- `atome/renderers/bevy-core/src/types.rs`
- `atome/renderers/bevy-core/src/texture.rs`
- `atome/renderers/bevy-core/src/shape_shadow_overlay.rs`
- `atome/renderers/bevy-core/src/spawn.rs`

Exposure: render records may set `corner_radius` / `cornerRadius` / `radius`; normalized virtual scene nodes expose `material.cornerRadius`; Bevy payloads expose `corner_radius`; Bevy core applies it to `shape` sprites by generating an alpha-mask texture. Render records may also set `material.shadow` with `{ color, blur, offsetX, offsetY, spread }`; normalized Bevy payloads expose `shadow` as `{ color, blur, offset_x, offset_y, spread }`; style patches may pass `material.shadow: null` to clear the shadow.

Boundary status: Open product-neutral rendering style. eVe may consume it through render records, but the contract must not encode dashboard-specific behavior.

### Bevy Text Texture Style API

Ownership: Atome open, product-neutral rendering contract.

Primary sources:

- `eVe/domains/rendering/render_atom.js`
- `eVe/domains/rendering/virtual_scene_contract.js`
- `eVe/domains/rendering/bevy_media_texture_resolver.js`

Exposure: text render records may set `text_style` / `textStyle` with font size, font weight, alignment, baseline, padding, stroke color/width, and shadow color/blur/offset. `RenderAtom` and Virtual Scene carry the style as disposable text texture metadata, and the browser Bevy resolver rasterizes fill plus optional stroke and diffuse shadow into one RGBA texture payload without using Canvas `maxWidth` glyph scaling.

Boundary status: Open product-neutral text rendering style. It must not create visible DOM text nodes, duplicate text shadow records, or a fallback renderer.

### eVe Atome Drag Runtime API

Ownership: eVe closed.

Primary sources: `eVe/core/atome_events/drag_runtime.js`, `eVe/core/atome_events/drag_arm_runtime.js`, `eVe/core/atome_events/drag_finish_runtime.js`, `eVe/core/atome_events/drag_session_state.js`, `eVe/core/atome_events/drag_session_support.js`.

Exposure: internal JavaScript module exports consumed by `eVe/core/atome_events.js` and the canonical Atome event binding path.

Verified entry points: `createDragRuntime`, `armDragSession`, `finishDragSession`, `createDragSessionState`, `resetDragSessionState`, `collectDragItems`, `createDragShadowTracker`.

Boundary status: Internal eVe product runtime. It must preserve canonical drag commits through injected callbacks and must not expose DOM drag state as durable Atome state.

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

Authentication bootstrap: `AdoleAPI.auth.bootstrap(phone, password, username, visibility)` is the atomic first-auth contract. Existing-phone attempts must verify the password and return a real authenticated token/session; unknown-phone attempts may create the account. The unified result exposes legacy per-backend fields plus top-level `ok`, `user`, `token`, and `backend` after a successful authenticated login or creation. UI code must not emulate this by calling `auth.login` followed by `auth.create`, and must not add its own post-bootstrap session gate beyond the canonical bootstrap success result and auth/session events owned by Atome auth state.

Pre-auth phone verification: `AdoleAPI.auth.requestPhoneVerification(phone, context, { exposeForTest })` and `AdoleAPI.auth.verifyPhoneVerification(phone, code, context)` are the browser-facing pre-auth OTP contract for login demos, account creation, and new-machine checks. The implementation lives in `atome/src/squirrel/apis/unified/adole_api/auth_phone_verification.js`, routes through the single active Adole WebSocket auth backend, and must not fall back to a secondary backend or add HTTP endpoints. Test/demo mode may expose `code` only when the backend explicitly returns it outside production; production responses must not expose the OTP secret.

Atome mutation rule: `AdoleAPI.atomes.create` and `AdoleAPI.atomes.alter` are public compatibility method names, but their framework implementation must emit canonical event commits through `adapter.atome.commit`. Direct adapter-level `atome.create` / `atome.alter` calls are legacy WebSocket protocol adapters only and must not be used as durable framework write paths.

Atome browser projection owner: `atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js` owns browser-side normalization of Atome API records and state-current results into canonical `{ id, type, kind, renderer, meta, traits, properties }` records at network/runtime boundaries. Historical transport aliases may be read only at that boundary and must not be re-emitted as a public Atome format.

Current project restoration owner: `atome/src/squirrel/apis/unified/adole_api/session.js` persists `squirrel_current_project_v2` with an explicit `userId`, `projects.js` restores it only for that same authenticated user, and `auth_workspace.js` owns cached pre-auth/anonymous workspace migration through the canonical `transferOwner` adapter before clearing the cache. `auth.js` only orchestrates login flows that call that migration owner. Tauri reload/relogin must not fall back to a cross-user project cache or a DOM-derived project id.

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

Pre-auth OTP WebSocket actions: `/ws/api` auth messages `request-phone-verification` and `verify-phone-verification` own the login pre-auth OTP request/check flow. They reuse `generateOTP`, `storeOTP`, `verifyOTP`, `sendSMS`, and `enforceAuthIdentityRateLimit` from `server/auth.js`; no `/api/auth/request-phone-verification` or `/api/auth/verify-phone-verification` REST route is part of this contract.

Atome route ownership: `server/atomeRoutes.orm.js` owns route orchestration, authentication, and event commit helpers; CRUD HTTP routes are owned by `server/atomeCrudRoutes.js`; event/state/snapshot routes are owned by `server/atomeEventRoutes.js`; boundary formatting lives in `server/atomeRouteContract.js`; WebSocket sync side effects live in `server/atomeSyncRuntime.js`.

Tauri Axum parity: local media write endpoints in `platforms/desktop-tauri/src/server/mod.rs` that return uploaded media ownership must expose `owner`, `owner_id`, and `ownerId` together so browser-on-Axum and Tauri media URLs can preserve `media_user_id` for protected `/api/uploads/:file` and `/api/recordings/:file` reads.

Tauri Axum auth parity: `platforms/desktop-tauri/src/server/mod.rs` must expose `GET /api/auth/me` through local auth so project reload hydration can restore the active user before reading persisted Atome/project state from `/api/state_current`.

Tauri local ownership migration: `platforms/desktop-tauri/src/server/local_atome.rs` owns the server-side guard for `transfer-owner`. It permits authenticated migration only from explicit anonymous owners or local owners without login credentials (`phone` and `password_hash` absent), and rejects transfer from any credentialed user.

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
- `atome/src/shared/atom_graph.js`
- `atome/src/shared/accessible_atom_node.js`
- `atome/src/shared/accessibility_graph.js`
- `atome/src/shared/accessibility_bridge_contract.js`
- `atome/src/shared/core_atome_types.js`
- `atome/src/shared/semantic_rename_contract.js`

Compatibility export: `atome/shared/atome_contract.js` re-exports the same contract for server and Node tests.
Graph compatibility export: `atome/shared/atom_graph.js` re-exports the same graph contract for server and Node tests.
Accessibility compatibility export: `atome/shared/accessible_atom_node.js` re-exports the same accessibility-node contract for server and Node tests.
Accessibility graph compatibility export: `atome/shared/accessibility_graph.js` re-exports the same accessibility graph contract for server and Node tests.
Accessibility bridge compatibility export: `atome/shared/accessibility_bridge_contract.js` re-exports the same bridge projection contract for server and Node tests.
Core type compatibility export: `atome/shared/core_atome_types.js` re-exports the same core type definitions for server and Node tests.
Semantic rename compatibility export: `atome/shared/semantic_rename_contract.js` re-exports the same rename contract for server and Node tests.

Exposure: JavaScript module exports consumed by the ADOLE client API, Fastify Atome routes, and database persistence.

Verified entry points: `normalizeCanonicalAtome`, `sanitizeAtomeEnvelope`, `sanitizeAtomeProperties`, `assertCanonicalPropertyKey`, `resolveCanonicalProperties`, `formatCanonicalAtome`, `registerAtomeType`, `getAtomeType`, `listAtomeTypes`, `toolToUniversalAtome`, `AtomeContractError`, `ATOM_GRAPH_VERSION`, `normalizeAtomGraphRecord`, `buildAtomGraph`, `ACCESSIBLE_ATOM_NODE_VERSION`, `ACCESSIBLE_ATOM_NODE_SCHEMA`, `ACCESSIBLE_ATOM_ROLES`, `ACCESSIBLE_ATOM_ACTIONS`, `ACCESSIBLE_ATOM_RELATIONS`, `sanitizeAccessibleAtomNode`, `assertAccessibleAtomNode`, `ACCESSIBILITY_GRAPH_VERSION`, `buildAccessibilityGraph`, `ACCESSIBILITY_BRIDGE_CONTRACT_VERSION`, `buildAccessibilityBridgeProjection`, `CORE_ATOME_TYPE_VERSION`, `CORE_ATOME_TYPE_IDS`, `CORE_ATOME_TYPE_DEFINITIONS`, `listCoreAtomeTypeDefinitions`, `registerCoreAtomeTypes`, `SEMANTIC_RENAME_VERSION`, `SEMANTIC_RENAME_CANONICAL_PROPERTY`, `SEMANTIC_RENAME_EVENT_KIND`, `normalizeSemanticRenameValue`, `resolveSemanticLabel`, `buildSemanticRenamePatch`, `buildSemanticRenameEvent`, `applySemanticRenameToRecord`.

Boundary rules:

- `normalizeCanonicalAtome` is the strict contract entry point. Transitional aliases such as `atome_id`, `atome_type`, `particles`, and `data` are accepted only when called with an explicit boundary-adapter option.
- `normalizeCanonicalAtome(..., { universal: true })` emits the enriched Atome envelope with `schema_version`, `capabilities`, `interfaces`, `composition`, `policy`, and `lifecycle`.
- `formatCanonicalAtome` remains a tolerant server/database response formatter and emits only the canonical envelope.
- `buildAtomGraph` is a pure structural graph contract over canonical state rows and append-only event rows. It emits roots, nodes, `byId`, parent-child links, per-node `visual_order` / `semantic_order` / `focus_order`, top-level `orders.visual` / `orders.semantic` / `orders.focus`, and diagnostics (`omitted_deleted_ids`, `orphan_links`, `cycle_links`, `duplicate_ids`) without reading the DOM, renderer state, or product UI registries.
- AtomGraph visual order is derived from z/order paint hints. Semantic and focus orders may be derived from explicit `semantic_order`, `reading_order`, `focus_order`, `tab_index`, or equivalent `properties.accessibility` fields; absent explicit values, they fall back deterministically without becoming renderer-owned state.
- `sanitizeAccessibleAtomNode` is a pure schema sanitizer for Atome-derived accessibility semantics. It emits an `AccessibleAtomNode` with role, label, description, alt text, focusability, visibility, actions, relations, and diagnostics without reading visible DOM, browser accessibility APIs, renderer payloads, or product UI state.
- `assertAccessibleAtomNode` is the strict schema gate and throws `AtomeContractError` when required accessibility-node fields or enum values are invalid.
- `buildAccessibilityGraph` derives an accessibility graph from `AtomGraph` and Atome properties. It emits visible accessible nodes, reading/focus orders, structural relations, links, diagnostics, and promoted roots for children of inaccessible parents without reading visible DOM, browser accessibility APIs, renderer payloads, or product UI state.
- `buildAccessibilityBridgeProjection` derives a disposable semantic bridge payload from `AccessibilityGraph`. It mirrors ids, labels, roles, actions, relations, and reading/focus order for future Browser/WebView/native consumers without creating DOM nodes, ARIA attributes, selectors, renderer state, or product UI state.
- Accessible actions are declarative capabilities on `properties.accessibility.actions`; consumers may expose or route them through approved tool/runtime capability paths, but the graph and bridge do not execute actions, mutate Atomes, or imply a DOM event target.
- Accessibility focus restoration is runtime session metadata, currently represented by `InlineEditSession.focus_origin` and `selection_snapshot`; it may reference graph or bridge ids, but must remain pure data and must not carry DOM nodes, selectors, browser elements, or product panel instances.
- `registerCoreAtomeTypes` installs strict core type definitions into the shared Atome type registry for text, shape, image, video, audio, audio waveform, waveform, group, project, and tool instance Atomes. It is explicit and idempotent, and does not change renderer dispatch.
- `listCoreAtomeTypeDefinitions` returns clone-safe definition data for inspection and tests.
- `buildSemanticRenamePatch` is the canonical rename patch builder. It writes `properties.label` and synchronizes `properties.accessibility.label` while preserving existing accessibility metadata.
- `buildSemanticRenameEvent` emits a persistent `set` event for rename operations and requires an explicit `tx_id` so HistoryTransaction grouping, undo, and redo do not depend on runtime memory.
- `resolveSemanticLabel` defines deterministic label fallback for graph/accessibility consumers: `properties.label`, `properties.accessibility.label`, `meta.name`, `properties.name`, `properties.title`, `properties.text`, then id.
- AtomGraph deletion filtering is projection-only. Durable create, set, delete, restore, undo, or redo writes must still flow through the append-only event pipeline.
- No public `fromLegacy...` or `toLegacy...` adapter API is allowed. Historical input shapes may be normalized only at explicit boundaries; SQL serialization must be named as storage serialization, not as a legacy Atome format.
- Browser-served modules under `atome/src/` and `eVe/` must import `atome/src/shared/atome_contract.js`; `atome/shared/atome_contract.js` remains a Node/server compatibility export and must not be imported by browser-served modules.
- Browser-served modules that need AtomGraph must import `atome/src/shared/atom_graph.js`; `atome/shared/atom_graph.js` remains a Node/server compatibility export and must not be imported by browser-served modules.
- Browser-served modules that need AccessibleAtomNode must import `atome/src/shared/accessible_atom_node.js`; `atome/shared/accessible_atom_node.js` remains a Node/server compatibility export and must not be imported by browser-served modules.
- Browser-served modules that need AccessibilityGraph must import `atome/src/shared/accessibility_graph.js`; `atome/shared/accessibility_graph.js` remains a Node/server compatibility export and must not be imported by browser-served modules.
- Browser-served modules that need the accessibility bridge contract must import `atome/src/shared/accessibility_bridge_contract.js`; `atome/shared/accessibility_bridge_contract.js` remains a Node/server compatibility export and must not be imported by browser-served modules.
- Browser-served modules that need core Atome type definitions must import `atome/src/shared/core_atome_types.js`; `atome/shared/core_atome_types.js` remains a Node/server compatibility export and must not be imported by browser-served modules.
- Browser-served modules that need semantic rename behavior must import `atome/src/shared/semantic_rename_contract.js`; `atome/shared/semantic_rename_contract.js` remains a Node/server compatibility export and must not be imported by browser-served modules.

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
- Backend routing in `atome_commit.js` must reuse the canonical Squirrel runtime detector from `atome/src/squirrel/apis/unified/adole_api/runtime.js`; Tauri dev pages on `localhost:3000` keep `state_current` refreshes on local Axum instead of issuing secondary Fastify HTTP reads.
- Fastify 401 responses for bearer-backed commit or `state_current` requests invalidate the stored Fastify token through the same auth owner, so expired cloud tokens cannot be replayed on every refresh tick.
- Fastify `state_current` 404 reads are cached as missing for a bounded client window in `atome_commit.js`; the canonical result remains `null`, and repeated UI refreshes must not keep issuing the same absent-id GET.
- `window.eveToolBase.createAtome` is a product runtime creation API over this commit boundary. Its return contract includes `id`/`atomeId`, `canonicalState`, nullable `view`, `committed`, and `rendered`; callers that need model-only creation must pass `{ render: false }`, which keeps DOM projection disabled after the canonical commit.
- `scripts/check_mutation_ownership_guardrails.mjs` is the guardrail entry point for this API boundary. It rejects direct client/runtime mutation of `state_current` and direct event-commit transport calls outside canonical commit/server owners.
- `scripts/check_squirrel_dom_adapter_guardrails.mjs` is the guardrail entry point for the legacy Squirrel Atome DOM adapter boundary. `this.element` may remain a projection handle, but model/business state must stay on Atome instance data or canonical persistence surfaces.
- Database event projection APIs: `database/adole.js` exposes `appendEvent`, `appendEvents`, `getStateCurrent`, `listStateCurrent`, `rebuildStateCurrentFromEvents`, `restoreStateSnapshot`, and the contained legacy `restoreSnapshot` adapter. It also re-exports the pure `database/adole_history_transactions.js` contract (`buildHistoryTransactions`, `classifyHistoryEvent`, `normalizeHistoryEvent`, `resolveHistoryCursor`, `selectUndoTransaction`, and `selectRedoTransaction`). Event projection must clone incoming event patches before projection enrichment, sanitize reserved Atome envelope keys before writing `state_current.properties`, and keep `state_current` coherent with `particles`; controlled state snapshot restore must replay through `appendEvents`, legacy single-atome snapshot restore must append a `set` event through `appendEvent`, restart-safe interaction reconstruction must preserve text edit, drag, resize, and semantic rename transactions from append-only events, and redo semantics must be derived from append-only transactions after a durable cursor rather than in-memory snapshots.

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
- Matrix project list loading, current-project persistence, active-project synchronization, and project rename commits are owned by `eVe/intuition/matrix/core/project_data.js`; stable Matrix project slot ordering and slot update serialization are owned by `eVe/intuition/matrix/core/project_order_runtime.js`. Every `props` payload sent through `window.Atome.commit` or `window.Atome.commitBatch` from either owner must be built with `sanitizeAtomeProperties(...)`.
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

Primary sources: `eVe/domains/rendering/render_atom.js`, `eVe/domains/rendering/virtual_scene_contract.js`, `eVe/domains/rendering/renderer_adapter_registry.js`, `eVe/domains/rendering/bevy_renderer_adapter_registry.js`, `eVe/domains/rendering/bevy_projection_adapter.js`, `eVe/domains/rendering/inline_edit_session.js`, `eVe/domains/rendering/inline_edit_close_overlay.js`, `eVe/domains/rendering/bevy_pending_media_contract.js`, `eVe/domains/rendering/bevy_media_texture_resolver.js`, `eVe/domains/rendering/bevy_media_resource_runtime.js`, `eVe/domains/rendering/bevy_web_presentation_runtime.js`, `eVe/domains/rendering/bevy_surface_background_runtime.js`, `eVe/domains/rendering/user_background_pattern_renderer.js`, `eVe/domains/rendering/user_surface_background_texture_runtime.js`, `eVe/domains/rendering/bevy_web_renderer_runtime.js`, `eVe/domains/rendering/scene_graph.js`, `eVe/domains/rendering/surface_size_runtime.js`, `eVe/domains/rendering/surface_runtime.js`, `eVe/domains/rendering/webgpu_compositor.js`, `eVe/domains/rendering/project_scene_runtime.js`, `eVe/domains/rendering/project_scene_gesture_runtime.js`, `eVe/domains/rendering/matrix_preview_renderer.js`, `eVe/intuition/runtime/project_scene_render_bridge.js`, `eVe/intuition/runtime/atome_description_frame_runtime.js`, `eVe/intuition/runtime/media_integrity_runtime.js`, `eVe/intuition/runtime/shape_svg_runtime.js`, `eVe/intuition/runtime/group_visual_runtime.js`, `eVe/intuition/runtime/group_visual_preview_runtime.js`, `eVe/intuition/runtime/media_source_runtime.js`, `eVe/intuition/runtime/media_hydration_runtime.js`, `eVe/intuition/runtime/media_mount_runtime.js`, `eVe/intuition/runtime/tool_genesis_media_runtime.js`, `eVe/intuition/runtime/tool_genesis_group_runtime.js`, `eVe/intuition/runtime/tool_genesis_projection_support_runtime.js`, `eVe/intuition/runtime/tool_genesis_lifecycle_runtime.js`, `eVe/intuition/runtime/tool_genesis_host_lifecycle_runtime.js`, `eVe/intuition/runtime/tool_genesis_core_services_runtime.js`, `eVe/intuition/runtime/tool_genesis_public_runtime.js`, `eVe/intuition/runtime/atome_host_registry_runtime.js`, `eVe/intuition/runtime/project_atome_index_runtime.js`, `eVe/intuition/runtime/tool_genesis_project_load_runtime.js`, `eVe/intuition/runtime/realtime_atome_events_runtime.js`, `eVe/intuition/runtime/tool_genesis_realtime_patch_runtime.js`, `eVe/intuition/runtime/tool_genesis_mutation_runtime.js`, `eVe/intuition/runtime/tool_genesis_bootstrap_runtime.js`, `eVe/intuition/runtime/persistence_diag_runtime.js`, `eVe/intuition/runtime/info_panel_sync_runtime.js`.

Exposure: JavaScript module exports consumed by eVe project, Matrix, media, text, export, and compositor runtimes.

Verified entry points: `normalizeRenderAtom`, `normalizeRenderAtoms`, `buildTextureCacheKey`, `buildTextCacheKey`, `buildWaveformCacheKey`, `normalizeAtomeRenderNode`, `createVirtualSceneTree`, `diffVirtualSceneTrees`, `VIRTUAL_SCENE_DIFF_TYPES`, `VIRTUAL_SCENE_DIRTY_FLAGS`, `RENDERER_ADAPTER_REGISTRY_VERSION`, `normalizeRendererAdapterKind`, `createRendererAdapterRegistry`, `registerRendererAdapter`, `getRendererAdapter`, `assertRendererAdapterKind`, `BEVY_RENDERER_ADAPTER_DEFINITIONS`, `DEFAULT_BEVY_RENDERER_ADAPTER_REGISTRY`, `createDefaultBevyRendererAdapterRegistry`, `mapVirtualSceneNodeToBevyPayload`, `mapVirtualSceneTreeToBevyPayload`, `mapVirtualSceneTransformToBevyPatch`, `mapVirtualSceneStyleToBevyPatch`, `mapVirtualSceneLayerToBevyPatch`, `parseBevyProjectionColor`, `INLINE_EDIT_SESSION_VERSION`, `INLINE_EDIT_MODES`, `INLINE_EDIT_OPENED_BY`, `INLINE_EDIT_STATUS`, `createInlineEditSession`, `assertInlineEditSession`, `updateInlineEditDraft`, `updateInlineEditOverlayAnchor`, `commitInlineEditSession`, `cancelInlineEditSession`, `readInlineEditFocusRestoration`, `INLINE_EDIT_CLOSE_OVERLAY_VERSION`, `INLINE_EDIT_CLOSE_OVERLAY_ACTIONS`, `INLINE_EDIT_CLOSE_OVERLAY_SOURCES`, `createInlineEditCloseOverlay`, `resolveInlineEditCloseOverlayAction`, `applyInlineEditCloseOverlayAction`, `createBrowserBevyMediaTextureResolver`, `createBevyMediaResourceRuntime`, `installBevyWebGpuContextDiagnostics`, `registerBevySurfaceBackgroundRuntime`, `readLatestBevySurfaceBackground`, `readLatestBevySurfaceBackgroundError`, `createUserBackgroundPatternRenderer`, `createUserSurfaceBackgroundTextureRuntime`, `startBevyWebRenderer`, `applyBevyWebRendererDiffs`, `applyBevyWebRendererSurfaceResize`, `readBevyWebRendererState`, `createRenderScene`, `hitTestRenderScene`, `createSurfaceEventRouter`, `resolveRenderSurfaceSize`, `renderSurfaceSizesMatch`, `ensureRenderSurface`, `readRenderSurfaceSize`, `updateRenderSurfaceScene`, `getRenderSurfaceState`, `ensureHiddenTextServiceRoot`, `mountActiveTextEditor`, `unmountActiveTextEditor`, `getTextServiceState`, `createUnifiedWebGPUCompositor`, `createMatrixPreviewRenderer`, `renderProjectScene`, `updateProjectSceneRecord`, `updateProjectSceneRecordByAtomeId`, `findProjectSceneByAtomeId`, `getProjectSceneState`, `hitTestProjectSceneAtClientPoint`, `collectProjectSceneAtomsInClientRect`, `beginProjectSceneTextEdit`, `commitProjectSceneTextEdit`, `cancelProjectSceneTextEdit`, `emitProjectSceneIntent`, `resizeProjectSceneRecord`, `clearProjectScene`, `clearAllProjectScenes`, `projectIdFromProjectLayer`, `isProjectSceneParent`, `renderProjectSceneRecord`, `rememberAtomeDescriptionFrame`, `resolveAtomeFrame`, `readAtomeFrameState`, `clearAtomeDescriptionFrames`, `createMediaHostIntegrityRuntime`, `rememberMediaIntegrityKindHint`, `readMediaIntegrityKindHint`, `forgetMediaIntegrityKindHint`, `isMediaIntegrityKind`, `isMediaTextualPatchKey`, `logMediaIntegrityEvent`, `createShapeSvgRuntime`, `isSvgShapeSpec`, `createGroupVisualRuntime`, `computeGroupSize`, `readGroupStepsFromProperties`, `createMediaSourceRuntime`, `isProtectedMediaUrl`, `isDirectRenderableMediaUrl`, `inferMediaSourceFromProperties`, `createMediaHydrationRuntime`, `createMediaMountRuntime`, `createToolGenesisCoreServicesRuntime`, `createToolGenesisHostLifecycleRuntime`, `createToolGenesisLifecycleRuntime`, `createToolGenesisPublicRuntime`, `createAtomeHostRegistryRuntime`, `createProjectAtomeIndexRuntime`, `createRealtimeAtomeEventsRuntime`, `createPersistenceDiagRuntime`, `createInfoPanelSyncRuntime`.

Boundary rules:

- The API consumes canonical Atome records and returns disposable render projections only.
- `virtual_scene_contract.js` is the Phase 1 bridge contract for future Bevy integration. It may describe hierarchy, diffs, dirty flags, and dense render-layer assignment derived from scene paint order, but it must remain renderer-agnostic and must not own canonical Atome state or duplicate Bevy ECS responsibilities.
- `render_atom.js` normalizes media source projection through `eVe/domains/media/shared/media_source.js` before Virtual Scene and Bevy mapping, so upload and recording sources are explicit API routes instead of relative browser paths; it also projects persisted poster data, waveform peaks, and video timeline fields as disposable render inputs without making them renderer-owned state. Video timeline projection carries `start`, `duration`, `trimIn`, `trimOut`, `offset`, `speed`, and `loop` from canonical Atome properties into `content.timeline`.
- `bevy_projection_adapter.js` is the strict one-way bridge from Virtual Scene data into browser Bevy payloads. Missing ids, kinds, positions, sizes, layers, required media sources, required textures, invalid video timeline values, or invalid fill colors are explicit errors. Browser text, raster image, SVG, persisted video-poster, and audio-waveform projection data use explicit RGBA texture payloads instead of a legacy project renderer; source-backed live video without a poster is rejected by the media resolver before readback and is handled by the dedicated Bevy video resource path, video payloads may carry normalized timeline projection for browser decode ownership, audio-waveform textures may be generated from persisted peaks or from decoded source audio, project-audio `playback_progress` is a nullable style projection used only for the Bevy waveform playhead, and Bevy layers come from the Virtual Scene dense paint order when available, with direct CSS layer values clamped to the Rust `i32` boundary before wasm-bindgen deserialization only for non-tree payloads.
- `renderer_adapter_registry.js` exposes a closed rendering-domain registry for adapter metadata. It is explicit and immutable at read boundaries: adapter kinds are normalized, renderer names are normalized, capabilities are cloned/frozen, and unsupported kinds throw through the caller-supplied projection error code.
- `bevy_renderer_adapter_registry.js` declares the default Bevy adapter metadata and kind-specific node/resource mapping callbacks for `shape`, `text`, `image`, `video`, and `audio_waveform`. `bevy_projection_adapter.js` owns common base payload validation and delegates kind-specific fields to the registered adapter.
- `inline_edit_session.js` exposes a pure state-machine contract for inline editing. It requires explicit session/project/atom ids, mode, activation source, initial value, focus origin, overlay anchor, and `tx_id`; returns immutable session objects; supports draft/overlay updates plus commit/cancel transitions; and rejects DOM nodes, functions, symbols, undefined values, invalid numbers, and non-plain objects in session metadata. `project_scene_text_runtime.js` consumes this contract for active project text editing and passes the session `tx_id` into `text.commit`.
- `inline_edit_close_overlay.js` exposes a pure disposable close-overlay contract. It derives overlay metadata from an open InlineEditSession, maps close/Escape/Enter/touch/accessibility activation to commit, cancel, or none, and returns focus-restoration data without creating Atomes, DOM nodes, selectors, ARIA attributes, or visual style state.
- `bevy_pending_media_contract.js` owns the browser Bevy pending-media decision contract: images must resolve a disposable RGBA texture before Bevy spawn, persisted video posters and waveform peaks are consumed before initial spawn, and uncached source-backed video plus waveform nodes enter Bevy with transparent pending material until the serialized resource update installs the derived non-live texture metadata or waveform texture. Live source-backed video must not be routed through RGBA readback.
- `bevy_surface_background_runtime.js` listens to the internal `eve:surface-background-changed` surface event, decodes or reuses the selected/generated background as an RGBA texture payload, and sends the non-Atome `surface_background` patch through the generated WASM export `apply_atome_bevy_surface_background`. `user_background_pattern_renderer.js` owns generated background pixel production only, while `user_surface_background_texture_runtime.js` bridges user preferences from the explicitly started `eVe/user/background.js` runtime into this Bevy payload. `eVe/eVe.js` is the boot owner that calls `startUserBackgroundRuntime()` after the `eve.user_background` module imports; missing shell view dependencies must throw there instead of becoming a silent fallback. User random background quick actions expose the closed product runtime global `window.apply_random_generated_background`, which applies generated local parameters only and must not fetch or proxy external wallpaper URLs. The explicit wallpaper download global delegates to `downloadRemoteWallpaper` so remote image retrieval, upload registration, and protected media URL creation stay server-owned before the Bevy background route consumes the result. `/api/uploads/remote-wallpaper` is Fastify-owned and must be addressed through the resolved Fastify base; it must not be posted to the local Axum/Tauri uploads server. The legacy DOM background layer is not part of this API.
- `bevy_web_renderer_runtime.js` starts the generated browser Bevy WASM renderer against the existing shared canvas, keeps one Bevy app per canvas, never adopts a started renderer state from a replaced canvas that only shares the same selector, registers the Bevy surface-background runtime only after the renderer state is stored with `started: true`, and applies Virtual Scene diffs plus surface-size patches through the generated Bevy WASM exports `apply_atome_bevy_spawn`, `apply_atome_bevy_despawn`, `apply_atome_bevy_transform`, `apply_atome_bevy_style`, `apply_atome_bevy_reparent`, `apply_atome_bevy_layer`, `apply_atome_bevy_visibility`, `apply_atome_bevy_text_metadata`, `apply_atome_bevy_resource`, `apply_atome_bevy_surface`, and `apply_atome_bevy_surface_background`. Browser Bevy projection payloads pass logical surface width/height and unscaled Virtual Scene nodes; `atome/renderers/bevy-core/src/render_math.rs` owns the fixed orthographic camera projection for those logical dimensions, and the web window uses a scale-factor override of `1.0` so monitor/browser scale does not zoom Atomes or desynchronize drag. `bevy_web_renderer_start_state.js` owns the browser event-loop ownership lock and startup state factories used to coalesce same-canvas concurrent starts while refusing a second canvas in the same page with `bevy_renderer_event_loop_already_owned`. `bevy_media_resource_runtime.js` owns immediate texture resolution, transparent pending media material, serialized deferred media texture generation, bounded deferred video retry behavior, spawn/resource/text texture mapping, and post-resize media queue resumption. `bevy_web_presentation_runtime.js` owns filtering of the known non-fatal WASM runner `unreachable` completion, bounded `request_atome_bevy_redraw` presentation primes, same-tick video-frame notification coalescing into one latest-frame WASM notify with redraw fallback only when no valid notify is sent, and WebGPU/canvas context lost/restored diagnostics on the active Bevy canvas only. `bevy_wasm_diagnostics_runtime.js` attaches generated WASM diagnostics readers to the shared Bevy perf diagnostic object, including web queue diagnostics, video backend capability reporting, and video copy/skip counters. Progress-only waveform style diffs use one redraw request instead of the heavier presentation-prime sequence. Video resolver readback and poster capture both use `eVe/domains/media/shared/video_decode_pool_runtime.js`; they must tolerate WebKit `play()` rejection outside user gestures, then reject transparent or all-black Safari/WKWebView frames as `bevy_media_texture_video_blank_frame` or an empty poster result so blank textures/posters are not applied to otherwise selectable video Atomes. These owners keep redraws and deferred resource updates inside the same Bevy canvas path without creating an alternate renderer route.
- Effectful project drag, resize, and text mutations enter as scene intents and must pass through `window.Atome.commit` or `window.Atome.commitBatch`; move frames use `gesture_frame` for realtime sharing, final drag/resize/text commits persist durable `set` state, and live drag/resize visual feedback may update disposable scene records before the durable final commit. `surface_runtime.js` converts client coordinates into render-surface logical coordinates before hit-testing so scaled canvases do not shift drag targets. `surface_pointer_runtime.js` computes resize target props with a uniform scale so active project resizes preserve aspect ratio for single Atomes and selected groups; resize hit-testing includes 5 logical px of extra inward tolerance on the right and bottom edge band without adding DOM handles. `project_scene_gesture_runtime.js` coalesces move-frame scene updates, WebGPU rerenders, and realtime `gesture_frame` commits to animation-frame cadence without becoming canonical state.
- Render surfaces are bounded by zone (`project`, `matrix`) and must not create one canvas per Atome. `readRenderSurfaceSize` exposes logical host dimensions, drawing-buffer dimensions, raw device-pixel dimensions, DPR, and optional texture clamp status separately; compositor targets must not confuse device-pixel buffer dimensions with scene coordinates.
- Project selection is transient runtime state read from `SelectionAPI.selected()` / `window.__selectedAtomeIds` by `project_scene_runtime.js`, marked on disposable projection records, mapped as a `selected` flag plus dense paint-order layer by the Virtual Scene and Bevy projection adapter, and sent through Bevy style diffs on the same project canvas. It must not be serialized into Atome properties or projected as per-Atome DOM.
- Text DOM is limited to one hidden service root and one active editor. Project text editing is exposed through project-scene text APIs and runtime state that includes the active `inline_edit_session`, not `.eve-atome-text` hosts.
- Project media diagnostics may resolve project-visible media through canonical Atome state plus `project_scene_runtime` records when the cleaned project route intentionally has no per-Atome DOM host. `media_diagnostics.js` owns the runtime report shape, `media_diagnostics_url.js` owns diagnostic URL/redaction helpers, and `media_diagnostics_probe.js` owns HTTP/probe-element checks. They must validate HTTP access plus project projection/playback only, and must not reopen the deleted MTrack editor or inspect `window.eveMtrackApi`.
- T24 cleanup boundary: inline edit, close overlay, AtomGraph, AccessibilityGraph, and AccessibilityBridgeProjection are not footer, dock, or MTraX APIs. Panel footer chrome, tool docks, and Molecule/MTraX docked runtimes must not expose or store project edit state, accessibility truth, bridge focus restoration, or graph-derived labels. Future footer/dock changes must consume canonical project scene APIs or explicit MTraX/Molecule APIs only.

Boundary status: Semi-public closed product API. It is not an Atome open framework contract until a product-neutral renderer contract is explicitly promoted.

### Native Bevy Backend Renderer API

Ownership: Tauri native platform renderer boundary.

Primary sources: `atome/renderers/bevy-core/`, `atome/shared/render_visual_tokens.js`, `platforms/desktop-tauri/Cargo.toml`, `platforms/desktop-tauri/src/bevy_backend/mod.rs`, `platforms/desktop-tauri/src/bevy_backend/bridge.rs`, `platforms/desktop-tauri/permissions/bevy-native-renderer.toml`, `platforms/ios/bevy-renderer/`, `platforms/ios/atome-auv3/Common/AtomeIosBevyRendererBridge.h`, `platforms/web/bevy-renderer/src/lib.rs`, `eVe/domains/rendering/bevy_native_renderer_runtime.js`.

Exposure: Rust library module exported when Cargo feature `bevy_backend` is enabled; Tauri `bevy_renderer_core` exposes the native Bevy scene/ops command bridge but that embedded bridge reports `presentable:false` until a real native presenter is wired to the project surface. The JavaScript runtime therefore uses the visible Bevy/WebGPU canvas path in Tauri WebView unless the host explicitly declares `window.__ATOME_NATIVE_BEVY_PRESENTABLE__ === true`. iOS/AUv3 exposes `bevy_native_start(surface_id, width, height, scene)`, `bevy_native_apply_ops(surface_id, ops)`, and `bevy_native_resize(surface_id, width, height)` through `window.__ATOME_IOS_NATIVE_INVOKE`; the WebView remains the application shell and host surface, but project Bevy dispatch stays native on iOS when that bridge exists. Xcode builds and links the `platforms/ios/bevy-renderer` Rust staticlib before Swift compilation; Swift calls `atome_ios_bevy_renderer_status(...)` and `atome_ios_bevy_scene_probe(...)` so the Xcode console distinguishes `rust_linked=1` from `presentable=0`. A successful iOS scene probe is not enough to claim visual rendering: while the Metal/Bevy presenter is absent, Swift returns `ios_bevy_native_not_presentable` with `renderer_mode=linked_no_presenter`, and the JavaScript projection records a non-visible native render result without selecting a Web/WASM fallback. Standalone native window presentation belongs to `bevy_renderer_native` and `run_atome_bevy_native(...)`. Tauri exposes the same native Bevy command endpoints through the `bevy-native-renderer` capability permission set; the JavaScript IPC payload uses Tauri camelCase keys (`surfaceId`) for those Rust `surface_id` parameters. Native IPC scenes carry media sources, text, and waveform peaks without browser-side RGBA texture decoding, so Swift/Rust receives the scene before platform media loading is attempted. Browser exposure is the `squirrel-bevy-renderer` WASM module and its `run_atome_bevy_renderer(canvas_selector, width, height, initial_scene)`, `request_atome_bevy_redraw()`, `notify_atome_bevy_video_frame(id, frame_version)`, `read_atome_bevy_web_diagnostics()`, and diagnostics reset/capability exports.

Verified entry points: `AtomeRenderScene`, `AtomeRenderNode`, `AtomeRenderOp`, `AtomeEntityId`, `AtomeLogicalSize`, `AtomeLogicalPosition`, `AtomeLayer`, `AtomeRenderKind`, `AtomeMediaSource`, `AtomeSelected`, `AtomeSelectionOverlay`, `AtomeEntityTable`, `AtomeRendererDiagnostics`, `SelectionVisualStyle`, `AtomeBevyRendererConfig`, `AtomeBevyRendererPlugin`, `apply_render_ops`, `atome_ios_bevy_renderer_status`, `atome_ios_bevy_scene_probe`, `bevy_native_start`, `bevy_native_apply_ops`, `bevy_native_resize`, `startBevyNativeRenderer`, `applyBevyNativeRendererDiffs`, `applyBevyNativeRendererSurfaceResize`, `shouldUseNativeBevyRenderer`, `AtomePowerProfile`, `AtomeRenderActivity`, `AtomeWinitSettings`, `AtomeUpdateMode`, `AtomePresentMode`, `AtomeRedrawRequest`, `AtomeFrameCounter`, `AtomeBevyPowerState`, `parse_atome_power_profile`, `atome_power_profile_from_env`, `atome_winit_settings_for_profile`, `atome_winit_settings_for_activity`, `atome_present_mode_for_profile`, `bevy_winit_settings_for_profile`, `bevy_present_mode_for_profile`, `apply_atome_power_activity`, `request_atome_redraw`, `should_write_transform`, `trace_is_idle_mutation`, `expected_updates_per_minute`, `AtomeNativeBevyRendererConfig`, `build_atome_bevy_embedded_app`, `build_atome_bevy_app`, `run_atome_bevy_native`, `ATOME_RENDER_VISUAL_TOKENS`, `getAtomeRenderSelectionVisualStyle`.

Boundary rules:

- The API consumes explicit projection data derived from canonical Atome records.
- It may map logical position to Bevy `Transform` and logical size/layer to disposable Bevy ECS components.
- It may expose low-power Bevy policy values for `ATOME_POWER_PROFILE=eco|balanced|performance`; eco is the default, balanced mirrors desktop-app behavior, and performance/continuous behavior is opt-in.
- Renderer features may create a Bevy window/surface as the active native rendering surface. That surface must consume projection data from canonical Atome records and must not run alongside another renderer for the same Atomes.
- Bevy audio features remain disabled; Atome Kira remains the single audio engine and may be exposed later through an explicit resource/event bridge instead of a second playback engine.
- WASM/browser Bevy APIs live in `platforms/web/bevy-renderer/` rather than the desktop Tauri crate, because the desktop crate includes native server/runtime dependencies that are not valid for `wasm32-unknown-unknown`.
- Browser Bevy projection currently supports shape, text, raster image, SVG, persisted video-poster, source-backed live video, audio waveform projection data, video timeline projection, selected-state style patches, and nullable audio waveform playback-progress style patches. Browser text/media payloads may include explicit RGBA texture data for non-live resources; source-backed live video bypasses the RGBA resolver and is represented in Bevy as an external-texture mesh path instead of a Bevy `Image` upload. The hidden browser decode source runtime keeps its decode root and `HTMLVideoElement` resources fully transparent under `#eve_bevy_video_decode_root`, applies video timeline projection to the source element before external-texture import, uses `requestVideoFrameCallback` as the active-playback frame pump when available, and keeps RAF only as fallback: trim seek, trim-end enforcement, offset, playback speed, and loop inside the trimmed source window. The WASM renderer turns accepted RGBA payloads into Bevy `Image` assets for non-live media, while selected-state and audio-progress patches rebuild disposable Bevy overlay entities inside the same canvas. Browser/WASM progress-only style ops are coalesced per Atome before the Bevy update drain so live audio playback cannot build an obsolete playhead queue. Browser/WASM Winit policy is reactive desktop-app mode with explicit EventLoopProxy wakeups and `RequestRedraw` messages; continuous update mode is not the default web route.
- Live project video is part of the browser/WASM Bevy API through the Virtual Scene render-node, transform, style, resource, hidden decode-source, and external-texture path. The old direct `AtomeVideoTrack` / `AtomeVideoTransform` / `VideoTrack*` mutation API and the WASM exports `apply_atome_bevy_video_track(...)`, `remove_atome_bevy_video_track(...)`, and `update_atome_bevy_video_transform(...)` are deleted and must not be reintroduced. `AtomeRenderNode` and `AtomeTransformPatch` carry local transform fields with serde defaults, `AtomeRenderNode` carries optional initial `uv_rect`, and `AtomeResourcePatch` carries tri-state `uv_rect` so resource updates can set, preserve, or clear crop rectangles. Browser projection accepts normalized `uvRect` / `uv_rect` and pixel `sourceRect` / `source_rect` / `cropRect` / `crop_rect` values, converting pixel crop rectangles through natural media size before sending Bevy `uv_rect`; it also forwards Virtual Scene `localTransform.scaleX`, `scaleY`, `rotation`, `originX`, and `originY` through standard Bevy payloads and transform patches. Video timeline fields are normalized and validated on the JavaScript projection/browser decode boundary, then applied to the hidden `HTMLVideoElement` source before the Bevy external-texture import. `AtomeStylePatch` carries opacity, filters, transitions, and playback progress for Virtual Scene style diffs so browser runtime mutations reach the same WASM style export. Browser Bevy projection accepts only normal/source-over blending; unsupported advanced modes such as `add`, `multiply`, and `screen` fail with `bevy_projection_blend_mode_unsupported:<id>:<mode>` instead of silently falling back to normal. `atome/renderers/bevy-core/src/video_external_texture.rs`, `atome/renderers/bevy-core/src/video_external_web.rs`, and `atome/renderers/bevy-core/assets/shaders/video_external.wgsl` own the current product video import/draw/sampling path. The external-texture component carries the current compositor layer, current per-track opacity, normalized crop `uv_rect`, color filters, and transition parameters; source-backed video meshes opt out of automatic 2D batching and rebuild UV coordinates from the canonical crop rectangle, while `render_math.rs` and `render_ops.rs` apply local scale/rotation/origin to the Bevy `Transform` without mutating canonical Atome state. The web RenderApp queues external-video phase items by the extracted layer and binds one material uniform so z-index, transform, crop, opacity, filters, and transitions are represented in the same Bevy canvas route. `atome/renderers/wgpu-web-external-texture/` owns the maintained Web `wgpu` backend fork that adds browser media source descriptors, `GPUDevice.importExternalTexture`, and external-texture bind-group resource mapping for the web renderer Cargo graph. The pure JavaScript `GPUExternalTexture` preview/probe path is a diagnostic reference only and must not be promoted into an eVe project-rendering API or side compositor. `read_atome_bevy_video_backend_capabilities()` is diagnostics-only; schema `atome.bevy.web.video_backend.v7` reports target and live backend `gpu_external_texture_texture_external`, `current_backend_final:true`, browser `GPUDevice.importExternalTexture` availability, true Web `wgpu` create/source/resource support from the maintained fork, blocker `none`, true product external-texture import and `texture_external` sampling, and false live RGBA and visible DOM overlay capabilities. `read_atome_bevy_video_copy_diagnostics()` and `reset_atome_bevy_video_copy_diagnostics()` are diagnostics-only counters for legacy copy pressure and skip-reason tracking; they do not describe the active source-backed live video route and do not add a second video-track API.
- Redraw requests must be explicit and transform writes must be gated by dirty interaction, animation, resize, video-frame notification, or external state causes rather than idle timers. Browser video-frame notifications are coalesced before crossing the WASM boundary, and the web renderer applies video-frame redraw requests without an extra wake after the queued notification already woke the reactive loop. Web diagnostics expose wake calls, redraw request/apply counts, and accepted/applied video-frame redraw counts so probes can separate idle loop cost from playback pressure. `window.__EVE_BEVY_PERF__` is an internal diagnostics object, not a product rendering API; `externalRenderEvents`/`external_render_events` and `videoFrameEvents`/`video_frame_events` keep high-frequency external render and video-frame event logging opt-in so normal probes measure the production-default path.
- It must not own canonical Atome state, mutation ordering, persistence, replay, sync, or renderer selection.
- Browser/WASM bridging must consume `eVe/domains/rendering/virtual_scene_contract.js` projection data wrapped as an `AtomeRenderScene` with shared Atome visual tokens rather than duplicating a second virtual scene owner.

Boundary status: Internal feature-gated Rust renderer API.

### eVe Clipboard Tool APIs

Ownership: eVe closed product tools over the Atome commit boundary.

Primary sources: `eVe/intuition/tools/copy.js`, `eVe/intuition/tools/paste.js`, `eVe/intuition/tools/clipboard/`, and `eVe/intuition/tools/shared/atome_record_utils.js`.

Exposure: registered UI actions `ui.copy.action` and `ui.paste.action`, plus existing runtime globals `window.eve_copy_selection`, `window.eve_paste_selection`, and `window.eveClipboardStore`.

Verified responsibilities: clipboard group state, persisted clipboard Atome payloads, shared eVe tool-side Atome record normalization through `tools/shared/atome_record_utils.js`, optional system clipboard writes for user-owned Atomes, paste event generation, and paste panel selection/drag-drop integration. Copy no longer reads selection through deleted `window.eveMtrackApi.getSelectedClipAtomeIds`; paste no longer routes through deleted `window.eveMtrackApi.pasteFromClipboard`; `window.eve_copy_selection` and `window.eve_paste_selection` remain the product clipboard entrypoints.

Boundary rules:

- Durable clipboard persistence must use `window.Atome.commit`.
- Shared record helpers must stay outside `clipboard/` so delete, copy, paste, and future tool surfaces do not keep parallel Atome record projection code.
- Pasted Atome creation must use `window.Atome.commitBatch`.
- Clipboard payloads must keep project, parent, type, owner, selection, and media render aliases out of durable `props`.

Boundary status: Closed product tool API. It consumes the eVe Atome commit boundary and must not duplicate open server/database persistence contracts.

### eVe Project Media Import Runtime API

Ownership: eVe closed product runtime over the project drop and Atome commit boundaries.

Primary source: `eVe/intuition/runtime/project_media_import_runtime.js`.

Exposure: JavaScript module exports consumed by eVeIntuition flower-menu import and the capture import tool.

Verified entry points: `invokeProjectMediaImport`, `requestProjectImportFiles`, `resolveCurrentProjectImportTarget`, `buildProjectImportAnchorEvent`.

Boundary rules:

- File selection is UI intent collection only; durable media creation is delegated to `eVe/intuition/tools/project_drop.js` through `importFilesToProjectViaCreator`, implemented by `project_drop_external_runtime.js` through the canonical `ui.creator` gateway. During RF-02, project-drop internals are split into closed focused runtimes: media/drop normalization (`project_drop_media_runtime.js`), Finder payload resolution (`project_drop_finder_payload_runtime.js`), drop-event/project-layer resolution (`project_drop_event_runtime.js`), drop-zone attach/destroy/reset (`project_drop_zone_runtime.js`), main-ribbon trash/drop session state (`project_drop_main_toolbox_session_runtime.js`), projected tool catalog/type/palette resolution (`project_drop_tool_catalog_runtime.js`), projection palette child hydration/expand/collapse/visibility sync (`project_drop_projection_palette_runtime.js`), projection slider relayout/value apply routing (`project_drop_projection_slider_runtime.js`), projection drag ghost-image creation/cleanup (`project_drop_projection_drag_preview_runtime.js`), tool-projection instance drag/move/delete/toolbox-reinsert persistence (`project_drop_projection_move_runtime.js` plus `project_drop_projection_move_flower_guard.js`), the projection dynamic toolbox handle gesture (`project_drop_toolbox_handle_drag_runtime.js`), the projection dynamic toolbox proximity rebalancer/container builder (`project_drop_toolbox_rebalance_runtime.js`), the grouped toolbox container chrome build/refresh + cap stepping (`project_drop_toolbox_chrome_runtime.js`), projection tool visual mounting (`project_drop_tool_visual_mount_runtime.js`), Finder/tool record drop handling (`project_drop_finder_record_drop_runtime.js`), projected tool button latch/icon/payload state (`project_drop_tool_button_state_runtime.js`), projection global event delegation (`project_drop_delegation_runtime.js`), and projection host geometry/clustering leaf helpers (`project_drop_projection_host_geometry_runtime.js`). These modules are internal eVe implementation owners, not new open APIs.
- The runtime may use the native iOS/AUv3 document picker, browser file picker, or hidden input picker only as file-selection surfaces.
- Temporary iOS/AUv3 import diagnosis logs were removed after the import and Bevy projection path was validated; this runtime now exposes the same import entry points without Xcode-console spam.
- It must not persist Atome state, upload files, or render media directly.
- The delegated media creation path must preserve the selected project id through the canonical commit envelope and project scene records, not DOM parent inference.

Boundary status: Closed product runtime API. It centralizes project media import intent collection for eVe UI tools and preserves the canonical project drop creation path.

### eVe Capture Tool Runtime API

Ownership: eVe closed capture tool runtime boundaries.

Primary sources: `eVe/intuition/tools/capture.js`, `eVe/intuition/tools/capture_source_runtime.js`, `eVe/intuition/tools/capture_preview_session_runtime.js`, `eVe/intuition/tools/capture_quick_record_runtime.js`, `eVe/intuition/tools/capture_fullscreen_runtime.js`, `eVe/intuition/tools/capture_fullscreen_chrome_runtime.js`, `eVe/intuition/tools/capture_reveal_runtime.js`, `eVe/intuition/tools/capture_export_geometry.js`.

Exposure: JavaScript module exports consumed by the capture tool facade and Intuition runtime registration.

Verified entry points: `createCaptureSourceRuntime`, `createCapturePreviewSessionRuntime`, `createCaptureQuickRecordRuntime`, `createCaptureFullscreenRuntime`, `createCaptureFullscreenChromeRuntime`, `createCaptureRevealRuntime`, `resolveCaptureExportGeometry`.

Boundary status: Closed product tool runtime API. Capture selection, preview, quick-record, fullscreen, and reveal owners may collect UI intent and projection-only preview state, but durable media Atome creation remains delegated to the existing media/import/recording commit paths.

### eVe Panel Tool Registration Runtime API

Ownership: eVe closed Intuition panel tool registration boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/panel_tool_registration_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` during boot registration.

Verified entry point: `registerPanelUiToolsRuntime`.

Boundary rules:

- The runtime registers existing panel surface tools only and keeps actual panel open/close behavior in injected panel callbacks.
- It may read `PANEL_SURFACE_DEFINITIONS` for canonical tool IDs and surface IDs but must not create duplicate panel definitions or alternate panel state.
- It must preserve the boot registration order before basic UI tools so existing runtime lookup remains deterministic.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral panel registration contract.

### eVe Main Tool Latched State Runtime API

Ownership: eVe closed Intuition main-tool visual/latched state resolution boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/main_tool_latched_state_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` when resolving main tool activation state.

Verified entry point: `createMainToolLatchedStateRuntime`.

Boundary rules:

- The runtime may read runtime tool APIs, cached latch state, menu alias families, visible panel surfaces, and disposable tool button DOM state.
- It must not invoke tools, open panels, mutate durable Atome state, or create alternate latch caches.
- Canonical latch writes remain owned by `tool_latched_state_runtime.js`; this runtime is read-only state resolution.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral tool-state contract.

### eVe Main Tool Selection Guard Runtime API

Ownership: eVe closed Intuition selection-required tool policy boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/main_tool_selection_guard_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` when blocking selection-required main tool activation without a target.

Verified entry point: `createMainToolSelectionGuardRuntime`.

Boundary rules:

- The runtime may read the canonical selection snapshot and may un-latch a blocked tool through the injected latch sync.
- It owns the selection-required key/tool-id policy for vector and record-action style tools; consumers must ask this runtime instead of duplicating the required-key set.
- It must not invoke tools, synthesize selection, or create fallback activation behavior when no target exists.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral selection capability contract.

### eVe Main Menu Runtime APIs

Ownership: eVe closed Intuition main-menu composition, content declaration, auth, catalog, and registration boundary.

Primary sources: `eVe/intuition/runtime/eve_intuition/main_menu_runtime.js`, `main_menu_content_runtime.js`, `main_menu_auth_runtime.js`, `main_tool_interaction_runtime.js`, `main_tool_latched_state_runtime.js`, `main_tool_selection_guard_runtime.js`, and `main_tool_registration_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` during boot menu construction.

Verified entry points: `createMainMenuRuntime`, `createMainMenuContentRuntime`, `createMainMenuAuthRuntime`, `createMainToolCatalogRuntime`, `createMainToolInteractionRuntime`, `createMainToolLatchedStateRuntime`, `createMainToolSelectionGuardRuntime`, and `createMainToolRegistrationRuntime`.

Boundary rules:

- The composite runtime owns the closed main-menu wiring and receives product callbacks by injection.
- The content runtime owns the content object for the main Intuition menu.
- The visible main sequence is `home`, `find`, `time`, `communicate`, `mode`, and `view`; unimplemented no-op/demo tools must not be exposed.
- It must not create fallback handlers, alternate tool buses, or non-Bevy atom renderers.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral menu declaration contract.

### eVe Main Tool Interaction Runtime API

Ownership: eVe closed Intuition main-tool interaction and catalog policy boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/main_tool_interaction_runtime.js`.

Exposure: JavaScript module exports consumed by `eVe/intuition/eVeIntuition.js` and main tool registration.

Verified entry points: `createMainToolCatalogRuntime`, `createMainToolInteractionRuntime`.

Boundary rules:

- The runtime owns main tool id resolution, dedicated declaration ids, base Atome-tool filtering, and canonical `triggerMainToolInteraction` dispatch.
- It may synchronize latch state only through injected canonical latch APIs and may block selection-required tools only through the injected selection guard.
- It must not reintroduce hidden diagnostic tools, fallback activation, or duplicate main-tool handler tables.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral tool interaction contract.

### eVe Finder Inline Runtime API

Ownership: eVe closed Intuition Finder inline and Finder panel bridge boundary.

Primary sources: `eVe/intuition/runtime/eve_intuition/finder_inline_runtime.js`, `eVe/intuition/runtime/eve_intuition/finder_tool_identity_runtime.js`, `eVe/intuition/runtime/eve_intuition/finder_inline_visual_runtime.js`.

Exposure: JavaScript module exports consumed by `eVe/intuition/eVeIntuition.js`, `tool_window_bridge_runtime.js`, panel tool registration, main tool definitions, and atome edit footer tool invocation.

Verified entry points: `createFinderInlineRuntime`, `createFinderToolIdentityRuntime`, `createFinderInlineVisualRuntime`.

Boundary rules:

- Finder identity normalization and projection-instance recovery live only in `finder_tool_identity_runtime.js`.
- Disposable inline input styling lives only in `finder_inline_visual_runtime.js`.
- Finder inline open/close/search and panel wrapper behavior live only in `finder_inline_runtime.js`; callers must use returned functions instead of duplicating Finder DOM searches.
- The runtime may project transient inline input DOM but must not create canonical Atome state, alternate Finder stores, or non-Bevy atom rendering paths.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral Finder/search bridge contract.

### eVe Atome Edit Footer Runtime APIs

Ownership: eVe closed Intuition Atome-edit footer model, rendering, drag, palette, slider, fullscreen, state, and invocation boundaries.

Primary sources: `eVe/intuition/runtime/eve_intuition/atome_edit_footer_runtime.js`, `atome_edit_footer_lifecycle_runtime.js`, `atome_edit_footer_model_runtime.js`, `atome_focus_fullscreen_runtime.js`, `atome_edit_footer_drag_runtime.js`, `atome_edit_footer_palette_runtime.js`, `atome_edit_footer_slider_runtime.js`, `atome_edit_footer_tool_state_runtime.js`, `atome_edit_footer_child_invocation_runtime.js`, `atome_edit_footer_definition_invocation_runtime.js`, and `atome_edit_footer_row_render_runtime.js`.

Exposure: JavaScript module exports consumed by `eVe/intuition/eVeIntuition.js`; these are closed product runtime seams, not public Atome APIs.

Verified entry points: `createAtomeEditFooterRuntime`, `createAtomeEditFooterLifecycleRuntime`, `createAtomeEditFooterModelRuntime`, `createAtomeFocusFullscreenRuntime`, `createAtomeEditFooterDragRuntime`, `createAtomeEditFooterPaletteRuntime`, `createAtomeEditFooterSliderRuntime`, `createAtomeEditFooterToolStateRuntime`, `createAtomeEditFooterChildInvocationRuntime`, `createAtomeEditFooterDefinitionInvocationRuntime`, and `createAtomeEditFooterRowRenderRuntime`.

Boundary rules:

- Footer model/state policy, persisted footer tools, project-playback availability, and catalog definition projection live in `atome_edit_footer_model_runtime.js`.
- The composite runtime is the only `eVeIntuition.js` footer entrypoint; footer row DOM rendering, palette children, sliders, drag payloads, focus/fullscreen layout, lifecycle/show/hide, and record-action visual state are split by responsibility and must not be re-inlined into `eVeIntuition.js`.
- All footer invocations must go through the injected canonical tool invokers and selection guards; these runtimes must not create alternate tool buses, fallback invocation paths, or non-Bevy atom renderers.
- Atome-editor footer drags continue to use the canonical `application/x-eve-finder-record` payload and active tool drag session only.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral footer/tool-surface contract.

### eVe Basic UI Tool Registration Runtime API

Ownership: eVe closed Intuition runtime tool registration boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/basic_ui_tools_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` during boot registration.

Verified entry point: `registerBasicUiToolsRuntime`.

Boundary rules:

- The runtime registers basic UI/catalog tools only; it receives existing menu, panel, selection, text creation, matrix, orientation, and item-state callbacks by injection instead of creating alternate owners.
- Media transport registration remains delegated to `media_reader_tool_runtime.js`; this runtime only preserves the existing boot registration order.
- It must not mutate durable Atome state except through the injected existing creation/update callbacks already owned by the Intuition runtime and tool base.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral tool-registration contract.

### eVe Text Tool Runtime APIs

Ownership: eVe closed Intuition text Atome editing, creation, and background input boundaries.

Primary sources: `eVe/intuition/runtime/eve_intuition/text_tool_runtime.js`, `text_tool_editing_runtime.js`, `text_tool_create_runtime.js`, and `text_tool_background_runtime.js`.

Exposure: JavaScript module exports consumed by `eVe/intuition/eVeIntuition.js` during boot registration.

Verified entry points: `createTextToolRuntime`, `createTextToolEditingRuntime`, `createTextToolCreateRuntime`, `createTextToolBackgroundRuntime`.

Boundary rules:

- The composite runtime owns shared text-tool coordinator state and project-id resolution.
- Text editing owns focus, caret, provisional adoption, cleanup, buffered insert, and immediate commit helpers for text Atomes.
- Text creation owns text-tool mode state, menu toggle handling, drag create sessions, exact-frame creation, and project-scene text-edit entry.
- Background runtime owns project-background click and keyboard text creation routing through canonical `invokeTool` and text session APIs.
- These runtimes must not create fallback DOM renderers, bypass Atome commit/update APIs, or render atoms outside the Bevy/WebGPU canvas route.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral text editing/creation contract.

### eVe Panel Actions Runtime API

Ownership: eVe closed Intuition panel/action orchestration boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/panel_actions_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js`, main-menu composition, and boot registration.

Verified entry point: `createPanelActionsRuntime`.

Boundary rules:

- The runtime owns standard panel open routing, generated panel operation binding, canonical Home/Matrix/Delete/Undo/Orientation actions, and Intuition item enabled-state updates.
- It must use the injected panel surface/open-settle APIs and must not create alternate panel registries or tool buses.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral panel action contract.

### eVe Flower Context Items Runtime API

Ownership: eVe closed Flower/context menu item resolution boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js`.

Exposure: JavaScript module exports consumed by `eVe/intuition/eVeIntuition.js` during Flower context runtime installation and footer invocation wiring.

Verified entry points: `createFlowerContextItemsRuntime`, `CONTEXT_BOUND_TRANSPORT_TOOL_IDS`, `resolveAtomeEditFooterDefinitionToolId`.

Boundary rules:

- The runtime owns Flower item construction, mixed-selection/media/text/project context routing, and strict transport-bound extra input construction.
- It may dispatch through injected canonical delete/import/context-tool invokers only; it must not create a second tool bus or fallback transport route.
- The shared context-bound transport id set must stay here so footer and Flower payload policies remain identical.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral context-menu contract.

### eVe Atome Edit Footer Selection Runtime API

Ownership: eVe closed Atome-edit footer selection and invocation payload boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/atome_edit_footer_selection_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` and injected into footer row/child/definition runtimes.

Verified entry point: `createAtomeEditFooterSelectionRuntime`.

Boundary rules:

- The runtime owns footer selection normalization, publication, and `extraInput` selection/atome id payload construction.
- It may publish selection only through the existing SelectionAPI/eveToolBase/event surfaces; it must not create alternate canonical selection state.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral selection payload contract.

### eVe Context Tool Invocation Runtime API

Ownership: eVe closed footer/Flower/main-ribbon context invocation boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/context_tool_invocation_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` and injected into footer/Flower/main-ribbon handlers.

Verified entry point: `createContextToolInvocationRuntime`.

Boundary rules:

- The runtime owns unified context invocation normalization and main-ribbon definition invocation.
- It must delegate through the injected canonical `invokeToolFromUiButton`; no alternate tool bus, shim, or fallback invocation path is allowed.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral context invocation contract.

### eVe Intuition Boot Runtime API

Ownership: eVe closed Intuition boot, warmup, registration, and debug exposure boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/boot_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` at module boot.

Verified entry point: `installEveIntuitionBootRuntime`.

Boundary rules:

- The runtime owns boot-time window menu exposure, auth sync, panel surface registration, Flower/footer/vector/draw installation, non-critical module warmup, UI tool registration, footer API exposure, and debug runtime installation.
- It must receive all product callbacks by injection and must not own Bevy/WebGPU rendering, durable Atome state, or tool implementation behavior.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral boot registration contract.

### eVe Selected Project Media Playback Runtime API

Ownership: eVe closed product runtime over the project scene and Atome audio boundaries.

Primary sources: `eVe/domains/media/selected_project_media_playback_runtime.js`, `eVe/intuition/runtime/eve_intuition/media_reader_tool_runtime.js`.

Exposure: JavaScript module exports consumed by the eVeIntuition media reader tool runtime; registered tool IDs `ui.media.reader`, `ui.animation.reader`, `ui.play`, `ui.pause`, and `ui.stop`.

Verified entry points: `runSelectedProjectMediaPlaybackAction`, `stopAllSelectedProjectMediaPlayback`, `registerMediaReaderToolRuntime`.

Boundary rules:

- The runtime resolves selected media from `project_scene_runtime` records because the cleaned project canvas route intentionally has no per-Atome media DOM host.
- Audio playback and extracted video-audio playback must go through `Squirrel.av.audio` and the Kira playback facade. It must not instantiate a second audio engine or enable Bevy audio.
- Project Audio Atome playback and extracted video-audio playback use Kira `play_instance`/`stop_instance` when available so pressing the play tool while media is active pauses the current voice and preserves a runtime-only position; the next play/toggle resumes from that position with `startSeconds`. For video Atomes, that position is read from the project timeline playback result so Bevy video decode and extracted audio resume from the same playhead. Explicit `stop` still clears the project playback runtime and resets progress.
- Browser video presentation uses the shared video decode pool plus disposable project-scene record updates so Bevy/WebGPU remains the visible route. The decode element is an implementation resource, not a visible Atome host or canonical media state.
- `media_reader_tool_runtime.js` is the closed eVeIntuition registration owner for the media/animation reader tools. It may call `setBevyVideoDecodePlayback(...)` for selected project video targets; `selected_project_media_playback_runtime.js` must not call that Bevy decode control directly.
- eVeIntuition must not route play/pause/stop/toggle through deleted `window.eveMtrackApi` transport methods, `scope=mtrack` forced transport, selected-group timeline loading, selected-group DOM video/audio sequence transport, or selected-Atome DOM `video/audio` transport. Active media transport must use selected project media or project automation; selected-group montage transport stays closed until the Bevy/WebGPU editor owns it.
- It must not persist playback frame data, mutate durable Atome properties, or use DOM media nodes as canonical selection/project state.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral AV transport contract plus native presenter capability tests.

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

Primary sources: `atome/src/squirrel/ai/agent_gateway.js`, `atome/src/squirrel/ai/default_tools.js`, `atome/src/squirrel/ai/default_tools_adole.js`, `atome/src/squirrel/ai/default_tools_bank.js`, `atome/src/squirrel/ai/default_tools_calendar.js`, `atome/src/squirrel/ai/default_tools_contacts.js`, `atome/src/squirrel/ai/default_tools_mail.js`, `atome/src/squirrel/ai/default_tools_share.js`, `atome/src/squirrel/ai/model_catalog_registry.js`, `atome/src/squirrel/ai/model_catalog_refresh.js`, `atome/src/squirrel/ai/provider_client.js`, `atome/src/squirrel/ai/trace_store.js`, `atome/src/squirrel/atome/mcp.js`, the internal `mcp_*` helper/handler modules, and `atome/src/squirrel/atome/runtime_tool_resolution.js`.

Exposure: `AtomeAI` tool registration, MCP protocol runtime, model catalog, provider client, trace store, and the default tools coordinator plus domain registration modules that bridge to Adole, communication services, and eVe runtime tools. The MCP public surface remains the global `handleAtomeMCPRequest` and `handleAtomeMCPRequestAsync`; the `mcp_*` modules are internal implementation owners for core state, security policy, platform bridges, resources/prompts, runtime invocation, communication helpers, and handler groups.

Verified responsibilities: tool registry, audit log, proposals, idempotency, risk tiers, toolchain limits, output schemas, parameter validation, MCP events, operations, confirmations, proposals, rate limits, sandbox profiles, and security journal.

Boundary status: Open orchestration contract. Calls into eVe tool runtime must go through registered runtime capability boundaries.

### Voice APIs

Ownership: Atome open voice runtime.

Primary sources: `atome/src/squirrel/voice/bootstrap.js`, `atome/src/squirrel/voice/service.js`, the internal `service_*` helper/runtime modules, `atome/src/squirrel/voice/orchestrator.js`, the internal `orchestrator_*` helper/runtime modules, `atome/src/squirrel/voice/tool_router.js`, `atome/src/squirrel/voice/ai_planner.js`, `atome/src/squirrel/voice/ai_planner_runtime_context.js`, `atome/src/squirrel/voice/main_handle_bridge.js`, `atome/src/squirrel/voice/home_surface.js`, and the focused `home_surface_*` helper/runtime modules.

Exposure: voice bootstrap modules, runtime services, tool router, communication surfaces, AI planner, main handle bridge, orchestrator facade, and home surface contract. The voice service public surface remains `createVoiceService`, `VOICE_V1_PROVIDER_DECISION`, and `resolveVoiceProviders`; the `service_*` modules are internal implementation owners. The orchestrator public surface remains `createVoiceOrchestrator`, `VoiceOrchestrator`, and `resolveVoiceExecutionBridge`; the `orchestrator_*` modules are internal implementation owners. The home surface exposes only `mountHomeVoiceSurface`; its helper/runtime modules are internal implementation owners.

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

Primary sources: `eVe/intuition/tools/core/tool_registry.js`, `eVe/intuition/tools/core/tool_runtime.js`, `eVe/intuition/tools/core/tool_instances.js`, `eVe/intuition/tools/core/tool_definition_ssot.js`, `eVe/intuition/tools/core/tool_interaction.js`, `eVe/intuition/tools/index.js`, `eVe/intuition/runtime/shared_project_override_runtime.js`, `eVe/intuition/runtime/implicit_gesture_commit_runtime.js`, `atome/src/squirrel/components/tool_slider_builder.js`, `eVe/intuition/shared/slider_tool_content.js`, `eVe/intuition/shared/slider_tool_dom.js`, `eVe/intuition/shared/tool_drag.js`, `eVe/intuition/projection/button.js`, `eVe/intuition/tools/ui/tool_button_factory.js`, `eVe/intuition/tools/ui/tool_button_params.js`.

Exposure: closed product runtime installed under `window.atome.tools`, plus tool registry/runtime module exports.

Verified responsibilities: tool definition registration/update, protected system-tool contract reconciliation, tool invocation, action routing, tool instance creation, persistence flows, Finder/tool projection helpers, latch, selection propagation, interaction routing, main view-mode intention routing through `tool.main.view` plus `ui.view.mode.list`, `ui.view.mode.table`, and `ui.view.mode.natural`, main mode-palette intention routing through `tool.main.mode` plus `tool.main.perform`, `ui.mode.edit`, and `ui.mode.consume`, the visible time-palette calendar route through `tool.main.time` plus `ui.calendar.panel`, and consumption of the canonical Atome-owned product-tool slider runtime. `tool_runtime_registered_handler.js`, `tool_runtime_atome_ops.js`, `tool_runtime_creator_media.js`, and `tool_runtime_context.js` own registered-handler bridge state, bootstrap Atome operations, creator media sizing, and runtime context construction consumed by `tool_runtime.js`; they remain internal eVe implementation modules, not new open APIs. `tool_button_params.js` owns normalized/serialized tool-button parameter payloads consumed by `tool_button_factory.js` and `menu/core/toolbox_runtime.js`. `shared/tool_drag.js` owns the canonical `application/x-eve-finder-record` MIME constant and active tool-drag session payload writes. Finder/tool drag payloads between `finder.js` and `project_drop.js`, main toolbox drags, Flower drags, projection strip drags, ribbon drags, and Atome-editor footer tool drags in `eVeIntuition.js` use only that MIME contract plus the active tool drag session, not a `text/plain` / `eve-tool:` mirror payload. Deleted MTraX tool IDs (`tool.main.mtrack`, `ui.mtrack.panel`, `ui.mtrax.open`, `ui.mtrack.clip_selection`, `ui.automation`, `ui.split`, `ui.join`, `ui.timeline_split`, `ui.crop`, `ui.mute`, `ui.solo`) are not registered by `tool_runtime.js`, `eVeIntuition.js`, or tool-latch alias groups. `ui.move` is not an MTraX clip API; it is owned by `tool_runtime.js` as the generic `v2_move` Finder/arrange route and must persist position plus parent/project metadata through Atome commit props. `ui.delete.selection` is the project delete/black-hole action and must not call deleted MTraX timeline or SVG-layer delete APIs; `delete.js` owns the action/drop wiring, `delete/blackhole_runtime.js` owns sanitized delete/restore commits plus Bevy project-scene cleanup/update, and `delete/panel_view.js` owns row rendering. Delete-panel row restore controls use the shared eVe button component, may not expose deleted Atome ids through row `data-*` metadata, and use only the canonical `application/x-eve-atome` drag payload rather than text MIME restore fallbacks; delete cleanup must resolve DOM removal through canonical `getAtomeElement(...)` rather than raw legacy DOM ids. `window.eveSvgLayerApi` is project-SVG-layer only; the layer panel must not read, select, add, or delete MTrack preview SVG layers through deleted `window.eveMtrackApi` routes. Tool buttons and UI interaction dispatch must not intercept play/pause/stop into deleted `window.eveMtrackApi` transport methods.

Verified shared slider runtime responsibilities:

- `atome/src/squirrel/components/tool_slider_builder.js` exports the canonical slider DOM/data-role selector contract, shared direct-drag controller, and expanding-square slider-tool runtime behavior.
- `eVe/intuition/shared/slider_tool_content.js` is the product wrapper that injects ribbon text tokens into the Atome-owned tool-slider runtime.
- `eVe/intuition/shared/slider_tool_dom.js` is a compatibility re-export surface for existing eVe imports; the unused `slider_direct_drag.js` re-export shim was removed.

Verified shared project override entry points: `createSharedProjectOverrideRuntime`, `fetchSharedOverrideAtomes`, `setSharedProjectOverride`, `getSharedProjectOverride`, `removeSharedProjectOverride`, `listSharedOverrideIdsForProject`, `resetSharedOverrides`.

Verified implicit gesture commit entry points: `createImplicitGestureCommitRuntime`, `emitCommitBatch`, `resolveImplicitGestureDispatch`, `shouldSkipImplicitGesturePhase`.

Boundary status: Closed product API. Atome AI/MCP may invoke it only through explicit runtime tool resolution and capability checks.

Known constraints: `tool_runtime.js` is a critical oversized legacy file. Do not expand it without reduction ownership.

### eVe Molecule APIs and Removed MTraX APIs

Ownership: eVe closed.

Primary sources: `eVe/core/media_engine/` and `eVe/domains/media/shared/extracted_video_audio_source.js`.

Exposure: `window.Molecule`, `window.eveMediaApi`, and JavaScript module exports for internal runtimes. The MTraX window APIs (`window.eveMtrackApi`, `window.open_mtrack_panel`, `window.close_mtrack_panel`) are deleted and must not be used as active integration surfaces.

Atome-to-Molecule open requests are routed through a source-layered request path (`atome_mtrack_open_request`) rather than being semantically bound to the originating double-click event. The current UI trigger may still be double-click, but downstream MTraX/Molecule open handling must key on the request source layer so the trigger can be moved later without changing panel/runtime semantics. This route must not auto-create MTraX group Atomes; until the Bevy/WebGPU editor rewrite lands, it may only resolve existing group/timeline context or fail explicitly.

Verified entry points:

- Molecule engine/API: `createMoleculeEngine`, `ensureMoleculeEngine`, `getMoleculeCommandCatalog`, `createMoleculeApi`, `ensureMoleculeApi`, `ensureMoleculeMediaRuntime`.
- Molecule tool modules: track-type registry, timeline schemas, reducers, session registry, persistence controller, media resolver, panel runtime, gestures, recording, nesting, and multi-instance controllers.
- Molecule track-type registry: `DEFAULT_MOLECULE_TRACK_TYPE_REGISTRY`, `createMoleculeTrackTypeRegistry`, `MOLECULE_TRACK_TYPE_IDS`, `MOLECULE_CLIP_TYPE_IDS`, `isMoleculeTrackKind`, and `isMoleculeClipKindAllowedOnTrack` are internal kernel exports. They own built-in video/audio/image/text/automation track definitions and clip compatibility for Molecule; they are not public Atome APIs.
- Molecule time model: `DEFAULT_MOLECULE_TEMPO`, `normalizeTempoMap`, `createTimeReference`, `secondsToMusical`, `musicalToSeconds`, and `normalizeTimelineTimeModel` are internal kernel exports. They own tempo-map normalization and dual seconds/musical references for Molecule snapshots; seconds remain the render/seek truth and musical time is editing metadata for later API/MCP operations.
- Molecule timeline operation API: `window.eveMoleculeTimelineApi` exposes the active group timeline bridge (`readGroupTimeline`, `applyGroupTimelineOperation`, `applyGroupTimelineBatch`, `listOpenGroupTimelines`) backed by Molecule sessions. `eve.timeline.*` AI tools and `ui.timeline.*` runtime tools delegate to this bridge; MCP policy gates them through `timeline.read` and `timeline.write`.
- Molecule timeline render API (V1.5): `window.eveMoleculeTimelineApi.renderTimelineScene({ project_id, timeline | group_id+steps, playhead_seconds? })` renders a timeline (track lanes, clip blocks, playhead) onto the single Bevy/WebGPU project surface `#eve_surface_project`, and `clearTimelineScene({ project_id })` removes it. Pure render path (no persistence stores required) routed through `eVe/intuition/runtime/molecule_timeline_scene_bridge.js` → `project_scene_runtime.js` `updateProjectSceneRecords`; timeline content is never rendered as DOM. Scrub is driven by re-rendering with a new `playhead_seconds`.
- Molecule session stores (V1.8): `window.Atome.moleculeStores = { projectStore, eventStore }` is installed at boot by `eVe/intuition/runtime/molecule_stores.js`. A Molecule timeline persists canonically inside the Atome model — the owner group atome carries the snapshot in its `molecule_timeline` property, written through `window.Atome.commit`, so each timeline edit is one deterministic Time Machine entry (D6). `openGroupTimeline`/`applyGroupTimelineOperation`/`applyGroupTimelineBatch` now run the real session backed by these stores, persisting + re-rendering the canvas on every committed edit; there is no parallel timeline store.
- Removed MTraX window API: the deleted `createMtrackWindowApiRuntime` / `createWindowApiBridgeRuntime` family no longer owns transport, recording, clip editing, SVG-layer, preview, or visual style routing.
- MTraX ruler rendering helpers: `ruler_canvas_runtime.js` exposes internal major-step and visible tick-window helpers for canvas-backed ruler rendering. This is a rendering implementation boundary, not a public timeline API.
- DOM projection guardrails: `npm run check:dom-projection-guardrails` scans maintained DOM fixtures under `tests/fixtures/dom` by default; pass `--paths` to audit explicit legacy/debug captures.
- Media projection helpers: `eVe/domains/media/shared/media_projection_state.js` exposes internal host-local media source and identifier readers/writers for renderer binding. This is not a durable media API and must not replace Atome properties, media stores, or persistence services.
- Media API shared helpers: `eVe/domains/media/api/media_api_shared.js` remains the import facade for media capture/playback API helpers; `media_api_auth.js` owns auth/backend URL/protected streaming query helpers, and `media_api_local_availability.js` owns local media synchronization and availability checks. These helpers expose `/api/uploads`, `/api/recordings`, and `/api/extract-audio` handling only through the maintained media API route contracts and must not reintroduce MTraX media naming or fallback media routes.
- Asset-box upload facade: `eVe/domains/media/asset_box.js` keeps the internal product imports used by project-drop/background/contact tools (`inferUploadAtomeType`, `looksLikeSvgUploadShape`, `createUploadAtome`, `sendFileToServer`) while delegating runtime/auth resolution to `asset_box_auth.js`, upload/download transport to `asset_box_upload_transport.js`, Atome persistence/listing to `asset_box_atome_store.js`, media type/dimension inference to `asset_box_media.js`, and disposable upload-panel UI to `asset_box_panel_dom.js` / `asset_box_panel_render.js`. These APIs write plain media Atomes through the canonical commit path and must not introduce MTraX grouping or fallback media routes.
- Media Atome integrity helpers: `eVe/domains/media/shared/media_atom_integrity.js` exposes internal validation and normalization for project media Atomes before persistence/rendering. It enforces stable source, audio/video duration, visual refs, and pending visual status while preserving the separation between Atome `kind` and renderable `media_kind`.
- Preview registry helpers: `eVe/domains/mtrax/preview/preview_registry_runtime.js` exposes the internal derived-cache API used by clip preview renderers (`register`, `get`, `release`, `has`, `rebuildFromState`). The API returns opaque `preview_*` identifiers for DOM projection and must not be treated as canonical media state.
- Group projection state helpers: `eVe/intuition/shared/group_state_runtime.js` exposes host-local group steps, timeline, and preview readers/writers for renderers. These helpers are an internal projection boundary only; durable group data must still come from Atome properties and timeline persistence APIs.
- MTraX karaoke detail: `detail_runtime.js` owns domain detail state and mutation application; `detail_record_schedule_state.js` owns the selection-only record-schedule detail projection. The Intuition detail panel keeps its closed UI action registration in `eVe/intuition/tools/detail_actions.js` for `ui.detail.karaoke.apply`, `ui.detail.record.toggle`, and `ui.detail.timecodes.toggle`; those actions remain UI/tool-gateway surfaces and must not bypass the karaoke host API or canonical tool runtime.
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
- WebSocket auth actions on `/ws/api`: `request-phone-verification`, `verify-phone-verification`.
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
- History and projection: `appendEvent`, `appendEvents`, `listEvents`, `getEvent`, `getStateCurrent`, `listStateCurrent`, `rebuildStateCurrentFromEvents`, `buildHistoryTransactions`, `classifyHistoryEvent`, `normalizeHistoryEvent`, `resolveHistoryCursor`, `selectUndoTransaction`, `selectRedoTransaction`, `createStateSnapshot`, `listStateSnapshots`, `getStateSnapshot`.
- Snapshots: `createSnapshot`, `getSnapshots`, `restoreSnapshot` (legacy single-atome adapter that appends a `set` event).
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

Evidence: exports and globals in `atome/src/squirrel/ai/agent_gateway.js`, `atome/src/squirrel/ai/default_tools.js`, the `atome/src/squirrel/ai/default_tools_*.js` domain registration modules, and `atome/src/squirrel/atome/mcp.js`. The `mcp_*` modules are imported by `mcp.js` / `mcp_handlers.js` and do not add public MCP API entry points.

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

Status: Public orchestration surface; individual default tool names should be regenerated from `default_tools.js` plus `default_tools_*.js` before building a formal registry.

#### Public Voice API Details

Visibility: Public framework service APIs.

Evidence: exports in `atome/src/squirrel/voice/index.js`, `bootstrap.js`, `service.js`, `orchestrator.js`, `tool_router.js`, `ai_planner.js`, `ai_planner_runtime_context.js`, `session_runtime.js`, `working_memory.js`, `semantic_contract.js`, `telemetry.js`, `vad.js`, and the home-surface public mount entry in `home_surface.js`. The `service_*` and `orchestrator_*` modules are imported by their facades and do not add public voice API entry points.

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
- Panel API: `openPanelSurface`, `closePanelSurface`, and panel surface exports from `panel_api.js`; eVeIntuition-specific surface registration and PanelCreatorV2 bridging live in `runtime/eve_intuition/panel_surface_runtime.js`. The deleted MTraX docked-panel preservation path (`preserveDockedMount` / `isDockedMtrackPanelElement`) and MTraX-only panel close/latch diagnostics are not active API behavior.
- Diagnostics: `window.__DEBUG__` is installed by `runtime/eve_intuition/debug_runtime.js` and remains an internal eVe diagnostic facade for app snapshots, footer state, selection state, project-layer state, persistence diagnostics, and deterministic test mode.
- Closed window bridges: `window.__eveTextTool` and `window.__eveFinderUiRuntime` are installed by `runtime/eve_intuition/tool_window_bridge_runtime.js`. They expose text-tool creation/background-editing hooks and Finder inline/panel control only inside the eVe product runtime; they are not Atome open APIs, persistent state owners, or rendering routes.
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

Evidence: exports in `eVe/elements/design.js`, the `eVe/elements/eVe_look.js` facade over `eVe/elements/look/*`, `eVe/elements/system_ui_tokens.js`, `eVe/elements/design/panel_chrome.js`, `panel_chrome_tokens.js`, and the `dialog_runtime.js` facade over dialog drag, geometry, reveal, and viewport runtimes; `window.eveUI` install in `design.js`.

Entry point families:

- Dialog and panel factories: `createEveDialog`, `revealEveDialog`, `createEveCloseControl`, panel chrome helpers, bounds helpers, fullscreen helpers with viewport resize tracking only while fullscreen is active, and chrome-scoped fullscreen double-click handles.
- UI primitives: rows, buttons, inputs, editable text, text helpers, and `eveUI` namespace. `createEveButton(...)` accepts `truncateText: false` only for composed visual buttons that own child layers instead of plain text clamping.
- Tokens and presets: system UI tokens, eVe tokens, CSS variable application, base style installation, panel chrome tokens and metrics.
- i18n binding helpers for visible text.

Owner: eVe closed design layer.

Use only from: eVe product UI and closed panels/tools.

Status: Semi-public product design API. Exact function names must be verified in `design.js` before use because the file is large and exports many helpers.

#### Molecule Runtime APIs and Deleted MTraX Runtime APIs

Visibility: Semi-public closed product APIs.

Evidence: module exports and globals in `eVe/core/media_engine/`, plus the removed-domain cleanup recorded in `todo/full_bevy_renderer.md`.

Entry points:

- Molecule engine/API: `createMoleculeEngine`, `ensureMoleculeEngine`, `getMoleculeCommandCatalog`, `createMoleculeApi`, `ensureMoleculeApi`, `ensureMoleculeMediaRuntime`.
- Molecule globals: `window.Molecule.engine`, `window.Molecule.api`, `window.Molecule.media`, `window.Molecule.createSession`, `window.Molecule.getSession`, `window.Molecule.disposeSession`, `window.Molecule.describeApi`, `window.Molecule.execute`, `window.Molecule.listCommands`, `window.eveMediaApi`, and `window.eveMoleculeTimelineApi`.
- Molecule session history/API: `createMoleculeSession` exposes `apply`, `applyBatch`, `applyTimelineOperation`, `copyClips`, `cutClips`, `pasteClips`, `duplicateClips`, `undo`, `redo`, `canUndo`, `canRedo`, and `getHistory`; persistence and multi-instance controllers expose timeline-scoped undo/redo helpers so molecule edits do not depend on global Atome selection.
- Timeline tools: `eve.timeline.read`, `eve.timeline.operation`, `eve.timeline.batch`, named `eve.timeline.*` verbs, `ui.timeline.read`, `ui.timeline.batch`, and named `ui.timeline.*` verbs are the active programmable timeline surfaces. `ui.timeline.*` definitions are registered by `eVe/intuition/tools/timeline_actions.js`; Molecule runtime files only provide the timeline session bridge.
- Deleted MTraX window API creators: `createMtrackWindowApiRuntime` and `createWindowApiBridgeRuntime` were removed with the MTraX domain.
- Deleted MTraX globals: `window.open_mtrack_panel`, `window.close_mtrack_panel`, and `window.eveMtrackApi` are not active API surfaces.
- Deleted MTraX bridge routing: Intuition tool invocation and selection-style application no longer route visual tools through `eveMtrackApi.applyClipVisualTool`.
- Removed MTraX clip-edit APIs: clip split/join/crop, clip selection, track mute/solo, hidden timeline split, timeline automation APIs, deleted-editor footer controls (`ui.mtrack.footer_control`, `ui.mtrack.loop_cells`, `ui.mtrack.clone`, `ui.mtrack.delete`, `ui.mtrack.follow*`, `ui.mtrack.loop`, `ui.mtrack.hzoom`, `ui.mtrack.vzoom`, `ui.mtrack.snap`, `ui.mtrack.tempo`), deleted panel/open actions (`ui.mtrax.open`, `ui.mtrack.panel`), deleted public tool id `tool.main.mtrack`, old `ensureMtrackPanelModule` loading/export, `window.eveMtrackApi` optional routes, MTrax preview metadata events, MTrax group timeline payload builders, `mtrax_timeline*` fallback aliases, deleted docked-panel preservation (`preserveDockedMount`, `isDockedMtrackPanelElement`, MTraX close/latch diagnostics), deleted Atome-editor MTrack footer embedding (`mtrackHost`, `mtrackExpanded`, `MTRACK_FOOTER_ANCHOR_UPDATE_EVENT`, `mtrack-host`, `data-mtrack-open`), deleted legacy DOM footer socket/placement APIs (`ensureAtomeEditFooterRoot`, `setAtomeEditFooterVisibility`, layout locks, resize observers, socket close button), deleted eVeIntuition Flower/footer/default/warmup `mtrack` exposure, deleted `mtracks`/`mtrax` footer-kind aliases, deleted mtrack preview-text creation, stale `tool_ui.mtrack.*` boot cleanup, deleted `tool_runtime.js` bootstrap mtrack diagnostics, deleted `mtrack_preview_text_*` text-create behavior, deleted `project_drop.js` native file routing to `window.eveMtrackApi` plus MTrack projection latch special cases, deleted clipboard selection through `window.eveMtrackApi.getSelectedClipAtomeIds`, deleted `resolveMtrackToolScope` routing, deleted MTrack delete routing through `window.eveMtrackApi.deleteSelection` / `deleteSvgLayer`, deleted MTrack SVG-layer manifest/select/add routing through the layer panel and vector layer listeners, deleted media diagnostics that reopened MTrack or read `window.eveMtrackApi`, deleted MTrack transport interception through tool buttons / UI interaction dispatch, deleted selected-group DOM media transport (`groupPlaybackState`, `playGroupTransport`, `pauseGroupTransport`), and deleted `window.__DEBUG__` MTrack timeline/GPU readers are no longer callable/runtime API behavior until the editor is rebuilt on the Bevy/WebGPU path. The old MTraX `ui.move` shim was removed; `ui.move` remains only as the generic Finder/arrange `v2_move` tool. `eVeIntuition.js` must not register `group_timeline_api`; that API is owned by the Molecule runtime.

Owner: eVe closed product media workflow.

Use only from: Molecule product UI, product tools, runtime bridge, and targeted diagnostics.

Status: Molecule remains a semi-public closed product API. MTraX APIs are removed and residual stale callers are cleanup targets, not supported surfaces.

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
- Video recording session preview contract: `startVideoRecordingSession` starts recording first, then passes the returned recording `MediaStream` to `createVideoPreviewRenderer`; `createVideoPreviewRenderer` renders supplied streams through the WebGPU preview renderer without acquiring a second camera stream, and only releases preview-registry streams it acquired itself.

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

- Tool core implementation helpers such as SVG draw model functions, SVG draw DOM/commit helpers, SVG vector edit DOM/refresh/mutation helpers, latch aliases, palette behavior, finder projection helpers, record action state helpers, and canonical tool invocation helpers.
- `__moleculeTestUtils`, `__moleculeApiTestUtils`, and other `__*TestUtils` exports.
- Removed MTraX helper families are not valid internal dependencies; use Bevy/WebGPU project rendering and media-domain helpers instead.

Owner: eVe closed implementation modules.

Use through: eVe semi-public runtime APIs, Molecule API, or tests.

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
