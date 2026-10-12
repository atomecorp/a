# Codex-like integration point

**Status:** Roadmap / implementation specification  
**Project:** atome / eVe  
**Date:** 2026-09-25  
**Target platforms:** Tauri desktop (macOS first), native iOS application, later other supported atome runtimes  
**Primary objective:** provide an integrated, secure, Codex-like development workflow inside atome/eVe, with chat and voice control, plan generation, code modification, validation, live preview, rollback, model selection, and explicit publishing controls.

---

## 1. Mission

Build a **Codex-like development mode inside atome/eVe** without turning the application shell into a self-modifying monolith.

The architecture must keep a **stable host shell** and run AI-produced changes inside a **candidate runtime/workspace** that can be validated, previewed, rejected, destroyed, or promoted without compromising the currently working runtime.

The first implementation must focus on what is technically reliable and easy to maintain:

1. JavaScript / HTML / CSS development first.
2. Tauri desktop live development first.
3. Native iOS Debug live-runtime support second.
4. WASM rebuild + reload after the JS path is stable.
5. Native Rust / Swift remain normal compiled code paths.
6. Git publishing is a separate, explicitly authorized action, never an automatic consequence of an AI answer.

This feature must **reuse the existing atome/eVe chat, voice, AI gateway, model catalogue, module loader, validation scripts, CodeMirror integration, test infrastructure, architecture maps, and security boundaries** instead of creating parallel systems.

---

# 2. Non-negotiable rules before implementation

Before writing or modifying code:

1. Read `.codex/AGENTS.md`.
2. Follow its mandatory module reading order.
3. Perform the mandatory reuse audit.
4. Locate canonical owners through:
   - `maps/CODEMAP.md`
   - `maps/ARCHITECTURE_MAP.md`
   - `maps/API_MAP.md`
   - `maps/DESIGN_MAP.md`
5. Reuse existing AI/chat/voice/model/runtime owners.
6. Do not create another chat subsystem.
7. Do not create another model-provider abstraction if the existing broker/catalogue can be extended.
8. Do not create a second generic filesystem abstraction.
9. Do not bypass the existing mutation/ownership contracts.
10. Do not weaken existing guardrails merely to make live coding easier.
11. Do not perform real Git commit/push operations while implementing this roadmap if the active `.codex` policy still forbids Git writes. Build/test the Publisher abstraction with mocks or an isolated test repository until the policy is explicitly changed.
12. Update maps and framework-state documentation when ownership or verified framework behavior changes.

---

# 3. Verified starting point to reuse

The current codebase already contains most of the foundations required for this feature.

## 3.1 Tauri desktop

Current Tauri configuration:

- frontend is sourced from `atome/src`;
- `atome` and `eVe` are bundled as local resources;
- Tauri shell/native Rust can remain stable while frontend resources are reloaded;
- pure JS/HTML/CSS changes therefore do not inherently require a Tauri binary rebuild.

Relevant paths include:

- `platforms/desktop-tauri/tauri.conf.json`
- `platforms/desktop-tauri/src/`
- `atome/src/`
- `eVe/`

The implementation should exploit this separation instead of trying to hot-swap Rust code inside the running binary.

## 3.2 Native iOS application

The iOS target is a real Xcode application using Swift and `WKWebView`, not a Tauri iOS target.

Relevant paths include:

- `platforms/ios/atome-auv3/`
- `platforms/ios/atome-auv3/application/`
- `platforms/ios/atome-auv3/Common/`
- `platforms/ios/package_ios_runtime.mjs`

Today, JavaScript is packaged by `package_ios_runtime.mjs` into an `atome_runtime` bundle used by the native application.

Therefore, the normal packaged application requires a rebuild/repackage for changed JS to reach the device.

The Codex-like development feature must add a **Debug-only external/candidate runtime route** without changing the normal production route.

## 3.3 Existing iOS runtime isolation

The iOS application already has:

- `WKWebView`;
- a JS ↔ Swift bridge;
- runtime boot telemetry;
- WebContent termination handling;
- `FeatureFlags.swift`;
- optional Web Inspector support in Debug;
- local HTTP server support;
- custom `atome://` runtime loading.

This is enough to implement a lightweight inner isolation model without a full virtual machine.

## 3.4 Existing module loader

Reuse:

- `atome/src/utils/module_loader_runtime.js`
- `globalThis.__ATOME_PACKAGED_MODULES__`
- `eVe/eVe.js`

Do not introduce a parallel module registry unless an unavoidable limitation is demonstrated.

## 3.5 Existing AI infrastructure

Reuse the existing owners around:

- `atome/src/squirrel/ai/agent_gateway.js`
- `atome/src/squirrel/ai/agent_gateway_execution.js`
- `atome/src/squirrel/ai/model_catalog_registry.js`
- provider broker/session infrastructure
- existing remote-tool approval model
- existing MCP/security mechanisms where relevant.

