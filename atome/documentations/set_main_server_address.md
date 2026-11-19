# Configuring the Main Server Address

This guide explains how to configure the address of the main server, **atome-server**
(Rust, Axum: `atome/servers/atome-server`), that Tauri, Android and iOS clients
synchronize with. atome-server is the one server since Fastify was retired
(2026-11-19); each person's vault runs in its own `atome-vault` process.

> **Historical names.** The settings below keep the names they had when the server was
> Fastify — `SQUIRREL_FASTIFY_URL`, `window.__SQUIRREL_FASTIFY_URL__`,
> `window.__SQUIRREL_TAURI_FASTIFY_URL__`, `--fastify-url`, `scripts/run_fastify.sh`.
> They are kept API names; every one of them points at atome-server.

## Overview

- **Local development**: Tauri + local atome-server on `localhost:3001`
- **Remote server**: Tauri connects to a remote atome-server (e.g. `https://atome.one`)
- **Server only**: atome-server runs standalone without Tauri

## Runtime Contract Reminder (Critical)

- In the Tauri runtime, local writes and local system/file operations go to the local
  server first (`127.0.0.1:3000`): `atome_server::local` (`atome/servers/atome-server/src/local/`),
  the same Rust code the iOS app and its AUv3 run.
- The local server persists locally, then synchronizes with atome-server.
- atome-server is the cloud synchronization authority.
- The browser runtime must not call the local server's endpoints.
- The server endpoint is chosen by configuration, never hardcoded in business logic.

## Recommended Endpoint Profiles

- Production: `https://atome.one`.
- Test server: `https://staging.atome.one` (see `server_installation.md`).
- Local tests: `http://localhost:3001`.

## Configuration Locations

| What | Where |
| --- | --- |
| Client URL resolution | `atome/src/squirrel/apis/serverUrls.js` (`getCloudServerUrl`) |
| Browser sync client | `atome/src/squirrel/apis/unified/sync_engine.js` (derives `/ws/sync` from the `/ws/api` URL) |
| Server port and address | `atome/servers/atome-server/src/main.rs` (`PORT`, `HOST`) |
| Native remote end (Tauri, iOS) | `SQUIRREL_FASTIFY_URL`, read by `atome/servers/atome-server/src/local/` and `platforms/desktop-tauri/src/local_http_navigation.rs` |
| Launch modes | `run.sh` (`scripts/setup/run_unix.sh`, `scripts/setup/service_commands.sh`) |

## Changing the Server Address

### Option 1: Environment Variable (Recommended)

Set `SQUIRREL_FASTIFY_URL` before launching Tauri:

```bash
export SQUIRREL_FASTIFY_URL=https://your-server.com
./run.sh --tauri
```

A server imposed at launch wins over the one chosen in the app; the built-in default
does not (`local_http_navigation.rs`). Without it the local server's remote end is
`https://atome.one`.

### Option 2: Command Line Argument

```bash
./run.sh --tauri --fastify-url https://your-server.com
```

`--fastify-url` cannot be combined with `--auth-local` or `--auth-prod`.

### Option 3: JavaScript Runtime Configuration

Set the global before the Squirrel bundle loads:

```javascript
window.__SQUIRREL_TAURI_FASTIFY_URL__ = 'https://your-server.com'; // Tauri production
window.__SQUIRREL_FASTIFY_URL__ = 'https://your-server.com';       // any client
```

## Run Modes

### Local Development (Default)

```bash
./run.sh
```

- Starts atome-server on `localhost:3001` (`scripts/run_fastify.sh` builds and runs
  `target/release/atome-server`)
- Starts Tauri, connected to the local atome-server

### Server Only

```bash
./run.sh --server
```

- Starts only atome-server on `localhost:3001`, no Tauri
- Useful for headless development, manual diagnostics, or a foreground server session

For an installed production server, prefer the service commands documented in
`server_installation.md`: `./run.sh --https`, `./run.sh restart`, `./run.sh status`,
and `./run.sh logs`, which keep atome-server managed by systemd or rc.d behind the
reverse proxy. On a production host `./run.sh --server` is only a foreground
diagnostic mode: stop the service first; it then starts atome-server from the service
environment without development bootstrap or `npm ci`.

### Tauri Only (Remote Server)

```bash
./run.sh --tauri --fastify-url https://your-server.com
```

- Does not start a local atome-server
- Tauri connects to the given remote server

### Tauri Only (Local Server Already Running)

```bash
./run.sh --tauri
```

- Assumes atome-server already runs on `localhost:3001`

## Server Port Configuration

atome-server reads `PORT` (default `3001`) and `HOST` (default `127.0.0.1` with
`NODE_ENV=production`, `0.0.0.0` otherwise) from the environment, then from the
project's `.env` (`atome/servers/atome-server/src/settings.rs`); an invalid value stops
it at startup (`HOST_invalid`).

```bash
PORT=8080 ./run.sh --server
```

### WebSocket Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/ws/api` | Authenticated request/response application API |
| `/ws/sync` | Authenticated, permission-scoped sync delivery and replay |

## Client Connection Logic

`getCloudServerUrl()` (`atome/src/squirrel/apis/serverUrls.js`) resolves the server in
this order:

1. In a browser page served by the server itself, that same origin.
2. `window.__SQUIRREL_TAURI_FASTIFY_URL__`.
3. `window.__SQUIRREL_FASTIFY_URL__`.
4. A loopback page already on the server's port: that origin.
5. The embedded iOS app: `https://atome.one`.
6. Tauri: the loopback origin on the server's port.
7. `server_config.json` (`window.__SQUIRREL_SERVER_CONFIG__`).
8. A page on a real domain: that origin.

Nothing else: with none of these, there is no server URL (no implicit localhost).

## Production Deployment

### HTTPS/WSS

atome-server speaks plain HTTP on its local port; TLS is the reverse proxy's (nginx,
installed and configured by `install_server.sh`, certificates by certbot). Clients use
an `https://` URL; the WebSocket URLs follow as `wss://`.

### Reverse Proxy Example (nginx)

```nginx
server {
    listen 443 ssl;
    server_name your-server.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## Environment Variables Summary

| Variable | Default | Description |
|----------|---------|-------------|
| `SQUIRREL_FASTIFY_URL` | `https://atome.one` (native local server) | The remote atome-server a local server syncs with |
| `PORT` | `3001` | atome-server's port |
| `HOST` | `127.0.0.1` in production, else `0.0.0.0` | atome-server's listening address |
| `GITHUB_AUTO_SYNC` | unset | `true` is refused at startup (`github_auto_sync_unsupported`) |

## Troubleshooting

### Client Can't Connect

1. Is the server running? `curl -fsS http://localhost:3001/health`
2. Is the URL correct? Check `window.__SQUIRREL_FASTIFY_URL__` and
   `window.__SQUIRREL_TAURI_FASTIFY_URL__`.
3. Are there CORS issues? Check the browser network tab.

### WebSocket Upgrade Fails

Behind a reverse proxy, the upgrade headers must be passed for both `/ws/api` and
`/ws/sync`:

```
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### SSL/TLS Errors

The client URL must use `https://` for a secure server; the WebSocket URLs then use
`wss://`.
