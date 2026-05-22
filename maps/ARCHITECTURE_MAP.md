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
- Panel source-of-truth ownership: `eVe/intuition/panel_definitions.js` owns panel surface metadata and `PanelCreatorV2` owns lifecycle execution. Tool runtime and menu surfaces must consume those contracts instead of declaring independent panel routing tables.
- Intuition layer ordering is centralized in `eVe/intuition/runtime/layer_contract.js`: project tools, floating project palettes, Molecule/dialog panels, component/docked palettes, main ribbon, active drag.
- Shared product-tool slider ownership now lives in the open Atome/Squirrel component layer at `atome/src/squirrel/components/tool_slider_builder.js`; eVe consumers must use that owner through the shared wrapper/re-export surfaces instead of keeping feature-local slider DOM or gesture logic.

Dependency direction:

- eVe may consume Atome open contracts.
- eVe may own closed adapters around product workflows.
- eVe must not reimplement generic Atome security, server, sync, persistence, communication, or audio contracts.
- eVe closed APIs must not be promoted to Atome without an explicit open contract, tests, and map updates.

Canonical extension points:

- `eVe/intuition/runtime/` for closed UI/tool runtime surfaces.
- `eVe/intuition/tools/core/` for tool registry, runtime, interaction, and tool definition SSOT.
- `eVe/intuition/tools/` for product tools.
- `eVe/elements/` for product design factories, tokens, and i18n-bound UI construction.
- `eVe/domains/*/api/` for closed domain APIs.
- `eVe/core/*_store/` for closed product store adapters.
- `eVe/domains/mtrax/` and `eVe/intuition/tools/molecule/` for closed Molecule/MTraX workflows.

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
