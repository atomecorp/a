# Nested panel anchoring and row seams

## Confirmed symptoms and owners

User settings can shift the entire panel while opening nested sections; clipped descendants also inflate ancestor scroll ranges. The old header-pin shift in bevy_panel_runtime.js competed with the canonical layout/reveal owners. An asynchronous section could outlive the global toggle anchor. A single latest anchor was then lost when its subsection closed.

Hierarchy marks painted outside a scroll viewport remained fixed while their rows moved. Their terminal horizontal caps lay on the painted row edge, so the beginner List Play case covered the cap. The shared fixed-row chevron also centred itself from column width instead of row height.

## Durable correction

Reuse the existing layout, scroll reveal and panel runtime. Measure clipped child content as its viewport; reveal ancestors inside out. Capture the toggle at dispatch, retain expanded anchors through geometry changes, and restore the preceding expanded anchor on close. Remove the physical panel translation rather than offsetting it again. A repaint alone must preserve deliberate scrolling.

Compose passive hierarchy marks inside scrolling content, inherit its clip and skip already-decorated subtrees. Carry edgeGapPx from existing row layout; place the terminal cap at the gap midpoint while the header return stays at its centre. Bound/centre fixed-row controls from the row height. Do not hide the rail with a local mask, alter a document's geometry, copy a renderer or special-case the Play icon.

## Reproduction and regression gates

Open Profile/User → Settings → Preferences → Visual and its nested sections. Open, close and reopen them; resize with the last nested section open and after closing it. The current open header must meet the useful bottom edge for up-opening and the top edge for down-opening, with no accumulated blank space or panel translation. Scroll repeatedly, and inspect rail caps between every pair of stacked rows. In beginner List, stack rows above the project band and verify that Play never covers the upper cap.

Persistent tests: tests/eve/panel_nested_scroll.test.mjs, tests/eve/bevy_panel_dark_skin_contract.test.mjs and tests/eve/bevy_panel_selectable_list_contract.test.mjs. The system_ui_base contracts verify the single base and its alternate-size projection. Web guest settings and List cap screenshots are recorded in root temp/user-list-validation; final close/resize pixel replay, authenticated User, left/right/mobile keyboard/orientation and Tauri/physical iOS still require acceptance. Executable success does not replace that acceptance.
