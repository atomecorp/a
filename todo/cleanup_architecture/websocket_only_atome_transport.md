# WebSocket-only Atome transport migration

Status: Actif

## Decision

All Atome application and business API operations must use the canonical WebSocket endpoint `/ws/api` on every supported runtime.

This includes:

- authentication and account operations;
- Atome create, read, update, alter, soft-delete, and list;
- append-only event commit and batch commit;
- `state_current` reads;
- event and property history;
- snapshot creation, listing, reading, and controlled restoration;
- sharing, permissions, synchronization, and user-data operations.

HTTP must not remain as an application-operation fallback, compatibility transport, secondary read path, or silent substitution.

HTTP remains allowed only where request/response resource transfer is intrinsically appropriate, including application bootstrap/static assets, health/configuration discovery, file or media upload/download, byte ranges, and external provider protocols. These exceptions must not mutate or query canonical Atome business state outside `/ws/api`.

## Current verified gap

- The unified Squirrel adapters already use `/ws/api` for most authentication, CRUD, sharing, file, and event operations.
- The separate `/ws/sync` route currently accepts anonymous connections and forwards global account, Atome, and file events without principal or permission scoping.
- `eVe/core/atome_commit.js` still delegates commits, state reads, event reads, and snapshots to HTTP request helpers.
- `atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js` still performs an HTTP `/api/state_current` read.
- Some eVe sharing/project resolution paths still fetch `/api/atome/:id`.
- WebSocket history currently returns an empty compatibility result.
- WebSocket restoration currently returns `Not implemented`.
- Fastify still publishes HTTP Atome/event/state/snapshot routes that can be mistaken for canonical application APIs.
- The Tauri remote-control/test harness still exposes HTTP command routes under
  `/__tauri_remote/*`; its typed actions must migrate to one local token-protected
  WebSocket control channel without retaining HTTP as an alternate transport.

## Dependencies

- The canonical `/ws/api` connection, authentication attachment, request-id correlation, and typed response routing must remain shared by Tauri and Fastify.
- `/ws/sync` must remain a distinct authenticated, permission-scoped real-time notification channel according to `todo/cleanup_architecture/authenticated_permission_scoped_ws_sync.md`.
- Durable mutations must continue through the append-only event helpers and database projection boundary.
- Soft-delete, actor normalization, authorization, idempotency, sync emission, transactions, replay, and snapshot semantics must remain unchanged.
- Binary resource transfer exceptions must remain explicitly separated from Atome business operations.

## Executable scope

1. Inventory every maintained application call to HTTP Atome, event, state, snapshot, auth, sharing, sync, and user-data routes.
2. Include development/test remote-control command routes in the inventory and migrate
   them to one authenticated local WebSocket control channel.
3. Define typed `/ws/api` actions and responses for every missing read or operation, including history, snapshots, controlled append-only restoration, and user-data operations. Rename remains a canonical `set` event built by the shared semantic-rename contract and must not become a separate transport action.
4. Route `window.Atome.commit`, `commitBatch`, `snapshot`, `getStateCurrent`, `listStateCurrent`, and `listEvents` exclusively through the unified WebSocket adapter.
5. Replace direct HTTP Atome reads in eVe and Squirrel with the canonical WebSocket API.
6. Ensure Tauri, Fastify, and iOS expose equivalent WebSocket operation semantics without an HTTP fallback.
7. Remove or explicitly retire the HTTP application-operation routes after all maintained consumers have migrated.
8. Add a permanent guardrail rejecting new HTTP calls to canonical Atome business routes outside approved server migration tests.
9. Update API, architecture, persistence, CRUD, installation, and debugging documentation.
10. Authenticate `/ws/sync`, scope every subscription and event to the verified principal, redact private account and filesystem fields, and reject unauthorized active sync requests.

## Exit criteria

- Maintained client/runtime code contains no HTTP request to Atome CRUD, events, `state_current`, snapshots, authentication, sharing, sync, history, restore, or user-data operations.
- The maintained remote-control/test harness uses one token-protected WebSocket channel
  and exposes no HTTP command alternative.
- Every required operation succeeds through `/ws/api` on Fastify and Tauri; supported iOS paths expose the same contract.
- History and controlled restoration are implemented and tested rather than returning empty or `Not implemented` compatibility responses; semantic rename continues to use canonical `set` events with explicit `tx_id`.
- Disconnect, reconnect, authentication expiry, duplicate request, timeout, authorization failure, and offline queue behavior return deterministic typed results.
- HTTP Atome business routes are removed or made unavailable to application clients, with no silent fallback.
- Static/config/health and binary media/file transport exceptions are documented and mechanically distinguished from Atome business operations.
- `/ws/sync` satisfies every exit criterion in `todo/cleanup_architecture/authenticated_permission_scoped_ws_sync.md`; no anonymous or globally broadcast application event remains.

## Required validation

- Focused unit tests for WebSocket request/response normalization and every action family.
- Fastify integration tests for CRUD, event commit/batch, reads, history, snapshots, restoration, sharing, and sync over `/ws/api`.
- Tauri integration tests covering the same operation matrix.
- iOS contract validation for supported operations and typed unsupported results where a capability is intentionally absent.
- Reconnect, expired-token, duplicate-request, offline/replay, and cross-runtime parity tests.
- A repository guardrail proving that maintained client code cannot call the retired HTTP Atome business routes.
- Authentication, permission-isolation, redaction, expiry, revocation, and reconnect tests for `/ws/sync`.
- `npm run check:execution-order`, syntax checks, architecture guardrails, and the narrowest relevant persistence/sync suites.
