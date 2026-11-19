# Server Installation & Management Guide

This guide explains how to install, configure, and manage the **Atome/Squirrel** server: **atome-server**
(Rust, Axum: `atome/servers/atome-server`), the one server since Fastify was retired (2026-11-19). It serves the
client, every route and WebSocket, the clocks, and one `atome-vault` process per person (`atome/servers/atome-vault`).
No Node process serves anything; Node only builds and checks the client.

> **Historical names.** `scripts/run_fastify.sh`, `SQUIRREL_FASTIFY_URL`, `window.__SQUIRREL_FASTIFY_URL__`,
> `window.__SQUIRREL_TAURI_FASTIFY_URL__` and `--fastify-url` keep the names they had under Fastify; they are kept
> API names and all point at atome-server.
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

The `install_server.sh` script handles everything: system dependencies, the Rust build of atome-server, Nginx, SSL certificates, and service creation.

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
* **Installs Dependencies**: Rust (rustup), Node.js 20 (client build), the C++ compiler and `python3-pip` the visio
  worker's build needs, SQLite headers, Nginx, Certbot.
* **Builds the Server**: `atome-server` and `atome-vault` with Cargo; atome-server prepares the central SQLite
  database itself when it starts (`atome/servers/atome-server/src/central_schema/`).
* **Sets up Nginx**: Configures a reverse proxy (Port 80/443 -> 3001).
* **Enables SSL**: Automatically generates Let's Encrypt certificates if a domain is pointed.
* **Installs Service**: Creates a system service (`squirrel`) running `target/release/atome-server`, restarted on failure
  (on Linux through `scripts/server_update.js --no-git --no-deps`).

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
```

* **HOST=127.0.0.1**: Ensures atome-server is only accessible via Nginx (security); it is the default when
  `NODE_ENV=production`, `0.0.0.0` otherwise.
* **PORT**: Internal port (default 3001).
* **SQLITE_PATH**: The central database (default `database_storage/adole.db`; a relative path is read from `server/`).
  The vaults live under `SQUIRREL_VAULT_ROOT` (default `database_storage/vaults`). There is no libSQL/Turso mode:
  a `LIBSQL_URL` or `TURSO_DATABASE_URL` stops the server at startup (`vault_router_requires_sqlite:libsql_is_set`).
* **JWT_SECRET** and **COOKIE_SECRET**: Required authentication secrets. `install_server.sh` and `update_server.sh` generate strong values in the service environment file when they are missing or too short, and preserve existing valid values.

> ⚠️ Important: On production servers, do not rely on untracked files inside `/opt/a` (like a manually created `.env`). They can be deleted by update operations. Use `/etc/squirrel/squirrel.env`.

### Sign-up and invitations

atome.one creates accounts by invitation only for now ([account_creation.md](account_creation.md) describes it from
the user's side). The server settings:

```bash
# Sign-up by invitation only (remove the line to open sign-up to everyone)
ATOME_SIGNUP_CLOSED=1
# The site the invitation links point to
ATOME_SITE_ORIGIN=https://atome.one
# The server's own sender: the noreply mailbox of atome.one at o2switch
ATOME_MAIL_FROM=noreply@atome.one
ATOME_MAIL_SMTP_HOST=rousse.o2switch.net
ATOME_MAIL_SMTP_PASSWORD=<the mailbox password>
# Optional: ATOME_MAIL_SMTP_USER (defaults to ATOME_MAIL_FROM),
# ATOME_MAIL_SMTP_PORT and ATOME_MAIL_SMTP_SECURITY (tls on 465 by default, or starttls on 587)
```

The mailbox is created once in o2switch's cPanel (Email Accounts → `noreply@atome.one`); atome.one's SPF, DKIM
(`default._domainkey`) and DMARC records already cover mail sent through that server. The host is the o2switch server
by the name on its TLS certificate, `rousse.o2switch.net` (cPanel › Connect devices shows it): `mail.atome.one` reaches
the same machine but its certificate does not name it, and certificate checks are never relaxed. The password lives only in
`squirrel.env` (mode 0600), never in the repository. Without the three `ATOME_MAIL_*` values every invitation is refused
with `system_mail_unconfigured` and nothing is created. The test server takes the same lines in
`/etc/squirrel-staging/squirrel.env`, with `ATOME_SITE_ORIGIN=https://staging.atome.one`. Restart the service after a
change (`systemctl restart squirrel`).

