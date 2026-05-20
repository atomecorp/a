# Debug & Automation Taskboard

## Task LOG-SCHEMA-000: Unified Log Schema + Helpers
status: IN_PROGRESS
files:
  - dev/log_schema.json
  - atome/shared/logging.js
description:
  - Define a JSON log envelope with required fields.
  - Provide helper functions to build/validate log entries.
acceptance:
  - JSON schema present at dev/log_schema.json.
  - Helper functions used by runtime loggers.

## Task LOG-FASTIFY-001: Fastify JSON Logging + Client Log Ingest
status: IN_PROGRESS
files:
  - server/server.js
description:
  - Emit JSONL logs to logs/fastify.log.
  - Accept browser logs at /dev/client-log.
acceptance:
  - logs/fastify.log grows on HTTP requests.
  - /dev/client-log writes to logs/browser.log.

## Task LOG-AXUM-002: Axum JSON Logging + Request IDs
status: IN_PROGRESS
files:
  - src-tauri/src/server/mod.rs
  - src-tauri/src/dev_logging.rs
  - src-tauri/src/main.rs
description:
  - Add tracing JSON output to logs/axum.log.
  - Inject request_id into responses.
acceptance:
  - logs/axum.log includes request_id and component fields.
  - x-request-id is present in Axum responses.

## Task LOG-WEBVIEW-003: Tauri Webview Console Logs
status: IN_PROGRESS
files:
  - src/squirrel/dev/logging.js
  - src-tauri/src/dev_logging.rs
  - src-tauri/src/main.rs
description:
  - Wrap console methods in Tauri webview.
  - Dispatch logs to Rust via invoke('log_from_webview').
acceptance:
  - Webview console logs appear in logs/axum.log.

## Task LOG-BROWSER-004: Browser Console Logs
status: IN_PROGRESS
files:
  - src/squirrel/dev/logging.js
  - server/server.js
description:
  - Wrap console methods in browser mode.
  - POST logs to /dev/client-log.
acceptance:
  - logs/browser.log receives browser console entries.

## Task LOG-DAEMON-005: Dev Log Aggregator
status: IN_PROGRESS
files:
  - dev/daemon/index.js
description:
  - Tail logs/*.log and broadcast over WebSocket.
acceptance:
  - ws://localhost:7777/dev/logs streams new log entries.

## Task UI-CONSOLE-006: Atome Dev Console Panel
status: IN_PROGRESS
files:
  - src/squirrel/dev/dev_console.js
  - src/squirrel/spark.js
description:
  - Create in-app Dev Console UI panel.
  - Provide filters, pause/resume, export, snapshot.
acceptance:
  - Panel connects to WS daemon and renders logs.
  - Snapshot button posts to /dev/snapshot.

## Task UI-TEST-007: YAML UI Scenario Runner
status: IN_PROGRESS
files:
  - tests/ui/runner/run-scenario.js
  - tests/ui/scenarios/dev-console-smoke.yaml
description:
  - Implement YAML scenario format and runner.
acceptance:
  - Report JSON written to logs/ui-tests/*.report.json.
  - Screenshot captured on failure.

## Task SNAPSHOT-008: Debug State + Snapshot API
status: IN_PROGRESS
files:
  - server/server.js
  - src-tauri/src/server/mod.rs
  - src/squirrel/dev/dev_console.js
description:
  - Add /dev/state endpoints (Fastify + Axum).
  - Store snapshot JSON via /dev/snapshot.
acceptance:
  - logs/snapshots/snapshot-<timestamp>.json created via UI button.

## Task UI-TEST-008: Full Stack Media, Session, and Project Acceptance
status: IN_PROGRESS
files:
  - tests/probes/ui_full_stack_acceptance_test8_probe.test.mjs
  - tests/probes/audio_recording_quick_capture_probe.test.mjs
  - tests/probes/video_recording_audio_integrity_probe.test.mjs
  - tests/probes/tauri_recorded_video_mtrack_probe.test.mjs
  - tests/probes/atome_persistence_probe.test.mjs
description:
  - Run autonomous DebugUI/Playwright checks for browser and Tauri runtimes.
  - Cover account creation, audio recording/playback, video recording/playback, MTraX preview diagnostics, session refresh persistence, and project atome persistence.
  - Use JavaScript/Ruby tooling only; Python is not part of this workflow.
acceptance:
  - `npm run probe:ui-full-stack-test8` writes `temp/probe_reports/ui_full_stack_acceptance_test8/report.json`.
  - Browser steps pass for account creation, audio decode/playable media, video audio integrity, MTraX import, refresh persistence, and atome persistence.
  - Tauri steps verify authenticated recorded-video streaming and report any UI playback or canvas-preview blockers explicitly instead of masking them.
  - Future debugging requests that ask for autonomous validation should run this test after code changes, provided Fastify and Tauri are already running.
