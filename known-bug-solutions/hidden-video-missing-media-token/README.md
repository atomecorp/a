# A recorded video never plays in a Bevy surface on Web (Fastify): decoder error 4

## Symptom

A video recording (`/api/recordings/…`) stays black or frozen in a Bevy-rendered
preview; `getBevyVideoDecodeStatus(id)` reports `exists: true, active: true,
errored: true, errorCode: 4, readyState: 0`. The same URL with `media_token`
plays; without it Fastify answers `404 application/json`.

## Root cause

`render_atom.js` normalizes a media source with
`normalizeApiMediaRouteSourceFromProperties`, which drops `token` /
`media_token` from the query. `syncBevyVideoDecodeSources` then gave that bare
URL to the hidden `<video>`. A `<video>` cannot send `Authorization`; Fastify
only trusts a verified session or the signed `?media_token=` capability
(`resolveMediaDownloadIdentity`, `server/server.js`), and `media_user_id` is no
longer an identity.

## Fix (2026-10-13)

`bevy_video_decode_source_runtime.js` gives the hidden element
`appendStreamingMediaAuthQuery(source)` — the helper every other media player
uses (local servers get no token, Fastify gets the session capability). The
decode entry keeps the projection source, so its identity/compare logic is
unchanged.

## Regression check

`temp/dashboard_fix/quick_contact_takes_real_app.probe.mjs` (HEADLESS=0):
« Lire : la video de la prise joue dans l apercu » and « pixels de l apercu en
mouvement ». The `decodeDiag` block in that probe prints the hidden `<video>`
`src`, its error code and a `fetch` of the same URL.

## Rejected hypotheses

- Dashboard suspension: it was a second, independent blocker (a UI preview on
  the Dashboard is now a `presentation` request), but the entry existed and was
  `active` while still failing with error 4.
- Codec / container: the file is H.264/AAC MP4 and plays once the token is present.
