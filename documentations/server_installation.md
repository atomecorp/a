# Server Installation & Management Guide

This guide explains how to install, configure, and manage the **Atome/Squirrel** server.
The installation process is fully automated and supports both **Linux (Debian/Ubuntu)** and **FreeBSD**.

## 🌍 Supported Platforms

| OS | Supported | Script | Notes |
|-----|-----------|--------|-------|
| **Linux (Debian/Ubuntu)** | ✅ Yes | `install_server.sh` | Production servers - uses `apt`, `systemd`, `/etc/nginx` |
| **FreeBSD** | ✅ Yes | `install_server.sh` | Production servers - uses `pkg`, `rc.d`, `/usr/local/etc/nginx` |
| **macOS** | ❌ No | Use `run.sh` | Development only - not designed for production servers |

### Recommended Versions

* **Linux**: Debian 11/12, Ubuntu 20.04/22.04/24.04 (Recommended)
* **FreeBSD**: 13.x, 14.x

> ⚠️ **Note for macOS users**: The `install_server.sh` script is designed for **production servers** only. On macOS, use `./run.sh` for local development.

## 🚀 Installation

The `install_server.sh` script handles everything: system dependencies, Node.js, PostgreSQL, Nginx, SSL certificates, and service creation.

### 1. Clone the Repository

Connect to your server via SSH and clone the project to `/opt/a` (Linux) or `/usr/local/a` (FreeBSD).

```bash
# Example for Linux
sudo git clone https://github.com/atomecorp/a /opt/a
cd /opt/a
```

### 2. Run the Installer

Run the script as root. It will detect your OS and adapt accordingly.

```bash
sudo ./install_server.sh
```

**What this script does:**

* **Detects OS**: Adapts commands (`apt` vs `pkg`, `systemd` vs `rc.d`).
* **Installs Dependencies**: Node.js 20, PostgreSQL 16, Nginx, Certbot, Rust, etc.
* **Configures Database**: Creates `squirrel` database and `postgres` user.
* **Sets up Nginx**: Configures a reverse proxy (Port 80/443 -> 3001).
* **Enables SSL**: Automatically generates Let's Encrypt certificates if a domain is pointed.
* **Installs Service**: Creates a system service (`squirrel`) for auto-restart.

---

## ⚙️ Configuration

The canonical production configuration is stored outside the git checkout:

* Linux: `/etc/squirrel/squirrel.env`
* FreeBSD: `/usr/local/etc/squirrel/squirrel.env`

The installer generates it for you (and may prompt for values on first install).
For convenience, the installer also creates a symlink at `./.env` that points to this file.

```bash
# .env example
NODE_ENV=production
PORT=3001
HOST=127.0.0.1
SQLITE_PATH=/opt/a/database_storage/adole.db
SQUIRREL_UPLOADS_DIR=/opt/a/uploads
SQUIRREL_MONITORED_DIR=/opt/a/monitored

# Optional: For cloud deployment with Turso/libSQL
# LIBSQL_URL=libsql://your-database.turso.io
# LIBSQL_AUTH_TOKEN=your_auth_token

# Optional: Disable browser UI log forwarding (production)
# SQUIRREL_DISABLE_UI_LOGS=1
```

* **HOST=127.0.0.1**: Ensures the Node.js server is only accessible via Nginx (security).
* **PORT**: Internal port (default 3001).
* **SQUIRREL_MONITORED_DIR**: Folder watched for aBox sync. If missing, aBox sync is disabled and the server will log a warning.

> ⚠️ Important: On production servers, do not rely on untracked files inside `/opt/a` (like a manually created `.env`). They can be deleted by update operations. Use `/etc/squirrel/squirrel.env`.

### Lockfile (Reproducible Installs)

Production installs use `npm ci`, which requires a committed lockfile.
Make sure `package-lock.json` is tracked in git and up to date with `package.json`.

---

## 🎮 Managing the Server

Once installed, the server runs in the background as a system service.
Use `./run.sh` with service commands to manage it easily on any platform.

### Common Commands

| Action | Command | Description |
| :--- | :--- | :--- |
| **Start (HTTPS)** | `./run.sh --https` | Start production server via systemd/nginx |
| **Start (HTTP dev)** | `./run.sh --server` | Start dev server (HTTP only, no Tauri) |
| **Status** | `./run.sh status` | Check if server is running & view recent logs |
| **Stop** | `./run.sh stop` | Stop the service |
| **Restart** | `./run.sh restart` | Restart the service (e.g. after updates) |
| **Logs** | `./run.sh logs` | View live logs (Ctrl+C to exit) |
| **Check** | `./run.sh check` | Run system diagnostics (Nginx, SSL, Ports) |

### Development vs Production

| Mode | Command | Protocol | Use Case |
| :--- | :--- | :--- | :--- |
| **Development** | `./run.sh --server` | HTTP | Local testing, debugging |
| **Production** | `./run.sh --https` | HTTPS (via Nginx) | Production servers |

---

