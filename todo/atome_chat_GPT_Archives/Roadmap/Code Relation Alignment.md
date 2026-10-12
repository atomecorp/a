# Code Relation Alignment — Task Guard for Codex

## Goal

Implement a durable, modular and framework-agnostic **Task Guard** for development work on **atome**.

The objective is simple: before any Codex task that can modify the project, Codex must determine which architectural blocks it needs to change, present that proposed scope in a small external HTML page, wait for explicit user validation, and then work only inside the approved scope. Any extension of scope must require a new explicit validation.

This system is a developer tool only. It must **not** be integrated into the atome UI or runtime.

---

## Core principles

1. **Agnostic architecture**
   - Do not hard-code the protection system around current UI concepts, menus, tools, assistants, MCP, audio, graphics, or any other current feature.
   - The engine must reason only in terms of architectural blocks, ownership, contracts, dependencies and permissions.
   - Current atome components may appear only in the registry/data that describes the present architecture, never as special cases in the Task Guard engine.

2. **Block isolation**
   - A task may modify only the explicitly approved block(s).
   - Neighboring blocks remain locked unless separately approved.
   - A block may continue to call and use another locked block through its declared public contract; locked does not mean unusable.

3. **Contract preservation**
   - Unless explicitly approved, a task must not change another block's public API, event contract, data contract, side effects, configuration contract or observable behavior.
   - Internal implementation and external contract are separate permissions.

4. **Fail closed**
   - Everything not explicitly approved is considered locked.
   - Unknown/unmapped files or new files are locked by default.
   - If the task requires a locked area, Codex must stop and request an extension of scope. It must never silently widen its own permissions.

5. **No false validation**
   - Missing, skipped, unavailable or failing checks must never be reported as validated.
   - The result must distinguish: `validated`, `failed`, and `not verified`.

6. **Preserve user work**
   - Never revert or overwrite unrelated pre-existing user changes.
   - Capture a baseline at the beginning of the task so the guard can distinguish pre-existing modifications from changes introduced during the current mission.

---

## User workflow

For every user request that may modify the project:

1. Codex reads the request and may inspect the repository in read-only mode.
2. Codex identifies the architectural blocks it believes need modification.
3. Codex launches Task Guard.
4. Task Guard opens a local HTML page showing the proposed scope.
5. The user checks/corrects the permissions and clicks **Validate**.
6. Codex receives the approved scope.
7. Only then may Codex modify the project.
8. At completion, the controller compares the actual changes with the approved scope and runs the relevant contract/regression checks.
9. If an out-of-scope change is detected, completion is blocked and the deviation is reported precisely.
10. The current mission state is reset before the next modifying task.

Read-only questions or analysis that make no project modification do not need to open Task Guard.

---

## Required UI

Create a small, external, reusable **standalone HTML interface**. It must not require Excel, atome, a framework, or a manually started server.

The normal screen should remain simple.

For each architectural block, show at least these independent permissions:

| Block | Modify implementation | Modify contract | Extend dependencies/access |
|---|---:|---:|---:|
| Proposed block A | checkbox | checkbox | checkbox |
| Block B | checkbox | checkbox | checkbox |
| Block C | checkbox | checkbox | checkbox |

Rules:

- All permissions are locked by default.
- Codex may pre-check only the permissions it believes are necessary.
- The user can change the proposal before validating.
- The page must clearly show the task summary and mission identifier.
- Provide **Validate** and **Cancel** actions.
- Do not expose unnecessary developer complexity in the default view; advanced details may be expandable.

The HTML itself is permanent. **Do not recreate it for every task.** Only the mission state is reset and regenerated.

---

## No-server validation bridge

Prefer a no-server implementation on macOS.

Use a small vanilla JavaScript/Node launcher/controller plus the standalone HTML page. Do not use Python or TypeScript.

Recommended flow:

1. The controller creates a new unique mission ID and resets any previous active mission.
2. It prepares the proposed scope from the current task and the architecture registry.
3. It opens the fixed HTML file with the mission data embedded safely in the URL fragment or another local mechanism that does not require a web server.
4. On **Validate**, the page produces an approval payload containing at minimum:
   - mission ID,
   - selected block permissions,
   - registry/version hash,
   - task summary/hash,
   - validation timestamp.