The Codex-like mode is a **development capability built on the existing agent layer**, not a new AI stack.

## 3.6 Existing development and validation infrastructure

Reuse existing dependencies and scripts including:

- CodeMirror;
- `chokidar`;
- `check:syntax`;
- Vitest;
- Playwright;
- existing `check:*` guardrails;
- existing probes;
- existing UI validation protocol;
- `scripts/update-hot-manifest.mjs`;
- existing SHA-256 based hot-manifest concept.

---

# 4. Core architecture

Use a stable-host / candidate-runtime architecture.

```text
┌──────────────────────────────────────────────┐
│              Stable atome host               │
│ Tauri shell or native iOS application shell  │
│                                              │
│  Existing chat / voice / developer UI        │
└───────────────────────┬──────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────┐
│           Developer Agent Orchestrator       │
│                                              │
│  Prompt → Context → Plan → Patch → Validate  │
│       → Candidate Preview → Approval         │
└───────────┬───────────────────────┬──────────┘
            │                       │
            ▼                       ▼
┌──────────────────────┐  ┌──────────────────────┐
│ Stable workspace A   │  │ Candidate workspace B │
│ known-good runtime   │  │ AI modifications      │
└──────────────────────┘  └──────────┬───────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │ validation pipeline  │
                          │ syntax / tests / UI  │
                          │ guardrails / probes  │
                          └──────────┬───────────┘
                                     │
                            pass     │      fail
                              ┌──────┴──────┐
                              ▼             ▼
                          Preview B      Destroy B
                              │           Reload A
                              ▼
                         User approval
                              │
                              ▼
                        Promote / publish
```

The system must **never edit the currently running stable runtime directly**.

---

# 5. Runtime A/B model

## 5.1 Runtime A

Runtime A is the last known-good runtime.

Requirements:

- immutable during an AI execution;
- always available for rollback;
- can relaunch independently of the candidate;
- its manifest/version/base commit is recorded.

## 5.2 Runtime B

Runtime B is the candidate runtime.

It may contain:

- AI-edited JavaScript;
- changed HTML/CSS;
- rebuilt WASM;
- temporary generated assets required for validation.

It must be disposable.

A candidate runtime is never considered valid because a model says it is valid.

It must pass executable checks.

## 5.3 Promotion

Promotion means:

1. candidate passes required validation;
2. user explicitly accepts the candidate;
3. candidate becomes the selected working state;
4. optional Git publish is still a separate step.

Promotion must not imply automatic commit or push.

## 5.4 Rollback

Rollback must be possible when:

- syntax fails;
- boot fails;
- WebContent crashes;
- health handshake times out;
- required UI/runtime probe fails;
- user presses Reject;
- user asks to restore previous version.

Rollback must restore Runtime A without requiring a native application reinstall.

---

# 6. Do not build a full VM

A full VM/container inside the application is unnecessary for the first implementation.

Use runtime isolation already provided by the host:

## Tauri

Prefer:

- a dedicated candidate webview/window;
- a dedicated candidate workspace directory or Git worktree;
- local development server;
- controlled reload of the candidate webview.

Keep the main atome shell alive.

## Native iOS

Use:

- stable Swift application shell;
- candidate JS runtime loaded in `WKWebView`;
- Debug-only runtime selector;
- recreate the `WKWebView` if necessary;
- return to packaged stable runtime on failure.

The WebView is the disposable execution environment.

---

# 7. Tauri live-development mode

## 7.1 Goal

Pure JavaScript/HTML/CSS changes must be testable without rebuilding the Tauri binary.

## 7.2 Flow

```text
User prompt
→ AI plan
→ user approves plan or allows configured auto-execute scope
→ AI edits candidate workspace
→ syntax + guardrails + relevant tests
→ reload candidate frontend
→ runtime health check
→ preview
→ accept/reject
```

## 7.3 Candidate development server

The candidate workspace should be served through a dedicated local development server.

Required properties:

- binds only to an explicitly configured interface;
- random or configured high port;
- authentication token even on localhost if the endpoint can mutate state;
- candidate ID/session ID required;
- path normalization;
- no arbitrary filesystem browsing;
- no shell endpoint;
- no directory traversal;
- no hidden automatic exposure to LAN.

## 7.4 File watching

Reuse `chokidar`.

Watch only the candidate scope.

Do not watch the whole machine.

## 7.5 Reload strategy

Initial MVP:

- controlled full frontend reload after validated JS changes.

Later optional optimization:

- module-level HMR only where ownership/lifecycle semantics prove it safe.

Do not introduce HMR into stateful canonical owners until their disposal/reinitialization lifecycle is explicitly defined and tested.

---

# 8. Native iOS live-development mode

## 8.1 Debug only by default

Add a capability such as:

`FeatureFlags.codexLiveRuntimeEnabled`

