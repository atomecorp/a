# Configuring the Main Fastify Server Address

This guide explains how to configure the Fastify server address that Tauri clients connect to for synchronization.

## Overview

The Squirrel framework supports multiple deployment modes:

- **Local development**: Tauri + local Fastify on `localhost:3001`
- **Remote server**: Tauri connects to a remote Fastify server
- **Server only**: Fastify runs standalone without Tauri

## Configuration Locations

### 1. Client-Side (Tauri/Browser)

The WebSocket sync client is configured in:

```
src/squirrel/integrations/version_sync.js
```

### 2. Server-Side (Fastify)

The server listens on the port defined in:

```
server/server.js
```

### 3. Run Script

Launch modes are controlled by:

```
run.sh
```

## Changing the Server Address

### Option 1: Environment Variable (Recommended)

Set `SQUIRREL_FASTIFY_URL` before launching Tauri:

```bash
# In .env file
SQUIRREL_FASTIFY_URL=https://your-server.com

# Or export directly
export SQUIRREL_FASTIFY_URL=https://your-server.com
./run.sh --tauri
```

### Option 2: Command Line Argument

Use `--fastify-url` when launching:

```bash
./run.sh --tauri --fastify-url https://your-server.com
```

### Option 3: JavaScript Runtime Configuration

Set the global variable before the sync engine initializes:

```javascript
// Set before Squirrel loads
window.__SQUIRREL_FASTIFY_URL__ = 'https://your-server.com';
```

## Run Modes

### Local Development (Default)

```bash
./run.sh
```

- Starts Fastify on `localhost:3001`
- Starts Tauri, connects to local Fastify

### Server Only

```bash
./run.sh --server
```

- Starts only Fastify on `localhost:3001`
- No Tauri launched
- Useful for headless/production servers

### Tauri Only (Remote Server)

```bash
./run.sh --tauri --fastify-url https://your-server.com
```

- Does NOT start local Fastify
- Tauri connects to the specified remote server

### Tauri Only (Local Server Already Running)

```bash
./run.sh --tauri
```

- Assumes Fastify is already running on `localhost:3001`

## Server Port Configuration

### Changing the Fastify Port

In `server/server.js`, modify:

```javascript
const PORT = parseInt(process.env.PORT) || 3001;
```

Or set via environment variable:

```bash
PORT=8080 ./run.sh --server
```

### WebSocket Endpoints

The server exposes two WebSocket endpoints:

| Endpoint | Purpose |
|----------|---------|
| `/ws/events` | File synchronization events (chokidar watcher) |
| `/ws/sync` | Version synchronization and client management |

## Client Connection Logic

The `version_sync.js` client resolves the server URL in this order:

1. **`window.__SQUIRREL_FASTIFY_URL__`** - JavaScript global (highest priority)
2. **Default fallback** - `ws://localhost:3001/ws/sync`

### Connection Code

```javascript
function resolveVersionSyncUrl() {
    // Check for custom Fastify URL
    const customUrl = typeof window.__SQUIRREL_FASTIFY_URL__ === 'string'
        ? window.__SQUIRREL_FASTIFY_URL__.trim()
        : '';
    
    if (customUrl) {
        // Convert http(s) to ws(s)
        const wsUrl = customUrl
            .replace(/^https:/, 'wss:')
            .replace(/^http:/, 'ws:')
            .replace(/\/$/, '');
        return `${wsUrl}/ws/sync`;
    }
    
    // Default to localhost:3001
    return 'ws://localhost:3001/ws/sync';
}
```

## Production Deployment

### HTTPS/WSS Configuration

For production with HTTPS:

1. **Server-side**: Configure SSL certificates in Fastify or use a reverse proxy (nginx, Caddy)

2. **Client-side**: Use `https://` URL, the client auto-converts to `wss://`:

   ```bash
   SQUIRREL_FASTIFY_URL=https://your-server.com ./run.sh --tauri
   ```

### Reverse Proxy Example (nginx)

```nginx
server {
    listen 443 ssl;
    server_name your-server.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## Checking Connection Status

### From Browser Console

```javascript
// Check connection state
window.Squirrel.VersionSync.getState()

// Returns:
{
  connected: true,
  serverVersion: "1.3.6",
  localVersion: "1.3.6",
  endpoint: "ws://localhost:3001/ws/sync",
  clientId: "client_123456789_abc123",
  pendingConflicts: 0
}
```

### From Server

```bash
# List connected clients
curl http://localhost:3001/api/admin/sync-clients
```

## Environment Variables Summary

| Variable | Default | Description |
|----------|---------|-------------|
| `SQUIRREL_FASTIFY_URL` | `http://localhost:3001` | Remote Fastify server URL |
| `PORT` | `3001` | Fastify server port |
| `GITHUB_AUTO_SYNC` | `true` | Enable/disable GitHub polling |

## Troubleshooting

### Client Can't Connect

Check the browser console for:

```
[version_sync] Connecting to: ws://...
[version_sync] ✅ Connected to version sync server
```

If you see reconnection attempts:

```
[version_sync] Reconnecting in 2000ms (attempt 2/10)...
```

**Verify:**

1. Is the server running? `curl http://localhost:3001/version.json`
2. Is the URL correct? Check `window.__SQUIRREL_FASTIFY_URL__`
3. Are there CORS issues? Check browser network tab

### WebSocket Upgrade Fails

If using a reverse proxy, ensure WebSocket upgrade headers are passed:

```
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### SSL/TLS Errors

Ensure the client URL uses `https://` (not `http://`) when connecting to a secure server. The client will automatically convert to `wss://`.
