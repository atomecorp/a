# Size And Font Surface Freeze

Date: 2026-08-08

This is the binding pre-implementation inventory for Package 8. It freezes the
complete visible and effectful behavior of the two legacy routes before their
BevyUI composition. No listed behavior may be dropped during migration.

## Size

- Panel tool: `ui.size.panel`; apply tool: `ui.size.apply`.
- Selection summary: localized count of the current selection.
- Numeric value: integer pixels, step `1`, minimum `6`, canonical apply maximum
  `2000`. The legacy `8..420` elastic-slider presentation is retired; it is
  not a second business bound for the panel.
- Direct entry and `-` / `+` use the shared numeric-field control.
- Scrub adjustment preserves `start`, `frame`, and `end` gesture phases.
- Presets: `18`, `24`, `36`, `48`, `72`, `96`, `144`, and `220` pixels.
- Open behavior: resolves the current text size and refreshes the selection.
- Close behavior: releases editing and all disposable interaction state.

The compact product-tool slider is not a panel component. Family 36 remains
deferred, and the retired Size panel must not consume `elastic_slider.js`.
The shared tool slider uses the canonical four-state session: a simple compact
click pins it open, a second compact icon/label click closes it, direct relative
drag closes on release, and a rail drag from pinned state stays open.

## Font

- Panel tool: `ui.font.panel`; apply tool: `ui.font.apply`.
- Selection summary: localized count of the current selection.
- Exclusive family list: Arial, Helvetica, Verdana, Trebuchet MS, Georgia,
  Times New Roman, Courier New, and monospace.
- Activating an enabled family applies only through `applyFontToSelection` and
  marks that family as the disposable selected presentation value.
- The inspected legacy route contains no font-weight or font-style control.
  Package 8 does not invent either behavior.
- Close behavior clears hover, focus, and press state.

For both tools, a remembered non-empty project text range has priority and is
stored only as bounded session state. The canonical `rich_text.spans` mutation
changes only `font_family` or numeric pixel `font_size`, preserves all other
attributes, and merges equivalent adjacent spans. Without a range, Font/Size
fall back to the whole selected text Atome; Font ignores non-text Atomes.

## Canonical component mapping

| Legacy occurrence | Canonical component/owner |
| --- | --- |
| Selection count | `selectionSummaryNode` / Squirrel selection-summary contract |
| Size entry, step, and scrub | `numericFieldNode` / shared numeric-field interaction runtime |
| Size presets | `scopeChipGroupNode` / Squirrel scope-chip contract |
| Font families | `selectableListGroupNode` / Squirrel selectable-list contract |
| Panel shell, close, drag, resize, scroll | shared Bevy panel runtime |
| Text editing | shared bounded BevyUI text-input session |
| Size/font business writes | `selection_style_apply.js` canonical facade |

The panels may own only disposable presentation state. They create no DOM
control, style palette, component implementation, durable cache, or alternate
mutation path. Package status remains `acceptance_pending` until explicit
product approval.
