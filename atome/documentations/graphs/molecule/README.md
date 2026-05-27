# Graphs - molecule

## Status

Point traite: molecule.

## Purpose

Ce dossier cartographie le bloc molecule pour faciliter le debug des routes de creation, sessions, panneaux, medias, recording et persistence.

## Files analyzed

- eVe/intuition/tools/molecule/index.js
- eVe/intuition/tools/molecule/runtime.js
- eVe/intuition/tools/molecule/session/session.js
- eVe/intuition/tools/molecule/session/registry.js
- eVe/intuition/tools/molecule/panel/index.js
- eVe/intuition/tools/molecule/media/index.js
- eVe/intuition/tools/molecule/recording/index.js
- eVe/intuition/tools/molecule/persistence/index.js
- eVe/intuition/tools/molecule/multi_instance/index.js
- eVe/intuition/tools/molecule/nested/index.js
- eVe/intuition/tools/molecule/footer_tools_contract.js
- eVe/intuition/tools/mtrack.js
- eVe/domains/mtrax/api/window_api_runtime.js
- eVe/domains/mtrax/ui/panel_lifecycle_runtime.js

## Main entry points

- `installMoleculeGroupTimelineRuntime` - eVe/intuition/tools/molecule/runtime.js:138
- `openGroupTimeline` - eVe/intuition/tools/molecule/runtime.js:149
- `closeGroupTimeline` - eVe/intuition/tools/molecule/runtime.js:196
- `createMoleculeSession` - eVe/intuition/tools/molecule/session/session.js:118
- `openMoleculePanel` - eVe/intuition/tools/molecule/panel/index.js:209
- `createMoleculeRecordingSession` - eVe/intuition/tools/molecule/recording/index.js:141
- `createMoleculeMediaResolver` - eVe/intuition/tools/molecule/media/index.js:53
- `createMoleculePersistenceController` - eVe/intuition/tools/molecule/persistence/index.js:82
- `createMoleculeMultiInstanceController` - eVe/intuition/tools/molecule/multi_instance/index.js:24

## Main risks found

- RISK-001: `DUPLICATE_CREATION` / `CONFLICT` entre `openGroupTimeline` et `createMoleculeMultiInstanceController.openInstance`.
- RISK-002: `MULTI_SOURCE_OF_TRUTH` entre `sessionsByGroup`, `MoleculeSession` state, `projectStore`, `eventStore`, DOM dataset et multi-instance registry.
- RISK-003: `ASYNC_RISK` sur `openGroupTimeline`: `projectStore.saveTimeline` est await, mais `openMoleculePanel` peut ensuite echouer sans rollback prouve.
- RISK-004: `PARTIAL_LIFECYCLE` sur `closeMoleculePanel`: le bouton close masque le panneau sans disposer la session.
- RISK-005: `ASYNC_RISK` sur persistence debounce: la sauvegarde planifiee n'est pas await dans le timer.
- RISK-006: `CYCLE_RISK` traite cote nested via `assertNoCycle`, mais depend de `projectStore.loadTimeline`.

## Graphs

- 01-call-graph.md
- 02-event-graph.md
- 03-state-graph.md
- 04-source-of-truth-graph.md
- 05-async-graph.md
- 06-lifecycle-graph.md
- 07-risk-map.md
- 08-open-questions.md
