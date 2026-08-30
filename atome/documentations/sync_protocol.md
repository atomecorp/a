# Canonical Sync Protocol (`/ws/api` + `/ws/sync`)

This document defines the common WebSocket-only protocol shared by Fastify,
browser, Tauri/Axum, and iOS/AiS. It is intentionally fail-closed.

## Goals

- One stable protocol across Fastify, browser, Tauri/Axum, and iOS/AiS.
- Deliver permission-scoped Atome, file, and permission events.
- Keep replay, conflict decisions, and client projection deterministic.

## Socket responsibilities

- `/ws/api` is the only authenticated command bus. It owns commits, batches,
  sharing operations, directory queries, and offline `sync:push`.
- `/ws/sync` is the authenticated delivery channel. A client may send only
  `auth`, `register`, `subscribe`, `unsubscribe`, `ack`, and `ping` there.
- Business mutations, offline events, directory queries, and generic request
  tunnels are forbidden on `/ws/sync`.
- Framework communication remains WebSocket-only. HTTP is limited to health,
  discovery, and explicit resource/file transfer boundaries.

## Endpoint

- `ws://<host>:<port>/ws/sync`

## Authentication and authorization

- `/ws/sync` requires an authenticated identity before the server sends `welcome`, capabilities, schema details, watcher information, or application events.
- Authentication must be derived from a server-verified session, cookie, token, or runtime credential and must never trust a client-supplied principal id.
- Each connection is bound to one principal and an explicit capability set.
- Atome events are filtered by current read permission and real-time sharing mode.
- Directory data is available only through an explicit `directory.public`
  subscription and emits redacted invalidations rather than account records.
- File events are limited to authorized roots and must not expose absolute server paths or unrelated host metadata.
- Every active message and subscription is authorized independently.
- Reconnect creates a new authentication boundary and cannot retain the preceding principal.

## Envelope (shared)

All messages are JSON objects. Control messages use:

- `type` (string, required)
- `timestamp` (ISO string or unix ms, recommended)
- `requestId` (string, optional correlation identifier)

Canonical synchronized events contain:

- `id`: globally unique event identifier and idempotency key;
- `stream`: opaque authorization-scoped stream identifier;
- `sequence`: monotonically increasing integer within that stream;
- `source`: device/session identifier used to suppress only the source session;
- `project_id`, `atome_id`, `tx_id`, and optional `gesture_id`;
- `vault_principal_id`: canonical owner of the stream's vault, emitted by the
  server for both replay and live delivery;
- `timestamp`: client event time used only by the offline LWW decision;
- `kind`, authorized property patch, and resulting authorized projection;
- per-property conflict-decision metadata without protected values.

## Required Types (minimal set)

### 1) auth (client -> server when the upgrade did not carry a verified credential)

```json
{
  "type": "auth",
  "token": "<verified runtime credential>"
}
```

No other message is accepted and no `welcome` is emitted before this succeeds.

### 2) register (client -> server, after authentication)

```
{
  "type": "register",
  "clientId": "client_...",
  "clientType": "tauri|browser|ios",
  "version": "app-version-or-null",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

The server answers with `registered`, binds the verified `principal_id`, and
announces the principal's currently authorized opaque stream ids. This list is
discovery metadata only; the client must still `subscribe` and the server must
reauthorize each stream.

```json
{
  "type": "registered",
  "principal_id": "verified-principal",
  "source": "device-session-id",
  "streams": ["opaque-stream-id"]
}
```

### 3) welcome (server -> client)

```
{
  "type": "welcome",
  "clientId": "client_...",
  "server": "fastify|axum",
  "version": "server-version",
  "capabilities": ["events", "atome-events", "file-events", "ping"],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 4) ping / pong

```
{ "type": "ping", "timestamp": 1700000000000 }
{ "type": "pong", "timestamp": 1700000000000 }
```

### 5) subscribe / unsubscribe (client -> server)

