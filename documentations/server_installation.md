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

The configuration is stored in the `.env` file in the project root.
The installer generates a default one for you.

```bash
# .env example
NODE_ENV=production
PORT=3001
HOST=127.0.0.1
ADOLE_PG_DSN=postgres://postgres:postgres@localhost:5432/squirrel
SQUIRREL_UPLOADS_DIR=/opt/a/uploads
```

* **HOST=127.0.0.1**: Ensures the Node.js server is only accessible via Nginx (security).
* **PORT**: Internal port (default 3001).

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

## 🔄 Updating the Server

To update the application code and dependencies:

```bash
# 1. Pull latest changes
git pull

# 2. Update dependencies (if needed)
./install_full.sh

# 3. Restart the server
./run_server.sh restart
```