The mail is sent by atome-server's own sender (`atome/servers/atome-server/src/mail/mod.rs`) through its own SMTP
client (`src/mail/smtp.rs`, on tokio and rustls); invitations live in the `auth_invites` table
(`atome/servers/atome-server/src/auth/invites.rs`): a digest of the link's secret and a keyed index of the address, never the link or the
address themselves.

### Lockfile (Reproducible Installs)

Production installs use `npm ci` (the client's build and checks) and `cargo build --release --locked`, which require
the committed `package-lock.json` and `Cargo.lock`.
Make sure `package-lock.json` is tracked in git and up to date with `package.json`.
The lockfile must validate with the production npm version as well as local npm;
Debian production currently uses npm 10, which requires the top-level optional
peer entries for `@emnapi/core` and `@emnapi/runtime`.
Manual production updates are visible by default:

```bash
sudo ./update_server.sh
```

For automated quiet runs, set `QUIET=1`; the log is written to
`logs/update_server.log`.
Every run prints a `run_id` and logs the same content to
`logs/update_server.log`. The wrapper records preflight identity, self-updates
the `/opt/a` source with `git fetch`, `git checkout main`, and
`git pull --ff-only`, stashes local changes when they block a fast-forward
update, re-executes itself when its own source changes, then records certificate
handling, the `scripts/server_update.js` execution, required eVe submodule
initialization, deployed-source verification, restart, postcheck, recent service
logs, and a final summary with the deployed Git HEAD. The eVe checkout is part
of the production contract: the update fails if `eVe/eVe.js` or
`eVe/version.txt` cannot be installed and verified.
Certificate handling does not force Let's Encrypt renewal: if the existing
certificate is valid beyond `CERT_RENEW_WINDOW_SECONDS` (30 days by default),
the certificate phase is logged as skipped so dependency installation and service
restart can continue.
After restart, the wrapper waits for the local health endpoint before declaring
success. Override `HEALTH_URL` or `HEALTHCHECK_TIMEOUT_SECONDS` only when the
production service intentionally listens on a different local endpoint or needs
more startup time.

For a deliberately forced production repair, `sudo ./update_server.sh --reset`
resets the local `main` branch to `origin/main` before reinstalling production
dependencies and restarting the service. Use it only when the normal
fast-forward update is blocked by a divergent production checkout.

The update wrapper verifies the deployed source before restart: it prints the
current Atome and eVe Git HEAD values and fails if the production `--server`
early route, the `/eVe/` static route, the required eVe files, or the required
`package-lock.json` entries are not present. The same verification also runs
inside `scripts/server_update.js` immediately after the Git and eVe update
phases and before `npm ci`, so a stale or incomplete checkout is detected before
dependency installation can obscure the root cause. After restart, the wrapper
also verifies `GET /eVe/eVe.js`, `GET /eVe/version.txt`, and
`GET /api/server-info`; a final `eveVersion: "unknown"` is a failed deployment,
not a warning. Any failing phase logs the phase name, exit code, current HEAD,
command, and log file path.

---

## 🎮 Managing the Server

Once installed, the server runs in the background as a system service.
Use `./run.sh` with service commands to manage it easily on any platform.
Production service commands are routed before development bootstrap. They do not
install Tauri dependencies, run `npm ci`, create local development `.env` values,
or start foreground development processes.
On an installed production host, `./run.sh` without arguments exits before
bootstrap for the same reason; use the service commands below instead.
On an installed production host, `./run.sh --server` is a foreground diagnostic
mode only. It uses the service environment file and refuses to run while the
system service is active, so it never runs the development bootstrap or `npm ci`.

### Common Commands

| Action | Command | Description |
| :--- | :--- | :--- |
| **Start (HTTPS)** | `./run.sh --https` | Start production server via systemd/nginx |
| **Foreground diagnostics** | `./run.sh --server` | Start atome-server in the foreground after stopping the service |
| **Status** | `./run.sh status` | Check if server is running & view recent logs |
| **Stop** | `./run.sh stop` | Stop the service |
| **Restart** | `./run.sh restart` | Restart the service (e.g. after updates) |
| **Logs** | `./run.sh logs` | View live logs (Ctrl+C to exit) |
| **Check** | `./run.sh check` | Run system diagnostics (Nginx, SSL, Ports) |

### Operator tools

The operator's tools are one Rust binary, `target/release/atome_admin`
(`atome/servers/atome-server/src/bin/atome_admin.rs`, built with the server): account roles, reported public events,
the shared assistant seats, and the server identity's keys. Run it from the project root with the service
environment loaded; its header lists the groups and commands:

```bash
cd /opt/a && set -a && . /etc/squirrel/squirrel.env && set +a && target/release/atome_admin <group> <command>
```

### Development vs Production

| Mode | Command | Protocol | Use Case |
| :--- | :--- | :--- | :--- |
| **Development** | `./run.sh --server` | HTTP | Local testing, debugging |
| **Production foreground diagnostics** | `./run.sh stop && ./run.sh --server` | HTTP behind manual session | Direct atome-server diagnostics with the service environment |
| **Production** | `./run.sh --https` | HTTPS (via Nginx) | Production servers |

### Test server: staging.atome.one

Every test against a public server runs on the test server, never on atome.one (user decision, 2026-10-29: atome.one
is production and will be reset once). It lives on the same machine as production and shares nothing with it:

| | Production | Test server |
| :--- | :--- | :--- |
| Checkout | `/opt/a` | `/opt/a-staging` |
| Service | `squirrel` | `squirrel-staging` |
| Settings, identity | `/etc/squirrel/` | `/etc/squirrel-staging/` (own secrets and server identity, generated) |
| Port | 3001 | 3101 |
| Database, vaults, sites | `/opt/a/database_storage`, `/opt/a/data/sites` | the same paths under `/opt/a-staging` |
| Backups | `/var/backups/squirrel` | `/var/backups/squirrel-staging` |

Its settings name it (`ATOME_SITE_ORIGIN=https://staging.atome.one`, `ATOME_APP_HOSTS=staging.atome.one,…`, WebAuthn
`SQUIRREL_WEBAUTHN_RP_ID` / `_ORIGINS`), keep the visio ports apart (`MEDIASOUP_RTC_MIN_PORT=50000`…`50999`), and carry
no provider key: no assistant, no paid API, sign-up open. Update it from its own checkout:

```bash
cd /opt/a-staging && node scripts/server_update.js --staging
```

`--staging` selects the `squirrel-staging` service, `/etc/squirrel-staging/squirrel.env` and its backups; the health
check reads the port from that file. It answers at `https://staging.atome.one` (since 19 Nov. 2026): the DNS A record
`staging` → the server in atome.one's zone, then `/usr/local/lib/atome-sites/site_domain_cert.mjs --host
staging.atome.one 3101`, which took its Let's Encrypt certificate (renewed by certbot's timer) and wrote its nginx
servers (`scripts/site_domain_cert.mjs`). Its former route, `https://atome.one:8443`, is disabled (its `sites-enabled`
link removed; `/etc/nginx/sites-available/atome-staging-8443` kept, unused).

