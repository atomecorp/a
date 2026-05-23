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

Primary sources: `atome/src/squirrel/apis.js`, `atome/src/squirrel/apis/essentials.js`, `atome/src/squirrel/apis/utils.js`, `atome/src/squirrel/apis/loader.js`, `atome/src/squirrel/apis/dragdrop.js`.

Exposure: JavaScript module exports and default `Apis` object.

Verified entry points: `wait`, `current_platform`, `dataFetcher`, `render_svg`, `fetch_and_render_svg`, `resize`, `strokeColor`, `fillColor`, `sanitizeSVG`, `DragDrop.createDropZone`, `DragDrop.collectFilesFromDataTransfer`, `DragDrop.summarizeFiles`.

Boundary status: Open framework helpers. Keep product-neutral.

### Squirrel Bootstrap and Component Registry API

Ownership: Atome open.

Primary sources: `atome/src/squirrel/spark.js`, `atome/src/squirrel/components/button_builder.js`, `atome/src/squirrel/components/slider_builder.js`, `atome/src/squirrel/components/tool_slider_builder.js`, `atome/src/squirrel/components/input_builder.js`, `atome/src/squirrel/components/console_builder.js`.

Exposure: runtime bootstrap through the Squirrel component registry installed by `spark.js`.

Verified responsibilities:

- Load and register canonical Squirrel system controls.
- Expose the canonical registry to runtime consumers through the Squirrel bootstrap globals.
- Provide the current canonical Atome-owned control set for Button, Slider, ToolSlider, Input, and Console.

Boundary status: Open framework component contract. eVe wrappers may compose these controls but should not redefine their core system-control contract in parallel.

### Adole Browser API

Ownership: Atome open.

Primary sources: `atome/src/squirrel/apis/unified/adole_apis.js`, `atome/src/squirrel/apis/unified/adole.js`, `atome/src/squirrel/apis/unified/adole_api/`.

Exposure: `AdoleAPI` module export and browser/global use where bootstrap installs it.

Verified namespaces: `auth`, `projects`, `activities`, `atomes`, `sharing`, `sync`, `machine`, `security`.

Boundary status: Open application/data API. eVe tools may consume it, but must not replace its auth, project, object, or sync semantics with product-local fallbacks.

Known constraints: `atome/src/squirrel/apis/unified/adole.js` is a large legacy surface and requires targeted verification before mutation.

### Server HTTP and WebSocket APIs

Ownership: Atome open server layer.

Primary sources: `server/server.js`, `server/auth.js`, `server/atomeRoutes.orm.js`, `server/mailRoutes.js`, `server/sharing.js`, `server/userFiles.js`, `server/visio.js`, `server/wsApiState.js`, `server/wsSend.js`, `server/serverIdentity.js`.

Verified route families:

- Health and diagnostics: `/health`, `/healthz`, `/__whoami`, `/dev/state`, `/dev/client-log`, `/client-log`, `/dev/snapshot`.
- Authentication and identity: `/api/auth/*`, `/api/server/identity`, `/api/server/verify`, `/api/server/status`.
- Atome object and state: `/api/atome/*`, `/api/events`, `/api/events/commit`, `/api/events/commit-batch`, `/api/state_current`, `/api/snapshots`.
- Uploads and protected files: `/api/uploads`, `/api/uploads/chunk`, `/api/uploads/complete`, `/api/uploads/:file`, `/api/files/*`, `/api/recordings/:file`, `/api/extract-audio/:file`.
- Mail gateway: `/api/eve/mail/sync`, `/api/eve/mail/send`, `/api/eve/mail/mark-read`, `/api/eve/mail/archive`, `/api/eve/mail/delete`.
- Admin/database/visio: `/api/admin/users/export`, `/api/admin/users/import`, `/api/db/status`, `/api/db/stats`, `server/visio.js` routes, `/ws/visio`.
- WebSocket APIs: `/ws/api`, `/ws/sync`.

Boundary status: Open server infrastructure. Route names containing `eve` currently exist for product mail integration and must be reviewed before being treated as stable open API names.

Known constraints: `server/server.js`, `server/auth.js`, and `server/sharing.js` are oversized legacy files. Do not expand them without reduction ownership.

### Database and Object Persistence API

Ownership: Atome open data layer.

Primary sources: `database/adole.js`, `database/driver.js`, `database/index.js`.

Exposure: JavaScript module exports for database adapters and object persistence helpers.

Verified entry points:

