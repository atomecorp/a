# Sharing & Sync System - Technical Analysis and Bug Report

## Date: January 25, 2026

---

## 1. Overview of What Was Done

### Session Work Summary

1. **Fixed duplicate `getCurrentProjectId` function** in communication.js
2. **Fixed `RC.start()` returning false on Tauri** - RemoteCommands system wasn't starting because:
   - `ensureCommandAuth()` called `getFastifyToken()` which looked for `local_auth_token`
   - On Tauri, the token exists but the user doesn't exist on Fastify
   - Fastify's WebSocket auth checked `findUserById()` and returned "User not found"

3. **Implemented Tauri token fallback** in UnifiedSync.js:

   ```javascript
   let token = getFastifyToken();
   if (!token) {
       token = getTauriToken();
   }
   ```

4. **Implemented "shadow user" creation** in server.js:
   - If JWT is valid but user doesn't exist on Fastify, create a shadow user automatically
   - Enables Tauri users to authenticate on Fastify without explicit registration

5. **Added diagnostic logging** in share.js and sharing.js to trace `receiverProjectId` flow

---

## 2. Technical Architecture

### Communication Flow

```
┌─────────────────┐                    ┌─────────────────┐
│   Tauri (Axum)  │                    │     Fastify     │
│   Port 3000     │◄──── WebSocket ───►│    Port 3001    │
│   SQLite local  │                    │   PostgreSQL    │
└─────────────────┘                    └─────────────────┘
        │                                      │
        └──────────── JWT_SECRET ──────────────┘
                   (shared secret)
```

### WebSocket Endpoints

| Endpoint | Purpose |
|----------|---------|
| `ws://127.0.0.1:3001/ws/api` | Main API WebSocket for commands, auth, atome operations |
| `ws://127.0.0.1:3001/ws/sync` | Real-time sync for file events, atome events |

### Notification/Command System

```
Sender                           Server                          Receiver
   │                               │                                │
   │ RC.sendCommand('eve-comm-share', data)                         │
   │──────────────────────────────►│                                │
   │                               │ Route to target user           │
   │                               │───────────────────────────────►│
   │                               │      RC.register('eve-comm-share', handler)
   │                               │                                │
   │                               │◄───────────────────────────────│
   │                               │        { ok: true }            │
```

---

## 3. Key Files for Sync/Sharing

### Frontend (Client-Side)

| File | Purpose |
|------|---------|
| `src/squirrel/apis/unified/UnifiedSync.js` | Centralized WebSocket sync, RemoteCommands (RC) system |
| `src/squirrel/apis/unified/adole.js` | FastifyAdapter, TauriAdapter, WebSocket message handlers |
| `src/squirrel/apis/unified/adole_apis.js` | AdoleAPI (share_atome, share_respond, list_atomes, etc.) |
| `src/application/eVe/tools/communication.js` | eVe communication UI, share handlers, notification system |
| `src/application/examples/share.js` | ShareAPI (share_with, accept_request, reject_request) |
| `src/application/examples/user.js` | loadProjectAtomes, project selection, visual atome creation |

### Backend (Server-Side)

| File | Purpose |
|------|---------|
| `server/server.js` | Fastify server, WebSocket routes, auth, message routing |
| `server/sharing.js` | handleShareMessage, createShareRequest, applyShareAcceptance, createSharedCopies |

---

## 4. Sharing Workflow

### Step 1: Sender Initiates Share

```
communication.js → ShareAPI.share_with() → AdoleAPI.sharing.share() 
→ FastifyAdapter.share.request() → WebSocket → server.js → sharing.js
```

1. User selects atome and target user
2. `ShareAPI.share_with()` is called with `shareType: 'copy'`
3. Server creates `share_request` atomes (inbox for receiver, outbox for sender)
4. Server returns `inboxId` (requestAtomeId)

### Step 2: Notification Sent

```
communication.js → RC.sendCommand('eve-comm-share', {..., requestAtomeId})
→ WebSocket → server.js → routes to target user's connection
→ RC.register('eve-comm-share', handler) → addNotification()
```

