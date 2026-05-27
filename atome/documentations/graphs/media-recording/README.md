# Graphs - media-recording

## Status

Point traite: media-recording.

## Purpose

Ce dossier cartographie le bloc media-recording pour faciliter le debug des captures audio/video, recorder browser/native, creation de clips enregistres et persistence.

## Files analyzed

- eVe/domains/mtrax/media/record_capture_runtime.js
- eVe/domains/mtrax/recording/action_capture_runtime.js
- eVe/domains/mtrax/recording/action_context_runtime.js
- eVe/domains/mtrax/api/api_record_action_runtime.js
- eVe/domains/mtrax/api/api_record_media_runtime.js
- eVe/domains/mtrax/api/api_record_state_runtime.js
- eVe/domains/mtrax/api/api_track_record_source_runtime.js
- eVe/domains/mtrax/audio/hmtracks_native_audio_runtime.js
- platforms/desktop-tauri/src/audio_engine/recorder.rs

## Main entry points

- `createMediaRecordCaptureRuntime` - eVe/domains/mtrax/media/record_capture_runtime.js:12
- `createMediaRecorderRuntime` - eVe/domains/mtrax/media/record_capture_runtime.js:255
- `startRecorderBatch` - eVe/domains/mtrax/media/record_capture_runtime.js:632
- `stopMediaRecorderRuntime` - eVe/domains/mtrax/media/record_capture_runtime.js:402
- `persistRecorderResultsToTracks` - eVe/domains/mtrax/media/record_capture_runtime.js:741
- `finalizeTrackSession` - eVe/domains/mtrax/media/record_capture_runtime.js:1259

## Main risks found

- RISK-001: `ASYNC_RISK` sur finalisation MediaRecorder/native avec timeouts.
- RISK-002: `PARTIAL_LIFECYCLE` si une session d'enregistrement n'est pas stoppee avant fermeture.
- RISK-003: `MULTI_SOURCE_OF_TRUTH` entre recorder runtime, stream MediaStream, clips crees, loop/take schedule et persistence.
- RISK-004: `SILENT_ERROR` possible via `sourceErrors` collectes sans blocage.

## Graphs

- 01-call-graph.md
- 02-event-graph.md
- 03-state-graph.md
- 04-source-of-truth-graph.md
- 05-async-graph.md
- 06-lifecycle-graph.md
- 07-risk-map.md
- 08-open-questions.md
