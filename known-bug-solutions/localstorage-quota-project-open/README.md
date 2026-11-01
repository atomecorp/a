# Opening or creating a project returns at once to the Dashboard (iOS, a used account)

## Symptom

iOS 1.46 (44), iPhone 17 Pro, 2026-11-01: touching a project shows the wallpaper ~2.5 s, then the Dashboard comes back;
Créer › Projet vide does the same. Web probes stay green (fresh profile). The native console
(`xcrun devicectl device process launch --console one.atome.app`) repeats
`[APP][console] Error: QuotaExceededError … setItem … persistScope`.

## Cause

The sync engine kept the streams it follows and their cursors in `localStorage`, rewritten whole after each burst
(`atome/src/squirrel/apis/unified/sync_engine.js#persistScope`). A used account follows one stream per atome:
66 295 streams, 10.49 MB (UTF-16) — the whole WebKit quota (~5 M characters). Every other `localStorage.setItem` then
throws. `project_workspace_activation_runtime.js#runProjectActivation` → `api.projects.setCurrent(…, persist=true)` →
`adole_api/session.js#setCurrentProjectCache` → `storage.js#writeStorage` throws → the activation fails → Dashboard.

Read the device's storage without changing it: `xcrun devicectl device copy from --domain-type appDataContainer
--domain-identifier one.atome.app --source "Library/WebKit/WebsiteData/Default/<hash>/<hash>/LocalStorage/localstorage.sqlite3"`,
then `sqlite3 … "select key, length(value) from ItemTable order by 2 desc"`.

## Fix

`atome/src/squirrel/apis/unified/sync_scope_store.js`: streams and cursors live in IndexedDB, one record per scope;
the scopes still in `localStorage` are moved once, then both keys are removed. `sync_engine.js` loads the scope
asynchronously, merges streams observed meanwhile, never writes before the stored scope arrived, and opens the socket
once it is read. No catch was added around `setCurrent`.

## Regression

`tests/eve/sync_engine.test.mjs` « SyncEngine keeps tens of thousands of streams out of a localStorage quota » and
« moves the localStorage scopes to IndexedDB once… ».

## Acceptance

On the device: five openings of existing projects and five empty creations stay in the project; after the first
launch with the fix, `localStorage` no longer holds `squirrel_sync_streams_v1` / `squirrel_sync_cursors_v1`.
Never store a collection that grows with the account in `localStorage`.
