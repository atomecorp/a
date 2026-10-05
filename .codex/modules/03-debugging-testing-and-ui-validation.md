# Debugging, Testing And UI Validation

Read this module for diagnosis, tests, runtime checks, or visual acceptance. Apply the [root instructions](../../AGENTS.md) and [common method](07-future-code-guardrails.md). The common method owns authorization, blockers, progress, completion reporting, and framework-state maintenance; this module owns validation execution and evidence.

## Evidence-driven investigation

Drive validation autonomously within the authorized scope. Continue until the reproduced problem is corrected and validated, or evidence establishes a blocker requiring access, a component authorization, or a product or architectural decision. Never stop at a probable cause, partial diagnosis, or unverified fix.

1. Reproduce with the narrowest deterministic scenario when feasible.
2. Identify the exact failing surface, canonical owner, runtime, and controlling chain.
3. State a falsifiable hypothesis and collect evidence that can confirm or disprove it.
4. Use an existing focused test or probe before inventing a temporary diagnostic.
5. Add only precise temporary instrumentation in the responsible layer when needed.
6. Correct the source within authorization and rerun the direct reproduction first.
7. Widen to relevant surrounding checks after the narrow validation passes.
8. Remove temporary instrumentation and rerun the cleaned path.

Read the relevant execution logs before and after each attempted correction. Do not repair blindly, add code from intuition, conclude from one symptom, or substitute code inspection for available runtime validation.

Evidence may include deterministic reproduction, targeted logs, traces, debug snapshots, runtime state, console errors, screenshots or frame captures, focused tests, and code-path inspection tied to observed behavior. Distinguish each evidence level; internal state alone does not prove visible rendering or interaction.

For recurrent symptoms, consult [known-bug-solutions/README.md](../../known-bug-solutions/README.md) and a matching issue's confirmed reproduction, owner, rejected hypotheses, correction, and regression checks. Update that knowledge base when a recurring issue receives a confirmed root-cause correction within the authorized scope.

## Full controlling-path coverage

Cover every important file and dependency involved in debugging, optimization, performance, cleanup, or architectural repair. Size, age, fan-out, entanglement, or crossing synchronization boundaries never justify skipping an owner, stopping inspection, or applying a partial repair.

Inspect large files in as many sequential passes as necessary to understand their relevant logic. Follow owners, callers, callees, shared helpers, state holders, renderers, sync boundaries, tests, and validation entry points. Do not claim completion while a controlling dependency remains unexplained.

Perform necessary decomposition and cleanup when authorized. When evidence proves that a complete repair needs broader scope or a missing internal component, finish read-only investigation, identify the prerequisite and bounded proposal, and use the common authorization gate. Complexity alone is not a blocker, and broader implementation is not automatically authorized.

## Runtime and console coverage

Use the requested context first: Web, Tauri, iOS, server, AUv3, or another specified runtime. Without a specified context, start with Web unless ownership evidence points elsewhere. Validate in the actual owning runtime and inspect every crossed boundary.

| Runtime | Required logs when involved |
| --- | --- |
| Web | Browser console, failed network requests, test runner, and relevant Fastify output. |
| Tauri | WebView console, Tauri terminal, Rust/Axum output, and paired Fastify logs. |
| iOS | Xcode/device native output, WebView console where available, and participating backend logs. |
| Server/integration | Relevant server and test process logs, beyond the final summary. |

Every remaining error or warning must be corrected, proven unrelated with evidence, or reported as an unresolved blocker with its scope. Never silently ignore console output or finalize with unexplained scenario errors or warnings.

## Validation routing

Verify commands against the current root `package.json` before running them. Known entry points are:

| Validation | Command |
| --- | --- |
| Focused Vitest file/folder | `npm run test:run -- path/to/test-or-folder` |
| Full Vitest / watch / requested coverage | `npm run test:run` / `npm run test` / `npm run test:coverage` |
| Syntax | `npm run check:syntax` |
| Guardrail baseline | `npm run check:m0` |
| Canonical component reuse | `npm run check:component-reuse-guardrails` (also in `check:m0`) |
| Molecule / guardrails plus Molecule | `npm run test:molecule` / `npm run check:m1` |
| Server verification | `npm run test:server-verification` |
| UI scenarios | `npm run dev:test-ui` |
| Existing targeted probes | `npm run probe:media-fixtures`, `npm run probe:browser-media-acceptance`, `npm run probe:ui-full-stack-test8` |

Do not run a milestone command absent from the current manifest or invent an equivalent validation claim. The refactor report records the removed obsolete citation.