5. On macOS, the page may place that payload on the clipboard as the result of the user's click; the local controller can read it with the system clipboard and verify that the mission ID/hash matches the active mission.
6. If browser clipboard restrictions prevent automatic copy from `file://`, provide a reliable user-gesture fallback such as an explicit **Copy validation** action. Do not introduce a permanent server merely to solve this.
7. After successful verification, write the approved scope to the local Task Guard state used by the controller.
8. Reject stale approval payloads from previous missions.

If the repository/environment provides a cleaner native mechanism, use it only if it preserves the requirements above: external tool, no atome runtime dependency, no manually managed server, explicit user validation, and machine-readable approval.

---

## Architecture registry

Create a machine-readable registry describing the current architecture of atome.

The Task Guard engine must remain generic; this registry is the only project-specific layer.

Each block should be able to declare:

- stable block ID,
- human-readable label,
- responsibility/ownership,
- owned file/path patterns,
- public interfaces/contracts,
- allowed dependencies,
- protected behaviors/invariants,
- relevant tests/check commands,
- optional child blocks.

The registry may evolve as atome evolves. A menu, API, renderer, MCP adapter or any current component may disappear without requiring a rewrite of the Task Guard engine.

Do not let Codex silently edit the registry during a normal task to make an otherwise forbidden change legal. Changes to the registry itself must be treated as a separately protected operation.

Unknown files and paths must be considered locked until mapped or explicitly approved.

---

## Mission state

Create an explicit machine-readable active mission file with at least:

- mission ID,
- task summary/hash,
- repository baseline identifier,
- pre-existing changed files,
- approved block permissions,
- approved path set derived from the registry,
- approved contract changes, if any,
- registry hash/version,
- validation status,
- timestamps.

At the start of every new modifying task:

- invalidate/reset the previous active mission,
- create a fresh mission ID,
- never reuse a previous approval automatically.

A historical log is optional, but the **active mission must always be fresh**.

---

## Enforcement

Implement protection in layers.

### 1. Before writing

No code modification is allowed before Task Guard approval.

Read-only inspection is allowed so Codex can determine the proposed scope.

### 2. During the task

Codex must treat the approved scope as immutable.

If another block, contract or dependency must be changed:

- stop,
- explain exactly why,
- create an amended proposal,
- reopen Task Guard,
- wait for explicit user approval,
- then continue.

### 3. After modification

Compare the actual task delta against the baseline and approved scope.

Detect at minimum:

- modified files,
- created files,
- deleted files,
- moved/renamed files,
- changes to protected registry/controller files,
- out-of-scope dependency changes,
- contract changes that were not approved.

A task must not be declared complete while an unauthorized delta exists.

### 4. Preserve pre-existing changes

The verifier must compare against the captured task baseline, not blindly against a clean Git checkout.

Never revert unrelated user work just to make the guard pass.

### 5. Hard-enforcement honesty

If the current Codex/runtime sandbox cannot enforce true file-level write denial, do **not** claim that it can.

In that case, implement the strongest reliable independent fail-closed verifier available, block task completion on violations, and document the limitation clearly. If a safe native sandbox/writable-path mechanism is available and compatible with the repository, integrate it as an additional layer without weakening the generic design.

---

## Contract and regression checks

The guard must protect more than file ownership.

For affected blocks and their direct relations, run the checks declared by the registry. These may include:

- public API compatibility,
- events/messages,
- data schemas,
- side effects,
- dependency rules,
- behavioral/regression tests,
- integration tests between neighboring blocks,
- visual tests where relevant.

Do not hard-code any current atome feature in the engine. Tests are associated with blocks/contracts through the registry.

If a check does not exist yet, report `not verified`; do not invent proof.

Reuse existing project tests and guardrails wherever possible instead of creating parallel systems.

---

## AGENTS.md integration

Update the repository's effective `AGENTS.md` instructions without deleting or weakening existing rules.

Add a clear mandatory rule equivalent to:

> For any user request that can modify the project, before the first write operation Codex must run the Task Guard preparation flow, present the proposed architectural scope in the external HTML interface, and wait for explicit user validation. The approved scope is immutable for that mission. Any required extension must be separately approved through Task Guard. Pure read-only questions/analysis are exempt.

Also ensure that delegated/sub-agents inherit the same approved scope and cannot widen it.

