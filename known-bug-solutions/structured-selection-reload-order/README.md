# Structured selection targets move between consecutive clicks

Confirmed in Chromium/WebGPU on 2026-09-08. Matrix selection appeared to toggle
off when the second cell was clicked with Meta held. Real handler tracing showed
the same Atome id on both clicks: an asynchronous store reload had reversed
records without explicit hierarchy positions between the gestures.

`project_view_molecule_list_model.comparePlaybackRecords` now compares canonical
hierarchy_order first and immutable ids second. List construction, depth-order
ties and recursive transport reuse that comparison. Input array position and
mutable labels no longer determine an unordered sibling's position.

The regression test reverses a store response between real Matrix event-handler
calls. `project_view_real_server_shape.test.mjs` fails before this correction and
passes afterward. The Web run `structured_selection_stable_order` passes all six
checks; inspected multi-selection pixels show both layers. Evidence is under
`temp/probe_reports/molecule_eve_ui_acceptance/structured_selection_stable_order/`.

Explicit persisted hierarchy positions retain priority. This repair does not
validate the separate five-zone drop or offscreen-selection campaigns.
