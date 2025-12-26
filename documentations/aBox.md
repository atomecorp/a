# aBox Dropbox-Style Workflow

This note explains how to use the built-in "aBox" drop zone to push files into the per-user Downloads area, how to pick the folders that are observed by the chokidar watcher, and how to confirm that everything flows into the Fastify/Tauri back end.

## 1. Prerequisites

- Node.js 18+ (or the runtime already bundled in Tauri).
- Project dependencies installed (`./scripts_utils/install_dependencies.sh --non-interactive`).
- PostgreSQL is optional; uploads + watcher work without the database, but file sharing and per-user access control require SQLite/libSQL.

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

`./run.sh` now exposes `DEFAULT_MONITORED_PATH` next to `DEFAULT_UPLOADS_PATH`. Update those two lines (or export `SQUIRREL_UPLOADS_DIR` / `SQUIRREL_MONITORED_DIR` yourself) and the script will export the matching `SQUIRREL_SYNC_WATCH` globs for both folders automatically before launching Fastify/Tauri. Even if you customize `SQUIRREL_SYNC_WATCH`, the Fastify watcher forcibly adds both directories so uploads stay mirrored. The default monitored inbox is `/Users/Shared/monitored` and Fastify logs `📂 Watcher detected ...` when a change occurs there.

Whenever the watcher fires, Fastify broadcasts JSON envelopes over `ws://<fastify-host>:3001/ws/sync`. The browser-side SyncEngine (see `src/squirrel/integrations/sync_engine.js`) converts them into `squirrel:adole-delta` events so you can listen for deltas anywhere in the UI.

## 4. Using the drag-and-drop UI

1. Import `src/application/aBox/index.js` from `src/application/index.js`.
2. Reload the app. You should see a dark drop zone plus a list of uploaded files.
3. Drag files or folders into the blue square. Every drop triggers `sendFileToServer`, which POSTs the blob to `/api/uploads` with the original filename + auth header (if available).
4. The "Uploaded files" list refreshes automatically by calling `GET /api/uploads` with the same auth context.

### Storage locations & sharing

- Per-user uploads: Fastify writes into `data/users/<user_id>/Downloads` (created on-demand). If no auth token is present, the user is `anonymous` and files land in `data/users/anonymous/Downloads`.
- Shared files: when a file is shared, the server creates a link in the recipient’s `Downloads/Shared/<ownerId>/` folder (hardlink when possible, symlink fallback) so data is not duplicated.
- Default monitored inbox: `DEFAULT_MONITORED_PATH` is `/Users/Shared/monitored`, kept separate from user downloads so the watcher never loops on freshly written files.
- Mirror behavior: changes in either `SQUIRREL_MONITORED_DIR` or `SQUIRREL_UPLOADS_DIR` are mirrored to the other side (adds/changes copy the file, deletions remove it) so both folders stay in sync.
- Legacy uploads dir (watcher): `SQUIRREL_UPLOADS_DIR` is now a legacy/sync watcher target (default `data/users/anonymous/Downloads`). You can change it in `run.sh` or export `SQUIRREL_UPLOADS_DIR` before starting the server.

## 5. Verifying the pipeline

1. **Console**: Watch the Fastify terminal. You should see `sync:handshake` followed by `sync:file-event` logs when the watcher detects the new file.
2. **Browser**: Open DevTools → Console and run:

   ```js
   window.addEventListener('squirrel:adole-delta', (evt) => console.log('delta', evt.detail));
   ```

   Drop another file; the delta payload should print immediately.
3. **API**: Request `GET http://127.0.0.1:3001/api/uploads` (or `/api/uploads` inside the app). The JSON response must list the filename + size that you just dropped (scoped to your user).
4. **Filesystem**: Inspect the Downloads directory directly. Example Fastify build:

   ```bash
   ls -lh data/users/<user_id>/Downloads
   ```

If all four checks work, the "dropbox" flow is fully operational.

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| WebSocket fails to connect | Keep Fastify running on port 3001; SyncEngine will automatically connect to `ws://127.0.0.1:3001/ws/sync`. To force the endpoint, set `window.__SQUIRREL_SYNC_WS__ = 'ws://127.0.0.1:3001/ws/sync'` before loading `spark.js`. |
| No files listed in the UI | Ensure `/api/uploads` is reachable. Check browser console for `Unable to load uploads`. |
| Files not written to disk | Verify write permissions on `data/users/<user_id>/Downloads` (Fastify) or the Tauri app-data directory. |
| Tauri upload blocked | Ensure `X-Filename` is allowed in CORS and that the client sends an auth token; otherwise the upload falls back to `anonymous`. |
| Watcher ignores a folder | Update `SQUIRREL_SYNC_WATCH` or the `watch` array so the folder pattern is included, then restart the server. |
| Dropped folders skipped | The current drag/drop helper flattens files. Use a zip if the host browser does not expose directory entries. |

With this setup you have a lightweight Dropbox-style pipeline: chokidar detects local edits, Fastify/Tauri relays structured deltas, and the aBox UI keeps the upload list in sync.

## 7. Bidirectional sync details

- `SQUIRREL_MONITORED_DIR` is the inbox you drag files into (defaults to `/Users/Shared/monitored`). `SQUIRREL_UPLOADS_DIR` is where Fastify writes the blobs (defaults to `src/assets/uploads`).
- The watcher fires for both directories even if `SQUIRREL_SYNC_WATCH` was customized, because `server/aBoxServer.js` calls `watcher.add([monitoredDir, uploadsDir])` at startup.
- When chokidar emits an add/change/unlink from either directory, the Fastify layer mirrors the change into the other directory (adds copy the file, deletes remove the mirrored copy). A short-lived guard prevents infinite loops when the mirrored write triggers another file event.
- To verify in both directions, run Fastify, then:

   ```bash
   touch "$SQUIRREL_MONITORED_DIR/test.txt"
   rm "$SQUIRREL_MONITORED_DIR/test.txt"
   touch "$SQUIRREL_UPLOADS_DIR/test.txt"
   rm "$SQUIRREL_UPLOADS_DIR/test.txt"
   ```

   You should see `test.txt` appear/disappear in the opposite directory after each pair of commands, and the Fastify log will print the mirror actions.
