# Graphs - panel-lifecycle

## Status

Point traite: panel-lifecycle.

## Purpose

Ce dossier cartographie le bloc panel-lifecycle pour faciliter le debug de l'ouverture, fermeture, docking, cleanup media/audio/renderer et persistence des panneaux mtrax/molecule.

## Files analyzed

- eVe/domains/mtrax/ui/panel_lifecycle_runtime.js
- eVe/domains/mtrax/ui/panel_bootstrap_runtime.js
- eVe/domains/mtrax/ui/panel_dialog_runtime.js
- eVe/domains/mtrax/ui/docked_renderer_runtime.js
- eVe/domains/mtrax/ui/panel_embed_bootstrap_runtime.js
- eVe/domains/mtrax/ui/mount_state_runtime.js
- eVe/intuition/runtime/mtrack_dock_controller.js
- eVe/intuition/runtime/panel_api.js
- eVe/intuition/tools/molecule/panel/index.js

## Main entry points

- `createPanelLifecycleRuntime` - eVe/domains/mtrax/ui/panel_lifecycle_runtime.js:1
- `open_mtrack_panel` - eVe/domains/mtrax/ui/panel_lifecycle_runtime.js:93
- `close_mtrack_panel` - eVe/domains/mtrax/ui/panel_lifecycle_runtime.js:163
- `createUiPanelBootstrapRuntime` - eVe/domains/mtrax/ui/panel_bootstrap_runtime.js:4
- `createPanelDialogRuntime` - eVe/domains/mtrax/ui/panel_dialog_runtime.js:3
- `createDockedRendererRuntime` - eVe/domains/mtrax/ui/docked_renderer_runtime.js:4
- `createMoleculeDockController` - eVe/intuition/runtime/mtrack_dock_controller.js:105

## Main risks found

- RISK-001: `PARTIAL_LIFECYCLE` entre fermeture molecule simple et fermeture mtrax complete.
- RISK-002: `ASYNC_RISK` sur pause/dispose audio lances en `void`.
- RISK-003: `MULTI_SOURCE_OF_TRUTH` entre root dialog, dock host, panel API globale, layer contract et state mtrax.
- RISK-004: `PARTIAL_LIFECYCLE` potentiel sur MutationObserver de diagnostic.

## Graphs

- 01-call-graph.md
- 02-event-graph.md
- 03-state-graph.md
- 04-source-of-truth-graph.md
- 05-async-graph.md
- 06-lifecycle-graph.md
- 07-risk-map.md
- 08-open-questions.md
