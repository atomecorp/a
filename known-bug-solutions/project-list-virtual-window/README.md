# End-anchored List loses visible rows after scrub

Confirmed 2026-09-08 in Web layout_scroll_visibility: with 20 tracks, reload the List, scrub Track 15 and release. The viewer still displays Track 15 but every bottom row disappears. The source tree contains only entries 0–13 while the scroll offset still shows entries 14–19.

The shared virtualizedHierarchicalSelectableListNode computes visibleStart=6 for an end-anchored 14-row buffer. project_view_list_view did not retain that value, and consuming anchorEnd left visibleStart=0. A later transport render projected the wrong buffer. This is not a missing media resource or an empty canonical list.

The existing List window now stores the shared virtualizer's computed visibleStart. Transport motion consumes its visibleStart/visibleCount instead of maintaining a second calculation. No new viewport state or renderer was introduced.

Validation: project_view_list_transport_ui.test.mjs (8 tests); Web layout_scroll_fixed (7 checks), real local/global scrub, split reload and left-handed layout. Inspected structured_local_scrub.png contains Tracks 15–20.
