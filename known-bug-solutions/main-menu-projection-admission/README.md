# Main menu admission races catalog publication

## Confirmed reproduction

In an isolated Web guest session at localhost:3001, open a project with
`view_mode: list` at Advanced expertise. The project and List render, but
activation fails with `workspace_main_menu_overlay_missing:0:0:0:0:no_error`.
The menu reports nine items and `treeMounted: true`, although the shared
runtime has no main-menu tree yet. No WebGPU error occurs in this reproduction.

## Cause

`workspace_main_menu_visibility.js#ensureWorkspaceMainMenuVisible` awaits
`showFully`, then checks projection after one frame. Generator/template
catalog publication calls `add`, `refresh` or `updateContent` while that first
mount hydrates its images. The canonical render queue correctly supersedes
older work, whose promise resolves without a tree. Workspace admission then
refreshes too early, cancels another pending projection and rejects before
the final render completes. Project activation never reaches
`revealProjectMainMenu`, leaving its transition opacity at zero.

This differs from the backdrop shader crash and from intentional Beginner
filtering. Expert/Beginner composition did not cause this race.

## Correction and evidence

The existing workspace-frame barrier drains the current main-menu work in
the canonical shared runtime's `renderQueues` before checking visibility.
It follows replacement work until that queue clears. No new scheduler,
menu rule, renderer, durable state or public API is introduced.

`tests/eve/dashboard_workspace_mode_contract.test.mjs` reproduces an initial
mount superseded by a still-pending replacement. Admission fails before the
repair and waits successfully afterward without cancelling the replacement.
The source-backed Expert/Beginner test in
`tests/eve/tool_runtime_home_lazy_load.test.mjs` retains nine/one menu items.

The real Web replay succeeds after repair: all eight Expert tools and the
handle are visible in List, and a real Contact/User click opens its panel.
Captured pixels are under `temp/user-panel-expert-*.png`; browser errors are
empty. Physical iOS acceptance remains to be performed by the user.