---

## 🖥️ Tauri Clients: Server Endpoint (Sync + Share)

In the **Tauri desktop app**, the UI origin is typically `https://tauri.localhost`.
This origin is **not** the cloud server (atome-server).

To ensure that **sync** (`/ws/sync`) and **sharing / direct-messages** (`/ws/api`) use the **cloud atome-server** (e.g. `https://atome.one`) in **Tauri production**, the client supports an explicit override.

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

If you want to point your dev Tauri client at the test server, set:

```js
window.__SQUIRREL_TAURI_FASTIFY_URL__ = 'https://staging.atome.one';
```

> Important: this is a **client-side** setting (Tauri/webview), not a server setting. It must be executed early (before importing/loading the Squirrel bundle).

---

## 🧩 atome-server Overview (Runtime)

atome-server runs from `target/release/atome-server` (source `atome/servers/atome-server/src/main.rs`), started from
the project root, whose `atome/src/index.html` it checks at startup. It speaks plain HTTP on its port; TLS is Nginx's.
WebSocket owns application operations; HTTP owns bootstrap, health/configuration discovery, diagnostics, and explicit file/media/archive resource transfer.

### Start Options (Advanced)

```bash
# Foreground HTTP server for development or manual diagnostics
./run.sh --server

# Manual (builds if needed, then runs atome-server directly)
./scripts/run_fastify.sh
```

For installed production servers, prefer the service commands above (`./run.sh
--https`, `./run.sh restart`, `./run.sh status`, and `./run.sh logs`) so atome-server
continues to run under systemd or rc.d behind Nginx.

### Key Endpoints

Assuming `PORT=3001` (default):

* `GET http://localhost:3001/health` - basic health + uptime
* `GET http://localhost:3001/api/server-info` - version + server type
* `ws://localhost:3001/ws/api` - authenticated request/response application API
* `ws://localhost:3001/ws/sync` - authenticated, permission-scoped notification WebSocket

Nginx must preserve WebSocket upgrade headers for both paths. A `/ws/sync` client must authenticate before receiving `welcome`; an HTTP application-operation fallback indicates a deployment or client defect.

After installation or update, run:

```bash
npm run check:websocket-only-transport
```

