# Contact plates without photo on every device but the one that imported them

## Symptom

iPad, 14 Nov. 2026 (R-163): the Contacts plates and Carnet rows showed the empty identity
glyph for most people; console `[AudioSchemeHandler] file missing … contact_photo_<hash>.jpg`.

## Evidence

- 995 cards of the account kept `photo` / `user_face` = `/file/data/users/<device>/Downloads/contact_photo_<hash>.jpg`
  (a path inside the importing device) and `photo_asset_id` naming an `image` atome whose
  `media_url` is on the server; 0 had an inline photo.
- The server answered the media (authorized fetch with the media token).

## Root cause

Before 24 Oct. 2026 an imported photo was stored as a file and the card kept that device's
local path. Since then photos are written inline (data URL, `photo_media.js#persistContactPhoto`),
but the older cards were never repaired: on any other device the path resolves to nothing.

## Correction

`atome/src/squirrel/contacts/photo_media.js#readStoredContactPhoto` reads the stored image
from the server (`fetchAuthorizedMedia`, owner checked, JPEG/PNG/WebP, ≤ 1 MiB inline) and
`local_source.js#inlineStoredPhotos` rewrites each such card through the canonical commit,
inline, or without photo when the server no longer holds it (404). Unreachable server, a
media not yet here or an HTTP error leave the card for a later pass (`pending`).
`bootstrap.js#inlineStoredPhotosOnce` runs it once per owner and page after the book's sync,
again later while some remain pending. The cards then travel inline to every device.

## Regression checks

- `tests/eve/contact_stored_photo.test.mjs` (inline / removed / idempotent; pending on
  network error, missing asset, HTTP 503; another owner's asset refused).
- iPad: 995 cards inline after one pass, all synchronized; a cold launch shows the photos.

## Acceptance

No card of the account names a `/file/...` photo; plates show the photo on every device.
