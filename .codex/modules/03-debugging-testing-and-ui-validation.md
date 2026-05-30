# Debugging Testing And UI Validation

This module is part of the active .codex rule set.

## AUTONOMOUS TEST EXECUTION POLICY

The assistant MUST drive validation autonomously and MUST NOT stop at a partial diagnosis, an unverified assumption, or a probable fix.

Operational obligations:

- Continue working until the reproduced problem is resolved, or until an evidence-backed architectural blocker makes resolution impossible without user clarification.
- Never guess the cause of a failure, repair blindly, or add code because a hypothesis merely seems likely.
- Add the minimum precise temporary logs, probes, or diagnostics required to identify the owning layer and the root cause.
- Always read the relevant execution logs before and after each attempted fix.
- Never stop while relevant error logs or warning logs remain unexplained.
- Remove temporary logs and diagnostics once the issue is proven fixed, then rerun the validation path to confirm clean output.

Mandatory console coverage by runtime:

- Browser mode: read the browser console, network failures, test runner output, and any Fastify-side logs involved in the scenario.
- Tauri mode: read the WebView console, the Tauri terminal output, Rust or Axum logs, and any paired Fastify logs when the scenario crosses that boundary.
- iOS mode: read Xcode console output, native iOS logs, WebView console output when available, and any backend logs participating in the failing path.
- Server-side or integration scenarios: read the relevant server and test process logs, not only the final failure summary.

Mandatory test selection strategy:

1. Reproduce the issue with the narrowest deterministic command or scenario.
2. Run the smallest validation that can falsify the current hypothesis.
3. After a local fix, rerun that same narrow validation first.
4. Only then widen to the next relevant suite or guardrail.
5. Do not declare success until the direct reproduction path and the relevant surrounding checks both pass.

Repository validation entry points:

- Focused Vitest file or folder: npm run test:run -- path/to/test-or-folder
- Full Vitest run: npm run test:run
- Watch-mode test development: npm run test
- Coverage when explicitly needed: npm run test:coverage
- Syntax validation: npm run check:syntax
- Guardrail baseline: npm run check:m0
- Molecule validation: npm run test:molecule
- Extended guardrails plus molecule: npm run check:m1
- Full milestone validation currently exposed by the repo: npm run check:m2
- Server verification: npm run test:server-verification
- UI scenario runner: npm run dev:test-ui
- Targeted probes when the failing area matches an existing probe: npm run probe:media-fixtures, npm run probe:browser-media-acceptance, npm run probe:ui-full-stack-test8

Test routing rules:

- For a single touched JavaScript module with an existing nearby test, run the focused test path first, not the full suite.
- For parser, syntax, or repository-wide safety changes, include npm run check:syntax.
- For architecture or policy-sensitive changes, include the relevant guardrail path and prefer at least npm run check:m0.
- For Molecule-related changes, include npm run test:molecule and widen to npm run check:m1 when the change can affect guardrails.
- During any debug, feature addition, repair, cleanup, or refactor, check whether the touched scope still contains legacy `MTrax` references for Molecule-owned behavior and progressively rename or remove them whenever the migration is coherent and verifiable.
- For server or API behavior, include npm run test:server-verification when the touched path reaches the verification surface.
- For UI issues, use the documented UI debug process and the UI scenario runner when applicable; do not rely on visual inspection alone, and exercise the real UI path when the bug depends on interaction.
- If an existing probe already targets the failing surface, run it before inventing a new temporary script.

Autonomous completion criteria:

- The original issue is reproduced, explained, fixed at the root cause, and revalidated.
- The narrowest relevant test or scenario passes.
- The next relevant suite or guardrail passes when applicable.
- Browser, Tauri, Xcode, server, and test logs relevant to the scenario contain no unexplained errors or warnings.
- Temporary diagnostics have been removed and the cleaned validation path has been rerun successfully.

If these conditions are not met, the assistant MUST keep investigating instead of stopping early.

## MANDATORY FULL-SCOPE DEBUG AND OPTIMIZATION COVERAGE

This rule is strict, non-negotiable, and applies to every debugging, optimization, performance, cleanup, and architectural repair task.

The assistant MUST treat every important file involved in the owning code path, even when that file is large, very large, legacy, tangled, highly connected, or architecturally tentacular.

Strictly forbidden reasons to stop, defer, narrow away, or leave the task incomplete:

- the file has too many lines;
- the file is too large to read in a single pass;
- the file has too many dependencies or callers;
- the file is old, messy, central, or spans several responsibilities;
- the code path crosses too many modules, layers, or synchronization boundaries.

Mandatory behavior:

- If an important file is too large to inspect in one pass, inspect it in as many sequential passes as necessary until the relevant logic is fully covered.
- If the bug, regression, or optimization surface crosses several files, continue through the full controlling chain: owners, callers, callees, shared helpers, state holders, renderers, sync layers, tests, and validation entry points.
- Never declare a task complete, blocked, or out of scope while an important controlling file or dependency chain remains unread, unexplained, or untreated.
- Never use file size, fan-out, complexity, or architectural entanglement as justification for a partial fix, a superficial optimization, or an early stop.
- When a large or tentacular file must be changed, perform the necessary structured refactor, decomposition, or cleanup required to make the repair or optimization complete and maintainable.
- When the relevant scope includes a large legacy file, treating that file thoroughly is mandatory work, not optional follow-up.

