# Wallpaper selection races

2026-10-09 — Reproduced against the real JavaScript preference and media owners
with mocked transport boundaries; physical-device acceptance remains pending.

## Confirmed causes and repair

- `eVe/user/background.js` treated an unreadable session/profile as an absent
  wallpaper and accepted delayed profile replies after a newer selection or
  owner change. Only successful absence now resolves the default; accepted
  preferences and session/logout transitions invalidate older reads.
- Generic preference events bypassed the pending local choice protection.
  The existing resolution owner now applies that protection for every source.
- An older protected-media fetch could revoke the newest blob. Completion is
  now accepted only for the current fetch promise.
- `eVe/intuition/tools/background.js` republished profile hydration as a user
  selection. Hydration now reads the resolved `eveBackground.getParams()`;
  its independent preference polling and write path are removed.
- `background_prefs.js` allowed concurrent writes and skipped reselecting a
  saved image during an outstanding write. Saves now capture their owner and
  parameters and serialize through the existing profile mutation API.

The project colour token separately had two values: new projects used #272727,
while uncoloured projects used #a9a9a9. The existing default owner now defines
#272727 once; CSS and GPU representations derive from it. Explicit stored
colours, including #a9a9a9 and translucent values, remain unchanged.

## Regression evidence

- [Wallpaper runtime contracts](../../tests/eve/background_default_wallpaper_contract.test.mjs)
- [Panel hydration and persistence](../../tests/eve/background_home_persistence.test.mjs)
- [Project colour and remount contracts](../../tests/eve/project_background_color_contract.test.mjs)
- [Bevy background delivery](../../tests/probes/bevy_surface_background_runtime.probe.mjs)

On physical iOS, replay launch → Dashboard → project → Dashboard → Background
open, rapid image reselection, visibility restoration and account switching
using real WebDriverAgent actions. Capture pixels and source-selection logs.
Distinguish a selected-file change from animation or decoder/shader corruption.
Ten installed-app captures show colour changes and transient block artefacts;
they do not prove the changed JavaScript is deployed or explain those artefacts.

Startup applies already-published preferences before the runtime starts. The
panel no longer deletes shared profile preferences on login/clear-view; session
cleanup remains owned by the canonical account session.
