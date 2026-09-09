# Text selection changes geometry or formats an invisible range

Confirmed in Chromium/WebGPU on 2026-09-08.

Entering the shared editor remeasured a fixed 320 x 180 text frame into its
content dimensions (118 x 24). `text_bridge.js` now preserves the frame on
entry and caret/range changes. Content changes or dirty font metrics still
request measurement. This does not establish that every global invalidation
or performance issue has been resolved.

The style-target owner retained a collapsed text range for up to 30 seconds.
`project_scene_text_edit_state.js` clears it on collapse, editor close and
target change, so an invisible old range cannot receive a later color change.
The shared selection token projects a visible blue highlight.

Regression: `tests/eve/text_editing_session_contract.test.mjs`.
Web sequence: select a text object, double-click, select all, collapse with an
arrow key, and compare source dimensions before/after. Evidence and inspected
pixels: `temp/probe_reports/molecule_eve_ui_acceptance/selection_text_v2/`.
Repeated Matrix focus changes and whole-interface geometry remain separate
acceptance cases.

A separate preview projection defect was confirmed in List and Matrix: the
shared editor held a visible range, but recordPreviewNode discarded rich_text
and rendered only plaintext plus a private collapsed caret. The preview now
passes scaled rich spans and selection into the existing BevyUI overlay record
and text texture renderer. The redundant caret projection was removed.
`structured_text_highlight_v2` passes both blue-pixel assertions and focus-owner
checks. CSS pixel source bounds are also parsed with parseFloat; a unit test
previously mapped a 320px frame to width 1. Exact glyph-coordinate mapping and
whole-interface geometry remain to verify.

partial_text_color_v1 confirmed another ownership failure: shared textarea blur closed the scene edit when a Color swatch took focus, clearing the range before style application. Scene text now opts into text_editing_session.retainOnBlur; ordinary fields still close on blur. The caret stops, the range stays visibly projected, and explicit commit/Tab ends editing. Remove time-based range expiry while the range is still visible. partial_text_color_commit_v3 passes six Web checks and persists red/green seven-character spans without changing the base color.

## 2026-09-09: selection before deferred contextual installation

Real Web cold-load reproduction recorded selection at 1573 ms and contextual installation at 2880.8 ms. Selection correctly existed in the canonical runtime but its notification had no contextual subscriber yet. The registry now triggers the existing deferred owner on first selection, and installation consumes the current selection through the same handler as subsequent events. No synthetic selection replay, duplicate selection state, or test API was introduced. `contextual_selection_levels.test.mjs` covers selection before installation. Actual single selection and repeated List/Matrix text edits pass; geometry and editor/resource counts remain constant.

Shared wrapped labels also exposed repeated visual line indices: later lines used the first line's offset and clipped text. The existing text-style owner now provides the wrapper to both editing and rasterization, with explicit line offsets. Full Health goal labels and the raster regression are verified.
