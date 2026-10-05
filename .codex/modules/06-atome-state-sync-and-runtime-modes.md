# Atome Model, State, History, Synchronization, and Runtime Modes

Applicable to Atome state, mutations, persistence, synchronization, replay, rights, and runtime contracts; also required when rendering or interactions touch those contracts. The project core and common method have already been read. Repository paths below are relative to the main atome/eVe project root.

## Canonical Atome model

Read the normative [Atome structure contract](../../atome/documentations/atome_structur_to_respect.md) for any change to Atome creation, validation, mutation, persistence, synchronization, replay, or rendering. All objects and concepts in eVe are Atomes; a view node, renderer, or external wrapper is not a replacement for the logical object.

The canonical description contains `id`, `type`, optional `kind`, optional `renderer`, `meta`, `traits`, and `properties`:

- `id` is globally immutable; `type` is canonical and selects the owning definition, schema, defaults, derived traits, and validation.
- Optional `kind` is validated or derived by the server against the type definition. `renderer` is a non-authoritative projection hint within the shared Bevy/WebGPU route, never a logical type, permission, state owner, or alternate visible backend.
- Keep the model minimal, explicit, schema-driven, and deterministic. Include only canonical data needed for deterministic creation, persistence, replay, synchronization, auditability, and rendering.
- Unknown properties require explicit schema authorization. Do not add view-local, DOM-local, renderer-local, debug-local, or convenience fields, serialized particle trees, or large payload mirrors.
- `atome.create` must include every physical characteristic required for replay and reconstruction, including geometry, layout, styling, media references, and deterministic initialization. Missing essential properties make creation invalid for persistence/replay.
- When `parent_id` is omitted, ordinary creation attaches the Atome to the current project. Explicit account-global operations must follow the distinct scope semantics in the persistence contract; they must not silently acquire project ownership.
- `meta.created_by` and `meta.created_at` are immutable and cannot be changed by writes.

Rendering consumes a validated description. DOM, canvas, WebGPU resources, native views, layout caches, and other surfaces are disposable projections. Gestures, placement, drag, resize, and interactions start from described state plus live input and emit canonical mutations; drifted DOM geometry is not a mutation baseline. Sanitize description/rendering ownership defects before dependent feature growth within the authorized scope; otherwise report the blocking repair and request its bounded scope. Server logic and ACL operate on logical particles independently of the renderer.

## Single mutation and history pipeline

The normative [persistence contract](../../eVe/documentations/atome_persistence_contract.md) owns the exact event, property, database, and recipient-projection semantics. Distinguish its documented requirements from its explicitly recorded implementation limitations; never infer all-runtime atomicity or complete history/permission coverage from helper tests.

Direct frontend business-state mutation is forbidden. The frontend must not call `window.AdoleAPI.atomes.*` directly. All visible business writes, including tools, UI, AI, and batches, pass through `window.Atome.commit` or `window.Atome.commitBatch`, then the canonical server event-commit entry point and storage pipeline. Tools also satisfy the Command Bus controls in [module 05](05-api-rendering-and-ui.md).

DOM writes, widget state, ad-hoc caches, view models, renderer buckets, timeline data, and synchronization helpers must not create parallel writable business paths. Ephemeral projection/runtime data has the explicit registry ownership in [module 01](01-root-constitution.md); it cannot become persisted or canonical truth.

| Concern | Exclusive role |
| --- | --- |
| `events` | One immutable, append-only intent and durable mutation history; no separate tools history |
| `particles` | Canonical structural/property decomposition of Atome-owned data; never a shadow UI store |
| `particles_versions` | Independently queryable property-level history |
| `state_current` | Canonical present-state projection derived from validated history; a materialized read projection, not a second history authority |
| Snapshots | Immutable caches derived from canonical data, deterministic restore checkpoints, and replay acceleration; never a replacement for event truth |
| DOM and visual resources | Disposable rendering, interaction wiring, accessibility, and editing projection |
| Timeline/cache/texture/render-target/matrix-thumbnail data | Derived acceleration only, reconstructible from canonical data |
| Realtime patches | Transport/sync deltas folded into the canonical mutation pipeline; never standalone truth |

History and snapshots are immutable; canonical history must not be hard-deleted or silently rewritten. Restore and replay are deterministic and fail explicitly when their contract is violated. Property-level timelines remain first-class and independently queryable. Time travel supports copying past state into the present by appending a version, or editing past intent and replaying to create a new branch; neither rewrites existing history. Restore only from trusted validation anchors, including immutable snapshots. Undo/restore targets a gesture end or logical event boundary.

Snapshot creation is explicit and user-driven through `window.Atome.snapshot`, never automatic. A storage field describing manual or system origin does not authorize automatic snapshot creation. The target reconstruction is a trusted snapshot carrying a deterministic event cursor plus replay of subsequent events. The documented current safe rebuild replays the complete event scope; do not claim snapshot acceleration is implemented until equivalence with full replay is proven in the affected runtime.