- Driver lifecycle: `connect`, `getDatabase`, `getDriverType`, `isSqlite`, `isLibsql`, `closeDatabase`.
- Serialization: `serializeJson`, `deserializeJson`.
- Object aliases: `createObject`, `getObject`, `getObjectById`, `getObjectsByOwner`, `getObjectChildren`, `updateObject`, `deleteObject`.
- Property aliases: `setProperty`, `setProperties`, `getProperty`, `getProperties`, `deleteProperty`, `getPropertyHistory`, `restorePropertyVersion`.
- Data source access: `getDataSourceAdapter`.

Boundary status: Open persistence contract. eVe closed stores may use it through explicit adapters, not by duplicating persistence rules.

Known constraints: `database/adole.js` is a critical oversized legacy file and must be reduced before feature growth.

### Security and Sync APIs

Ownership: Atome open.

Primary sources: `atome/security/trusted_keys.js`, `atome/security/serverVerification.js`, `atome/security/cloudSync.js`, `atome/security/syncQueue.js`, `atome/src/squirrel/security/bootstrap.js`, `atome/src/squirrel/security/token_vault.js`.

Verified responsibilities: trusted server metadata, fingerprint lookup, server verification, cloud sync status, sync queue behavior, token vault bootstrap, and token vault tests.

Boundary status: Open framework security. eVe may call these contracts but must not own product-specific bypasses.

### Communication Service APIs

Ownership: Atome open services with eVe closed UI consumers.

Primary sources: `atome/src/squirrel/mail/bootstrap.js`, `atome/src/squirrel/mail/service.js`, `atome/src/squirrel/contacts/bootstrap.js`, `atome/src/squirrel/contacts/service.js`, `atome/src/squirrel/calendar/bootstrap.js`, `atome/src/squirrel/calendar/service.js`, `atome/src/squirrel/bank/bootstrap.js`, `atome/src/squirrel/bank/service.js`.

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

Primary sources: `atome/src/squirrel/voice/bootstrap.js`, `atome/src/squirrel/voice/service.js`, `atome/src/squirrel/voice/orchestrator.js`, `atome/src/squirrel/voice/tool_router.js`, `atome/src/squirrel/voice/ai_planner.js`, `atome/src/squirrel/voice/main_handle_bridge.js`, `atome/src/squirrel/voice/home_surface.js`.

Exposure: voice bootstrap modules, runtime services, tool router, communication surfaces, AI planner, main handle bridge, and home surface contract.

Boundary status: Open voice orchestration with closed eVe surfaces injected where product UI is required. Voice mutations must route through tool/runtime contracts, not direct state mutation.

### Audio and AV Runtime APIs

Ownership: Atome open.

Primary sources: `atome/src/application/audio_runtime/audio.facade.js`, `atome/src/application/audio_runtime/audio_playback_api.js`, `atome/src/application/audio_runtime/audio_recording_api.js`, `atome/src/application/audio_runtime/av_contracts.js`, `atome/src/application/audio_runtime/play_record_core.js`, `atome/src/application/audio_runtime/runtime_audio_backend.js`, `atome/src/application/audio_runtime/stt_api.js`.

Exposure: `Squirrel.av.audio`, `Squirrel.av.devices`, `Squirrel.av.codec`, `Squirrel.av.graph`.

Verified facade methods: `on`, `off`, `set_backend`, `get_backend`, `get_runtime`, `detect_and_set_backend`, `create_clip`, `destroy_clip`, `play`, `play_instance`, `stop`, `stop_instance`, `stop_clip`, `jump`, `set_param`, `map_midi`, `add_marker`, `remove_marker`, `set_marker_follow_actions`, `clear_marker_follow_actions`, `query_clip`, `createRecordingSession`, `prepareRecordingSession`, `armRecordingSession`, `startRecordingSession`, `stopRecordingSession`, `listAudioInputs`, `listAudioOutputs`, `selectAudioInput`, `selectAudioOutput`, `createAudioProfile`, `createAudioNode`.

Boundary status: Open media runtime contract. eVe media and MTraX code should consume this facade for product playback/recording instead of owning engine semantics.

Known constraints: `play_record_core.js` is above the normal size threshold and must be reduced when touched.

### eVe Tool Runtime APIs

Ownership: eVe closed.

Primary sources: `eVe/intuition/tools/core/tool_registry.js`, `eVe/intuition/tools/core/tool_runtime.js`, `eVe/intuition/tools/core/tool_instances.js`, `eVe/intuition/tools/core/tool_definition_ssot.js`, `eVe/intuition/tools/core/tool_interaction.js`, `eVe/intuition/tools/index.js`, `atome/src/squirrel/components/tool_slider_builder.js`, `eVe/intuition/shared/slider_tool_content.js`, `eVe/intuition/shared/slider_tool_dom.js`, `eVe/intuition/shared/slider_direct_drag.js`, `eVe/intuition/projection/button.js`, `eVe/intuition/tools/ui/tool_button_factory.js`.

