# Adole Security and Sharing

## 1. Overview

This document consolidates the Adole sharing model and the user file security model.
Sharing is explicit, auditable, and permission-driven. File access is scoped to the
owner or explicitly shared recipients.

## 2. Atome Sharing System

### 2.1 Core principles

- No sharing is implicit.
- No update is silent.
- Every decision is persisted.

### 2.2 Mailbox / Inbox system

- Sharing requests are delivered to the recipient mailbox.
- Requests persist until explicitly accepted, rejected, or blocked.
- Requests are stored even if the recipient is offline.
- Optional atome messages can be attached to a sharing request.

### 2.3 User discovery (directory)

- Fastify is the authoritative public user directory.
- Browser clients fetch the directory online only.
- Tauri clients cache the directory locally for offline discovery.
- The directory is public but contains safe identity fields only.

### 2.4 User approval policies (persistent)

Every sharing request requires explicit approval. Per-sender policies are stored:

- One-shot (single share)
- Always (persistent authorization)
- Never authorize requests (auto reject)
- Block all requests (no notification)

Stored data includes initiating user, recipient, policy, permissions, and timestamp.

### 2.5 Share modes

#### Real-time (linked)
- Changes propagate instantly.
- Property-level updates, not full replacement.

#### Manual (linked)
- Local changes only until explicit publish.
- No background propagation.

#### Detached copy (unlinked)
- A new atome is created at share time.
- No synchronization after copy.
- Original creator identity is preserved as metadata.

### 2.6 Permissions model

Global permissions:
- read
- alter
- delete
- create

Property-level overrides can restrict or extend access.

### 2.7 Offline support and resynchronization

- Linked shares can be edited offline.
- Offline actions are replayed on reconnection.
- Conflicts are resolved deterministically.

Detached shares never resync.

### 2.8 Conflict resolution

- Explicit permissions take priority.
- Timestamps decide ordering.
- The owner is final arbiter if needed.

## 3. User Files & Sharing System

### 3.1 File isolation

- Users see only their files by default.
- Shared files are visible only to authorized recipients.
- Public files are visible to all.

### 3.2 File routes

#### GET /api/files/my-files
Returns files owned by the user.

#### GET /api/files/accessible
Returns all accessible files (owned + shared).

#### POST /api/files/share
Shares a file with another user.

#### POST /api/files/unshare
Revokes a share.

#### POST /api/files/visibility
Toggles file public/private visibility.

#### GET /api/files/stats
Admin file statistics.

### 3.3 Sharing routes

#### POST /api/share/create
Creates a share for project/atome/file.

#### DELETE /api/share/:shareId
Revokes a share.

### 3.4 Permissions

| Level | Value | Description |
|-------|-------|-------------|
| NONE  | 0     | No access |
| READ  | 1     | Read only |
| WRITE | 2     | Read/write |
| ADMIN | 3     | Full control (can re-share) |

### 3.5 Resource types

- project
- atome
- file

## 4. Security Notes

- Access is enforced by ownership + sharing permissions.
- File download endpoints require authentication or explicit access.
- No implicit sharing or silent propagation is allowed.

