# Multiple selection plays one object and shows inactive text

Web multi_play_baseline confirmed that real Play on two selected rows left the
recursive transport stopped. The footer forced playChild(record) regardless of
selection. It now delegates both single and multiple structured selections to the current container's
recursive transport. Single selection preserves the selected child's own mode and duration. The existing compiler validates membership, sorts selected
roots canonically, prunes covered descendants and retains nested playback modes.
No canonical hierarchy is modified. Container Play stops the old item clock.

The first successful scope run exposed a second pixel error: a text-only
sequential plan inferred a prompter containing adjacent inactive lines. That
special snapshot, projection and hit-test path was removed. The common visual
subject now follows activeLeafRecords for text as for other media.

multi_play_active_leaves_v2 passes real Matrix/List Play and Stop, preserves
selection, checks projected text against active leaves, then double-clicks and
selects text in the same viewer. Six Web checks and clean console. Inspected
Matrix screenshot shows one active text with both rows selected. Unit cases
cover 2+5 second selected roots, nested simultaneous modes and ancestor/child
selection without duplicate playback.

Remaining: all four mode choices via palette, offscreen and long-press selection,
selection removal while playing, and natural-mode multiple Performance capture.

Web selection_recursive_v2 verifies repeated edits and retargeting without activating the legacy item clock. Molecule selection reuses the project Play Mode palette. The older order probe still contains a Name-double-click navigation assumption; Name now owns rename, and hierarchy/preview owns entry.

## Cumulative selection and interruption follow-up — 2026-09-08

The real Cmd-click path previously followed the clicked member before toggling canonical selection, so removing the second selected member played that removed member. List/Matrix now mutate selection first and pass the resulting IDs to the existing recursive follow owner. Empty selection stops. Web cumulative_play_fixed passes six checks; queue/transport contracts pass 24 tests. Pending mix preparation also checks current transport status before resuming; a delayed-stretch test proves Stop cannot restart audio.

## Nested Matrix and deleted scope follow-up — 2026-09-08

Real nested-drop/reload playback exposed a missing Matrix transportRecords
method: visible cells alone contained no descendants, yielding zero duration.
Matrix now reuses the canonical full-project loader as List does.
nested_matrix_transport_fixed and matrix_molecule_preview_clean pass; 32
shape/context/preview tests pass. The tile also reuses the composite preview
owner instead of showing a blank Molecule card.

A paused mode change now discards the old plan; recursive_235_fixed verifies
10-second sequential and 5-second simultaneous/nested playback in both views.
Deleting the active scope stops transport before resolving the empty viewer;
offscreen_deleted_preview_fixed verifies deletion of 20 rows with no ghost.

## Selection promotion during view teardown — 2026-09-09

Repeated Natural composition/Undo/reload made the next drag behave as editing. promoteActiveToCanvas forced contextLevel=edition for a selected object. It now preserves the entry level and rail-only selection semantics. All six Natural held composition gestures then passed; the touch contextual contract passed 20 tests. Several objects may remain editable, but promotion never creates a new edit session.

### Adjacent Performance clips rejected after Stop (2026-09-09)

Confirmed with real Natural gestures: two recorded holds existed in the recorder, but Stop produced `clip placement rejected: overlap` and the owner remained empty. Independent rounding of measured start/duration produced a one-sample overlap (528002 versus the next start 528001); floating seconds also misclassified exact touching sample edges. Capture now quantizes start/end and subtracts frames; existing kernel collision checks compare sample intervals at the owner sample rate. Reducers, stretch and block loop pass that rate. Regression examples are in `tests/eve/project_view_playback_regressions.test.mjs`; both failed before and passed after. Full Molecule suite passed. Do not fix by moving the next event or silently allocating a new lane.

### Old rail after Dashboard project switch (2026-09-09)

Actual state showed a former Performance project as activeAtomeId with the original project as projectId. `openCurrentLevel` had captured old navigation but used mutable state.projectId after awaiting its owner. The shared context now guards project/navigation/revision before and after reads and when invoking retained definitions. Two tests first reproduced the mismatch; 15 context/readiness tests passed after repair. Actual Dashboard return left no previous target and selecting the visible original group opened its own context. Evidence: interaction-context-return-fixed.json and user_context_return_selected.png.
