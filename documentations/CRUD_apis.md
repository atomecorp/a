# Unified CRUD APIs Documentation

This document describes the unified API system for Squirrel Framework, providing consistent CRUD + ADOLE operations across both local (Tauri/Axum) and cloud (Fastify) backends.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Authentication APIs](#authentication-apis)
4. [Atome CRUD APIs](#atome-crud-apis)
5. [ADOLE APIs](#adole-apis)
6. [User Data APIs](#user-data-apis)
7. [Sync APIs](#sync-apis)
8. [Usage Examples](#usage-examples)

---

## Overview

The Squirrel Framework provides a unified API layer that works seamlessly across:

- **Tauri (Local)**: Rust/Axum server on port 3000, using SQLite
- **Fastify (Cloud)**: Node.js server on port 3001, using PostgreSQL

Both backends implement identical APIs, allowing the same frontend code to work in any environment.

### Key Features

- **ADOLE (Append-only alterations)**: All changes are versioned, enabling full history and restore capabilities
- **Deterministic User IDs**: Same phone number generates identical user IDs across all platforms (UUID v5)
- **JWT Authentication**: Secure token-based auth with bcrypt password hashing
- **Offline Support**: Queue operations when offline, sync when connected
- **Real-time Sync**: WebSocket broadcasting for instant updates
- **CRUD as a facade**: CRUD endpoints are translated into Command Bus/ADOLE operations internally (append-only, auditable)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (JavaScript)                      │
├─────────────────────────────────────────────────────────────┤
│              Unified API Layer (src/squirrel/apis/unified/)   │
│  ┌─────────────┬─────────────┬─────────────┬────────────────┐ │
│  │ UnifiedAuth │ UnifiedAtome│ UnifiedUser │ UnifiedSync    │ │
│  │             │             │ Data        │                │ │
│  └──────┬──────┴──────┬──────┴──────┬──────┴───────┬────────┘ │
│         │             │             │              │          │
│  ┌──────┴─────────────┴─────────────┴──────────────┴────────┐ │
│  │                    Adapter Layer                          │ │
│  │  ┌─────────────────┐         ┌─────────────────┐         │ │
│  │  │  TauriAdapter   │         │ FastifyAdapter  │         │ │
│  │  │  (port 3000)    │         │ (port 3001)     │         │ │
│  │  └────────┬────────┘         └────────┬────────┘         │ │
│  └───────────┼──────────────────────────┼───────────────────┘ │
└──────────────┼──────────────────────────┼───────────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│     Tauri Backend        │  │    Fastify Backend       │
│  ┌────────────────────┐  │  │  ┌────────────────────┐  │
│  │ Axum HTTP Server   │  │  │  │ Fastify Server     │  │
│  │ local_auth.rs      │  │  │  │ auth.js            │  │
│  │ local_atome.rs     │  │  │  │ atomeRoutes.orm.js │  │
│  └─────────┬──────────┘  │  │  └─────────┬──────────┘  │
│            │             │  │            │             │
│  ┌─────────┴──────────┐  │  │  ┌─────────┴──────────┐  │
│  │      SQLite        │  │  │  │    PostgreSQL      │  │
│  └────────────────────┘  │  │  └────────────────────┘  │
└──────────────────────────┘  └──────────────────────────┘
```

---

## Authentication APIs

### Base URLs

| Platform | URL |
|----------|-----|
| Tauri    | `http://localhost:3000/api/auth/local` |
| Fastify  | `http://localhost:3001/api/auth` |

### Endpoints

#### Register a new user

```http
POST /api/auth/register
Content-Type: application/json

{
  "phone": "+33612345678",
  "password": "SecurePassword123!",
  "username": "john_doe"
}
```

**Response:**

```json
{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "john_doe",
    "phone": "+33612345678"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "phone": "+33612345678",
  "password": "SecurePassword123!"
}
```

**Response:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "john_doe",
    "phone": "+33612345678"
  }
}
```

#### Get current user

```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "john_doe",
    "phone": "+33612345678"
  }
}
```

#### Change password

```http
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}
```

#### Refresh token

```http
POST /api/auth/refresh
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

#### Logout

```http
POST /api/auth/logout
Authorization: Bearer <token>
```

#### Delete account

```http
DELETE /api/auth/delete-account
Authorization: Bearer <token>
Content-Type: application/json

{
  "password": "CurrentPassword123!",
  "confirm": true
}
```

---

## Atome CRUD APIs

### Base URLs

| Platform | URL |
|----------|-----|
| Tauri    | `http://localhost:3000/api/atome` |
| Fastify  | `http://localhost:3001/api/atome` |

### Endpoints

#### Create an atome

```http
POST /api/atome/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "document",
  "kind": "document",
  "properties": {
    "name": "My Document",
    "content": "Hello World",
    "tags": ["test", "demo"]
  }
}
```

**Note:** `kind` is optional but validated against `type`. If omitted, the server derives it from `type`.
`renderer` is optional and only used as a UI hint.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "abc123-def456-ghi789",
    "type": "document",
    "kind": "document",
    "created_at": "2024-01-15T10:30:00Z",
    "properties": {
      "name": "My Document",
      "content": "Hello World",
      "tags": ["test", "demo"]
    }
  }
}
```

#### Get an atome

```http
GET /api/atome/:id
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "abc123-def456-ghi789",
    "type": "document",
    "kind": "document",
    "properties": { ... },
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T11:00:00Z"
  }
}
```

#### Update an atome (properties update)

```http
PUT /api/atome/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "properties": {
    "name": "Updated Document",
    "content": "New content",
    "version": 2
  }
}
```

**Note:** CRUD updates are translated into ADOLE/Command Bus operations internally (append-only). Unspecified properties remain unchanged unless explicitly cleared by the client.

#### List all atomes

```http
GET /api/atome/list
Authorization: Bearer <token>
```

**Query parameters:**

- `type`: Filter by type (e.g., `?type=document`)
- `limit`: Max number of results (default: 100)
- `offset`: Pagination offset

**Response:**

```json
{
  "success": true,
  "data": [
    { "id": "abc123", "type": "document", ... },
    { "id": "def456", "type": "document", ... }
  ],
  "count": 2
}
```

#### Delete an atome

```http
DELETE /api/atome/:id
Authorization: Bearer <token>
```

---

## ADOLE APIs

ADOLE (Append-only Document Object Lifecycle Engine) provides versioned, auditable document management.

### Key concepts

- **Alterations**: Individual property changes, each creating a history entry
- **History**: Complete audit trail of all changes
- **Restore**: Revert any property to any previous version

### Endpoints

#### Alter an atome (append-only changes)

```http
POST /api/atome/:id/alter
Authorization: Bearer <token>
Content-Type: application/json

