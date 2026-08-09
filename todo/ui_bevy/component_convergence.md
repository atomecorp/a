# Component convergence — remaining owners

Status: Actif

Created 2026-08-07, after the audit that produced the *CANONICAL COMPONENT
OWNERS* section of `.codex/modules/04-feature-work-cleanup-and-framework-reuse.md`
and the `check:component-reuse-guardrails` guard.

That audit found the inline text editor in **six copies** — 981 lines over a
750-line canonical stack — and converged them into
`eVe/intuition/runtime/bevy_panel/bevy_panel_text_editing.js`. Two items were
left, deliberately, and are recorded here rather than in a comment.

The guard's allowlist is the live ledger: an entry there is a copy that still
has to converge, removing the entry is the definition of done, and the list may
never grow.

---

## 1. One virtualized window — needs a product decision first

**This is not an extraction.** The three implementations are not three copies of
one algorithm; they are two different strategies, and choosing between them
changes behaviour on an approved panel.

| Surface | Strategy | Cost measured on one 200-record page, 320 px viewport |
|---|---|---:|
| `bevy_panel_selectable_list.js` (Infos, project list) | window **by page** — builds the whole loaded page, spacers stand for unloaded pages | **1 205 nodes** for ~9 visible rows |
| `bevy_panel_matrix.js` (Panel Lab) | window by page, same shape | — |
| `project_view_matrix_content.js` (project Matrix) | window **by viewport** — builds only the visible row range inside the page | **103 nodes**, 25 tiles |

A factor of **12**, rebuilt on every repaint: selection, hover, expand,
keystroke. The catastrophic case is already avoided — the ceiling is the page
size (200), not the total (5 000) — so this is waste, not a defect.

**What is unambiguously duplicated**: `virtualPageIndex`
(`bevy_panel_selectable_list.js`) and `matrixPageIndex` (`bevy_panel_matrix.js`)
are identical character for character except their name and the stride
expression. A pagination fix in one silently misses the other. This is the
reason to converge, ahead of the node count.

**The decision to take before any code:**

- **Option A — the owner offers both granularities.** Nothing changes for
  Infos; the duplication disappears; the waste stays.
- **Option B — everything moves to viewport windowing.** Infos gains the factor
  of 12; the page-level mode disappears. **Recommended**, and it is a behaviour
  change on a `validated` panel, so it needs an unchanged-tree probe plus real
  browser scroll verification, not a mechanical extraction.

Target owner: `eVe/intuition/runtime/bevy_panel/bevy_panel_virtual_window.js`.
The contract is already common — `windowState` (`pageIndex`, `pageSize`,
`totalCount`, `hasNext`), a vertical stride, an `onWindowChange`. Only the
stride differs, and it is a parameter: row height for the list, `table.rowHeightPx`
for the matrix, tile height plus gap for the grid.

Exit criterion: one windowing owner, one page-index calculation, the three
surfaces consuming it, `virtualPageIndex` and `matrixPageIndex` gone, the three
files removed from the guard's allowlist, and the browser scroll behaviour of
Infos verified unchanged.

---

## 2. The declared editing debt — smaller than it first looked

Four files were left in the guard's allowlist. Re-examined, they are not four
equivalent items:

| File | Nature | Disposition |
|---|---|---|
| `bevy_panel_lab_text_input_runtime.js` (152 l.) | full editor skeleton — a real copy | converge, **or delete with Panel Lab** |
| `bevy_panel_lab_multiline_input_runtime.js` (180 l.) | full editor skeleton — a real copy | same |
| `bevy_panel_numeric_field_runtime.js` (247 l.) | full editor skeleton — a real copy | **belongs to workstream slot A**: it is consumed by `bevy_panel_size_runtime.js`, Size/Font being migrated there. The legacy non-collision rule forbids a second workstream owning it. Slot A converges it, or hands it over. |
| `bevy_ui_main_menu_inline_search_runtime.js` (329 l.) | **not a copy** — it holds `focus` but none of the `layout` / `project` / `handle` skeleton; it drives the hidden text service for a search query, a different shape | re-audit before assuming convergence; it may legitimately stay a direct consumer |

**The two Panel Lab runtimes are scheduled for deletion.** *Panel Lab
retirement* in `bevy_panel_migration_guide.md` is `planned` and calls for the
whole surface to go. Converging code that is slated to be removed buys little;
the honest options are to converge them only if Panel Lab survives, or to let
them leave with it.

Exit criterion: the guard's allowlist contains only the session modules, the
canonical owner, and `text_bridge.js` — the canvas text editor, a legitimate
consumer at a different layer.

---

## Why neither was done in the session that found them

Item 1 carries a product decision and a behaviour change on a `validated` panel.
Item 2 is, on inspection, one file owned by another active workstream, two files
awaiting a deletion already planned, and one that may not be a copy at all.
Neither is a mechanical follow-up, and both are cheap to defer because the guard
now prevents the problem from growing.