Business-state inspections, assertions, restore, replay, and sync reconciliation must never read truth back from the DOM. View logic must not decide canonical business rules or authoritative mutation ordering. Correct duplicated ownership against the relevant audit/architecture graphs; do not preserve ambiguity among history, current-state projections, particles, caches, or patches.

For touched rendering, interaction, projection, serialization, replay, or sync scopes, preserve or update regression coverage proving canonical state survives DOM teardown, rerender, hydration, replay, and reconciliation without recovering business truth from the view. Use [module 03](03-debugging-testing-and-ui-validation.md) for execution and evidence. Non-deterministic replay is forbidden.

## Offline operation and synchronization

Read the normative [realtime synchronization contract](../../eVe/documentations/realtime_sync_architecture.md) when changing connectivity, delivery, runtime selection, or synchronization ownership.

Fastify remains the canonical account and synchronized-cloud boundary. Its documented current role is identity, sessions, vault routing, invitations, sockets, and authorization orchestration; each principal's dedicated vault owns that principal's cloud business event log and projection. This refines the cloud ownership boundary, not permission to create another writable authority or bypass Fastify. The existing wiring is in `server/server.js`, `server/userVaultRouter.js`, and `server/wsAtomeOperations.js`; source inspection does not establish runtime validation.

Web Browser, Tauri, iOS, AUv3, and FreeBSD Pure OS modes must support offline operation, automatic resynchronization, deterministic conflict handling, and append-only sync logic. Tauri writes locally through Axum and must continue to commit while Fastify is unavailable. Synchronization is bidirectional; queue changes while the peer is unavailable and replay them on reconnect. Clients initiate cloud connections; Fastify never connects to Tauri's local server. Browser clients use the configured Fastify origin, never Tauri local endpoints.

Use `/ws/api` for commands and offline uploads, and `/ws/sync` for authenticated cloud delivery/replay. The sync channel must authenticate the principal before welcome/events and apply current permissions and recipient projection. It must not become a direct-message or mutation command bus. The canonical browser delivery/reconnect owner is `atome/src/squirrel/apis/unified/sync_engine.js`, installed as `window.Squirrel.SyncEngine`; the old `UnifiedSync.js` and `window.Squirrel.Sync` names are not an available execution path.

Synchronization must be robust, deterministic, lossless, and history-compatible. Conflict resolution must not silently overwrite state, discard history, or introduce temporary reconciliation hacks. Native host calls remain bounded by module 05's capability-adapter exception and cannot replace application commands or synchronization.

## Per-runtime contracts

| Mode | Required stack and constraints |
| --- | --- |
| Web Browser | Fastify, WebGPU, Kira WASM, Symphonia WASM |
| Tauri | Axum, WebGPU, native Kira and Symphonia. Axum is the sole backend/runtime entry point for implementation, tests, debugging, APIs, filesystem access, local services, and integration flows. All filesystem access passes through Axum. |
| iOS | AIS server, native SQLite iOS, WebGPU, native Kira and Symphonia. Low latency, battery efficiency, offline-first operation, and mobile stability are mandatory. |
| AUv3 | AIS server, native SQLite iOS, WebGPU, native Kira and Symphonia. No blocking, disk access, runtime allocation, or nondeterministic latency in the realtime audio thread. |
| Pure OS FreeBSD | Native FreeBSD runtime, Fastify server, auto-launched WebView, native Kira and Symphonia; standalone creative-operating-system behavior. |

For Tauri, browser File APIs, direct WebView filesystem access, browser-side filesystem hacks, alternate server paths, ad-hoc test ports, temporary development bridges, and port `1430` are forbidden. A native bridge or file-picker UI must preserve Axum's filesystem authority.

The main application remains JavaScript under the core and module 02. Existing native host/runtime stacks are platform boundaries, not permission to implement application business behavior in another language or duplicate it outside the canonical APIs. Validate every participating boundary for cross-runtime scenarios under module 03.

## Sharing and access control

Sharing must be explicit, auditable, permission-driven, and policy-validated. Permissions apply at both object and property scope. Implicit sharing, silent propagation, and hidden privilege escalation are forbidden. Linked sharing must not redundantly store server copies of the shared data; permission enforcement owns access.

Preserve the distinct modes: realtime linked sharing propagates authorized changes immediately; manual linked sharing publishes only on explicit request; a detached unlinked copy is a one-time copy with no further synchronization. Public read and public write for eVe users are explicit permission modes, never implicit access. Property-level grants may allow reading a property such as `width` without allowing modification or exposing other values.

Rendering hints, runtime metadata, transport deltas, and native adapters must never alter logical identity, permissions, or canonical business-state semantics. UI exposure does not prove a sharing mode is implemented or verified; consult the current contract and real permission path before using it.
