# Graphs - sequence-timeline

## Status

Point traite: sequence-timeline.

## Purpose

Ce dossier cartographie le bloc sequence-timeline pour faciliter le debug du playhead, transport, loop cells, playback, persistence et timelines de groupe/projet.

## Files analyzed

- eVe/domains/mtrax/timeline/group_timeline_bootstrap_runtime.js
- eVe/domains/mtrax/timeline/playback_control_bootstrap_runtime.js
- eVe/domains/mtrax/timeline/playback_position_bootstrap_runtime.js
- eVe/domains/mtrax/timeline/playback_frame_update_runtime.js
- eVe/domains/mtrax/timeline/persist_runtime.js
- eVe/domains/mtrax/timeline/play_runtime.js
- eVe/domains/mtrax/timeline/transport_controls.js
- eVe/domains/mtrax/transport/transport_gestures_runtime.js
- eVe/domains/mtrax/project/project_playback_timeline_runtime.js
- eVe/intuition/runtime/group_timeline_api.js
- eVe/intuition/tools/timeline.js

## Main entry points

- `createGroupTimelineBootstrapRuntime` - eVe/domains/mtrax/timeline/group_timeline_bootstrap_runtime.js:10
- `createPlaybackControlBootstrapRuntime` - eVe/domains/mtrax/timeline/playback_control_bootstrap_runtime.js:5
- `createTimelinePersistRuntime` - eVe/domains/mtrax/timeline/persist_runtime.js:3
- `createTransportGesturesRuntime` - eVe/domains/mtrax/transport/transport_gestures_runtime.js:11
- `open_timeline_panel` - eVe/intuition/tools/timeline.js:340
- `close_timeline_panel` - eVe/intuition/tools/timeline.js:350

## Main risks found

- RISK-001: `MULTI_SOURCE_OF_TRUTH` entre playhead visuel, hmtracks audio, media elements, project playback et persisted timeline.
- RISK-002: `ASYNC_RISK` sur prewarm audio et RAF playback.
- RISK-003: `PARTIAL_LIFECYCLE` sur listeners/timers du panneau timeline historique.
- RISK-004: `CONFLICT` entre scrub UI, host follow, playback RAF et timeline API.

## Graphs

- 01-call-graph.md
- 02-event-graph.md
- 03-state-graph.md
- 04-source-of-truth-graph.md
- 05-async-graph.md
- 06-lifecycle-graph.md
- 07-risk-map.md
- 08-open-questions.md