### Step 3: Receiver Accepts Share

```
communication.js (click 'accept') → ShareAPI.accept_request(requestAtomeId)
→ AdoleAPI.sharing.respond({requestAtomeId, status: 'accepted', receiverProjectId})
→ FastifyAdapter.share.respond() → WebSocket → server.js → sharing.js
→ handleShareMessage (action: 'respond') → applyShareAcceptance()
→ createSharedCopies({..., receiverProjectId})
```

### Step 4: Atome Copy Created

```
sharing.js:createSharedCopies() → db.createAtome({
    parent: receiverProjectId,  // <-- CRITICAL: Must be receiver's current project
    owner: targetUserId,
    properties: {..., shareType: 'copy', originalAtomeId}
})
```

### Step 5: Project Reload

```
communication.js → window.loadProjectAtomes(currentProjectId)
→ user.js:loadProjectAtomes() → list_atomes({projectId, includeShared: true})
→ Filter by parent_id === projectId → createVisualAtome() for each
```

---

## 5. Share Types

| Type | Behavior |
|------|----------|
| `copy` | Creates a copy of the atome in receiver's project (parent_id = receiver's project) |
| `linked` | Only grants permissions, no copy created (atome stays in sender's project) |

**Current default in ShareAPI.share_with():** `linked`  
**Current override in communication.js:** `copy` (line 3199)

---

## 6. Problems Encountered

### Problem 1: RC.start() Returning False on Tauri

- **Root Cause:** `ensureCommandAuth()` couldn't authenticate because Tauri user didn't exist on Fastify
- **Solution:** Added shadow user creation + Tauri token fallback
- **Status:** ✅ Fixed

### Problem 2: Notifications Not Delivered

- **Root Cause:** `requestAtomeId` was null because share request failed with "User not found"
- **Solution:** Shadow user creation ensures target user exists
- **Status:** ✅ Fixed

### Problem 3: Shared Atomes Not Attached to Receiver's Project

- **Suspected Cause:** `receiverProjectId` is null or not properly passed
- **Status:** ⏳ Under investigation (logging added)

---

## 7. Current Bugs to Resolve

### Bug 1: Atomes Not Being Shared

**Symptoms:**

- Share action completes but atome doesn't appear on receiver side
- No error shown to user

**Possible Causes:**

- `receiverProjectId` is null when `accept_request` is called
- `window.__currentProject.id` not set on receiver
- Share request fails silently

**Files to Check:**

- `share.js:accept_request()` - is `getCurrentProjectId()` returning a value?
- `sharing.js:createSharedCopies()` - is `receiverProjectId` passed correctly?

---

### Bug 2: Atomes Appear Then Disappear

**Symptoms:**

- Atome shows up briefly then vanishes from the canvas

**Possible Causes:**

- Duplicate atome IDs causing DOM conflicts
- Real-time sync overwriting local state
- Filter in `loadProjectAtomes()` excluding the atome after reload
- Atome created with wrong `parent_id` then filtered out

**Files to Check:**

- `user.js:loadProjectAtomes()` - filter logic (line 609-622)
- `UnifiedSync.js` - real-time patch handlers
- `adole_apis.js:list_atomes()` - deduplication logic

---

### Bug 3: Atomes Attached to Communication Panel Instead of Project

**Symptoms:**

- Shared atomes appear in communication panel area
- Not visible in the project canvas

**Possible Causes:**

- `parent_id` set to wrong element (communication panel ID instead of project ID)
- Visual creation uses wrong container
- `receiverProjectId` is null, causing fallback to communication panel

**Files to Check:**

- `sharing.js:createSharedCopies()` - what is `resolvedParent`?
- `communication.js` - is there code that creates visual atomes in wrong container?
- `share.js:getCurrentProjectId()` - is it returning correct value?

---

## 8. Code Quality Issues Identified

### Issue 1: Multiple Implementations of Same Functionality

- `getCurrentProjectId()` exists in:
  - `share.js` (line 115)
  - `communication.js` (line 110)
  - `finder.js` (line 115)
  - `debug.js` (line 422)
- Should be centralized in one place

### Issue 2: Fallbacks Masking Real Errors

- Code silently falls back instead of failing loudly
- Example: If `receiverProjectId` is null, atome is created with `parent: null` instead of throwing error

### Issue 3: Inconsistent Property Naming

- `receiverProjectId` vs `receiver_project_id`
- `shareType` vs `share_type`
- `atomeIds` vs `atome_ids`

### Issue 4: Scattered Share Logic

- Share handling in `communication.js` (2800+ lines)
- Share API in `share.js`
- Share processing in `sharing.js`
- Atome creation in multiple places

---

## 9. Recommended Next Steps

1. **Add Diagnostic Logging** (Done ✅)
   - Trace `receiverProjectId` from client to server
   - Log `parent_id` of created copies

2. **Test and Collect Logs**
   - Share an atome from Fastify to Tauri
   - Check Fastify server logs for `[Share]` messages
   - Check browser console for `[ShareAPI]` messages

3. **Identify Root Cause**
   - If `receiverProjectId` is null → Fix `getCurrentProjectId()` on Tauri
   - If copy has wrong parent → Fix `createSharedCopies()` logic
   - If copy has correct parent but not displayed → Fix `loadProjectAtomes()` filter

4. **Consolidate Code**
   - Create single `getCurrentProjectId()` function
   - Remove fallbacks that mask errors
   - Fail loudly with clear error messages

5. **Add Validation**
   - Require `receiverProjectId` for non-linked shares
   - Validate atome creation before sending success response

---

## 10. Diagnostic Logs Added

### In `share.js:accept_request()`

```javascript
console.log('[ShareAPI] accept_request - requestAtomeId:', requestAtomeId);
console.log('[ShareAPI] accept_request - receiverProjectId:', receiverProjectId);
console.log('[ShareAPI] accept_request - shareInfo:', JSON.stringify(shareInfo));
console.log('[ShareAPI] accept_request - respond result:', JSON.stringify(res));
```

### In `sharing.js:handleShareMessage()` (respond action)

```javascript
console.log('[Share] Processing accept - receiverProjectId from message:', receiverProjectId);
console.log('[Share] Processing accept - particles.receiverProjectId:', particles.receiverProjectId);
console.log('[Share] acceptanceParticles.receiverProjectId:', acceptanceParticles.receiverProjectId);
```

### In `sharing.js:applyShareAcceptance()`

```javascript
console.log('[Share] shareType check:', { shareType, isLinked: shareType === 'linked' });
console.log('[Share] receiverProjectId:', particles?.receiverProjectId || 'NONE');
console.log('[Share] receiverProjectId for copies:', receiverProjectId);
```

### In `sharing.js:createSharedCopies()`

```javascript
console.log('[Share] Creating copy with parent:', resolvedParent, 'for owner:', targetUserId);
console.log('[Share] Created copy result:', JSON.stringify(created));
```

---

## 11. Files Modified This Session

| File | Changes |
|------|---------|
| `src/squirrel/apis/unified/UnifiedSync.js` | Added Tauri token fallback in `ensureCommandAuth()` |
| `server/server.js` | Added shadow user creation in WebSocket auth |
| `src/application/examples/share.js` | Added diagnostic logging in `accept_request()` |
| `server/sharing.js` | Added diagnostic logging in respond handler and createSharedCopies |

---

## 12. Testing Checklist

- [ ] Restart Fastify server to apply logging changes
- [ ] Open project on Tauri (receiver)
- [ ] Open project on Fastify/Browser (sender)
- [ ] Share an atome from sender to receiver
- [ ] Check if notification appears on receiver
- [ ] Accept the share
- [ ] Check Fastify logs for `[Share]` messages
- [ ] Check browser console for `[ShareAPI]` messages
- [ ] Verify atome appears in receiver's project with correct parent_id
