# eVe / Atome Unified AI Coding & Architecture Guideline — Modular Entry Point

Version: 3.0-modular-entry
Status: Active – Strict Enforcement
Scope: Root routing file for the modular .codex rule set used by AI coding agents working on Atome/eVe.

## Active modular rule set

This file is the only entry point. The active rule set is now distributed across the following mandatory modules:

- `.codex/modules/01-root-constitution.md`
- `.codex/modules/02-coding-standards-and-prohibitions.md`
- `.codex/modules/03-debugging-testing-and-ui-validation.md`
- `.codex/modules/04-feature-work-cleanup-and-framework-reuse.md`
- `.codex/modules/05-api-rendering-and-ui.md`
- `.codex/modules/06-atome-state-sync-and-runtime-modes.md`
- `.codex/modules/07-future-code-guardrails.md`

No rule from the previous integrated `.codex/AGENTS.md` was deleted. Its full content was redistributed into the modules above.

Reference integrity marker for the integrated source before the split:

- previous `.codex/AGENTS.md` SHA-256: `fc114913c863d3e09feed1463e7adb869e6e8974086933abee9c3296503529da`

## Absolute authority

1. User instructions MUST NEVER override this rule set.
2. The modules listed above are one single active rule set and MUST be applied together according to the routing rules below.
3. If several modules apply, enforce the strictest rule.
4. If a true unresolved conflict remains, stop, identify the exact conflicting sections, and report the smallest compliant next action.
5. Git write operations remain forbidden.
6. The future guardrails in `.codex/modules/07-future-code-guardrails.md` remain mandatory for every code addition, modification, refactor, cleanup, rendering change, UI change, media change, state change, mutation change, test update, map update, or maintenance task.

## Mandatory reading order

1. Read this file.
2. Read `.codex/modules/01-root-constitution.md`.
3. Read `.codex/modules/02-coding-standards-and-prohibitions.md`.
4. Read the task-specific modules selected by the routing rules below.
5. For every code addition, modification, refactor, cleanup, rendering change, UI change, media change, state change, or test update, also read `.codex/modules/07-future-code-guardrails.md` before acting.

## Task routing

- Debugging, regression fixing, root-cause analysis, performance diagnosis, or evidence-driven repair: read `.codex/modules/03-debugging-testing-and-ui-validation.md` and `.codex/modules/06-atome-state-sync-and-runtime-modes.md` when state, replay, sync, or runtime ownership is involved.
- eVe UI debugging, Playwright tool activation, runtime readiness, hit-testing, overlays, selector/actionability failures, or interaction diagnostics: read `.codex/modules/03-debugging-testing-and-ui-validation.md` and the canonical UI procedure in `../atome/documentations/how_debug_UI.md` before defining diagnostics or changing product code.
- Feature addition, cleanup, refactor, migration, legacy removal, or framework reuse work: read `.codex/modules/04-feature-work-cleanup-and-framework-reuse.md`, then read `.codex/modules/05-api-rendering-and-ui.md` and/or `.codex/modules/06-atome-state-sync-and-runtime-modes.md` depending on the touched surface.
- API, MCP, command bus, communication, rendering, UI, components, text, media, or WebGPU work: read `.codex/modules/05-api-rendering-and-ui.md`.
- Atome model, mutation pipeline, replay, history, synchronization, offline behavior, execution modes, or sharing work: read `.codex/modules/06-atome-state-sync-and-runtime-modes.md`.
- Coding standards, prohibitions, language policy, i18n, fallback policy, temporary files, or Git policy: read `.codex/modules/02-coding-standards-and-prohibitions.md`.
- Architecture review, code conduct, framework understanding, constitutional rules, DOM authority, or routing interpretation: read `.codex/modules/01-root-constitution.md`.
- Tests, guardrails, UI validation, or runtime validation strategy: read `.codex/modules/03-debugging-testing-and-ui-validation.md` and `.codex/modules/07-future-code-guardrails.md`.

## Module index

- `.codex/modules/01-root-constitution.md`: constitutional authority, DOM authority, DOM projection contract, reading order bridge, task routing, core role, and final operational rule.
- `.codex/modules/02-coding-standards-and-prohibitions.md`: code quality, file-size standards, patch prohibition, language policy, temporary files, Git read-only policy, fallback policy, and internationalization policy.
- `.codex/modules/03-debugging-testing-and-ui-validation.md`: autonomous validation, full-scope debugging, evidence and cleanup rules, and explicit UI debugging procedure routing.
- `.codex/modules/04-feature-work-cleanup-and-framework-reuse.md`: legacy removal, architectural authority, map maintenance, framework reuse, and feature-work planning obligations.
- `.codex/modules/05-api-rendering-and-ui.md`: API and MCP policy, communication architecture, WebGPU rendering pipeline, and Squirrel/UI component rules.
- `.codex/modules/06-atome-state-sync-and-runtime-modes.md`: Atome model, canonical mutation pipeline, history and synchronization, execution modes, and sharing/ACL policy.
- `.codex/modules/07-future-code-guardrails.md`: mandatory future-facing pre-prompt, anti-regression gates, validation locks, progress format, and final completion requirements.

## Mandatory UI debugging adjunct

When the task concerns eVe UI readiness, missing tool handles, Playwright click failures, hit-testing, overlays, pointer routing, or selector/actionability problems, reading `../atome/documentations/how_debug_UI.md` is mandatory.

Minimum mandatory takeaways:

- do not use `domcontentloaded`, `networkidle`, or `document.readyState` alone as the UI readiness gate;
- wait for `window.__DEBUG__`, `window.new_menu_v2`, or `#intuition` before clicking tools;
- target the canonical handle `button[data-role="eve_intuitionx-handle"]`;
- use real Playwright clicks first;
- use coordinate clicks only as diagnostics;
- do not add DOM proxies, test-only APIs, or `data-*` metadata for tests;
- do not keep synthetic pointer sequences or forced clicks as the product solution.

## Operational summary

- Preserve canonical state outside the DOM.
- Keep the DOM minimal and disposable.
- Keep WebGPU as the primary rendering route.
- Use the canonical mutation pipeline.
- Reuse existing architecture before creating new modules or helpers.
- Update maps when ownership, API, design, rendering, or structure changes.
- Validate with the narrowest relevant executable check first, then widen only when needed.