Exposure: closed product runtime installed under `window.atome.tools`, plus tool registry/runtime module exports.

Verified responsibilities: tool definition registration/update, protected system-tool contract reconciliation, tool invocation, action routing, tool instance creation, persistence flows, Finder/tool projection helpers, latch, selection propagation, interaction routing, and consumption of the canonical Atome-owned product-tool slider runtime.

Verified shared slider runtime responsibilities:

- `atome/src/squirrel/components/tool_slider_builder.js` exports the canonical slider DOM/data-role selector contract, shared direct-drag controller, and expanding-square slider-tool runtime behavior.
- `eVe/intuition/shared/slider_tool_content.js` is the product wrapper that injects ribbon text tokens into the Atome-owned tool-slider runtime.
- `eVe/intuition/shared/slider_tool_dom.js` and `eVe/intuition/shared/slider_direct_drag.js` are compatibility re-export surfaces for existing eVe imports.

Boundary status: Closed product API. Atome AI/MCP may invoke it only through explicit runtime tool resolution and capability checks.

Known constraints: `tool_runtime.js` is a critical oversized legacy file. Do not expand it without reduction ownership.

### eVe Store APIs

Ownership: eVe closed product persistence layer.

Primary sources: `eVe/core/event_store/`, `eVe/core/project_store/`, `eVe/core/media_store/`, `eVe/core/browser_store/`, `eVe/core/tauri_store/`, `eVe/core/ios_store/`.

Verified entry points: `createEventStore`, `createMemoryEventAdapter`, `createProjectStore`, `createMemoryProjectAdapter`, `createMediaStore`, `createMemoryMediaAdapter`, `buildMediaRef`, `validateProbe`, `validateRuntimeAssets`.

Boundary status: Closed product stores unless a product-neutral persistence contract is explicitly promoted into Atome.

### eVe Molecule and MTraX APIs

Ownership: eVe closed.

Primary sources: `eVe/core/media_engine/`, `eVe/intuition/tools/molecule/`, `eVe/domains/mtrax/api/`, `eVe/domains/mtrax/clips/`, `eVe/domains/mtrax/preview/`, `eVe/domains/mtrax/audio/`, `eVe/domains/mtrax/timeline/`.

Exposure: `window.Molecule`, `window.eveMediaApi`, `window.eveMtrackApi`, `window.open_mtrack_panel`, `window.close_mtrack_panel`, and JavaScript module exports for internal runtimes.

Atome-to-Molecule open requests are routed through a source-layered request path (`atome_mtrack_open_request`) rather than being semantically bound to the originating double-click event. The current UI trigger may still be double-click, but downstream MTraX/Molecule open handling must key on the request source layer so the trigger can be moved later without changing panel/runtime semantics.

Verified entry points:

- Molecule engine/API: `createMoleculeEngine`, `ensureMoleculeEngine`, `getMoleculeCommandCatalog`, `createMoleculeApi`, `ensureMoleculeApi`, `ensureMoleculeMediaRuntime`.
- Molecule tool modules: timeline schemas, reducers, session registry, persistence controller, media resolver, panel runtime, gestures, recording, nesting, and multi-instance controllers.
- MTraX window API: `createMtrackWindowApiRuntime`, `createWindowApiBridgeRuntime`, transport, recording, clip move/crop, track record source, misc, and record-state runtimes.
- MTraX dropped-video import: `addClipFromEntry` keeps the public drop entry point and delegates linked audio creation to the existing descriptor media resolver with `audio_source_role: video_audio`.

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

Evidence: `eVe/core/atome_commit.js` attaches methods to `window.Atome` and `window.__atomeCommitApi`.

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

- Mail: `createGlobalMailApi`, `bootstrapGlobalMail`, `createMailService`, `createMailIndex`, `createMailSyncState`, `createMailConnectorContract`, `createIcloudMailConnector`, `normalizeIcloudMailRecord`, `createNodeIcloudImapClient`, `createNodeIcloudSmtpClient`.
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

Evidence: exports in `atome/src/squirrel/voice/index.js`, `bootstrap.js`, `service.js`, `orchestrator.js`, `tool_router.js`, `ai_planner.js`, `session_runtime.js`, `working_memory.js`, `semantic_contract.js`, `telemetry.js`, and `vad.js`.

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

Status: Public framework API; `play_record_core.js` is oversized and must be reduced when touched.

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
- Panel API: `openPanelSurface`, `closePanelSurface`, and panel surface exports from `panel_api.js`.
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
