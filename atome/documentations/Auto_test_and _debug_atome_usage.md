# How To Use Test & Debug System

This guide explains how to enable, use, and disable the test/debug tooling that was added.

## Prerequisites (one-time)

- Install JS deps: `npm install`
- Build Rust deps (if you use Tauri/Axum): `cargo build` from `src-tauri`

## Enable

### Start the log aggregator (optional but recommended)

```
npm run dev:logs
```

This starts the WebSocket stream at `ws://localhost:7777/dev/logs`.

### Start the app servers

- Fastify: `npm run start:server`
- Tauri/Axum: your usual `tauri dev` or `./run.sh`

### Enable the Dev Console UI

Pick one:

1) Add `?devconsole=1` to the app URL  
2) Set localStorage: `localStorage.atome_dev_console = "1"`  
3) Set before app boot: `window.__ATOME_DEV_CONSOLE__ = true`

## Use

### Where logs go

- Fastify: `logs/fastify.log`
- Axum/Tauri: `logs/axum.log`
- Browser console: `logs/browser.log`

### UI snapshot button

The Dev Console has a "Snapshot" button. It calls:

- `http://127.0.0.1:3000/dev/state` (Axum)
- `http://127.0.0.1:3001/dev/state` (Fastify)

Then it writes a snapshot file to:

- `logs/snapshots/snapshot-<timestamp>.json`

### UI test runner

```
npm run dev:test-ui -- scenario=<name>
```

Reports are stored in:

- `logs/ui-tests/<scenario-name>.report.json`
- screenshots: `logs/ui-tests/<scenario-name>-step-<n>.png`

## Disable

### Quick disable (no UI, no forwarding)

- Do not run `npm run dev:logs`
- Do not set `?devconsole=1` or `localStorage.atome_dev_console`

### Hard disable (code)

In `src/squirrel/spark.js`, comment out:

```
import './dev/logging.js';
import './dev/dev_console.js';
```

This removes console forwarding and the Dev Console UI entirely.

### Disable console wrapper only

If you need to keep the Dev Console UI but stop console forwarding,
set this before `squirrel/spark.js` loads:

```
window.__ATOME_CONSOLE_WRAPPED__ = true;
```

## Common Troubleshooting

- Dev Console says "ws: disconnected":
  - Ensure `npm run dev:logs` is running.
  - Check the WS URL: `ws://localhost:7777/dev/logs`.

- No browser logs:
  - Ensure Fastify is running (`npm run start:server`).
  - Confirm `logs/browser.log` is writable.