- Start with the nearby focused test for a changed JavaScript owner.
- Include syntax checks for parser, syntax, or repository-wide safety changes.
- Include relevant guardrails for architecture or policy-sensitive code; prefer at least `check:m0`.
- Include Molecule tests for Molecule changes; widen to `check:m1` when guardrails may be affected.
- Include server verification when the modified server/API path reaches that surface.
- Use real UI execution when interaction or rendering is involved; visual inspection alone is insufficient.
- Inspect legacy `MTrax` references for Molecule-owned behavior and handle them under [module 04](04-feature-work-cleanup-and-framework-reuse.md).

Run the direct reproduction and relevant surrounding checks before declaring success. Add or update the smallest meaningful persistent test under `tests/` when an affected runtime contract lacks required coverage. Do not invent tests that merely restate the implementation. For documentation-only edits, validate links, references, consistency, traceability, and diff scope; application runtime tests are required only when the task changes or makes a new verification claim about application behavior.

## Rendering, state and interaction regression coverage

Apply the detailed constraints in [module 01](01-root-constitution.md), API/UI contracts in [module 05](05-api-rendering-and-ui.md), and state/replay contracts in [module 06](06-atome-state-sync-and-runtime-modes.md). For the affected subset, tests or guardrails must prove:

- minimal DOM and canvas budgets, no visible per-Atome subtree or canvas, and the shared WebGPU route;
- bounded hidden text service and actual text layout/rendering/editing behavior;
- image texture, video frame, and audio waveform rendering through the unified renderer;
- renderer-owned matrix previews without cloned DOM;
- selection, hit-testing, drag, resize, and transforms without forbidden DOM metadata;
- cache invalidation driven by canonical state, with no active legacy or fallback renderer;
- canonical-state survival through DOM teardown, rerender, hydration, replay, and reconciliation without reading business truth from the DOM;
- relevant durable mutations, persistence, deterministic replay, and synchronization contracts.

Exercise affected real actions: click, tap, pointer down/move/up, drag, resize, keyboard, focus, selection, copy/paste, IME, matrix/project display, video frames, and waveform display. A fixture without the affected media or behavior does not validate it.

## UI and visual acceptance

Before defining diagnostics or changing product code for UI readiness, tool activation, hit-testing, overlays, selectors, actionability, or any request to verify the UI visually, read and follow the complete canonical [UI debug procedure](../../atome/documentations/how_debug_UI.md). The [short entry](../how_debug_UI.md) routes to it. The secondary [eVe debug reference](../../eVe/documentations/debug_UI.md) describes diagnostic APIs; it does not replace the canonical procedure.

The canonical procedure owns readiness gates, foreground overlay lookup, real record-center pointer actions, hit-test diagnosis, existing canvas-aware helpers, pixel evidence, and prohibited diagnostic shortcuts. Follow it rather than duplicating its recipes or relying on document readiness, forced events, test-only activation, or state-only proof.

Observe the real interaction sequence and visible transitions. Neither code inspection, a static screenshot, nor a guessed event path proves an interaction-dependent fix. Inspect captured pixels and logs together; distinguish empty capture, environment failure, and product failure with evidence. If synthetic input fails while real input passes, the synthetic failure does not invalidate the real user path.

For visual acceptance across Web, Tauri, and physical iOS, also follow the complete [visual test protocol](../visual-test-protocol.md): all requested platform/scenario rows, real gestures, project/account isolation, media evidence, failure reproduction and classification, screenshots, logs, latency observations, and the final function-by-platform matrix. Do not weaken its evidence or completion requirements.

## Diagnostic cleanup and permanent observability

Temporary diagnostics may exist only for isolation and proof; they must not remain in production. Put temporary artifacts under `temp/` and persistent tests under `tests/` according to [module 02](02-coding-standards-and-prohibitions.md).

Remove failed experiments, abandoned probes, temporary logic branches, superseded edits, and unnecessary diagnostic output incrementally. If the user requests validation before cleanup, retain temporary instrumentation only until that validation completes.

Once confirmed, remove temporary logs, probes, tracing hooks, ad-hoc helpers, verbose instrumentation, and product-injected UI test code. Keep required persistent regression tests. Rerun the cleaned validation and inspect consoles again to prove no residue or unexplained output remains.

Committed production code must not contain ad-hoc `console.log`, `console.warn`, `console.debug`, debug traces, or temporary performance/verbose instrumentation. Atome and eVe version logs are the only permanently authorized ad-hoc logs. Needed persistent observability must use architecture-compliant centralized monitoring, structured logging, explicit levels, deterministic traces, and production-safe instrumentation through the existing owner or an explicitly authorized extension.

Before completion, scan modified files for unauthorized logs and temporary debug code. Report all failed, skipped, blocked, flaky, unavailable, or not-run validations through the common method; never convert them into a success claim.