## 🖥️ Tauri Clients: Fastify Endpoint (Sync + Share)

In the **Tauri desktop app**, the UI origin is typically `https://tauri.localhost`.
This origin is **not** the cloud Fastify server.

To ensure that **sync** (`/ws/sync`) and **sharing / direct-messages** (`/ws/api`) use the **cloud Fastify** (e.g. `https://atome.one`) in **Tauri production**, the client supports an explicit override.

### Recommended (Tauri production)

Set this global **before the Squirrel bundle is loaded**:

```js
window.__SQUIRREL_TAURI_FASTIFY_URL__ = 'https://atome.one';
```

This will drive:

* `window.__SQUIRREL_FASTIFY_URL__` (HTTP base)
* `window.__SQUIRREL_FASTIFY_WS_API_URL__` (WS API base, e.g. `wss://atome.one/ws/api`)
* `window.__SQUIRREL_FASTIFY_WS_SYNC_URL__` (WS sync base, e.g. `wss://atome.one/ws/sync`)

### Dev behavior (unchanged)

In development, you can keep using local config (for example, via `server_config.json`) and you usually **do not** need to set `__SQUIRREL_TAURI_FASTIFY_URL__`.

If you want to point your dev Tauri client at a staging Fastify, set:

```js
window.__SQUIRREL_TAURI_FASTIFY_URL__ = 'https://your-staging-domain.example';
```

> Important: this is a **client-side** setting (Tauri/webview), not a server setting. It must be executed early (before importing/loading the Squirrel bundle).

---

## 🧩 Fastify Server Overview (Runtime)

The Fastify server runs from `server/server.js` and exposes REST + WebSocket endpoints.

### Start Options (Advanced)

```bash
# Recommended (uses run.sh)
./run.sh --server

# Manual (runs Fastify directly)
node server/server.js
```

### Key Endpoints

Assuming `PORT=3001` (default):

* `GET http://localhost:3001/health` - basic health + uptime
* `GET http://localhost:3001/api/server-info` - version + server type
* `ws://localhost:3001/ws/api` - authenticated WebSocket API
* `ws://localhost:3001/ws/sync` - sync events WebSocket

For detailed API and WebSocket usage examples, see `server/README.md`.
For the minimal shared `/ws/sync` protocol, see `documentations/sync_protocol.md`.

### Manual Service Management (Advanced)

If you prefer using native system commands:

**Linux (systemd):**

```bash
systemctl status squirrel
systemctl start squirrel
systemctl stop squirrel
journalctl -u squirrel -f  # Logs
```

**FreeBSD (rc.d):**

```bash
service squirrel status
service squirrel start
service squirrel stop
tail -f /var/log/messages  # Logs (or specific app log if configured)
```

---

## � AiS — Apple iOS Server (AUV3 Platform)

**AiS (Apple iOS Server)** is a specialized HTTP server that runs **exclusively on iOS** within the **AUV3 (Audio Unit V3)** plugin environment. Unlike Fastify (Node.js) or Axum (Rust/Tauri), AiS is a **native Swift implementation** designed for iOS sandboxing and real-time audio constraints.

### Key Characteristics

| Feature | Value |
|---------|-------|
| **Platform** | iOS only (AUV3 extension) |
| **Implementation** | Swift (Network framework) |
| **Port** | Dynamic (usually 8080+) |
| **Bind Address** | `127.0.0.1` only (loopback) |
| **Database** | None (uses App Group Shared Container + iCloud) |
| **Location** | `/src-Auv3/Common/LocalHTTPServer.swift` |

### Why AiS Exists

* **iOS extensions cannot run Node.js or Rust runtimes** (sandboxing + security)
* **Audio Unit plugins require ultra-low latency** and minimal memory footprint
* **WebView needs local HTTP access** for serving audio files (custom schemes have limitations)
* **Emulates Fastify API** for frontend compatibility across all platforms

### Architecture Differences

Unlike production servers (Fastify/Axum), AiS does **not use SQL databases**:

```
┌─────────────────────────────────────┐
│  AUV3 Extension (iOS Sandbox)       │
├─────────────────────────────────────┤
│  WKWebView (Squirrel UI)            │
│    ↓ HTTP requests ↓                │
│  AiS (LocalHTTPServer.swift)        │
│    ↓ file operations ↓              │
│  App Group Shared Container         │
│    - /audio/ (M4A, MP3, WAV)        │
│    - /projects/ (JSON)              │
│    - /cache/                        │
│  ↓ optional sync ↓                  │
│  iCloud Drive                       │
└─────────────────────────────────────┘
```

### No Installation Required

AiS is **embedded in the iOS app bundle** and starts automatically when:

* The AUV3 plugin is loaded by a DAW (GarageBand, Logic Pro, etc.)
* The companion iOS app launches

**No manual installation steps needed** — it's part of the Xcode build process.

### Configuration

AiS configuration is handled via iOS app settings, not environment files:

