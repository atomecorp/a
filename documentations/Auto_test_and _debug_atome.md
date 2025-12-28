# Atome Debug & QA Architecture

## Goals

* Centralize logs from all runtimes: Axum, Fastify, Tauri webview, browser.
* Standardize log format and metadata.
* Provide a unified Dev Console inside Atome.
* Enable automated UI testing and scripting.
* Support Copilot assistance through structured reports.

---

## 1. Standard Log Format

### Task List

* [ ] Define a universal JSON log envelope:

  * `timestamp` (ISO-8601)
  * `level` (debug/info/warn/error)
  * `source` (axum/fastify/tauri_webview/browser)
  * `component` (auth/sync/adole/audio/ui/...)
  * `request_id` (optional)
  * `session_id` (optional)
  * `message`
  * `data` (structured details)
* [ ] Create a shared schema file (`/dev/log_schema.json`).
* [ ] Add validation helpers for each platform.

---

## 2. Axum (Rust) Integration

### Task List

* [ ] Add `tracing` + `tracing-subscriber` with JSON formatter.
* [ ] Inject `source="axum"` and `component` tags.
* [ ] Configure output:

  * stdout for local dev
  * `logs/axum.log` for JSONL persistence
* [ ] Create minimal middleware for automatic `request_id` injection.

---

## 3. Fastify (Node.js) Integration

### Task List

* [ ] Install & configure `pino` with JSON output.
* [ ] Add `source="fastify"`, `component`, `request_id`.
* [ ] Pipe into `logs/fastify.log` (JSON Lines).
* [ ] Expose `/dev/client-log` for browser logs.

---

## 4. Tauri Webview Logging

### Task List

* [ ] Inject console wrapper in preload script:

  * capture log level + arguments
  * call `invoke('log_from_webview', { ... })`
* [ ] Implement Rust handler to push logs into `tracing`.
* [ ] Add fallback to file if invoke fails.

---

## 5. Browser Logging (Web Mode)

### Task List

* [ ] Wrap console methods (log/info/warn/error/debug).
* [ ] POST logs to Fastify `/dev/client-log`.
* [ ] Enforce JSON schema.

---

## 6. Dev Log Daemon (Aggregator)

### Task List

* [ ] Create `dev-daemon/` service:

  * tail `logs/*.log` (JSONL)
  * optional WebSocket input from runtimes
* [ ] Expose `ws://localhost:<port>/dev/logs`.
* [ ] Merge and broadcast unified logs.
* [ ] Add filter by level/source/component.

---

## 7. Atome Dev Console (Internal UI)

### Task List

* [ ] Create panel in Atome UI: `DevConsole`.
* [ ] Connect to WS aggregator.
* [ ] Display stream with:

  * filters (source, level, text)
  * live pause/resume
  * export selected lines as JSON
* [ ] Jump-to-trace via `request_id/session_id`.

---

## 8. UI Automation & Robot Mode

### Task List

* [ ] Create `tests/ui/scenarios/` directory.
* [ ] Define YAML scenario format:

  * click / fill / wait-for / assert
  * selectors via `data-test-id`
* [ ] Add `data-test-id` attributes to core UI.
* [ ] Build runner:

  * Browser mode: Playwright
  * Tauri mode: browser fallback or custom WebSocket executor
* [ ] Save results to `logs/ui-tests/*.report.json`.
* [ ] Save screenshots on failure.

---

## 9. Debug Snapshots

### Task List

* [ ] Add `/dev/state` endpoints (Axum & Fastify):

  * connection states
  * last errors
  * sync counters
* [ ] Add UI button "Dump Debug Snapshot":

  * collect `/dev/state` x2
  * attach recent logs
  * store `snapshot-<timestamp>.json`

---

## 10. Copilot Workflow

### Task List

* [ ] Document commands:

  * `npm run dev:logs` (start aggregator + console)
  * `npm run dev:test-ui -- scenario=<name>`
* [ ] Copy `report.json` into PR comments for AI context.
* [ ] Establish standard prompt templates to request fixes.

---

## Folder Structure (Proposal)

```
repo/
  dev/
    log_schema.json
    daemon/
      index.ts
  logs/
    axum.log
    fastify.log
    ui-tests/
  tests/
    ui/
      scenarios/
      runner/
  src/
    tauri/
    browser/
    shared/
```

---

## Deliverables Checklist (MVP)

* [ ] Unified JSON log format
* [ ] Axum + Fastify instrumentation
* [ ] Webview + Browser console wrappers
* [ ] Log aggregator daemon
* [ ] Atome Dev Console
* [ ] YAML UI scenario engine
* [ ] Playwright integration
* [ ] Snapshot API & UI button

---

## 11. Copilot-Centric Workflow

This section defines how to structure tasks, files, and outputs so that Copilot can work as independently as possible to implement, test, and debug the system.

### 11.1 Principles

* Tasks must be **explicit and atomic** (small, well-defined units of work).
* Each task must declare:

  * a unique `id`,
  * the list of **target files**,
  * a clear **description**,
  * **acceptance criteria** linked to logs/tests,
  * a `status` field (`TODO | IN_PROGRESS | DONE`).
* All machine-readable outputs (logs, reports, snapshots) must be stored in predictable locations.
* Copilot should always be invoked with:

  * a reference to the **task id(s)**,
  * the relevant **spec file**,
  * and the **latest reports**.

---

### 11.2 Taskboard Specification File

Create a spec file dedicated to debug & automation tasks, for example:

* `dev/specs/debug_automation.md`

Structure:

