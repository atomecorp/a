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

## Boundary Rules

Atome open APIs live under `atome/`, `server/`, and `database/` when they are product-neutral. They own core Squirrel APIs, authenticated storage, Atome object/event/state contracts, product-neutral communication services, security, AI/MCP, voice, audio, sync, server routes, and database adapters.

eVe closed APIs live under `eVe/`. They own product UI, private tools, product stores, Molecule/MTraX workflows, media editing runtimes, panels, branding, and product composition.

Atome must not contain eVe UI, private product workflows, or product-only tool composition. eVe must not duplicate generic Atome security, server, sync, or cross-platform contracts.

## Verified API Families

### Squirrel Utility API

Ownership: Atome open.

Primary sources: `atome/src/squirrel/apis.js`, `atome/src/squirrel/apis/essentials.js`, `atome/src/squirrel/apis/utils.js`, `atome/src/squirrel/apis/loader.js`.

Exposure: JavaScript module exports and default `Apis` object.

Verified entry points: `wait`, `current_platform`, `dataFetcher`, `render_svg`, `fetch_and_render_svg`, `resize`, `strokeColor`, `fillColor`, `sanitizeSVG`.

Boundary status: Open framework helpers. Keep product-neutral.

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

Primary sources: `eVe/intuition/tools/core/tool_registry.js`, `eVe/intuition/tools/core/tool_runtime.js`, `eVe/intuition/tools/core/tool_instances.js`, `eVe/intuition/tools/core/tool_definition_ssot.js`, `eVe/intuition/tools/core/tool_interaction.js`, `eVe/intuition/tools/index.js`.

Exposure: closed product runtime installed under `window.atome.tools`, plus tool registry/runtime module exports.

Verified responsibilities: tool definition registration/update, tool invocation, action routing, tool instance creation, persistence flows, Finder/tool projection helpers, latch, selection propagation, and interaction routing.

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

Verified entry points:
- Molecule engine/API: `createMoleculeEngine`, `ensureMoleculeEngine`, `getMoleculeCommandCatalog`, `createMoleculeApi`, `ensureMoleculeApi`, `ensureMoleculeMediaRuntime`.
- Molecule tool modules: timeline schemas, reducers, session registry, persistence controller, media resolver, panel runtime, gestures, recording, nesting, and multi-instance controllers.
- MTraX window API: `createMtrackWindowApiRuntime`, `createWindowApiBridgeRuntime`, transport, recording, clip move/crop, track record source, misc, and record-state runtimes.

Boundary status: Closed product media workflow. Public promotion requires a deliberate Atome media contract and tests.

Known constraints: MTraX/Molecule naming remains transitional and is tracked in later execution tasks.

## Required Follow-Up Work

The next execution tasks must refine this map by:
- Creating `maps/ARCHITECTURE_MAP.md`.
- Listing public, semi-public, and internal APIs without hallucination or duplication.
- Making map consultation mandatory before future implementation.
- Adding automated validation for map/source consistency where practical.
