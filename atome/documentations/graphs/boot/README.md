# Graphs - boot

## Status

Point traite: boot.

## Purpose

Ce dossier cartographie le bloc boot pour faciliter le debug de l'ordre de chargement, init UI/runtime/audio/video/projet et appels bloquants.

## Files analyzed

- eVe/eVe.js
- atome/src/utils/module_loader_runtime.js
- atome/src/squirrel/kickstart.js
- atome/src/squirrel/squirrel.js
- atome/src/squirrel/early-init.js
- eVe/intuition/bootstrap.js
- eVe/intuition/tools/init.js
- eVe/intuition/tools/project_bootstrap.js
- atome/src/squirrel/apis/loadServerConfig.js

## Main entry points

- `loadModulesSequentially` - atome/src/utils/module_loader_runtime.js:5
- IIFE module loader - eVe/eVe.js:27
- `initKickstart` - atome/src/squirrel/kickstart.js:4
- `squirrel:ready` dispatch - atome/src/squirrel/kickstart.js:42
- `bootstrapIntuition` - eVe/intuition/bootstrap.js:11
- `bootstrapProject` - eVe/intuition/tools/project_bootstrap.js:819
- `loadRuntimeVersions` - atome/src/squirrel/kickstart.js:177

## Main risks found

- RISK-001: `PERFORMANCE_BLOCKER` / `ASYNC_RISK` par chargement sequentiel de tous les modules eVe.
- RISK-002: `CONFLICT` possible entre `squirrel:ready`, project bootstrap et auth check.
- RISK-003: `ASYNC_RISK` sur permissions capture lancees en `void`.
- RISK-004: `PARTIAL_LIFECYCLE` si module load echoue: tout le boot eVe s'arrete.

## Graphs

- 01-call-graph.md
- 02-event-graph.md
- 03-state-graph.md
- 04-source-of-truth-graph.md
- 05-async-graph.md
- 06-lifecycle-graph.md
- 07-risk-map.md
- 08-open-questions.md
- 09-boot-timeline.md