Requirements:

- exists only under `#if DEBUG` or equivalent internal-development configuration;
- false in Release;
- cannot be activated from arbitrary remote JavaScript;
- requires an authenticated developer session;
- normal App Store/production package always uses the packaged runtime unless a separate future compliance review explicitly changes this.

This separation is important because App Store Review Guidelines §2.5.2 restrict downloaded code that changes application functionality, while §4.7 has separate constraints for certain HTML5/JavaScript software. atome exposes native bridges, therefore production remote-code execution must not be assumed acceptable.

## 8.2 Runtime source selection

Debug application should support:

```text
Packaged runtime
or
Authorized candidate runtime
```

The selection must be visible in diagnostics.

Example conceptual state:

```text
runtime_source = packaged
runtime_source = candidate:https://dev-host/session/<id>/
```

## 8.3 Pairing

Recommended pairing model:

1. desktop/server generates a short-lived pairing code or QR;
2. iPhone Debug app authenticates;
3. server returns a short-lived session token;
4. token is bound to:
   - user;
   - device;
   - candidate session;
   - permitted workspace;
   - expiration;
   - allowed actions.

Do not store a permanent GitHub token or provider secret on the iPhone.

## 8.4 Network security

Required:

- TLS where traffic leaves localhost;
- certificate validation;
- no wildcard CORS;
- session-specific authorization;
- short expiry;
- revocation;
- origin/path validation;
- rate limiting;
- request size limits;
- audit log.

For local-LAN development, provide an explicit trusted-device pairing process rather than assuming the local network is trusted.

## 8.5 Failure recovery

If candidate runtime:

- cannot boot;
- reports fatal boot failure;
- becomes unresponsive;
- causes WebContent termination;

the native host must offer or perform a safe fallback to the packaged runtime.

The stable Swift shell remains alive.

## 8.6 Release behavior

Release build must not expose:

- development runtime address input;
- arbitrary remote module URL;
- Web Inspector developer control;
- filesystem mutation endpoints;
- AI coding write tools;
- Git publisher credentials.

Production can still contain normal AI/chat features, but not the privileged development execution surface unless separately designed and reviewed.

---

# 9. WASM development path

WASM must not block the first MVP.

## Phase 1

JS-only candidate development.

## Phase 2

Support:

```text
source change
→ build WASM on desktop/server
→ validation
→ serve generated .wasm in candidate runtime
→ reload candidate webview
```

The iPhone must not be expected to compile Rust/WASM itself.

## Temporary JS implementation rule

A native/WASM feature may temporarily have a JS implementation during experimentation only when:

1. the public contract/API is the same;
2. the JS version does not create a second canonical state owner;
3. it is explicitly marked as a development implementation;
4. production selection is deterministic;
5. both implementations can be tested against the same contract tests;
6. temporary JS is removed when the compiled implementation becomes canonical.

Do not duplicate rendering engines, audio engines, mutation ownership, or core state as a shortcut.

---

# 10. Rust and Swift changes

The UI must identify native changes separately.

## Rust/Tauri

If the plan modifies Rust:

- mark `native rebuild required`;
- do not pretend it is hot-reloadable;
- run relevant cargo checks;
- restart/rebuild Tauri through the normal development path.

## Swift/iOS

If the plan modifies Swift/Objective-C/C++:

- mark `Xcode rebuild required`;
- do not attempt dynamic replacement;
- run normal native tests/build checks.

The chat should explain this transition, but keep the same plan/task session.

---

# 11. Developer access and authorization

This feature creates powerful code-execution capability and must not be available to every normal account.

Use capability-based authorization, not only a hidden menu.

Suggested capabilities:

```text
developer.codex.view
developer.codex.plan
developer.codex.execute_js
developer.codex.build_wasm
developer.codex.run_tests
developer.codex.preview
developer.codex.publish
developer.codex.native_build
developer.codex.admin
```

A role may group capabilities, but execution checks must be capability-based.

Suggested product roles:

- Normal user: no development surface.
- Developer Reader: inspect/chat/plan only.
- Developer Executor: candidate modifications + tests + preview.
- Developer Publisher: explicit publish actions.
- Developer Admin: configure providers, policies, scopes, devices.

Never infer authorization from the visibility of a UI button.

Every privileged backend/native action must check authorization again.

---

# 12. Security threat model

The design must explicitly protect against the following.

## 12.1 Prompt injection into code tools

A source file, README, remote page, issue, project data, generated text, or model output must not be able to silently grant itself capabilities.

Security policy and user authorization are out-of-band from model content.

## 12.2 Arbitrary shell execution

The MVP must not expose a generic unrestricted shell tool to the model.

Instead implement an allowlisted task runner.

Examples:

```text
check:syntax
selected Vitest targets
selected Playwright/probe commands
approved build commands
approved WASM build
approved package verification
```

