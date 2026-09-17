# iOS wallpaper: the opaque `atome:` origin cannot read an http response

## Symptom

In the user panel on iOS, **Import a background** and **Download a background**
both leave the surface unchanged. No error is shown. The same two actions work
in Tauri and in the browser. The preference is sometimes saved, so the panel
looks as if it had succeeded while the surface never changes.

## Confirmed cause

WKWebView serves the app from the custom `atome:` scheme. WebKit treats that
origin as **opaque**, and two CORS walls follow from it:

1. **Local Swift server.** `LocalHTTPServer.swift` answers every media response
   with `Access-Control-Allow-Origin: *` and no `Access-Control-Allow-Credentials`.
   `eVe/user/background.js` fetched the wallpaper bytes with
   `credentials: 'include'`, and the Fetch spec forbids reading a `*` response in
   that mode: the fetch fails before the server is consulted, the rejection is
   swallowed by the `.catch()` around `resolveProtectedBackgroundObjectUrl`, and
   nothing reaches `publishBevySurfaceBackground`.
   Measured in a real engine with the exact Swift headers:
   `include: BLOQUE (Failed to fetch)` / `omit: OK 200`.
2. **Cloud Fastify.** `isAllowedCorsOrigin` in `server/server.js` admits only
   loopback and `tauri://localhost` origins, and @fastify/cors then answers a
   request from the phone with **no** CORS header at all — and does not answer
   its preflight either (verified: `OPTIONS` falls through to a 404). Every
   http call the WebView makes to atome.one is therefore unreadable, including
   `POST /api/uploads/remote-wallpaper` (the random download) and the
   `GET /api/uploads/:file` that serves the stored wallpaper.

This is why the rest of the app is unaffected: iOS reaches the cloud over the
`/ws/api` WebSocket, which no CORS check applies to. The wallpaper was the rare
feature that needed plain HTTP.

The media pipeline already knew this rule —
`resolveProtectedMediaFetchCredentials` returns `'omit'` for the local native
backend — but `eVe/user/background.js` had its own fetch and never adopted it.

## Durable correction

- `eVe/domains/media/shared/opaque_origin.js` is the single authority:
  `isOpaqueWebOrigin()` (protocol `atome:` / `asset:` / `ipc:`) and
  `resolveOpaqueSafeFetchCredentials()`. Authentication on that origin travels
  as a bearer token and user hints in headers, never as a cookie, so `omit` is
  not a downgrade: it is the only mode that can be read at all.
- `eVe/user/background.js`, the A-Box upload transport (uploads list, download,
  wallpaper POST) and the cloud pull in `media_api_local_availability.js` read
  that rule instead of hard-coding `'include'`. No other runtime's mode changes.
- `asset_box_file_upload.js` no longer prefers the cloud base from an opaque
  origin: the write would leave and its answer would be unreadable, so the file
  would exist nowhere the session can name. The local server owns it there and
  the native sync carries it to the cloud.
- `server/cors_policies.js` gives the media routes (`/api/uploads`,
  `/api/recordings`, `/api/extract-audio`) the policy `/api/server/verify`
  already used for this same origin: wildcard origin, **no** credentials, bearer
  auth only. Applied from an `onSend` hook so it also lands on a preflight
  @fastify/cors short-circuits, plus explicit `OPTIONS` routes because that
  plugin answers a preflight only for an allowlisted origin. Every other route
  stays on the restricted, credentialed allowlist.

## Regression evidence

- `temp/ios_background_cors_probe.mjs`: the credentials decision is `omit` from
  an `atome:` origin (local and cloud URLs) and stays `include` on the web.
- `temp/ios_opaque_origin_server_cors_probe.mjs`: real @fastify/cors —
  preflight and response readable from `atome://`, other routes still closed to
  it, `tauri://localhost` keeps its reflected origin with credentials.
- Real Fastify booted on port 3097: `OPTIONS /api/uploads/remote-wallpaper` with
  `Origin: atome://` → 204 + `Access-Control-Allow-Origin: *` with no
  `Access-Control-Allow-Credentials`; `GET /api/uploads/x` with
  `Origin: tauri://localhost` → reflected origin + credentials; `/api/server/identity`
  → no CORS header for `atome://`.
- Browser-engine check against the exact Swift header set: `include` blocked,
  `omit` returns the image bytes.
- `node platforms/ios/package_ios_runtime.mjs`: 619 files, the new rule present
  in the packaged chunk.

## Offline is the iOS contract, and the fix strengthens it

iOS must work with no server reachable. `temp/ios_offline_background_probe.mjs`
holds that line for real: the Swift server is mimicked with its exact headers on
loopback, a cloud token AND a cloud base are present, and every outbound fetch
that is not 127.0.0.1 throws `Load failed` the way WebKit does in airplane mode.
Importing a background then succeeds with **zero** outbound call, resolves to
`http://127.0.0.1:<port>/api/uploads/…`, and returns byte-for-byte the image
that was imported.

Run against a pristine `HEAD` copy of eVe, the same probe fails on every count:
the import left for `https://atome.one/api/uploads` and died there. Preferring
the cloud from the opaque origin was itself the offline defect — the fix removes
a cloud dependency rather than adding one.

The server-side CORS policy matters only for **Download a background**, which
fetches a random image from the internet and can therefore never work offline on
any platform. Nothing on the offline path (import, display, local read) consults
it: the local Swift server already answers `*` on its own.

## Required native acceptance

1. Deploy the server (the cloud fix is server-side) and rebuild the iOS app.
2. User panel → Import a background: the surface must show the image, and it
   must still be there after a relaunch.
3. User panel → Download a background: repeated presses must each show a new
   wallpaper.
4. Tauri and the browser must keep working unchanged — they exercise the
   credentialed path this fix deliberately leaves alone.
