# Atome application API

Status: Specification — migration active

The required end state is that Atome application and business operations use WebSocket exclusively through `/ws/api` on Fastify, Tauri, and iOS. The current implementation still contains HTTP CRUD, authentication, event, `state_current`, history, and snapshot routes or fallback paths. Their removal and the missing WebSocket parity are tracked in `todo/cleanup_architecture/websocket_only_atome_transport.md`.

HTTP remains limited to static/bootstrap resources, health and configuration discovery, and binary file/media transfer.

The request examples below define the target contract. They must not be interpreted as proof that every action is already implemented on every runtime.

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

History is permission-filtered and derived from append-only events or property versions.

Typed WebSocket history parity is not yet complete across all maintained runtimes.

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

Restoration verifies permissions and appends canonical `set` events. It does not rewrite or delete the original event history.

Typed WebSocket snapshot and controlled-restoration parity is not yet complete across all maintained runtimes.

## Rename

Rename is not a dedicated transport action. It is a canonical `set` event built with `buildSemanticRenameEvent(...)`, writing `properties.label` and `properties.accessibility.label` under an explicit `tx_id`.

## Real-time notifications

The target contract gives `/ws/api` ownership of authenticated request/response operations. `/ws/sync` is intended to become a distinct authenticated, permission-scoped notification channel. The current remediation is tracked in `todo/cleanup_architecture/authenticated_permission_scoped_ws_sync.md`.

## Validation target

A permanent transport guard must be added as an exit criterion of `todo/cleanup_architecture/websocket_only_atome_transport.md`. It does not exist yet.