If a later generic terminal is added, it must be a separate high-risk capability with isolation and explicit per-session approval.

## 12.3 Path traversal

All candidate file operations must:

- canonicalize paths;
- resolve symlinks;
- verify final path remains under permitted workspace roots;
- reject `..` traversal;
- reject protected roots;
- reject filesystem device paths.

## 12.4 Secret leakage

Never send model providers:

- `.env` values;
- private keys;
- access tokens;
- signing certificates;
- provisioning credentials;
- GitHub PATs;
- production database credentials;

unless a separately defined secret-handling policy explicitly authorizes a specific value.

Context builder must redact secret patterns and protected files.

## 12.5 Git credential theft

The LLM must never receive reusable GitHub credentials.

Publishing service owns credentials/tokens.

Prefer:

- GitHub App;
- OAuth;
- short-lived tokens;
- narrow repository scopes.

## 12.6 Native bridge abuse

Candidate JavaScript must not automatically inherit every privileged Swift/Tauri command.

Native commands must be capability checked.

Where possible distinguish:

```text
normal application bridge
developer bridge
```

The developer bridge is disabled outside authorized development sessions.

## 12.7 Remote runtime tampering

Candidate manifests should include integrity information.

At minimum:

- candidate ID;
- base revision;
- file list;
- SHA-256;
- creation time;
- validation status.

For remote iOS development, optionally sign the candidate manifest with a development signing key and verify before launch.

## 12.8 Replay

Privileged requests require:

- session ID;
- nonce or monotonic request identifier;
- expiration;
- server-side replay rejection for high-risk actions.

## 12.9 Cross-user leakage

Each developer session has isolated:

- conversation context;
- candidate workspace;
- logs;
- model session;
- authorization scope.

Never reuse a writable candidate directory between users.

## 12.10 Denial of service

Set limits for:

- concurrent model calls;
- candidate builds;
- file size;
- diff size;
- test duration;
- output/log volume;
- WASM compilation concurrency.

## 12.11 Auditability

Record structured audit events for:

- developer session opened;
- model selected;
- plan created;
- plan approved;
- files proposed;
- files changed;
- validations run;
- candidate launched;
- candidate accepted/rejected;
- publisher requested;
- publisher approved/denied;
- Git operation result;
- security denial.

Do not log secrets or full sensitive prompts by default.

---

# 13. Minimum user interface

Do not build a new standalone IDE first.

Reuse the existing atome/eVe conversation surface and extend it with a **Developer / Codex-like mode**.

The bare minimum UI must include:

## 13.1 Existing chat

Use the existing chat/message system.

Add message types/states for:

- user request;
- model analysis summary;
- plan;
- action request;
- validation result;
- diff;
- preview status;
- publish request;
- error/recovery.

Do not fork the conversation engine.

## 13.2 Voice

Reuse the existing voice pipeline.

Voice input should become the same development prompt as typed input.

The execution path must not differ depending on typed vs spoken prompt.

Optional spoken outputs:

- plan summary;
- validation failure;
- approval request;
- task completion summary.

Avoid reading long diffs aloud unless explicitly requested.

## 13.3 Model selector

Expose model selection in Developer mode.

Minimum controls:

```text
Planning model
Execution model
```

Allow both to be the same model.

Reuse the existing model catalogue/broker.

Do not hardcode provider-specific UI.

The UI should show at least:

- provider/model label;
- availability;
- context capability if already known by the catalogue;
- optional cost/speed class if supported by existing metadata.

## 13.4 Target selector

Minimum targets:

```text
Tauri candidate
iOS Debug candidate
Browser candidate
```

Later:

```text
WASM rebuild
Native build
```

## 13.5 Scope selector

User must be able to see/edit the allowed code scope.

Examples:

```text
atome/src/...
eVe/...
specific module
selected files
```

A plan must state its intended scope before execution.

## 13.6 Plan view

The plan must be a first-class object, not just prose hidden in chat.

Minimum fields:

- objective;
- affected canonical owner(s);
- files expected to change;
- files explicitly protected;
- steps;
- validation commands;
- runtime target;
- native rebuild requirement;
- risk level;
- rollback plan.

Actions:

```text
Edit plan
Approve plan
Reject plan
Execute
```

Configuration may later allow low-risk auto-execute, but MVP should require plan approval before write operations.

## 13.7 Diff view

After changes:

- show changed files;
- additions/removals;
- allow opening a file;
- use existing CodeMirror where appropriate;
- show whether a change is generated or manually edited;
- show validation status.

Actions:

```text
Accept candidate
Request changes
Reject candidate
Rollback
```

## 13.8 Validation view

Display checks as states:

```text
syntax       passed
guardrails   passed
unit tests   passed
UI probe     not required / passed / failed
runtime boot passed
```

A green chat answer from the model is not a validation result.

