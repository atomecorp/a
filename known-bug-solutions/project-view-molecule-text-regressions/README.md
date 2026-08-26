# Project-view Molecule and text regressions

Verified 2026-08-26 in real Chromium/WebGPU.

- Reorder detached a reabsorbed member because order-only `set` events omitted
  the canonical `parent_id` envelope. Carrying `parent_id` in the same batch as
  `hierarchy_order` and visual depth preserves membership and reload order.
- Direct member Delete bypassed the Molecule owner. The canonical member Delete
  now removes its clip, reindexes survivors and deletes the empty owner in one
  logical transaction.
- Create Text deactivated every lazy sibling; Code interpreted its first
  synthetic `state.off` during import as activation and opened CodeMirror.
  Exclusivity now sends `state.off` only to sibling runtimes already active.
- Return reached background creation during a canonical text edit. The active
  text-session gate now keeps Return in the single hidden editor as `\n`.
- Visual preview handlers were attached to passive BevyUI panels, so double
  click fell through to Natural and opened its chrome. Interactive previews now
  use the existing hit-testable pointer-capture node and enter `rail_only` text
  editing; Escape cancels and a structured outside pointer commits.
- Visual long press formerly opened the surface-item Flower menu, which has no
  text styling tools. It now opens the canonical Atome Flower context; Couleur
  updates the active `rich_text` range before the single outside-click commit.

Evidence: `temp/probe_reports/molecule_eve_ui_acceptance/order_delete_parent_preserved/report.json`
and `temp/probe_reports/molecule_eve_ui_acceptance/text_visual_flower_color/report.json`.
