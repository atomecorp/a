# Superseded HTML Panel Refactor

This legacy HTML-dialog plan is not an active panel contract and must not be
used for implementation. Its header and tools-dock design conflicts with the
active BevyUI contract.

The authoritative active-surface inventory is
`eVe/documentations/panel_html_inventory.md`. The authoritative execution
ledger is `todo/ui_bevy/bevy_panel_migration_guide.md`, registered as Priority
1 in `todo/execution_order.md`.

The active BevyUI structure is `PanelRoot -> BodyScroll -> FooterControls`:
BodyScroll is the only scroll owner, while FooterControls owns title, close,
drag, and resize controls. A passive header and generic tools dock are
forbidden.
