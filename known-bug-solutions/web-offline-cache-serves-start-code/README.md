# A Web change does not show: the browser keeps the code of the server's start

## Symptom

A JavaScript or asset change is in the working tree and a fresh isolated
server shows it, but the user's browser on the dev server (3001) still shows
the old behaviour, even after a reload (2026-10-27: the navigation arrows kept
their removed pulsing halo). Restarting the server helps only until the next
file edit.

## Confirmed root cause

`server/offline_app_assets.js` built `/offline-manifest.js` (url + SHA-256 of
every public asset) once, at the server's start. `atome/src/sw.js` serves every
manifest asset from its cache only, and installs a new version only when every
fetched file matches its manifest digest. After any edit, the frozen digest no
longer matched: every install failed (`offline_asset_integrity_failed`) and the
service worker already active kept serving the files of the server's start. With
several sessions editing in parallel, even a restart was outdated within minutes.

## Durable correction

`registerOfflineAppAssets` keeps the manifest in step with the files: a
recursive `fs.watch` on each root reads again only the changed path (file
hashed, directory walked, missing path or link forgotten), settles 150 ms, then
republishes the version. The next navigation sees a new manifest, the service
worker installs it and drops the old cache.

## Regression check

`node temp/nav_arrow_halo/offline_manifest_follow.probe.mjs` (to be moved under
`tests/` if kept): edit, new directory, skipped paths, removal, rename, and the
startup manifest equal to the former full walk on the real roots.

## Acceptance

On 3001, a fresh browser becomes controlled by the service worker and gets the
current files; after another edit, the next visit installs the new cache version.
Immediate relief on an affected browser: Cmd+Shift+R (bypasses the worker).
