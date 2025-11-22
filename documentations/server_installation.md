# Server Installation (Standalone)

This guide explains how to install and run the **Atome** server on a Linux machine (Debian/Ubuntu recommended) or macOS, without the graphical interface (Tauri).

## Prerequisites

* **Git** installed (`sudo apt install git` or `brew install git`)
* **Internet Access** (to download Node.js, PostgreSQL, and libraries)
* *(Optional)* A domain name pointing to the server for HTTPS (e.g., `atome.one`)

## Quick Installation

Simply run these commands:

```bash
# 1. Clone the repository
git clone https://github.com/atomecorp/a
cd a

# 2. Run the automated installation script
# This script will:
# - Install Node.js and dependencies
# - Install and configure PostgreSQL (user/db creation)
# - Download frontend libraries (Tone.js, Leaflet, etc.)
# - Propose HTTPS configuration (Let's Encrypt)
./install_server.sh
```

## Running the Server

Once the installation is complete, start the server with:

```bash
./run_server.sh
```

The server will be accessible at:

* **HTTP**: `http://your-ip:3001`
* **HTTPS**: `https://your-domain:3001` (if configured)

## Technical Details

### What `install_server.sh` does

* Checks and installs system dependencies (psql, etc.).
* Automatically configures the `squirrel` database with the `postgres` user.
* Calls `install_update_all_libraries.sh` to fetch JS/CSS assets.
* Detects if you are on Linux to propose SSL certificate generation via Certbot.

### What `run_server.sh` does

* Loads environment variables (`.env`).
* Detects SSL certificates (Production or Self-signed).
* Starts the Fastify server (`server/server.js`).

## Updates

To update the server later:

```bash
git pull
./install_server.sh
```