```md
# Debug & Automation Taskboard

## Task LOG-AXF-001: Unified Logging for Axum + Fastify
status: TODO
files:
  - src/axum/logging.rs
  - src/fastify/plugins/logging.ts
description:
  - Implement JSON logging format defined in `dev/log_schema.json`.
  - Ensure `source`, `component`, `request_id` fields are always present.
acceptance:
  - All logs written as JSONL.
  - `logs/axum.log` and `logs/fastify.log` created on first request.
  - No panics or unhandled exceptions on log write.

## Task LOG-WEBVIEW-002: Tauri Webview Console Wrapper
status: TODO
files:
  - src/tauri/preload/log_wrap.js
  - src/tauri/commands/log_from_webview.rs
description:
  - Wrap console.* methods in the Tauri webview.
  - Dispatch logs to Rust via `invoke('log_from_webview', ...)`.
acceptance:
  - console.log/info/warn/error/debug visible in unified logs.
  - `source=tauri_webview` correctly set.
```

Guidelines:

* Always keep tasks **short and focused**.
* Prefer adding a new task over expanding an existing one.
* When a task is completed, update `status: DONE` (this can be done by Copilot as part of the PR).

---

### 11.3 Standard Output Locations for Copilot

To make Copilot effective for debugging and regression analysis, enforce these output paths:

* Unified logs:

  * `logs/axum.log`
  * `logs/fastify.log`
  * `logs/tauri_webview.log` (optional if not folded into axum.log)
  * `logs/browser.log` (optional if not folded into fastify.log)
* UI tests:

  * `logs/ui-tests/<scenario-name>.report.json`
  * `logs/ui-tests/<scenario-name>-step-<n>.png` (screenshots)
* Debug snapshots:

  * `logs/snapshots/snapshot-<timestamp>.json`

Each report JSON should follow a stable format, e.g.:

```json
{
  "scenario": "create-project-and-add-note",
  "success": false,
  "failed_step": 5,
  "error": "target [data-test-id='btn-add-note'] not found",
  "logs_correlation_id": "abc-123",
  "created_at": "2025-01-01T12:00:00Z"
}
```

Copilot can then:

* open the report file,
* inspect fields (`failed_step`, `error`),
* read correlated logs via `logs_correlation_id`,
* propose code fixes in the target files listed in the corresponding task.

---

### 11.4 UI Scenario Format for Copilot

All UI scenarios used for automation should:

* live under `tests/ui/scenarios/`,
* use a consistent YAML structure,
* only rely on `data-test-id` selectors.

Example:

```yaml
name: create-project-and-add-note
version: 1
steps:
  - type: click
    target: "[data-test-id='btn-new-project']"
  - type: fill
    target: "[data-test-id='input-project-name']"
    value: "Test project"
  - type: click
    target: "[data-test-id='btn-save-project']"
  - type: wait-for
    target: "[data-test-id='project-opened']"
    timeout_ms: 5000
  - type: click
    target: "[data-test-id='btn-add-note']"
  - type: fill
    target: "[data-test-id='input-note-text']"
    value: "Hello from robot"
  - type: assert-text
    target: "[data-test-id='note-content']"
    equals: "Hello from robot"
```

The UI test runner must:

* fail fast when a step cannot be executed,
* record the `failed_step` index and error message in the report,
* optionally capture a screenshot.

---

### 11.5 Recommended Copilot Prompts

To maximize autonomy, prefer prompts that:

* reference **task IDs**,
* include explicit file paths,
* point to **reports**.

Examples:

```text
Implement tasks LOG-AXF-001 and LOG-WEBVIEW-002 from dev/specs/debug_automation.md.
Focus on the files listed in each task and keep the existing public API stable.
```

```text
Read logs/ui-tests/create-project-add-note.report.json and fix the scenario
and/or UI code so that the scenario passes.
Update the corresponding task status in dev/specs/debug_automation.md.
```

```text
Inspect logs/axum.log and logs/fastify.log for recurring errors related to sync.
Propose fixes in src/shared/sync/*.ts and add any missing logging to help
diagnose future issues.
```

---

### 11.6 Development Loop with Copilot

Define and document a standard loop for daily work:

1. **Plan**

   * Edit `dev/specs/debug_automation.md`.
   * Add or update tasks with clear IDs and acceptance criteria.

2. **Implement (with Copilot)**

   * Ask Copilot to implement one or more tasks.
   * Review and adjust the generated code if necessary.

3. **Run Tests & Collect Reports**

   * Execute:

     * `npm run dev:test-ui -- scenario=<name>` for UI scenarios.
     * any unit/integration tests you define.
   * Ensure reports are written to `logs/ui-tests/` and logs to `logs/*.log`.

4. **Debug (with Copilot)**

   * Ask Copilot to read the reports and logs.
   * Let it propose fixes and additional instrumentation.

5. **Update Taskboard**

   * When a task is done and tests pass, update `status: DONE`.
   * Optionally let Copilot modify the taskboard file as part of the same change.

6. **Repeat**

   * Iterate until all tasks required for a feature / milestone are DONE.

---

### 11.7 Minimal Requirements to Consider Copilot “Maximally Independent”

Copilot can be considered as independent as possible (within its limits) when:

* [ ] All debug/logging/automation tasks live in `dev/specs/debug_automation.md` (or equivalent) with IDs, files and acceptance criteria.
* [ ] All logs and automation outputs are in stable, machine-readable JSON formats under `logs/`.
* [ ] All critical UI elements have `data-test-id` attributes.
* [ ] UI scenarios exist for all major user flows under `tests/ui/scenarios/`.
* [ ] There are documented commands to run tests and generate reports.
* [ ] Copilot is always invoked with a combination of:

  * task IDs,
  * spec file path,
  * relevant log/report file paths.

Once these conditions are met, Copilot can:

* implement new tasks end-to-end,
* interpret failures via reports,
* propose code fixes and updates to the taskboard,
  while you only need to:
* execute commands (tests, builds, runs),
* review diffs,
* approve or reject changes.