Do not rely on `AGENTS.md` alone for enforcement; it is the workflow trigger, while the controller/verifier provides the independent check.

Before finishing, verify that the `AGENTS.md` file being edited is actually effective for the repository according to the current Codex instruction-loading rules. Do not assume a nested file is active merely because it exists.

---

## Suggested implementation structure

Use the existing repository organization if an equivalent location already exists. Do not duplicate an existing guard system.

A reasonable shape, to adapt after inspecting the repository, is:

```text
.codex/
  task-guard/
    task_guard.html
    task_guard.mjs
    registry.json
    current_mission.json
    README.md
```

The exact paths are not mandatory. Prefer integration with existing development/guardrail infrastructure when present.

`current_mission.json` should be generated state and should not become a source of permanent architectural truth.

Do not add runtime code to atome for this feature.

---

## Required controller commands / behavior

Provide a minimal command set or equivalent operations:

- `prepare` — reset previous mission, capture baseline, create proposal and open the HTML.
- `approve` / approval listener — validate the user approval payload and activate the mission.
- `status` — show the active mission and approved permissions.
- `check` — compare actual changes with the approved scope and run declared checks.
- `reset` — invalidate the active mission.

Keep usage simple enough that Codex can call these automatically. The user should normally only need to review the HTML and click **Validate**.

---

## Bootstrap / first implementation

Before coding:

1. Audit the existing repository guardrails, architectural maps, tests, scripts and effective AGENTS instructions.
2. Reuse existing mechanisms when they already solve part of this problem.
3. Identify current architectural ownership boundaries from the repository instead of inventing arbitrary ones.
4. Build an initial registry from those discovered boundaries.
5. Keep uncertain mappings visibly marked as uncertain and locked by default.
6. Do not restructure unrelated application code merely to make the registry cleaner.

The Task Guard implementation itself must remain a generic tool even though its first registry describes atome today.

---

## Acceptance tests

Before considering this task complete, demonstrate at least these scenarios in a safe test environment:

1. **Normal scoped task**
   - User approves Block A implementation only.
   - A file owned by A is modified.
   - `check` passes.

2. **Neighbor violation**
   - Only A is approved.
   - A file owned by B is intentionally modified.
   - `check` must fail and identify B/file precisely.

3. **Contract violation**
   - A implementation is approved but its public contract is not.
   - An intentional public contract change is introduced.
   - The guard must fail.

4. **New unknown file**
   - Create a new file outside all approved ownership patterns.
   - The guard must fail by default.

5. **Pre-existing user change**
   - A file is already modified before the mission begins.
   - Run a task that does not touch that file.
   - The guard must not attribute or revert that pre-existing change.

6. **Scope extension**
   - Start with A only.
   - Discover that B must change.
   - Codex must stop and require a new Task Guard approval before changing B.

7. **Stale approval**
   - Reuse the validation payload from a previous mission.
   - It must be rejected.

8. **Guard self-protection**
   - During a normal scoped task, attempt to modify the registry/controller/approval state to bypass the guard.
   - The guard must reject the attempt unless guard maintenance was explicitly approved.

9. **Read-only request**
   - Ask a question that makes no project changes.
   - Task Guard must not open unnecessarily.

10. **Delegated agent**
    - Delegate part of a task to another agent.
    - The delegated agent must inherit, not expand, the approved scope.

---

## Definition of done

The task is complete only when:

- the standalone Task Guard HTML exists and is usable,
- no manual server is required for the normal flow,
- a new modifying prompt starts with a fresh mission,
- Codex proposes a scope before writing,
- explicit user validation is required,
- the approved scope is machine-readable,
- out-of-scope changes are detected independently,
- contract changes require separate authorization,
- pre-existing user work is preserved,
- stale approvals cannot be reused,
- the guard cannot silently authorize changes to itself,
- AGENTS.md enforces the workflow trigger,
- read-only tasks remain frictionless,
- existing project guardrails are reused rather than duplicated,
- documentation contains the exact user flow and recovery steps,
- all acceptance scenarios above have been demonstrated or any technically impossible hard-enforcement limitation is stated explicitly rather than hidden.

## Final implementation principle

**Authorize the intended change, lock everything else, preserve contracts by default, and never let the agent expand its own scope silently.**
