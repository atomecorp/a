# Atome application API

Status: Implemented and guarded

Atome application and business operations use WebSocket exclusively through `/ws/api` on Fastify, Tauri, and iOS. Maintained clients have no HTTP fallback for CRUD, authentication, events, `state_current`, history, snapshots, restoration, synchronization, sharing, or user-data operations.

HTTP remains limited to static/bootstrap resources, health and configuration discovery, and explicit binary file/media/archive transfer. Binary endpoints transfer bytes only; canonical Atome business queries and mutations remain owned by `/ws/api`.

## Common request contract

Every request is a JSON object containing:

- `type`: action family;
- `action`: typed operation;
- `requestId`: client correlation id, added by the unified adapter;
- `token`: authenticated credential when required.

Every response preserves the request id and returns a typed `*-response` envelope with `success`, optional result fields, and an `error` string on failure.

Applications should use `AdoleAPI`, `FastifyAdapter`, `TauriAdapter`, or the eVe `window.Atome` facade rather than constructing socket messages directly.

## Authentication

```json
{
  "type": "auth",
  "action": "login",
  "phone": "+33123456789",
  "password": "user secret"
}
```

Supported authentication actions include registration/bootstrap, login, current session (`me`), logout, phone verification, password change, account update, and account deletion. Authentication success attaches the verified principal to the `/ws/api` connection.

## Atome CRUD

Create:

```json
{
  "type": "atome",
  "action": "create",
  "atome_id": "optional-stable-id",
  "atome_type": "document",
  "parent_id": "project-id",
  "particles": {
    "name": "My Document",
    "content": "Hello"
  }
}
```

Get:

```json
{
  "type": "atome",
  "action": "get",
  "atome_id": "atome-id"
}
```

List:

```json
{
  "type": "atome",
  "action": "list",
  "atome_type": "document",
  "parent_id": "project-id",
  "include_deleted": false,
  "limit": 100,
  "offset": 0
}
```

Alter or update:

```json
{
  "type": "atome",
  "action": "alter",
  "atome_id": "atome-id",
  "particles": {
    "content": "Updated content"
  }
}
```

Soft-delete:

```json
{
  "type": "atome",
  "action": "soft-delete",
  "atome_id": "atome-id"
}
```

Durable writes are translated to canonical append-only events and projected into `state_current`; the DOM is never a persistence source.

## Event commits and reads

Commit one event:

```json
{
  "type": "events",
  "action": "commit",
  "event": {
    "kind": "set",
    "atome_id": "atome-id",
    "project_id": "project-id",
    "payload": {
      "props": {
        "color": "red"
      }
    }
  }
}
```

Commit a transaction:

```json
{
  "type": "events",
  "action": "commit-batch",
  "tx_id": "transaction-id",
  "events": []
}
```

List readable events:

```json
{
  "type": "events",
  "action": "list",
  "project_id": "project-id",
  "atome_id": "optional-atome-id",
  "order": "asc",
  "limit": 1000,
  "offset": 0
}
```

## Current state

```json
{
  "type": "state-current",
  "action": "get",
  "atome_id": "atome-id"
}
```

```json
{
  "type": "state-current",
  "action": "list",
  "project_id": "project-id",
  "include_shared": true,
  "limit": 1000,
  "offset": 0
}
```

`state_current` is a materialized read cache. It must never be mutated directly.

## History

```json
{
  "type": "atome",
  "action": "history",
  "atome_id": "atome-id",
  "property": "optional-property",
  "order": "desc",
  "limit": 50
}
```

History is permission-filtered and derived from append-only events or property versions. Fastify and Tauri implement the typed operation; iOS returns a typed unsupported result when the local capability is unavailable.

## Snapshots and controlled restoration

Create:

```json
{
  "type": "snapshot",
  "action": "create",
  "project_id": "project-id",
  "label": "Before redesign",
  "snapshot_type": "manual"
}
```

List or get:

```json
{
  "type": "snapshot",
  "action": "list",
  "project_id": "project-id"
}
```

```json
{
  "type": "snapshot",
  "action": "get",
  "snapshot_id": 42
}
```

Restore:

```json
{
  "type": "snapshot",
  "action": "restore",
  "snapshot_id": 42,
  "tx_id": "snapshot-restore-42"
}
```

Restoration verifies permissions and appends canonical `set` events. It does not rewrite or delete the original event history. Fastify and Tauri implement the typed operation; iOS reports unsupported capabilities explicitly rather than falling back to HTTP.

## Rename

Rename is not a dedicated transport action. It is a canonical `set` event built with `buildSemanticRenameEvent(...)`, writing `properties.label` and `properties.accessibility.label` under an explicit `tx_id`.

## Real-time notifications

`/ws/api` owns authenticated request/response operations. `/ws/sync` is a distinct authenticated, permission-scoped notification channel. It sends no welcome or application information before authentication and never acts as a business-operation fallback.

## Permanent validation

Run `npm run check:websocket-only-transport`. The guard rejects maintained client calls to retired HTTP business routes, HTTP remote-control command routes, unauthenticated `/ws/sync` composition, and generic WebSocket-to-HTTP tunnels.