{
  "alterations": [
    { "key": "content", "value": "New content", "operation": "set" },
    { "key": "tags", "value": ["updated", "adole"], "operation": "set" },
    { "key": "version", "value": 3, "operation": "increment" }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "alterations_applied": 3,
    "alterations": [
      {
        "key": "content",
        "previous_value": "Old content",
        "new_value": "New content",
        "operation": "set",
        "applied_at": "2024-01-15T12:00:00Z"
      },
      ...
    ]
  }
}
```

#### Rename an atome

```http
POST /api/atome/:id/rename
Authorization: Bearer <token>
Content-Type: application/json

{
  "new_name": "Renamed Document"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "old_name": "My Document",
    "new_name": "Renamed Document"
  }
}
```

#### Get history

```http
GET /api/atome/:id/history
Authorization: Bearer <token>
```

**Query parameters:**

- `key`: Filter by specific property (e.g., `?key=content`)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "key": "content",
      "value": "Current content",
      "previous_value": "Old content",
      "changed_at": "2024-01-15T12:00:00Z",
      "changed_by": "550e8400-e29b-41d4-a716-446655440000",
      "change_type": "update"
    },
    ...
  ],
  "count": 5
}
```

#### Restore a property version

```http
POST /api/atome/:id/restore
Authorization: Bearer <token>
Content-Type: application/json

{
  "key": "content",
  "version_index": 2
}
```

