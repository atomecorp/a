# Size And Font HTML Line Migration Registry

Date: 2026-08-08

Exhaustive retirement ledger for Package 8. `M` means migrated into the Bevy
product surface, `R` means replaced by an existing canonical runtime contract,
and `D` means deleted with DOM-only presentation. The ranges partition all
historical source lines exactly once: **177 / 177 Size lines** and **133 / 133
Font lines**.

## `eVe/intuition/tools/size.js` — 177 lines rewritten as a Bevy bridge

| Lines | Disposition | Destination |
| ---: | :---: | --- |
| 1-17 | R/D | DOM factories, elastic-slider import, and legacy style installer are removed; Bevy runtime and canonical apply owners replace them. |
| 19 | M | Eight pixel presets move to the Size surface model. |
| 21-64 | D | Dialog, DOM hint, selection text, slider row, and mount nodes are deleted. |
| 66-83 | M | Current value normalization and public apply-phase normalization remain renderer-neutral. |
| 85-96 | M/R | Selection count and apply behavior move to the Size surface over the canonical facade. |
| 98-115 | D/M | Elastic-slider DOM is deleted; direct edit, step, and scrub use the standard numeric field. |
| 117-132 | D/M | DOM preset buttons become standard scope-chip buttons. |
| 134-145 | R | DOM visibility functions become shared Bevy surface open/close calls. |
| 147-166 | M | `ui.size.apply` retains its id, aliases, policy, and canonical handler. |
| 168-177 | M/D | Public open/close and `eveSizeApi` survive; the DOM visibility listener is replaced by surface lifecycle selection subscription. |

## `eVe/intuition/tools/font.js` — 133 lines rewritten as a Bevy bridge

| Lines | Disposition | Destination |
| ---: | :---: | --- |
| 1-11 | R/D | DOM factories and legacy style installer are removed; Bevy runtime and canonical apply owners replace them. |
| 13-22 | M | Eight font-family values move to the Font surface model. |
| 24-61 | D | Dialog, DOM hint, selection text, and list host are deleted. |
| 63-87 | M/R | Active family, selection count, and apply behavior move to disposable Font surface state over the canonical facade. |
| 89-101 | D/M | DOM buttons, datasets, and inline font styles become the standard selectable-list composition. |
| 103-112 | R | DOM visibility functions become shared Bevy surface open/close calls. |
| 114-125 | M | `ui.font.apply` retains its id, aliases, policy, and canonical handler. |
| 127-133 | M/D | Public open/close survive; the DOM visibility listener is replaced by surface lifecycle selection subscription. |

`selection_style_apply.js`, `style_panels_visual.js`, and `elastic_slider.js`
remain because Couleur and the contextual Atome-edit footer still consume their
owned behavior. Package 8 removes only Size and Font dependencies on those
legacy visual helpers.
