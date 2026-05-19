# Minimal Sync Protocol (ws/sync)

This document defines the **minimal common protocol** shared by Fastify and Axum for `/ws/sync`.
It is intentionally small and backward-compatible with existing payloads.

## Goals

- Single, stable protocol for real-time sync across Fastify and Axum.
- Preserve existing features (file events, atome events, account events, GitHub sync).
- Keep client logic (UnifiedSync) simple and deterministic.

## Endpoint

- `ws://<host>:<port>/ws/sync`

## Envelope (shared)

All messages are JSON objects. Recommended fields:

- `type` (string, required)
- `timestamp` (ISO string or unix ms, recommended)
- `requestId` (string, for request/response patterns, optional)

## Required Types (minimal set)

### 1) register (client -> server)

```
{
  "type": "register",
  "clientId": "client_...",
  "clientType": "tauri|browser|electron",
  "version": "app-version-or-null",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2) welcome (server -> client)

```
{
  "type": "welcome",
  "clientId": "client_...",
  "server": "fastify|axum",
  "version": "server-version",
  "capabilities": ["events", "sync_request", "file-events", "atome-events"],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 3) ping / pong

```
{ "type": "ping", "timestamp": 1700000000000 }
{ "type": "pong", "timestamp": 1700000000000 }
```

### 4) sync_request (client -> server)

```
{ "type": "sync_request", "timestamp": 1700000000000 }
```

Response (server -> client):

```
{ "type": "sync_started", "mode": "github|local", "timestamp": 1700000000000 }
```

### 5) event (server -> client)

All realtime broadcasts are wrapped in a single event envelope.

```
{
  "type": "event",
  "eventType": "atome:updated|atome:created|atome:deleted|sync:file-event|sync:account-created|sync:account-deleted",
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

## Legacy Compatibility (mapping)

During migration, servers may still emit legacy types. Clients should map them to `type:"event"`:

- `atome-sync` -> `eventType: atome:created|atome:updated|atome:deleted` (derive from `payload.operation`)
- `sync:file-event` or `file-event` -> `eventType: sync:file-event`
- `sync:account-created` / `sync:account-deleted` -> `eventType: sync:account-created|sync:account-deleted`
- `sync:user-created` / `sync:user-deleted` -> `eventType: sync:user-created|sync:user-deleted`

## Migration Plan (no feature loss)

1) **Phase 0 - Documented Protocol**
   - This doc is the reference for new behavior.
2) **Phase 1 - Server emits `welcome` + `event`**
   - Fastify and Axum emit `welcome` after `register`.
   - Broadcasts wrap into `type:"event"` while keeping legacy events for compatibility.
3) **Phase 2 - UnifiedSync consumes `event`**
   - Client prefers `event` and falls back to legacy types.
4) **Phase 3 - Remove legacy paths**
   - Remove legacy `atome-sync` direct forwarding once all clients updated.

## Notes

- The protocol does not require auth at the sync layer. Auth is handled by `/ws/api`.
- Servers may send `welcome` immediately on connect, but should still accept `register`.
