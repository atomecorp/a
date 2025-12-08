# Real-Time Sync Architecture

## Overview

The unified API supports real-time synchronization via a single WebSocket endpoint `/ws/sync`.

```
┌─────────────────┐         WebSocket          ┌─────────────────┐
│   Client 1      │◄─────────────────────────►│   Fastify       │
│   (Tauri)       │                            │   Server        │
└─────────────────┘                            │                 │
                                               │    /ws/sync     │
┌─────────────────┐                            │                 │
│   Client 2      │◄─────────────────────────►│                 │
│   (Browser)     │                            └─────────────────┘
└─────────────────┘
```

## Components

### 1. SyncEngine (`src/squirrel/integrations/sync_engine.js`)

Unified client-side WebSocket manager with:

- Single connection to `/ws/sync`
- Handles all event types: file, atome, account, version
- Auto-reconnection with exponential backoff
- Event-based architecture via `syncEventBus`
- Global API via `window.Squirrel.SyncEngine`

### 2. Fastify WebSocket Route (`/ws/sync`)

Server-side WebSocket handler that:

- Registers connected clients
- Broadcasts CRUD events to all other clients
- Forwards file watcher events
- Handles version sync and account events
- Persists changes to PostgreSQL database

### 3. UnifiedSync Integration

`UnifiedSync.js` provides high-level methods:

- `connectRealtime(options)` - Connect with event callbacks
- `disconnectRealtime()` - Disconnect from WebSocket
- `isRealtimeConnected()` - Check connection status

## Usage

### Basic Connection

```javascript
import { UnifiedSync } from '../../squirrel/apis/unified/index.js';

// Connect with callbacks
await UnifiedSync.connectRealtime({
    onAtomeCreated: (data) => {
        console.log('New atome from another client:', data.atome);
    },
    onAtomeUpdated: (data) => {
        console.log('Atome updated:', data.atome);
    },
    onAtomeDeleted: (data) => {
        console.log('Atome deleted:', data.atomeId);
    },
    onConnected: (data) => {
        console.log('Connected as:', data.clientId);
    },
    onDisconnected: (data) => {
        console.log('Disconnected:', data.reason);
    }
});
```

### Direct SyncEngine Access

```javascript
// Via global API
const { subscribe, send, getState } = window.Squirrel.SyncEngine;

// Subscribe to events
const unsubscribe = subscribe((event) => {
    console.log('Sync event:', event.type, event);
});

// Send a message
send({ type: 'ping', timestamp: Date.now() });

// Check state
const state = getState();
console.log('Connected:', state.connected);
console.log('Client ID:', state.clientId);
```

### Automatic Broadcasting

When you use `UnifiedAtome`, changes are automatically broadcast:

```javascript
import { UnifiedAtome } from '../../squirrel/apis/unified/index.js';

// This will:
// 1. Save to Tauri (local SQLite)
// 2. Save to Fastify (PostgreSQL)
// 3. Broadcast via WebSocket to all connected clients
const result = await UnifiedAtome.create({
    kind: 'note',
    data: { title: 'My Note', content: 'Hello world' }
});
```

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `sync:connected` | `{ clientId, serverTime }` | WebSocket connected |
| `sync:disconnected` | `{ code, reason }` | WebSocket disconnected |
| `atome:created` | `{ atome, sourceClient, timestamp }` | New atome created |
| `atome:updated` | `{ atome, sourceClient, timestamp }` | Atome updated |
| `atome:altered` | `{ atomeId, alteration, atome }` | ADOLE alteration |
| `atome:deleted` | `{ atomeId, sourceClient, timestamp }` | Atome deleted |
| `atome:renamed` | `{ atomeId, oldName, newName }` | Atome renamed |
| `atome:restored` | `{ atomeId, atome }` | Atome restored |
| `file:change` | `{ path, event }` | File changed |
| `version:update` | `{ id, version }` | Version updated |

## Configuration

The SyncEngine automatically detects the environment and constructs the appropriate WebSocket URL:

- Development: `ws://127.0.0.1:3001/ws/sync`
- Production: Uses the production server URL

## Reconnection Strategy

- Initial delay: 1 second
- Max delay: 30 seconds
- Multiplier: 2x (exponential backoff)

## Flow Diagram

```
Client A                   Fastify Server                   Client B
   │                            │                              │
   │  1. Create atome locally   │                              │
   │──────────────────────────► │                              │
   │                            │                              │
   │  2. POST /api/atome/create │                              │
   │──────────────────────────► │                              │
   │                            │                              │
   │  3. Broadcast via WS       │  4. Receive WS event         │
   │──────────────────────────► │─────────────────────────────►│
   │                            │                              │
   │                            │  5. Update local cache       │
   │                            │                              │
```

## Testing

1. Start Fastify server: `npm run server`
2. Open browser at `http://localhost:3001`
3. Load `socket_test.js` example
4. Check console for WebSocket connection status
5. Create an atome and watch it sync in real-time
