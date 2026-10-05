# Floating Bevy panels interleave

Confirmed 2026-10-05: all windows used the same absolute root/body/footer levels, so an older hierarchy rail, text and command band could cross the newer opaque shell. Rejected hypothesis: neutral shell/gradient transparency; all stops have alpha 1.

Canonical repair: opening-request order in `eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js`; relative levels in the existing tree/footer builders; compact disjoint complete-window ranges in `bevy_panel_projection.js`; shared content/preview record scoping and root hit-test ordering. Do not repair by changing skin opacity, raising only the root or adding unbounded timestamp/stride Z values. Native depth clamps at 5000. Embedded sections stay in their host.

Persistent regression: `tests/eve/bevy_panel_stack_contract.test.mjs`. Real acceptance: open Contacts, open Infos through Mystic, inspect overlapping rails/text/commands/footers, reverse opening order, reopen, refresh the rear window, close, and verify covered controls cannot receive clicks. Also exercise three windows, scroll, drag/resize and narrow widths on Web/Tauri/iOS.

Real Web accessible surfaces (Contacts/Calendar/Communication) and pixel comparison passed; exact Mystic/Infos and native replay remain open gates. Full results: `eVe/documentations/panel_stack_validation_2026-10-05.md`.