## 13.9 Runtime indicator

Always indicate what is currently running:

```text
STABLE A
CANDIDATE B
PACKAGED iOS
REMOTE DEV iOS
```

This must be visible enough that a developer cannot confuse candidate code with released code.

## 13.10 Publish view

Publishing is separate from Accept Candidate.

Display:

- base branch/revision;
- candidate branch;
- files;
- validation summary;
- proposed commit title;
- proposed PR title/body if applicable.

Actions:

```text
Create commit
Push branch
Open PR
Cancel
```

These actions require explicit user approval and the corresponding capability.

---

# 14. Suggested conversation workflow

## 14.1 Plan-only request

```text
User: “Analyse pourquoi Mystic ne s’ouvre plus.”
→ gather relevant context
→ produce plan
→ no file modifications
```

## 14.2 Plan + execute

```text
User request
→ context builder
→ planning model
→ plan object
→ user approval
→ execution model
→ candidate patch
→ validation
→ candidate launch
→ user accepts/rejects
```

## 14.3 Follow-up correction

The same development session must preserve:

- approved plan;
- current candidate;
- validation history;
- user corrections.

A follow-up such as:

> “The animation is right but reduce the delay.”

must modify the same candidate rather than starting a new unrelated workflow.

---

# 15. Context builder

The context sent to the coding model should be built intentionally.

Inputs may include:

1. `.codex/AGENTS.md`;
2. mandatory task-specific `.codex/modules/*`;
3. relevant maps;
4. selected source files;
5. current Git/base revision metadata;
6. current candidate diff;
7. relevant tests;
8. previous validation errors;
9. user-approved plan;
10. target runtime information.

Do not blindly send the whole repository.

Use retrieval/routing to find canonical owners first.

The model should receive explicit protected paths and write scope.

---

# 16. Plan data model

Conceptual minimum:

```js
{
  id,
  session_id,
  goal,
  target_runtime,
  planning_model,
  execution_model,
  owners: [],
  allowed_paths: [],
  protected_paths: [],
  expected_files: [],
  steps: [],
  validation: [],
  risk_tier,
  requires_native_rebuild,
  rollback_strategy,
  status
}
```

Statuses may include:

```text
draft
awaiting_approval
approved
executing
validating
preview_ready
rejected
accepted
publish_pending
published
failed
rolled_back
```

Use existing project conventions for actual naming/schema.

---

# 17. Candidate workspace

The candidate workspace must be physically separated from the stable running tree.

Preferred desktop implementation:

- Git worktree, or
- shadow workspace cloned/copied from the known base revision.

Selection should be based on the simplest implementation compatible with current repository/submodule layout.

Requirements:

- record base SHA/revision;
- candidate ID;
- deterministic cleanup;
- no modification to unrelated working tree;
- no accidental carry-over from another session.

If Git worktrees interact badly with current `eVe` submodule/project organization, use a dedicated shadow workspace and document the reason.

---

# 18. Patch engine

The model should not write arbitrary raw filesystem state without an observable patch transaction.

Required pipeline:

```text
model proposal
→ normalize patch
→ validate paths
→ validate scope
→ apply to candidate transaction
→ record diff
→ run checks
```

On application failure:

- transaction fails;
- candidate state is restored;
- error is returned to the agent.

Do not silently partially apply a multi-file patch unless the task explicitly supports staged partial application.

---

# 19. Validation pipeline

Validation must be proportional to the touched scope.

## Level 1 — always

- parse/syntax;
- path/scope validation;
- security guardrails;
- project-specific mandatory static guards relevant to touched files.

## Level 2 — targeted

- relevant unit tests;
- relevant probes;
- module-specific checks.

## Level 3 — UI/runtime when relevant

- launch candidate;
- wait for real atome/eVe readiness;
- use canonical UI debugging/visual protocol;
- verify expected interaction.

## Level 4 — platform build when needed

- WASM build;
- Tauri Rust check/build;
- iOS native build.

Do not run every possible expensive check for a single isolated JS edit unless project guardrails require it.

The plan must state what validation will be run before execution.

---

# 20. Candidate runtime health protocol

Create/reuse a minimal runtime health handshake.

A candidate must be able to report:

```text
candidate_id
runtime_version
boot_started
core_ready
eve_ready
ui_ready
fatal_error
```

The exact milestones should reuse existing boot telemetry where possible.

The host uses this to decide whether the candidate is safe to present.

Timeout must not automatically promote.

---

# 21. Model architecture

The user must be able to choose models without the rest of the development workflow becoming provider-specific.

## 21.1 Planning model

Responsibilities:

- inspect task/context;
- identify canonical owners;
- produce plan;
- identify risks;
- choose validation strategy.

No writes.

## 21.2 Execution model

Responsibilities:

- generate patch within approved plan/scope;
- react to compiler/test/runtime errors;
- iterate candidate.

