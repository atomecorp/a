# Real-Time Sync Architecture

## Overview

The unified API now supports real-time synchronization between Tauri (local) and Fastify (cloud) backends via WebSocket.

```
┌─────────────────┐         WebSocket          ┌─────────────────┐
│   Client 1      │◄─────────────────────────►│   Fastify       │
│   (Tauri)       │                            │   Server        │
└─────────────────┘                            │                 │
                                               │  /ws/atome-sync │
┌─────────────────┐                            │                 │
│   Client 2      │◄─────────────────────────►│                 │
│   (Browser)     │                            └─────────────────┘
└─────────────────┘
```

## Components

### 1. SyncWebSocket (`src/squirrel/apis/unified/SyncWebSocket.js`)

Client-side WebSocket manager with:

- Auto-reconnection with exponential backoff
- Event-based architecture
- Heartbeat keepalive
- Connection state management

### 2. Fastify WebSocket Route (`/ws/atome-sync`)

Server-side WebSocket handler that:

- Registers connected clients
- Broadcasts CRUD events to all other clients
- Persists changes to PostgreSQL database

### 3. UnifiedSync Integration

`UnifiedSync.js` now provides:

- `connectRealtime(options)` - Connect with event callbacks
- `disconnectRealtime()` - Disconnect from WebSocket
- `isRealtimeConnected()` - Check connection status
- `on(event, callback)` - Subscribe to sync events

### 4. UnifiedAtome Integration

`UnifiedAtome.js` automatically broadcasts:

- `atome:created` on create
- `atome:altered` on alter/update/rename
- `atome:deleted` on delete

## Usage

### Basic Connection

```javascript
import { UnifiedSync } from '../../squirrel/apis/unified/index.js';

// Connect with callbacks
await UnifiedSync.connectRealtime({
    onAtomeCreated: (data) => {
        console.log('New atome from another client:', data.atome);
        // Refresh UI or local cache
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

### Manual Event Subscription

```javascript
import { SyncWebSocket } from '../../squirrel/apis/unified/index.js';

// Connect directly
await SyncWebSocket.connect();

// Subscribe to events
const unsubscribe = SyncWebSocket.on('atome:created', (data) => {
    console.log('New atome:', data.atome);
});

// Later: unsubscribe();

// Check connection
if (SyncWebSocket.isConnected()) {
    console.log('WebSocket is active');
}
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
| `sync:error` | `{ error }` | Connection error |
| `atome:created` | `{ atome, sourceClient, timestamp }` | New atome created |
| `atome:updated` | `{ atome, sourceClient, timestamp }` | Atome updated |
| `atome:altered` | `{ atomeId, alteration, atome, sourceClient, timestamp }` | ADOLE alteration |
| `atome:deleted` | `{ atomeId, sourceClient, timestamp }` | Atome deleted |

## Configuration

Default WebSocket URL: `ws://127.0.0.1:3001/ws/atome-sync`

Can be customized:

```javascript
await SyncWebSocket.connect({ 
    url: 'ws://custom-server:3001/ws/atome-sync',
    token: 'your-auth-token'
});
```

## Reconnection Strategy

- Initial delay: 1 second
- Max delay: 30 seconds
- Multiplier: 2x (exponential backoff)
- Max attempts: 10

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