```swift
// Automatic configuration in AudioUnitViewController.swift
LocalHTTPServer.shared.start(preferredPort: 8080)
```

The WebView frontend detects AiS automatically:

```javascript
// Platform detection in kickstart.js
if (current_platform().toLowerCase().includes('auv3')) {
  window.__SQUIRREL_SERVER__ = 'AiS';
  window.__SQUIRREL_FASTIFY_URL__ = `http://127.0.0.1:${AiS_PORT}`;
}
```

### Key API Endpoints

AiS emulates these Fastify routes for compatibility:

* `GET /api/server-info` — Server metadata (version, platform)
* `GET /audio/*` — Serve audio files with HTTP Range support (streaming)
* `GET /api/file/*` — Read files from App Group Shared Container
* `POST /api/file/*` — Write files to App Group Shared Container

### Data Persistence

**Important**: AUV3 extensions use **non-persistent WebView storage** (`WKWebsiteDataStore.nonPersistent()`).

### Realtime Sync (AiS + Fastify)

- AiS should expose `/ws/sync` using the same protocol as Axum (see `documentations/sync_protocol.md`).
- Fastify remains the reference server; AiS should relay realtime sync to/from Fastify when network is available.
- When offline, AiS remains the local read/write authority and replays changes once Fastify is reachable.

This means:

* **LocalStorage is cleared** on each extension reload
* **Critical data must be saved to App Group Shared Container**
* **Use `iCloudFileManager`** for cross-device sync (optional)

Example persistence flow:

```javascript
// ❌ Don't rely on this in AUV3
localStorage.setItem('project', JSON.stringify(data));

// ✅ Do this instead (persists across reloads)
await fetch('/api/file/projects/my-project.json', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

### Performance

AiS is optimized for iOS Audio Unit constraints:

* **Startup time**: < 50ms (native Swift, no runtime)
* **Memory footprint**: 2-5 MB (minimal overhead)
* **Latency**: < 1ms (loopback interface)
* **Audio streaming**: Gapless playback with Range requests
* **FastStart optimization**: M4A files are reorganized for progressive playback

### Limitations

* **No WebSocket support** (use `window.webkit.messageHandlers` instead)
* **Extension lifecycle**: Server stops when DAW closes the plugin
* **Sandboxed I/O**: Only App Group Shared Container + scoped bookmarks
* **No external network access** (security requirement)
* **No PostgreSQL/SQLite** (file-based storage only)

### Development vs Production

| Aspect | Development | Production (AUV3) |
|--------|-------------|-------------------|
| **Testing** | iOS Simulator or device via Xcode | DAW host (GarageBand, Logic) |
| **Debugging** | Xcode debugger attached to extension | Console logs via `os_log` |
| **Storage** | Local files in simulator | App Group + iCloud |
| **Updates** | Xcode rebuild + reinstall | App Store updates only |

### Monitoring & Logs

AiS logs are visible in:

* **Xcode Console** (when debugging)
* **iOS Console.app** (macOS device logs)
* **Device logs** via `xcrun simctl spawn` (simulator)

Example log filtering:

```bash
# View AiS logs on connected iOS device
xcrun devicectl device info logs --device <UDID> | grep "LocalHTTPServer"
```

### When to Use AiS

Use AiS when:

* Building iOS Audio Unit plugins
* Testing Squirrel UI in DAW hosts
* Implementing audio-heavy workflows on iOS

**Do not use AiS for**:

* Production web servers (use Fastify)
* Desktop apps (use Axum/Tauri)
* Cross-platform database sync (use Eden/PostgreSQL)

### Related Documentation

* **Architecture details**: `documentations/databas_architecture.md` (Section 6: AiS)
* **AUV3 implementation**: `/src-Auv3/Common/LocalHTTPServer.swift`
* **WebView integration**: `/src-Auv3/Common/WebViewManager.swift`
* **File management**: `/src-Auv3/Common/iCloudFileManager.swift`

---

## �🔄 Updating the Server

`install_server.sh` is meant for **initial provisioning** (system packages, Nginx, SSL, service creation).
For day-to-day production updates, use the `run.sh` **service commands**.

To update the application code and dependencies in a reproducible way (recommended):

```bash
cd /opt/a
./run.sh update
```

If you are not logged in as `root`, use `sudo`:

```bash
cd /opt/a
sudo ./run.sh update
sudo ./run.sh status
sudo ./run.sh logs
```

This update command will:

* Keep the server environment file outside the git checkout (so updates cannot wipe it)
* Reinstall Node.js dependencies deterministically using the lockfile
* Restart the system service and reload Nginx

> ⚠️ Avoid running `git clean -fd` on production unless you also reinstall dependencies and restore your environment files.

Legacy/manual update (still works if you know what you're doing):

```bash
# 1. Pull latest changes
git pull

# 2. Update dependencies (if needed)
./install_full.sh

# 3. Restart the server
./run.sh restart
```

> 💡 **Tip**: If you started the server manually in foreground (not as a service), use `Ctrl+C` to stop it.