## 21.3 Optional reviewer model

Future extension:

- independent review of patch;
- detect scope creep;
- architecture compliance;
- security review.

Not required for barebone MVP.

## 21.4 Provider routing

Use existing provider/model broker and model catalogue.

Future configuration can support:

```text
Plan: model A
Execute: model B
Review: model C
```

but MVP only needs Plan + Execute.

---

# 22. Human approval policy

Use risk tiers.

Example:

## LOW

- text/comment/docs;
- isolated UI constants;
- narrow JS patch.

May eventually allow configured auto-execution inside candidate only.

## MEDIUM

- multiple JS modules;
- runtime behavior;
- local persistence;
- API usage.

Plan approval required.

## HIGH

- auth;
- security;
- filesystem;
- native bridge;
- networking;
- package/build configuration;
- Git publishing.

Explicit approval before the privileged action.

## CRITICAL

- production secrets;
- signing;
- destructive data migration;
- release publishing;
- privilege model modification.

Separate high-friction flow; never auto-execute.

Use existing agent risk-tier/security abstractions if they already cover this.

---

# 23. Git / GitHub publishing architecture

Git publishing is not part of model execution.

Create a separate `Publisher` capability/service.

Conceptual flow:

```text
Candidate accepted
→ Publish request generated
→ user reviews
→ Publisher authorization
→ commit
→ push
→ optional PR
```

## Security

Prefer server/desktop credential ownership.

Do not place reusable GitHub PAT in frontend JS.

Prefer GitHub App or OAuth with short-lived permissions.

## Product actions

Minimum future actions:

```text
Create branch
Commit accepted candidate
Push
Open PR
Show CI status
```

## Current implementation-policy constraint

The active `.codex/AGENTS.md` currently forbids Git write operations by coding agents.

Therefore:

- implement the Publisher interface;
- implement dry-run/mock tests;
- do not exercise commit/push against the real repository until the applicable policy is explicitly updated/authorized.

---

# 24. Existing chat reuse

The existing chat is already the correct interaction surface.

Do not build:

- another message store;
- another conversation ID system;
- another voice transcript path;
- another model session system.

Instead add a development task attachment/state to the existing conversation.

Conceptually:

```text
Conversation
└── DeveloperSession
    ├── Plan
    ├── Candidate
    ├── PatchSet
    ├── ValidationReport
    └── PublishRequest
```

This allows normal discussion and development actions to coexist in the same conversation.

---

# 25. Voice integration

Minimum behavior:

1. existing microphone/voice input captures prompt;
2. transcript enters the same DeveloperSession;
3. assistant may summarize the plan verbally;
4. user can say:
   - “approve the plan”;
   - “execute”;
   - “reject”;
   - “rollback”;
   - “show the diff”;
   - “run the tests again”;
5. high-risk actions still use the same approval/security policy as taps/clicks.

Voice must never bypass a required explicit authorization.

---

# 26. Minimum barebone MVP

The first usable version should deliberately be small.

## MVP target: Tauri + JavaScript

### Required

- Developer mode capability gate.
- Reuse existing chat.
- Typed prompt.
- Reuse existing voice input if already stable.
- Planning model selector.
- Execution model selector.
- Plan generation.
- Plan approval.
- Scope/path display.
- Candidate workspace.
- AI JS edits.
- `check:syntax`.
- relevant guardrails.
- targeted tests.
- candidate frontend reload.
- runtime health result.
- diff display.
- Accept / Reject / Rollback.
- audit log.

### Not required for first MVP

- full terminal;
- arbitrary shell;
- native Rust hot reload;
- Swift hot reload;
- multi-agent swarm;
- automatic publishing;
- full remote iOS;
- live collaborative coding;
- production remote code updates.

The MVP is successful when a developer can say:

> “Change this JS behavior.”

and safely get:

```text
plan
→ approved patch
→ validated candidate
→ live Tauri preview
→ accept/reject
```

without rebuilding Tauri.

---

# 27. Phase 2 — iOS Debug candidate runtime

After Tauri MVP is stable:

1. add Debug-only feature flag;
2. add trusted developer pairing;
3. add remote candidate runtime source;
4. preserve packaged runtime fallback;
5. authenticate every developer request;
6. load candidate runtime in WKWebView;
7. use boot health handshake;
8. support candidate reload;
9. recover to packaged runtime after failure;
10. test on physical iPhone.

Success condition:

A JS change can be created on desktop/server and tested on a physical iPhone **without rebuilding Xcode**, while the Release application remains unaffected.

---

# 28. Phase 3 — WASM candidate builds

Add:

- approved WASM build task;
- candidate WASM manifest;
- checksum;
- candidate runtime refresh;
- contract tests between JS-facing API and WASM implementation.

Success condition:

A Rust/WASM implementation can be rebuilt outside the phone and loaded by the iOS/Tauri candidate runtime without changing Swift/Tauri native code.

