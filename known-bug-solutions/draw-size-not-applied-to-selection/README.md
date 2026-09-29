# Draw size leaves a selected drawing unchanged

Confirmed by code inspection and contract tests on 2026-09-28.

With a drawn stroke selected and the draw tool not armed, moving `draw_size`
in the sidebar rail changed nothing on the selected shape: the slider only
reached `drawState.brushSize`, which seeds the next stroke. The sibling
`ui.draw.opacity.apply` already routed to the selection, so the two sliders of
the same rail behaved differently.

Owning layer: `intuition/tools/core/svg_draw_runtime.js` registers
`ui.draw.size.apply`; `intuition/tools/selection_style_apply.js` owns selection
styling; `intuition/tools/core/svg_draw_model.js` owns the SVG geometry of a
drawn shape.

The slider now writes both targets: the brush for the next strokes, and the size
of every selected drawing. Applying in the armed state as well is safe by
construction rather than by a guard: `createProjectDraw` already deselects the
stroke it just drew while the brush is armed, and the armed tool rail binds
`draw_size` straight to `setBrushSize` without crossing this handler.

A drawn shape stores its trace in a viewBox whose padding is half its own
stroke (`resolveDrawGeometry` reserves `strokeWidth / 2 + 1` per side). Writing
`stroke-width` alone therefore leaves the thicker trace clipped by that viewBox,
and moving the attributes without the box would shift the rendered trace.
`restrokeDrawMarkup` rewrites the width on every stroked shape and moves the
viewBox, the markup size and the Atome box by the half-difference, scaled by
the box/viewBox ratio so a resized drawing keeps its position.

Rejected hypotheses: the rail did not send the value (`selection_ids` and
`value` both reach the handler through `buildToolExtraInput`), and the
bootstrap fallback registration `{ kind: 'style_apply', operation: 'draw_size' }`
in `tool_runtime_bootstrap.js` is inert — `tool_runtime_bootstrap_panel_handlers.js`
only branches on `couleur|size|font|opacity`, and the runtime handler wins in
`window.atome.tools.handlers` anyway. The first correction copied the sibling
opacity rule (`!drawState.active`) and would have left the contextual rail's
palette without effect whenever the draw tool was still armed; that guard is not
kept, because the selection is the only target this slider can name and the
drawing path is already protected by `createProjectDraw`'s deselection.

Regression: `tests/eve/draw_stroke_size_contract.test.mjs` (4 tests) and the
restroke blocks of `tests/eve/intuition/tools/core/svg_draw_model.probe.mjs`.

Web sequence: open Create > Draw, draw a stroke, select it, open the rail and
move Taille; the trace must thicken in place, without shifting and without
clipping, and the next drawn stroke must still use the last chosen brush size.
