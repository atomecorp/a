# ADOLE API v3.0 Documentation

## Overview

`adole_apis.js` is the unified WebSocket API layer for the Squirrel framework. It provides a consistent interface for data operations that work across both **Tauri** (local SQLite) and **Fastify** (remote LibSQL) backends.

All functions attempt operations on both backends and return combined results, ensuring data synchronization between local and remote storage.

---

## Import

```javascript
import { AdoleAPI } from './src/squirrel/apis/unified/adole_apis.js';
```

Or use individual functions:

```javascript
import { create_user, log_user, current_user } from './src/squirrel/apis/unified/adole_apis.js';
```

---

## API Structure

```javascript
AdoleAPI = {
    auth: { ... },      // User authentication
    projects: { ... },  // Project management
    atomes: { ... },    // Atome CRUD operations
    sharing: { ... },   // Share atomes with other users
    sync: { ... },      // Synchronization utilities
    debug: { ... }      // Debug tools
}
```

---

## Authentication (`AdoleAPI.auth`)

### `create(phone, password, username, options?, callback?)`

Create a new user account.

```javascript
// Create a public account (default - user is visible in user list)
const result = await AdoleAPI.auth.create('33333333', 'mypassword', 'john');

// Create a private account (hidden from user list)
const result = await AdoleAPI.auth.create('33333333', 'mypassword', 'john', { visibility: 'private' });
// result: { tauri: { success, data, error }, fastify: { success, data, error } }
```

**Options:**

- `visibility`: `'public'` or `'private'` (default: `'public'`)
  - **public**: User appears in `AdoleAPI.auth.list()`, others can see phone and username (default)
  - **private**: User is hidden, must be contacted by phone number directly

### `login(phone, password, username?, callback?)`

Log in an existing user.

```javascript
const result = await AdoleAPI.auth.login('33333333', 'mypassword');
if (result.tauri.success || result.fastify.success) {
    console.log('Logged in!');
}
```

### `logout(callback?)`

Log out the current user (clears tokens from localStorage).

```javascript
await AdoleAPI.auth.logout();
```

### `current(callback?)`

Get the currently logged-in user.

```javascript
const result = await AdoleAPI.auth.current();
// result: { logged: true, user: { user_id, username, phone, ... }, source: 'tauri'|'fastify' }
```

### `delete(callback?)`

Delete the current user's account.

```javascript
await AdoleAPI.auth.delete();
```

### `list(callback?)`

List all **public** users. Private users are hidden and must be contacted by phone number.

```javascript
const result = await AdoleAPI.auth.list();
// result.tauri.users or result.fastify.users
// Only returns users with visibility = 'public'
```

### `setVisibility(visibility, callback?)`

Change the current user's account visibility.

```javascript
// Make account public (visible in user list)
await AdoleAPI.auth.setVisibility('public');

// Make account private (hidden from user list)
await AdoleAPI.auth.setVisibility('private');
```

---

## Projects (`AdoleAPI.projects`)

### `create(projectName, callback?)`

Create a new project for the current user.

```javascript
const result = await AdoleAPI.projects.create('My New Project');
const projectId = result.tauri.atome_id || result.fastify.atome_id;
```

### `list(callback?)`

List all projects owned by the current user.

```javascript
const result = await AdoleAPI.projects.list();
const projects = result.tauri.projects.length > 0 
    ? result.tauri.projects 
    : result.fastify.projects;
```

### `delete(projectId, callback?)`

Delete a project and all its atomes.

```javascript
await AdoleAPI.projects.delete('b4cae1d7-b207-412e-8d59-b323923064cd');
```

### `getCurrent()`

Get the current project info (synchronous, from memory).

```javascript
const project = AdoleAPI.projects.getCurrent();
// { id: 'b4cae1d7...', name: 'My Project' }
```

### `getCurrentId()`

Get only the current project ID (synchronous).

```javascript
const projectId = AdoleAPI.projects.getCurrentId();
// 'b4cae1d7-b207-412e-8d59-b323923064cd'
```

### `setCurrent(projectId, projectName?, persist?)`

