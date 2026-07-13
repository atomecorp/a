# .codex Rule Set Coverage Summary

This is a navigation aid only. The active authority is [AGENTS.md](AGENTS.md) and its mandatory modules.

| Concern | Canonical module |
|---|---|
| Constitutional authority, DOM ownership, architectural role | `modules/01-root-constitution.md` |
| Code quality, simplicity, size, dead-code removal, language, fallbacks, Git, i18n | `modules/02-coding-standards-and-prohibitions.md` |
| Debugging, tests, evidence, UI validation | `modules/03-debugging-testing-and-ui-validation.md` |
| Reuse, legacy removal, map maintenance, capacity recovery | `modules/04-feature-work-cleanup-and-framework-reuse.md` |
| APIs, MCP, communication, rendering, UI components | `modules/05-api-rendering-and-ui.md` |
| Atome model, commits, history, sync, runtimes, ACL | `modules/06-atome-state-sync-and-runtime-modes.md` |
| Mandatory pre-flight, anti-regression gates, validation, completion lock | `modules/07-future-code-guardrails.md` |

## Cross-cutting invariants

- Canonical state remains outside the DOM.
- WebGPU is the product rendering route; the DOM is disposable projection only.
- All durable mutations use the canonical commit pipeline.
- Existing canonical code must be reused before new code is created.
- Simplicity is mandatory: prefer fewer concepts, layers, dependencies, writable states, and execution paths.
- No fallback architecture, compatibility shim, duplicate ownership, or speculative abstraction.
- Remove dead, duplicate, obsolete, temporary, and unnecessary code when safe.
- Validate the smallest relevant executable path first, then widen when required.
