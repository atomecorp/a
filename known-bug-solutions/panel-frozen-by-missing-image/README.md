# A panel stays on its first frame ("Chargement des contacts") and ignores taps

## Symptom

iPad 2026-10-11: the Contacts panel (also the user's own card) kept showing its
first projection — the own row plus "Chargement des contacts" — forever; a tap
on the own row reached the right BevyUI node but nothing changed. The console
repeated `Unhandled Promise: Error: bevy_media_texture_fetch_failed:404` and
`[AudioSchemeHandler] file missing … contact_photo_<hash>.jpg`.

## Evidence

- The panel runtime's logical tree (`bevyPanelRuntimeState.mounted.get('contact').tree`)
  already held the full list (89 people, 296 nodes); the BevyUI runtime still
  projected the first tree (`readOverlayDiagnostics()`: 24 records, 10 nodes).
- `collectPeopleDirectory` alone answered in 286 ms: loading was finished.

## Root cause

`eVe/domains/rendering/bevy_ui_image_runtime.js::hydrateImageNode` rejected the
whole tree when one image could not be resolved. A contact photo referenced by
the synchronized profile but absent from this device answered 404, so every
refresh of the panel rejected in `projectPanelStack` and the screen kept the
previous projection.

## Correction

A failed (non-aborted) image resolution now fails only its node: the node is
projected without image payload and carries `imageError` with the cause; the
rest of the tree is projected. An abort still returns `null` as before.

## Regression checks

- `tests/eve/bevy_ui_image_hydration_contract.test.mjs`: "an unavailable image
  source fails only its node, never the whole panel tree" (fails before the fix).
- iPad: open Utilisateur → the full list appears; tap the own row → the card
  (Identité et photo, Bio, Profil, Réglages, déconnecter) opens.

## Open

The missing contact photo itself (media present on another device, not on this
iPad) is a separate media synchronization question — **To verify**.