## DEBUGGING, EVIDENCE, AND CLEANUP POLICY

Problem resolution MUST be evidence-driven.

The assistant MUST NOT:

- presume a root cause without proof;
- create code for debugging, fixing, refactoring, or cleanup from intuition alone;
- repair a bug blindly;
- draw hasty conclusions from a single symptom;
- declare a fix valid without targeted verification.

Mandatory investigation method:

1. reproduce the issue when feasible;
2. identify the exact failing surface, owning layer, and runtime context;
3. formulate a falsifiable hypothesis;
4. collect evidence that can confirm or disprove that hypothesis;
5. instrument the responsible layer with precise temporary logs, probes, traces, snapshots, or diagnostics when needed;
6. isolate and fix the root cause;
7. rerun the same scenario;
8. verify the symptom is gone, the root cause is addressed, and no regression was introduced.

Context selection is mandatory during debugging:

- Use the explicitly requested context first: Tauri, iOS, Web Browser, server, AUv3, or another stated runtime.
- If no context is specified, start with Web Browser mode unless runtime ownership evidence points elsewhere.
- If ownership points to Tauri, validate in Tauri with the WebView, Axum, and related logs.
- If ownership points to iOS, validate in iOS with Xcode, native, WebView, and related backend logs.
- If the path crosses runtime boundaries, inspect the logs and behavior of each boundary instead of assuming the first visible failure is the source.

Accepted evidence includes targeted logs, debug snapshots, runtime state inspection, deterministic reproduction steps, browser or native console errors, screenshots or frame captures, focused automated tests, and code-path inspection tied to observed behavior.

Console and UI obligations:

- Always read the relevant browser, webview, native, server, or test consoles when they exist.
- Do not stop debugging while unexplained errors or warnings remain in the observed consoles.
- Each remaining error or warning must be resolved, disproven as unrelated with evidence, or escalated to the user with clear proof and scope.
- For UI issues, read and apply eVe/documentations/debug_UI.md before defining or running UI diagnostics, autonomous UI checks, or browser-driven validation.
- Use the documented UI debug surface whenever relevant, including window.**DEBUG** state readers, deterministic test mode, screenshot capture, and comparison of DOM state, debug state, visual output, and console errors.
- Validate UI fixes through the real interaction path when applicable: click, tap, drag, pointer movement, focus changes, keyboard input, gesture sequences, and visible state transitions.
- Do not approve a UI fix based only on code inspection, a static screenshot, or a guessed event path when the failure depends on interaction.

Temporary diagnostics:

- Temporary debugging code MUST NEVER remain in production code.
- Add temporary logs and diagnostics precisely, strategically, only in the responsible layer, and only for as long as needed.
- Temporary debug scripts, probes, and validation helpers MUST remain under ./temp or ./tests according to their role.
- Remove failed attempts, abandoned probes, temporary logic branches, invalid experiments, and superseded debug edits incrementally as soon as they are proven unnecessary.
- Do not let unsuccessful debugging attempts accumulate in the codebase.

Cleanup and permanent logging rules:

- No issue is solved until the fix is verified by evidence.
- No issue is solved while relevant consoles still contain unexplained errors or warnings produced by the reproduced scenario.
- If the user requests validation before cleanup, temporary diagnostics may remain only until that validation is complete.
- Once the solution is confirmed, remove all temporary logs, probes, debug instrumentation, tracing hooks, console outputs, ad-hoc validation helpers, and temporary UI test code introduced only for isolation or proof.
- After cleanup, rerun the relevant validation path and verify in the console that no temporary debug output remains and that no unexplained errors or warnings are still emitted.
- Forbidden in committed production code: console.log, console.warn, console.debug, ad-hoc debug traces, temporary performance traces, and temporary verbose runtime instrumentation.
- Only permanently authorized logs are Atome version logs and eVe version logs.
- If persistent observability is required, use centralized architecture-compliant monitoring, structured logging, explicit log levels, deterministic trace systems, and production-safe instrumentation.
- Silent accumulation of debug logs or diagnostic residue is an architecture violation.
- Before finalizing any task, scan modified files for remaining logs, remove all non-authorized logs, and verify that no temporary debug code or instrumentation remains.

## MANDATORY UI DEBUGGING ADJUNCT

For eVe UI interaction debugging, Playwright tool activation failures, runtime readiness issues, hit-testing failures, or selector/actionability problems, the agent MUST read and apply the canonical procedure in [../../atome/documentations/how_debug_UI.md](../../atome/documentations/how_debug_UI.md) before inventing new diagnostics or changing product code.

Mandatory takeaways from the validated procedure:

- Do not use `domcontentloaded`, `networkidle`, or `document.readyState` alone as the UI readiness gate.
- Before clicking eVe tools, wait for the eVe runtime surface through `window.__DEBUG__`, `window.new_menu_v2`, or `#intuition`.
- Target the existing canonical handle with `button[data-role="eve_intuitionx-handle"]`.
- Use real Playwright clicks first.
- Use coordinate clicks only to classify hit-test or actionability failures.
- Do not add DOM proxies above the canvas or tools.
- Do not add `data-*` attributes to Atomes or rendered tool surfaces just for tests.
- Do not use a test-only API that activates a tool directly.
- Do not keep `force: true`, coordinate clicks, `dispatchEvent`, or synthetic pointer events as the product solution.
- If synthetic events fail but real clicks pass, ignore the synthetic failure for product behavior because it is not the user path.
