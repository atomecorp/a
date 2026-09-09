# SVG double-click has no points in WebGPU

Confirmed by real Chromium gestures in vector_baseline_v2 (2026-09-08).
Draw and brush settings passed, but double-click produced no handles. The old
runtime required a visible SVG host, getScreenCTM and DOM overlay nodes; the
canonical WebGPU scene supplies none of those.

svg_vector_edit_runtime now parses svg_vector_model in a detached document and
supplies point/control pointer-capture nodes to the existing contextual BevyUI
tree. Canonical gesture commits serialize edits and cancellation restores the
source path. Project View's existing Visual panel exposes its derived geometry;
structured double-click explicitly requests edition. Natural footers are not
projected over structured views. The former DOM overlay, refresh and mutation
classifier modules and live-element write methods were removed after consumer
checks.

Two intermediate integration failures were repaired: boot's public contextual
facade now exposes hasContext/isEditing, and handle colors use the shared Bevy
RGBA parser. Tests exercise the boot facade and real tree normalization.

Evidence: vector_handles_v4 passes real Natural handle movement;
vector_structured_color_v1 passes movement in Matrix/List and an actual Color
swatch click. Inspected pixels show handles and the changed red stroke in the
viewer and its track previews. Tests: svg_vector_editing.test.mjs,
contextual_selection_levels.test.mjs, project_view_list_preview_model.test.mjs,
selection_style_font_size_contract.test.mjs, user_login_boot_order_contract.probe.mjs.

The color regression also confirmed an unselected object could receive a color
through an old SVG layer context. Color now uses only current selected canonical
objects, preserving paint=none and opacity; no DOM host is consulted.

Web vector_history_isolated_origin additionally verifies a visible curve control
drag, exact keyboard undo/redo, and new strokes in both structured viewers.
The corrected private-vault history route is documented in vault-history-routing.
To verify: transformed imported SVGs and all imported curve variants.
