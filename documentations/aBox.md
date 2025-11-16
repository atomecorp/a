# aBox Dropbox-Style Workflow

This note explains how to use the built-in "aBox" drop zone to push files into the local uploads area, how to pick the folders that are observed by the chokidar watcher, and how to confirm that everything flows into the Fastify/Tauri back end.

## 1. Prerequisites

- Node.js 18+ (or the runtime already bundled in Tauri).
- Project dependencies installed (`./scripts_utils/install_dependencies.sh --non-interactive`).
- PostgreSQL is optional; uploads + watcher work without the database.

## 2. Start the runtimes

Choose one of the developer stacks:

### Fastify + browser

```bash
npm run start:server
```

Open `http://localhost:3001` and make sure `src/application/aBox/index.js` is imported (see `src/application/index.js`).

### Tauri desktop build

```bash
scripts_utils/run_tauri.sh
```

Tauri spawns two servers for you: Axum on `127.0.0.1:3000` (static files/upload API) and Fastify on `127.0.0.1:3001` (watcher + WebSocket stream).

## 3. Watcher configuration

The chokidar watcher lives in `server/sync/fileSyncWatcher.js`. By default it tracks:

```text
src/application/**/*.js
src/squirrel/**/*.js
server/**/*.js
scripts_utils/**/*.js
src/assets/**/*
```

You can override the watch list without touching the code:

- **Permanent change**: edit `startFileSyncWatcher({ watch: [...] })` inside `server/server.js` and restart the server.
- **Temporary change**: export `SQUIRREL_SYNC_WATCH="/absolute/path/**/*"` before starting Fastify/Tauri. Separate multiple globs with commas. Example:

   ```bash
   SQUIRREL_SYNC_WATCH="src/assets/uploads/**/*" npm run start:server
   ```

- To ignore extra folders, set `SQUIRREL_SYNC_IGNORE` with glob patterns (same comma-separated format).

Whenever the watcher fires, Fastify broadcasts JSON envelopes over `ws://<fastify-host>:3001/ws/events`. The browser-side SyncEngine (see `src/squirrel/integrations/sync_engine.js`) converts them into `squirrel:adole-delta` events so you can listen for deltas anywhere in the UI.

## 4. Using the drag-and-drop UI

1. Import `src/application/aBox/index.js` from `src/application/index.js`.
2. Reload the app. You should see a dark drop zone plus a list of uploaded files.
3. Drag files or folders into the blue square. Every drop triggers `sendFileToServer`, which POSTs the blob to `/api/uploads` with the original filename.
4. The "Uploaded files" list refreshes automatically by calling `GET /api/uploads`.

### Storage locations

- Default (Fastify & Tauri): both servers write to `src/assets/uploads` inside the repo so the watcher can see every drop.
- `./run.sh` now exports `SQUIRREL_UPLOADS_DIR` to that repo folder automatically, so both runtimes share it without extra steps during local dev.
- Custom path: set `SQUIRREL_UPLOADS_DIR` before launching either server (or edit it in `run.sh`). Relative values are resolved from the project root; absolute paths are used as-is.
- Sandboxed fallback: if Tauri cannot write to the shared path (e.g., a packaged, read-only bundle), it falls back to its app-data directory and logs the override.

## 5. Verifying the pipeline

1. **Console**: Watch the Fastify terminal. You should see `sync:handshake` followed by `sync:file-event` logs when the watcher detects the new file.
2. **Browser**: Open DevTools → Console and run:

   ```js
   window.addEventListener('squirrel:adole-delta', (evt) => console.log('delta', evt.detail));
   ```

   Drop another file; the delta payload should print immediately.
3. **API**: Request `GET http://127.0.0.1:3001/api/uploads` (or `/api/uploads` inside the app). The JSON response must list the filename + size that you just dropped.
4. **Filesystem**: Inspect the uploads directory directly. Example Fastify build:

   ```bash
   ls -lh src/assets/uploads
   ```

If all four checks work, the "dropbox" flow is fully operational.

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| WebSocket fails on `ws://127.0.0.1:3000/ws/events` | Keep Fastify running on port 3001; SyncEngine will automatically fall back. To force the endpoint, set `window.__SQUIRREL_SYNC_WS__ = 'ws://127.0.0.1:3001/ws/events'` before loading `spark.js`. |
| No files listed in the UI | Ensure `/api/uploads` is reachable. Check browser console for `Unable to load uploads`. |
| Files not written to disk | Verify write permissions on `src/assets/uploads` (Fastify) or the Tauri app-data directory. |
| Watcher ignores a folder | Update `SQUIRREL_SYNC_WATCH` or the `watch` array so the folder pattern is included, then restart the server. |
| Dropped folders skipped | The current drag/drop helper flattens files. Use a zip if the host browser does not expose directory entries. |

With this setup you have a lightweight Dropbox-style pipeline: chokidar detects local edits, Fastify/Tauri relays structured deltas, and the aBox UI keeps the upload list in sync.