Set the current project. Optionally persists to database for restoration at next login.

```javascript
// Set and persist (default)
await AdoleAPI.projects.setCurrent('b4cae1d7...', 'My Project');

// Set without persisting
await AdoleAPI.projects.setCurrent('b4cae1d7...', 'My Project', false);
```

### `loadSaved()`

Load the user's last saved project from database. Called automatically at login.

```javascript
const saved = await AdoleAPI.projects.loadSaved();
// { id: 'b4cae1d7...', name: 'My Project' } or { id: null, name: null }
```

---

## Global Project Access

The current project is also accessible globally:

```javascript
// Via window object
window.__currentProject.id    // Current project ID
window.__currentProject.name  // Current project name

// Via AdoleAPI
AdoleAPI.projects.getCurrentId()
AdoleAPI.projects.getCurrent()
```

---

## Atomes (`AdoleAPI.atomes`)

Atomes are the core data units in the ADOLE system.

### `create(atomeType, parentId, data?, callback?)`

Create a new atome.

```javascript
const result = await AdoleAPI.atomes.create('shape', projectId, {
    color: 'blue',
    width: 100,
    height: 100
});
const atomeId = result.tauri.atome_id || result.fastify.atome_id;
```

### `list(filters?, callback?)`

List atomes with optional filters.

```javascript
// List all atomes
const result = await AdoleAPI.atomes.list();

// Filter by type
const shapes = await AdoleAPI.atomes.list({ atomeType: 'shape' });

// Filter by project
const projectAtomes = await AdoleAPI.atomes.list({ projectId: 'b4cae1d7...' });
```

### `get(atomeId, callback?)`

Get a single atome by ID.

```javascript
const result = await AdoleAPI.atomes.get('c9fd02eb-4630-4ae2-84e9-20a4c2dce616');
const atome = result.tauri.atome || result.fastify.atome;
```

### `delete(atomeId, callback?)`

Delete an atome.

```javascript
await AdoleAPI.atomes.delete('c9fd02eb...');
```

### `alter(atomeId, particles, callback?)`

Update an atome's particles (properties).

```javascript
await AdoleAPI.atomes.alter('c9fd02eb...', {
    color: 'red',
    left: '100px',
    top: '200px'
});
```

---

## Sharing (`AdoleAPI.sharing`)

### `share(phoneNumber, atomeIds, permissions, mode, overrides?, currentProjectId?, callback?)`

Share atomes with another user.

```javascript
await AdoleAPI.sharing.share(
    '11111111',                                    // Target user's phone
    ['c9fd02eb...', '4fc6d79f...'],               // Atome IDs to share
    { edit: true, view: true, delete: false },    // Permissions
    'copy',                                        // 'copy' or 'reference'
    { color: 'green' },                           // Optional property overrides
    currentProjectId                               // Target project (optional)
);
```

**Sharing modes:**

- `copy`: Creates independent copies for the recipient
- `reference`: Creates linked references (changes sync)

---

## Synchronization (`AdoleAPI.sync`)

### `sync(callback?)`

Synchronize local and remote data.

```javascript
await AdoleAPI.sync.sync();
```

### `listUnsynced(callback?)`

List atomes that need synchronization.

```javascript
const result = await AdoleAPI.sync.listUnsynced();
```

---

## Debug (`AdoleAPI.debug`)

### `listTables(callback?)`

List all database tables (debug utility).

```javascript
const result = await AdoleAPI.debug.listTables();
console.log(result.tauri.tables, result.fastify.tables);
```

---

## Return Value Structure

Most functions return a dual-result object:

```javascript
{
    tauri: {
        success: boolean,
        data: any,
        error: string | null
    },
    fastify: {
        success: boolean,
        data: any,
        error: string | null
    }
}
```

**Best practice:** Check both backends and use whichever succeeded:

```javascript
const result = await AdoleAPI.atomes.list();
const atomes = result.tauri.success 
    ? result.tauri.atomes 
    : result.fastify.atomes;
```

---

## Callbacks

All functions accept an optional callback as the last parameter:

