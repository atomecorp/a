# Shared media answers 403 in the browser: the service worker refused another account's `/api/uploads`

## Symptom

On the Web, a media that another account shares with this one (a shared project's
proxy, a picture or a sound of a live shared folder) fails to load in the
recipient's browser: `GET /api/uploads/<file>?media_user_id=<sharer>` answers
`403` with an empty body. It is intermittent: the same request passes when the
page is not yet controlled by the service worker (first load, hard reload) and
fails once it is. A `fetch` of the same URL from Node, or with the service
worker bypassed, answers `200` — the server itself allows it.

## Root cause

`atome/src/offline_media.js#atomeLocalMediaResponse`, the service worker's
reader of the browser file store, refused any `/api/uploads/…` request whose
`media_user_id` was not the signed-in account (`authorization.id !== owner` →
`403`). That rule was written to keep one identity from reading another's
*local* files, but it also stopped every request for another account's medium,
which is never in this device's store and must go to the server, the only one
able to decide from the share (atome-server `media/downloads.rs#can_read`).

## Fix (2026-11-25, register R-349 lot 3b)

The service worker still answers `403` without an owner, without a signed-in
identity, or when the identity is locked (sign-out closes the boundary at
once). When the owner is another account, it passes the request on to the
server (`return fetch(request)`) instead of refusing it; the local store is
read only for the person's own files. The local read of another account stays
closed.

## Regression check

- `temp/r349_share_proxy/lot3b/ui.probe.mjs` (two accounts, isolated server):
  notes `bob_service_worker.controlled: true`, then « Bob télécharge le fichier
  du proxy (Bearer) » and « (media_token) » both `200`, and the proxy plays.
- `temp/r349_share_proxy/final/retest.probe.mjs`: Bob plays the shared Ogg and
  MP4 proxies in the Médiathèque viewer at Écoute, Lecture and Écriture with
  the page controlled by the service worker; its error list carries no `403`
  on `/api/uploads`.

## Rejected hypotheses

- Server rights (`share_access_listen_only`): the server answered `200` to the
  same URL with the same session; the `403` never reached its log.
- A missing `media_token`: the request carried it; the refusal happened before
  any network request.