---

# 29. Phase 4 — Publisher

Add Publisher UI/service after execution safety is proven.

Minimum:

- branch proposal;
- commit message proposal;
- explicit commit approval;
- explicit push approval;
- optional PR creation;
- status returned to chat.

Do not combine “Accept candidate” with “Push”.

---

# 30. Phase 5 — advanced Codex-like behavior

Optional later capabilities:

- reviewer model;
- automatic bug-loop from failing tests;
- task decomposition;
- concurrent read-only agents;
- semantic code search;
- repository map refresh;
- task checkpoints;
- resumable DeveloperSession;
- per-file manual editing;
- saved reusable development prompts;
- automatic regression test generation;
- CI feedback loop;
- pull-request review conversation;
- multi-device preview.

These must not be prerequisites for the MVP.

---

# 31. Security gates before iOS or multi-user release

Do not enable privileged development mode for broader users until all are proven:

- capability authorization;
- session revocation;
- short-lived tokens;
- per-user candidate isolation;
- path traversal tests;
- symlink escape tests;
- secret redaction tests;
- native bridge permission tests;
- unauthorized API tests;
- replay protection tests;
- rate-limit tests;
- candidate integrity tests;
- audit logs;
- failed-candidate rollback;
- iOS packaged fallback;
- Release build verifies developer code path is disabled.

---

# 32. Required tests

At minimum create executable tests for:

## Authorization

- normal user cannot access plan tool;
- reader cannot execute;
- executor cannot publish;
- revoked session cannot continue.

## Filesystem

- `../` rejected;
- absolute path outside workspace rejected;
- symlink escape rejected;
- protected path rejected;
- allowed scoped path accepted.

## Patch transaction

- multi-file patch success;
- invalid file causes transaction rejection;
- rollback restores previous candidate state.

## Validation

- syntax failure blocks preview;
- mandatory guardrail failure blocks preview;
- optional test failure is represented accurately;
- successful validation permits preview.

## Runtime

- candidate boots;
- candidate boot timeout fails;
- runtime fatal event fails;
- stable runtime remains recoverable.

## Tauri

- pure JS candidate reload requires no native rebuild.

## iOS Debug

- Release cannot activate remote runtime;
- unauthorized Debug session cannot activate remote runtime;
- paired authorized Debug session can load candidate;
- failed candidate returns to packaged runtime.

## Publisher

- no publish without capability;
- no publish without explicit approval;
- provider/model cannot invoke Publisher directly;
- credentials are not present in frontend JS/model context.

---

# 33. UX constraints

Respect atome/eVe UI principles.

Do not turn Developer mode into a traditional cluttered IDE.

Prefer:

- conversation-first;
- inline plan;
- inline status;
- contextual diff;
- explicit target/runtime indicator;
- minimal persistent controls.

Avoid:

- floating palette proliferation;
- popup-heavy workflow;
- VS Code imitation;
- terminal-first UX;
- hidden side effects.

The system should feel like:

> **talk to eVe → inspect plan → let it work → see result → validate**

rather than:

> open an IDE inside atome.

---

# 34. Suggested Developer mode states

```text
IDLE
UNDERSTANDING
PLANNING
AWAITING_PLAN_APPROVAL
EXECUTING
VALIDATING
PREVIEW_STARTING
PREVIEW_READY
AWAITING_ACCEPTANCE
ACCEPTED
REJECTED
ROLLING_BACK
PUBLISH_PENDING
PUBLISHING
DONE
FAILED
```

State must be canonical and observable.

Do not derive critical execution state only from UI elements.

---

# 35. Error handling

Every failure must indicate:

- phase;
- operation;
- owner/tool;
- candidate ID;
- recoverability;
- whether stable runtime is untouched;
- suggested next action.

Examples:

```text
PLAN_FAILED
PATCH_SCOPE_DENIED
PATCH_APPLY_FAILED
SYNTAX_FAILED
GUARDRAIL_FAILED
TEST_FAILED
CANDIDATE_BOOT_FAILED
CANDIDATE_RUNTIME_CRASHED
PAIRING_EXPIRED
PUBLISH_DENIED
PUBLISH_FAILED
```

Do not silently fall back to unvalidated code.

---

# 36. Observability

Add structured development telemetry, local by default.

Useful events:

```text
codex.session.created
codex.plan.created
codex.plan.approved
codex.patch.proposed
codex.patch.applied
codex.validation.started
codex.validation.finished
codex.preview.started
codex.preview.ready
codex.preview.failed
codex.candidate.accepted
codex.candidate.rejected
codex.rollback.completed
codex.publish.requested
codex.publish.completed
codex.security.denied
```

Do not send source code or secrets into analytics by default.

---

# 37. Performance goals

The feature should optimize for iterative speed without compromising safety.