```
{
  "type": "subscribe",
  "stream": "opaque-stream-id",
  "cursor": 41
}
{
  "type": "unsubscribe",
  "stream": "opaque-stream-id"
}
```

`directory.public` is a named capability subscription rather than an opaque
Atome stream. The server reauthorizes every subscription and replay.

### 6) event (server -> client)

All realtime broadcasts are wrapped in a single event envelope.

```
{
  "type": "event",
  "event_id": "evt_...",
  "stream": "opaque-stream-id",
  "sequence": 42,
  "source": "device-session-id",
  "project_id": "project-id",
  "atome_id": "atome-id",
  "vault_principal_id": "canonical-vault-owner",
  "tx_id": "transaction-id",
  "gesture_id": "gesture-id-or-null",
  "kind": "set",
  "patch": { "props": { "left": 10, "top": 20 } },
  "projection": { "atome_id": "projected-id", "properties": { "left": 10, "top": 20 } },
  "lww_decisions": { "left": { "winner": true } },
  "replay": false,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 7) ack / replay-complete

```
{ "type": "ack", "stream": "opaque-stream-id", "sequence": 42 }
{ "type": "replay-complete", "stream": "opaque-stream-id", "cursor": 42 }
```

ACK cursors are scoped by environment fingerprint, principal, and stream.
Duplicate `event.id` values are idempotent. Replay is sequence-ordered and the
server rechecks authorization immediately before every replay batch.

Tauri stores a distinct authenticated local principal and Fastify principal.
For an event whose `vault_principal_id` is the configured Fastify principal,
the native projection maps ownership to the authenticated local principal. For
a shared event, it preserves the foreign `vault_principal_id` and grants only
the projected permission to the local recipient. This mapping changes the
native projection only; it never rewrites append-only remote audit identity.

### 8) stream availability and directory invalidation (server -> client)

An authorization change can announce or revoke an opaque stream without
placing a business command on the delivery channel:

```json
{ "type": "stream-available", "stream": "opaque-stream-id" }
{ "type": "revoked", "stream": "opaque-stream-id" }
```

For a linked root share, authorization is evaluated from the stream Atome's
current canonical `parent_id` chain. The server announces streams for existing
and future descendants and sends `revoked` as soon as that chain no longer
reaches the shared root. An Atome root has no descendant expansion unless it is
actually a Project or Molecule container in canonical state.

```
{
  "type": "event",
  "event_id": "directory-event-id",
  "stream": "directory.public",
  "sequence": 12,
  "kind": "directory.invalidate",
  "patch": {
    "principal_id": "public-opaque-principal",
    "action": "created|updated|revoked",
    "revision": 12
  }
}
```

It never contains phone numbers, contact details, secrets, password hashes, or
complete account rows. Clients refresh through the authorized `/ws/api`
directory operation.

### 9) error (either direction)

```
{
  "type": "error",
  "code": "request-failed|invalid-payload|unknown-type",
  "message": "Human-readable error",
  "context": { "requestId": "req_..." }
}
```

## Notes

- Authentication is mandatory at the sync layer even though authenticated request/response business operations remain owned by `/ws/api`.
- Servers send `welcome` only after successful authentication and may then accept `register`.
- An ordinary interactive commit carrying stale `expected_versions` is rejected
  atomically with `property_version_conflict`.
- Offline events are submitted through `/ws/api sync:push`. Authorized concurrent
  properties use LWW: the newest valid timestamp wins; equal valid timestamps use
  lexical `event.id`; an invalid timestamp ranks below every valid timestamp and
  is then ordered by lexical `event.id`.
- Every accepted competing event remains append-only even when it loses current
  projection. Correction, restoration, undo, and redo append events.
- Delivery excludes only the originating session. Other sessions belonging to
  the same principal receive the event.
- Password hashes, phone numbers, absolute paths, host metadata, and unrelated resource identifiers are forbidden in ordinary client events.
- The permanent regression check is `npm run check:websocket-only-transport`.