**Note:** `version_index` is 0-based (0 = most recent, 1 = previous, etc.)

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "key": "content",
    "previous_value": "Current content",
    "restored_value": "Old content from version 2",
    "restored_from_version": 2,
    "restored_from_date": "2024-01-14T10:00:00Z"
  }
}
```

---

## User Data APIs

### Export all user data

```http
GET /api/user-data/export
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "exported_at": "2024-01-15T12:00:00Z",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "atomes": [
      {
        "id": "abc123",
        "type": "document",
        "properties": { ... },
        "history": {
          "content": [
            { "value": "v3", "changed_at": "..." },
            { "value": "v2", "changed_at": "..." }
          ]
        }
      }
    ]
  }
}
```

### Delete all user data

```http
DELETE /api/user-data/delete-all
Authorization: Bearer <token>
Content-Type: application/json

{
  "confirm": "DELETE_ALL_MY_DATA"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "deleted_atomes": 42,
    "user_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

## Sync APIs

The sync system handles bidirectional synchronization between local and cloud storage.

### Check sync status

```http
GET /api/sync/status
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "local_count": 10,
    "cloud_count": 8,
    "pending_upload": 2,
    "pending_download": 0,
    "conflicts": [],
    "last_sync": "2024-01-15T11:00:00Z"
  }
}
```

### Trigger sync now

```http
POST /api/sync/now
Authorization: Bearer <token>
```

### Resolve a conflict

```http
POST /api/sync/resolve
Authorization: Bearer <token>
Content-Type: application/json

{
  "id": "abc123",
  "resolution": "keep_local"  // or "keep_cloud" or "merge"
}
```

---

## Usage Examples

### JavaScript (Browser/Tauri)

```javascript
import { UnifiedAuth, UnifiedAtome } from './squirrel/apis/unified/index.js';

// Initialize with preferred backend
const auth = new UnifiedAuth('tauri'); // or 'fastify' or 'auto'
const atome = new UnifiedAtome('tauri');

// Register and login
await auth.register('+33612345678', 'password123', 'username');
const { token } = await auth.login('+33612345678', 'password123');

// Create a document
const doc = await atome.create('document', {
  name: 'My Notes',
  content: 'Hello World'
});

// Alter with ADOLE
await atome.alter(doc.id, [
  { key: 'content', value: 'Updated content' },
  { key: 'tags', value: ['important'] }
]);

// Get history
const history = await atome.getHistory(doc.id, 'content');

// Restore previous version
await atome.restore(doc.id, 'content', 1);

// List all documents
const docs = await atome.list({ type: 'document' });

// Delete
await atome.delete(doc.id);
```

### cURL (Command line)

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+33612345678","password":"password123"}' \
  | jq -r '.token')

# Create atome
curl -X POST http://localhost:3001/api/atome/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"document","kind":"document","properties":{"name":"Test","content":"Hello"}}'

# Alter atome
curl -X POST http://localhost:3001/api/atome/abc123/alter \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alterations":[{"key":"content","value":"New content"}]}'

# Get history
curl http://localhost:3001/api/atome/abc123/history \
  -H "Authorization: Bearer $TOKEN"
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

### Common HTTP status codes

| Code | Meaning |
|------|---------|
| 200  | Success |
| 400  | Bad request (invalid parameters) |
| 401  | Unauthorized (missing or invalid token) |
| 403  | Forbidden (no permission) |
| 404  | Not found |
| 409  | Conflict (e.g., user already exists) |
| 500  | Internal server error |

---

## Security Notes

1. **Passwords** are hashed with bcrypt (10 rounds)
2. **Tokens** are JWT with 24h expiry (7d for Fastify cookies)
3. **User IDs** are deterministic UUIDs generated from phone numbers
4. **All endpoints** require authentication except register/login
5. **CORS** is configured for local development; restrict in production

---

## File Locations

| Component | Tauri (Rust) | Fastify (Node.js) |
|-----------|--------------|-------------------|
| Auth routes | `src-tauri/src/server/local_auth.rs` | `server/auth.js` |
| Atome routes | `src-tauri/src/server/local_atome.rs` | `server/atomeRoutes.orm.js` |
| Database | `data/*.db` (SQLite) | PostgreSQL |
| Unified APIs | `src/squirrel/apis/unified/` | Same |

---

## Version History

- **v1.0** (2024-01): Initial unified API implementation
- Added ADOLE endpoints (alter, rename, history, restore)
- Added user-data management (export, delete-all)
- Added token refresh endpoint
- Unified authentication across platforms
