# Graphs - media-import

## Status

Point traite: media-import.

## Purpose

Ce dossier cartographie le bloc media-import pour faciliter le debug des imports de fichiers, drops timeline/preview/projet, creation de clips et resolution des sources media.

## Files analyzed

- eVe/domains/mtrax/media/drop_runtime.js
- eVe/domains/mtrax/media/element_runtime.js
- eVe/domains/mtrax/media/upload_resolution_runtime.js
- eVe/domains/mtrax/media/atome_runtime.js
- eVe/domains/mtrax/timeline/import_media_timeline.js
- eVe/domains/mtrax/integration/external_file_drop_runtime.js
- eVe/domains/mtrax/integration/local_drop_bootstrap_runtime.js
- eVe/domains/mtrax/preview/preview_file_drop_bridge.js
- eVe/intuition/tools/project_drop.js
- eVe/intuition/tools/molecule/media/index.js

## Main entry points

- `createMediaDropRuntime` - eVe/domains/mtrax/media/drop_runtime.js:1
- `handleFilesDropped` - eVe/domains/mtrax/media/drop_runtime.js:178
- `bindDropZone` - eVe/domains/mtrax/media/drop_runtime.js:221
- `createMediaElementRuntime` - eVe/domains/mtrax/media/element_runtime.js:11
- `createMediaElement` - eVe/domains/mtrax/media/element_runtime.js:584
- `createMediaElementFromDescriptor` - eVe/domains/mtrax/media/element_runtime.js:830
- `buildImportedMtraxTimeline` - eVe/domains/mtrax/timeline/import_media_timeline.js:60
- `createExternalFileDropRuntime` - eVe/domains/mtrax/integration/external_file_drop_runtime.js:1
- `bindPreviewFileDropBridge` - eVe/domains/mtrax/preview/preview_file_drop_bridge.js:19

## Main risks found

- RISK-001: `CONFLICT` entre drop projet global, drop preview et drop timeline.
- RISK-002: `ASYNC_RISK` sur `preview_file_drop_bridge`: `void appendDroppedFilesOnNewTopTrack`.
- RISK-003: `MULTI_SOURCE_OF_TRUTH` entre source upload, source normalisee, runtimePlaybackSource, media_ref/runtime_assets et timeline clip src.
- RISK-004: `PARTIAL_LIFECYCLE` sur drop zones/listeners globaux si aucun cleanup n'est appele.

## Graphs

- 01-call-graph.md
- 02-event-graph.md
- 03-state-graph.md
- 04-source-of-truth-graph.md
- 05-async-graph.md
- 06-lifecycle-graph.md
- 07-risk-map.md
- 08-open-questions.md
