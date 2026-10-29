# eVe home: a choice in a rubric shows the home first; closing a panel lands on the home

## Symptom

From a rubric of the eVe home (Projets, Objectifs, the search…), choosing a
project turns every plate back into the home tiles, then the project opens.
In Capture, after a take (audio, video, photo…), the list's ✕ goes back to the
home instead of the Capture rubric. More visible on a phone (slow open).
Créer › Texte (or any panel opened from a rubric or one of its levels): its ✕
lands on the bare home instead of the rubric — on iOS after a hold in the text
(the copy/paste menu), a native prompt, or any lost focus.

## Evidence (2026-10-25)

`temp/rubric_no_home_flash/project_pick.probe.mjs` (`THROTTLE=8`, phone-like
CPU): Mystic `closing` from 83 ms to 723 ms after the tap, home shown with no
rubric until the view switch at 801 ms; screenshot = home tiles turning back.
`temp/rubric_no_home_flash/capture_flow.probe.mjs` with `BLUR=1` (a window
`blur`, as a native permission prompt or recorder does): the Capture rubric
closes under the recording list (`rubric: ''` at 6.6 s), ✕ gives the home.
`temp/panel_return_place/create_text_touch.probe.mjs` (iOS detection, touch,
keyboard following the focus): `BLUR=1` reproduces ✕ → home on the code of
the iOS build 31 (HEAD 554c87679); `HOLD=1` (a hold in the text field)
reproduced it even with causes 1–2 fixed.

## Root causes

1. `bevy_ui_mystic_activation.js#activateItem` ran a plate's action and the
   menu's closing cascade **at the same time** (`Promise.all([pending, close()])`).
   On a grid (the home's rubric) the cascade reveals the home while the
   project is still loading.
2. `mystic/context.js` closed any open menu on `window` `blur`
   (`cancelForDragStart`), even a rubric laid open and released, so a native
   prompt during a take removed the rubric hosted under the list.
3. The rubric under a stage is the same Mystic, merely suspended, and every
   generic dismissal treated it as the menu on screen: the hold in a panel field
   (`openMysticContextMenu` toggles an open menu shut — and then showed no
   copy/paste either), a `contextmenu`, a DOM click outside the canvas, a drag.
   Its `onClose` then laid the bare home under the panel, and the stage's
   close had nothing to come back to.
4. A grid plate without `closeOnSelect: false` that opened a stage still
   closed its own rubric right after its action.

## Correction

1. On a grid, the level stays on screen until the action has answered, then
   closes; a project opening removes it at once (`dismissNow` on the real view
   switch), so the home never shows. Radial menus are unchanged. A level that
   hosts what its plate opened (suspended) is not closed at all.
2. A lost focus ends the gesture under way and closes only a menu a finger
   still holds; a released menu stays.
3. `mystic/index.js#isMysticMenuShown` (open and not `isHosted()`): the generic
   dismissals of `mystic/context.js` (blur, `contextmenu`, click outside, drag,
   the copy/paste toggle) act on a menu shown only; a hosted grid belongs to
   its host. The hold in a hosted panel's field now opens the copy/paste menu.
4. One owner of the way back, `eVe/domains/dashboard/dashboard_stage_host.js`:
   when a stage opens it keeps the origin (rubric, anchor, query, the Mystic's
   `measure().levels` and `page`); its close resumes the suspended grid, or —
   if something closed that rubric meanwhile — reopens it at once at that place
   (`openAt({ place })`, `bevy_ui_mystic_activation.js#layPlace`: levels and
   page laid before the first render, no cascade from the home tiles). A rubric
   closed under a stage stays the logical place (title, hidden tiles) until then.
   Ways out elsewhere (another rubric, the long press on Back, the Atom's
   slide) forget the origin first (`leaveForHome`).
5. A program found by the home search opens on the stage (it was a floating
   panel over the bare home).
6. (2026-10-27) Closing a panel shrank it into its plate BEFORE the suspended
   rubric came back (`dashboard_mystic_stage.js#closePanel`): ~400 ms of bare
   wallpaper, the home to the eye, on every panel of the eVe home. The stage now
   gives the rubric back first, then the panel shrinks into its plate over it.
   Probe `temp/contact_directory/close_flash.probe.mjs` (frames + timeline).

## Acceptance

`THROTTLE=8 HEADLESS=0 node temp/rubric_no_home_flash/project_pick.probe.mjs`:
no frame with the home active and no rubric before the project view; a held
Mystic still closes on `blur`.
`BLUR=1 HEADLESS=0 node temp/rubric_no_home_flash/capture_flow.probe.mjs`:
the rubric stays `capture` from its opening through the ✕.
`temp/panel_return_place/`: `create_text`, `create_text_touch` (`HOLD=1`,
`BLUR=1`), `sublevel` (`VARIANT=hold|blur|plain`: back in Contacts › + with the
same level and plates), `search_program`, `frames` (`HOLD=1 HEADLESS=0`: the
panel shrinks over the wallpaper, then the rubric's plates at once — no home
tile on any frame).
Rule: closing anything opened from a rubric comes back to that rubric, level
and page; only an explicit way home (long press on Back, the Atom's slide)
goes home.
