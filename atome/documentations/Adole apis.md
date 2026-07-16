# ADOLE API v3.0 Documentation

## Overview

`adole_apis.js` is the unified WebSocket API layer for the Squirrel framework. It
provides a consistent interface across **Tauri** local persistence and **Fastify**
remote persistence without binding an account to one permanent direction of use.

An operation is committed once through the canonical append-only path of the active
runtime. For a linked account, synchronization then propagates it automatically and
bidirectionally between Fastify, Tauri installations, browsers, and other supported
runtimes. A user may therefore work Browser → Tauri, Tauri → Browser, or alternate
between linked devices without changing the state model. The `Try` guest workspace
remains local/private until the user explicitly creates or links an account and accepts
any proposed workspace adoption.

---

## Import

```javascript
import { AdoleAPI } from './atome/src/squirrel/apis/unified/adole_apis.js';
```

Or use individual functions:

```javascript
import { create_user, log_user, current_user } from './atome/src/squirrel/apis/unified/adole_apis.js';
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
  - **public**: User appears in `AdoleAPI.auth.list()` with safe public identity fields such as user id, username, and visibility.
  - **private**: User is hidden from the public directory.
- Profile visibility does not authorize disclosure of the phone number.
- Phone and other contact fields require a separate explicit, revocable consent or an authorized relationship.

### `login(phone, password, username?, callback?)`

Log in an existing user.

```javascript
const result = await AdoleAPI.auth.login('33333333', 'mypassword');
if (result.tauri.success || result.fastify.success) {
    console.log('Logged in!');
}
```

### `logout(callback?)`

Log out the current user, revoke the active session where possible, and remove any
legacy browser-storage token remnants. Browser authentication must use HttpOnly session
cookies; native bearer material belongs in the approved credential store or encrypted
vault.

```javascript
await AdoleAPI.auth.logout();
```

### `current(callback?)`

Get the currently logged-in user.

```javascript
const result = await AdoleAPI.auth.current();
// result: { logged: true, user: { user_id, username, phone, ... }, source: 'tauri'|'fastify' }
```

### `delete(phone, password, username?, callback?)`

Delete a user account by phone (requires password).

```javascript
await AdoleAPI.auth.delete('33333333', 'mypassword', 'john');
```

### `deleteAccount({ password, deleteData? }, callback?)`

Delete the currently authenticated account.

```javascript
await AdoleAPI.auth.deleteAccount({ password: 'mypassword', deleteData: true });
```

### `changePassword({ currentPassword, newPassword }, callback?)`

Change the password for the currently authenticated account.

```javascript
await AdoleAPI.auth.changePassword({
    currentPassword: 'OldPass123!',
    newPassword: 'NewPass456!'
});
```

### `refreshToken(callback?)`

Refresh authentication tokens for active backends.

```javascript
const result = await AdoleAPI.auth.refreshToken();
```

### `list(callback?)`

List all **public** users with field-level redaction. Private users are hidden, and phone/contact information is absent unless the authenticated caller has a separate explicit authorization.

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

### Historical `share(phoneNumber, ...)` wrapper

This phone-oriented signature is migration debt, not the canonical sharing identity
contract. Maintained sharing persists only opaque immutable principal identifiers. If a
caller is authorized to search by phone, the server resolves the phone to the stable
principal before applying the share; the phone must not become a share target.

`share(phoneNumber, atomeIds, permissions, mode, overrides?, currentProjectId?, callback?)`

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

Some current compatibility methods still return a dual-result object:

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

This shape reports compatibility/backend observations; it must not be used to perform
two independent canonical writes or to select an arbitrary winner. Product code uses
the canonical result of the active runtime, while the synchronization layer reconciles
linked runtimes from append-only events.

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

1. **Local-first and bidirectional**: one canonical commit occurs on the active runtime; linked runtimes synchronize automatically in either direction
2. **User-Scoped Data**: Current project is stored per-user, not globally
3. **Machine Identification**: Each device gets a persistent non-secret identifier; this identifier is not an authentication token
4. **User-Machine Association**: Bidirectional relationship for session restoration
5. **WebSocket Communication**: Uses WebSocket for real-time operations
6. **Token Management**: Browser sessions use HttpOnly cookies; native bearer material uses the approved credential store or encrypted vault. Remaining Web Storage token paths are active remediation debt in `todo/cleanup_architecture/secure_auth_token_storage.md`

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
