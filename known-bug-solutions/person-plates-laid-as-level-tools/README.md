# Rencontre plates empty: small tools with the « contact » glyph, never the photo

## Symptom

R-163 (user, 14–15 Nov. 2026, iPhone/iPad): Contacts › Rencontre › a goal › a scope shows
the people as « fichiers vides »: small plates on the tools row, each with only the name and
the thin « contact » outline, even for a person whose directory card has a photo. A person
whose profile photo was taken whole from a phone does not appear at all.

## Evidence

Reproduced on the Web stack with test accounts only (isolated server, temp database;
`temp/meeting_photo_2026-11-15/rencontre.probe.mjs`, three adult public peers declaring
« friendship »: Ana with a 2.7 MB JPEG, Ben without photo, Cleo with a PNG):

- `directory.meet` served Cleo's `user_face` (a 66 KB `data:image/png`), Ben's `null`, and no
  Ana at all (`out/before/report.json`).
- Each plate the Mystic drew was a 64 px tool whose only image was a 24 px
  `data:image/svg+xml` glyph: no photo, no `user.svg` (`out/before/plates.png`, `plate_tree`).
- The server log held `vault_request_too_large`: Ana's whole profile commit (name, birth date,
  Rencontre declarations, photo) was refused by the vault process (`MAX_REQUEST_BYTES`, 2 MB).

## Root cause

1. `dashboard_mystic_level_tools.js#isTool` lays as one of the level's own tools any plate
   with no data `item`, no `tile` mark and a `glyph`. `dashboardMysticLabelItem` always gives a
   glyph, and `dashboard_meeting.js` did not mark its person plates `tile`: they became tools
   (`tool: true`), so `bevy_ui_mystic_model.js#itemNode` dropped their own face (the photo, or
   `user.svg`) and drew the « contact » glyph. The objectives' people
   (`dashboard_objective_people.js`) already carried `tile: true` and were right.
2. `bevy_panel_home_profile_editor.js#applyPhotoFile` kept the chosen photo whole
   (`readImageFileAsDataUrl`): a phone photo makes a data URL of several megabytes, the
   profile commit passes the vault's 2 MB request bound and is refused; the person never
   reaches the server (AGENTS.md rule 21) nor the directory.

## Correction

- `eVe/domains/dashboard/dashboard_meeting.js`: the person plates and « Personne » are marked
  `tile: true` (data, never level tools). The plate keeps its face: the photo fills it under
  the label band (`cover`), the standard identity placeholder `user.svg` without one.
- `eVe/intuition/runtime/bevy_panel/bevy_panel_home_profile_editor.js#applyPhotoFile`: the
  profile photo is read by `readImageFileAsScaledDataUrl` (longest side 1280 px, JPEG 0.85),
  as the Rencontre photos already were (`bevy_panel_home_meeting_actions.js`). The 2.7 MB
  JPEG becomes a 234 KB data URL; the profile commit passes.

## Rejected hypotheses

- A device-bound photo path (as `contact-photo-device-bound-path`): the directory serves the
  profile's own `user_face`, an inline data URL from the profile editor; nothing to resolve.
- A server projection or privacy defect: `directory/entries.rs#publish` serves the face as
  stored; with no privacy rule `privacy_rules::allows_read` lets it through.

## Regression checks

- `tests/eve/dashboard_meeting_plates.test.mjs`: Contacts › Rencontre › Amitié › Monde laid
  through `dashboardMysticLevelTools('contacts', …)`; each person is not a tool, keeps its face,
  a photo drawn `cover`, `user.svg` without one; « Personne » kept. Fails without the fix.
- `tests/eve/first_launch_runtime.test.mjs` mocks only `readImageFileAsScaledDataUrl`: the
  photo step fails if the editor goes back to the whole-file reader.
- Probe `temp/meeting_photo_2026-11-15/rencontre.probe.mjs` (`out/after/`): 20/20 checks,
  photos on Ana's and Cleo's plates, the placeholder on Ben's, Ana's card with her photo, no
  console error or warning.

## Not covered

Contact creation (`bevy_panel_contact_create_runtime.js`) still keeps a chosen photo whole
(`readImageFileAsDataUrl`): a phone photo on a new card can hit the same vault bound.
