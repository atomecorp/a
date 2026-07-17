# Minimal Sync Protocol (ws/sync)

This document defines the **minimal common protocol** shared by Fastify and Axum for `/ws/sync`.
It is intentionally small and fail-closed.

## Goals

- Single, stable protocol for real-time sync across Fastify and Axum.
- Deliver permission-scoped Atome, file, and permission events.
- Keep client logic (UnifiedSync) simple and deterministic.

## Endpoint

- `ws://<host>:<port>/ws/sync`

## Authentication and authorization

- `/ws/sync` requires an authenticated identity before the server sends `welcome`, capabilities, schema details, watcher information, or application events.
- Authentication must be derived from a server-verified session, cookie, token, or runtime credential and must never trust a client-supplied principal id.
- Each connection is bound to one principal and an explicit capability set.
- Atome events are filtered by current read permission and real-time sharing mode.
- Account-directory events are not exposed on the ordinary sync channel.
- File events are limited to authorized roots and must not expose absolute server paths or unrelated host metadata.
- Active messages are authorized independently. Fastify accepts `ping` and `register`; unsupported operations return `operation_not_allowed`.
- Reconnect creates a new authentication boundary and cannot retain the preceding principal.

## Envelope (shared)

All messages are JSON objects. Recommended fields:

- `type` (string, required)
- `timestamp` (ISO string or unix ms, recommended)
- `requestId` (string, for request/response patterns, optional)

## Required Types (minimal set)

### 1) auth (client -> server when the upgrade did not carry a verified credential)

```json
{
  "type": "auth",
  "token": "<verified runtime credential>"
}
```

No other message is accepted and no `welcome` is emitted before this succeeds.

### 2) register (client -> server, after authenticated connection establishment)

```
{
  "type": "register",
  "clientId": "client_...",
  "clientType": "tauri|browser|electron",
  "version": "app-version-or-null",
  "timestamp": "2024-01-01T00:00:00.000Z"
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

### 5) event (server -> client)

All realtime broadcasts are wrapped in a single event envelope.

```
{
  "type": "event",
  "eventType": "atome:updated|atome:created|atome:deleted|sync:file-event|permission-change",
  "payload": { "any": "data" },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 6) error (either direction)

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
- Password hashes, phone numbers, absolute paths, host metadata, and unrelated resource identifiers are forbidden in ordinary client events.
- The permanent regression check is `npm run check:websocket-only-transport`.