```javascript
// Promise style
const result = await AdoleAPI.auth.current();

// Callback style
AdoleAPI.auth.current((result) => {
    console.log(result);
});
```

---

## Architecture Notes

1. **Dual Backend**: Operations run on both Tauri (local) and Fastify (remote) for redundancy
2. **User-Scoped Data**: Current project is stored per-user, not globally
3. **Machine Identification**: Each device gets a unique ID stored in localStorage
4. **User-Machine Association**: Bidirectional relationship for session restoration
5. **WebSocket Communication**: Uses WebSocket for real-time operations
6. **Token Management**: Auth tokens stored in localStorage (`local_auth_token`, `cloud_auth_token`)

---

## Machine Identification (`AdoleAPI.machine`)

Each device/browser gets a unique persistent machine ID stored in localStorage.

### `getCurrent()`

Get current machine info (synchronous).

```javascript
const machine = AdoleAPI.machine.getCurrent();
// { id: 'abc123-...', platform: 'tauri_mac' }
```

**Platform values:**

- `tauri_mac`, `tauri_windows`, `tauri_linux`, `tauri_ios`, `tauri_android`
- `safari_mac`, `safari_ios`
- `browser_windows`, `browser_linux`, `browser_android`
- `browser_unknown`

### `register(userId?)`

Register or update machine in database. Called automatically on login.

```javascript
await AdoleAPI.machine.register('user-id');
```

### `getLastUser()`

Get the last user who logged in on this machine.

```javascript
const result = await AdoleAPI.machine.getLastUser();
// { userId: 'xxx', lastLogin: '2025-12-16T10:30:00.000Z' }
```

---

## Global State Access

Three global objects are exposed on `window` for easy access:

```javascript
// Current project
window.__currentProject.id      // Project ID
window.__currentProject.name    // Project name

// Current user
window.__currentUser.id         // User ID
window.__currentUser.name       // Username
window.__currentUser.phone      // Phone number

// Current machine
window.__currentMachine.id      // Machine ID (persisted in localStorage)
window.__currentMachine.platform // Platform (tauri_mac, safari_ios, etc.)
```

---

## Data Model: Machine ↔ User Relationship

```
Machine (atome)                    User (atome)
┌────────────────────────┐        ┌────────────────────────┐
│ atome_type: "machine"  │        │ atome_type: "user"     │
│ particles: {           │        │ particles: {           │
│   last_user_id ────────┼───────►│   current_machine_id ──┼───┐
│   platform             │        │   current_project_id   │   │
│   last_login           │        │   ...                  │   │
│   last_seen            │        │ }                      │   │
│ }                      │◄───────┼────────────────────────┼───┘
└────────────────────────┘        └────────────────────────┘
```

- **1 Machine → 1 last_user_id**: The last user who logged in on this machine
- **1 User → 1 current_machine_id**: The last machine this user logged in from
- **1 User → N machines**: A user can use multiple machines (tracked via login history)
- **1 Machine → N users**: Multiple users can use the same machine

---

## Additional Auth Functions

### `getCurrentInfo()`

Get current user info from memory (synchronous).

```javascript
const user = AdoleAPI.auth.getCurrentInfo();
// { id: 'xxx', name: 'john', phone: '33333333' }
```

### `setCurrentState(userId, userName?, userPhone?, persistMachine?)`

Set current user state and optionally update machine association.

```javascript
await AdoleAPI.auth.setCurrentState('user-id', 'john', '33333333', true);
```

### `tryAutoLogin()`

Try to auto-login based on machine's last user. Called at app startup.

```javascript
const result = await AdoleAPI.auth.tryAutoLogin();
if (result.success) {
    console.log('Auto-logged in as:', result.userName);
} else if (result.hint === 'last_user_known') {
    console.log('Last user on this machine:', result.userId);
    // Show "Welcome back, tap to login" UI
}
```

---

## Related Files

- `adole.js` - Low-level adapters (TauriAdapter, FastifyAdapter)
- `remote_commands.js` - Remote command system for cross-user messaging
- `remote_command_handlers.js` - Built-in command handlers