The HTTP routes are mounted by `atome/servers/atome-server/src/http/` (the list is in
`.codex/modules/05-api-rendering-and-ui.md`, « Existing HTTP divergences »).
For the minimal shared `/ws/sync` protocol, see `atome/documentations/sync_protocol.md`.

### Manual Service Management (Advanced)

If you prefer using native system commands:

**Linux (systemd):**

```bash
systemctl status squirrel --no-pager -l
systemctl start squirrel
systemctl stop squirrel
journalctl -u squirrel -f -l  # Logs
```

**FreeBSD (rc.d):**

```bash
service squirrel status
service squirrel start
service squirrel stop
tail -f /var/log/messages  # Logs (or specific app log if configured)
```

---

## 📱 iOS, AUv3, Tauri and Android: the local server

The iOS app and its AUv3 extension, like Tauri and Android, run **atome-server's local module**
(`atome/servers/atome-server/src/local/`, the "AiS server" of older docs) inside their own process, on one SQLite
vault (`adole.db`, in the app group's container on iOS). On iOS, `platforms/ios/atome-auv3/Common/LocalServer.swift`
only starts it (paths, the keychain's session key, the device key's verifier) and rebinds it when iOS takes its
listening socket back during a suspension; it answers on loopback only.

* It serves the same client and the same routes as atome-server, so the page works offline through it.
* It syncs with atome-server (`SQUIRREL_FASTIFY_URL`, `https://atome.one` by default) through its sync queue
  (`local_atome_sync_worker.rs`) and relays what only the cloud does (`public_relay.rs`, `provider_relay.rs`).
* Offline it stays the local read/write authority and replays its changes once atome-server is reachable.
* Nothing is installed by hand: it is built into the app (Xcode for iOS/AUv3; `atome-server` with
  `default-features = false`, so no SFU).

The realtime sync protocol both sides speak is `atome/documentations/sync_protocol.md`.

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
* Build `atome-server` and `atome-vault` (`cargo build --release --locked`; the Rust toolchain must be installed on the host,
  and the visio worker's build tools, below: the update stops with `c++ is missing` or `python3 pip is missing` otherwise)
* Run one confined vault on the host (`scripts/check_vault_confinement.mjs`): Linux ≥ 5.19 with Landlock enabled
  (`landlock` in `/sys/kernel/security/lsm`), and every folder above the vault root crossable (`o+x`); otherwise the
  update stops before the restart
* Restart the system service (`squirrel`, running `atome-server`) and reload Nginx

> ⚠️ Avoid running `git clean -fd` on production unless you also reinstall dependencies and restore your environment files.

### Visio: what the host needs (since 2026-11-06)

The calls' SFU runs inside `atome-server` (`atome/servers/atome-server/src/visio/`, the `mediasoup` crate 0.21.0);
no Node process and no `mediasoup-worker` binary is involved.

* **Build (Debian 12, arm64 or x86_64)**: the crate compiles the C++ worker during `cargo build` (about 8 minutes the
  first time, then cached in `target/`). It needs a C++17 compiler (`build-essential`, `g++`), `python3` with pip
  (`python3-pip`; pip installs meson and ninja into the build folder, nothing system-wide) and network access to
  PyPI and to the meson wraps (abseil, openssl, libuv, libsrtp, usrsctp, flatbuffers, liburing are downloaded and
  built statically). `scripts/server_update.js` installs both packages and checks them before the build. Two builds
  of the worker in two target directories at the same moment break each other (they share the crate's
  `subprojects/` folder in `~/.cargo/registry`): build in the one `target/`.
* **Settings** (`/etc/squirrel/squirrel.env`), read once at startup; an invalid value stops the server with
  `<NAME>_invalid`: `MEDIASOUP_LISTEN_IP` (default `127.0.0.1`; a public
  server sets `0.0.0.0`), `MEDIASOUP_ANNOUNCED_IP` (the public IP the ICE candidates announce; without it on a
  loopback listen address the log warns that remote clients exchange no media), `MEDIASOUP_RTC_MIN_PORT` /
  `MEDIASOUP_RTC_MAX_PORT` (default 40000–49999; staging keeps 50000–50999).
* **Firewall**: the RTC port range open in UDP and TCP (UDP preferred, TCP when UDP is blocked).
* **Startup**: the worker starts once, before the server listens; a worker that cannot start is the server's startup
  error (`visio_worker_start_failed:…`), and a worker that dies ends the process (systemd restarts it).
* Tauri and the iOS app build `atome-server` with `default-features = false`: their local servers carry no SFU.

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