For a pure JS edit:

- no Tauri rebuild;
- no Xcode rebuild;
- only targeted validation;
- candidate reload should be the dominant delay.

For iOS Debug:

- normal native app stays installed/running;
- only candidate runtime reloads.

For WASM:

- rebuild only the relevant WASM artifact when technically possible.

Do not add speculative caching until real measurement shows a bottleneck.

---

# 38. Offline behavior

When AI/provider/network is unavailable:

- stable atome continues working;
- existing candidate remains inspectable;
- local diff remains inspectable;
- rollback remains available;
- no candidate is silently promoted.

On iOS, packaged runtime is always the safe fallback.

---

# 39. Suggested implementation ownership

Do not create these exact files blindly; first map to canonical owners.

Conceptual responsibilities that must exist somewhere:

```text
DeveloperSession owner
Plan owner
CandidateWorkspace owner
PatchTransaction owner
ValidationRunner owner
CandidateRuntimeController owner
Authorization/Capability owner
Audit owner
Publisher owner
```

Each responsibility must have one canonical owner.

If an existing atome/eVe owner already covers it, extend it instead of adding a new subsystem.

---

# 40. Implementation sequence

## P0 — Architecture/security audit

Deliver:

- reuse map;
- canonical owner list;
- threat model;
- Tauri runtime flow;
- iOS runtime flow;
- scope/protected roots;
- required `.codex` policy interaction;
- test plan.

No production feature code before this is complete.

## P1 — Tauri JS MVP

Deliver:

- Developer mode gate;
- plan object;
- candidate workspace;
- patch transaction;
- validation;
- candidate reload;
- diff;
- accept/reject/rollback.

## P2 — Chat + voice polish

Connect existing chat/voice actions cleanly to DeveloperSession.

Do not build new conversation infrastructure.

## P3 — iOS Debug remote candidate

Deliver paired authenticated Debug runtime loading with packaged fallback.

## P4 — WASM

Add build/reload path.

## P5 — Publisher

Implement separately from execution.

## P6 — Hardening

Multi-user security, audit, revocation, abuse limits, recovery tests.

---

# 41. Definition of done for the first milestone

The first milestone is done only when all of the following are true:

1. A privileged developer can open Developer/Codex-like mode.
2. Existing chat is used.
3. A prompt produces a structured plan.
4. The plan identifies canonical owners and intended file scope.
5. User approves the plan.
6. Model modifies only a candidate workspace.
7. Syntax and required guardrails run.
8. Relevant tests run.
9. Candidate runtime is launched separately from stable runtime.
10. User can see the diff and validation report.
11. User can Accept, Reject, or Rollback.
12. A failed candidate cannot destroy stable Runtime A.
13. No unrestricted shell exists.
14. Unauthorized user cannot invoke write/build tools.
15. No secret/provider/Git credential is exposed to the model.
16. Pure JS iteration on Tauri requires no native rebuild.
17. All new architecture owners are documented in the relevant maps.
18. `FRAMEWORK_STATE.md` is updated when required by the active `.codex` protocol.
19. Completion report states what was reused, modified, removed, added, and validated.

---

# 42. Definition of done for iOS Debug milestone

1. Native iOS app remains the stable shell.
2. Remote/candidate runtime exists only in authorized Debug configuration.
3. Physical iPhone can pair with a trusted development host.
4. JS candidate loads without Xcode rebuild.
5. Candidate health is verified before acceptance.
6. WebContent failure does not kill the development workflow permanently.
7. Packaged runtime is recoverable.
8. Release build cannot enable the development runtime.
9. Development credentials are short-lived and revocable.
10. Native bridge permissions remain enforced.

---

# 43. Explicit anti-goals

Do not:

- rewrite atome/eVe around Codex;
- embed a complete VS Code clone;
- create a second AI gateway;
- create a second chat;
- create a second voice system;
- let the model write directly into stable production runtime;
- give the model an unrestricted shell in MVP;
- give the model GitHub credentials;
- auto-push code after generation;
- attempt Swift/Rust runtime hot swapping;
- rely on App Store production remote-code execution;
- weaken `.codex` architecture rules;
- use a full VM unless later evidence demonstrates an actual need.

---

# 44. Final product vision

The desired experience is:

```text
User opens Developer mode
→ talks or types to eVe
→ chooses/uses planning model
→ receives a clear implementation plan
→ validates/edits plan
→ AI modifies isolated candidate
→ system runs real checks
→ candidate appears immediately in Tauri or iOS Debug
→ user tests it
→ user accepts or rejects it
→ system rolls back safely if needed
→ user explicitly decides whether to publish to GitHub
```

The key principle is:

> **AI may modify a candidate; only validated and explicitly accepted code may become the working state.**

This keeps the Codex-like experience dynamic while preserving the architecture, security, recoverability and platform constraints of atome/eVe.
