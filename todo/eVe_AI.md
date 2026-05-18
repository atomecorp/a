# eVe AI Operating Model — Jarvis Architecture

Date: 2026-03-25

## Purpose

This document defines the target architecture and product behavior for eVe AI.

eVe AI must behave like a real personal assistant — proactive, fast, context-aware, and able to act through voice or text with the same fluency a human assistant would. The reference model is Jarvis from Iron Man: an always-present, intelligent agent that understands intent, executes actions, anticipates needs, remembers context, and responds progressively.

The goal is not to add more local heuristics. The goal is to build an LLM-first operating layer for eVe that can understand natural language by voice or text, decide the correct action, call the correct tool or MCP surface, and return a correct and useful result.

**Latency target**: the UX objective is sub-second response for common single-tool requests. This is a design target, not a guaranteed SLA. Actual latency depends on factors outside the architecture's control: network conditions, LLM provider response time, cold starts, prompt size, TTS processing, backend load, and device capability. The architecture must minimize controllable latency (single LLM call, streaming, progressive TTS, thin preprocessing). It cannot promise fixed wall-clock time.

The system must behave like a real action-taking assistant, not like a rule-based parser and not like a slow chatbot.

## Key architectural invariants

These invariants must never be violated:

1. **Real execution only.** No fake success responses. All claims must be grounded in executed actions or verified state.
2. **LLM for semantics, code for guarantees.** Models interpret meaning. Code enforces correctness, permissions, validation, and safety.
3. **Fast path by default.** Most requests must resolve in one LLM call.
4. **Slow path when required.** Multi-step reasoning must be supported without forcing multi-pass overhead on simple requests.
5. **Identity must be grounded.** Entity references must resolve deterministically before execution.
6. **Policy before execution.** Autonomy decisions must be deterministic and not delegated to the LLM.
7. **Observability always on.** Every request must produce a structured trace.
8. **Voice-first timing discipline.** Silence destroys perceived intelligence. Acknowledgment within 300ms, sub-second response as a UX target for simple requests (not a guaranteed SLA — see Latency target in Purpose).
9. **Runtime actions are first-class.** Atome runtime manipulation must follow the same rigor as business tools (mail, contacts, calendar).
10. **Proactivity must remain bounded.** The assistant must help without becoming intrusive. No silent autonomous high-risk actions.

## Engineering guardrails

These rules apply to every contributor — human or AI — writing code or architecture for the assistant:

- **No patches, temporary fixes, workaround paths, or parallel semantic logic** outside the canonical architecture. If something is broken, fix the root cause.
- **No regex- or keyword-based business understanding layer.** Regex may be used only for shallow technical normalization (e.g., trimming whitespace, normalizing Unicode), never for intent understanding, domain routing, or entity classification.
- **Natural-language interpretation must always be LLM-led.** Deterministic code may validate, gate, or execute, but must not replace semantic understanding.
- **Runtime objects must never be modified through direct JavaScript property mutation** (`object.x = ...`, `object.color = ...`, etc.) **outside the official Atome / eVe action APIs.** All AI-driven mutations must go through the same framework action APIs as manual user actions so that history, undo/redo, persistence, hooks, observers, permissions, and audit remain fully integrated. Any bypass — whether intentional or accidental — is a highest-severity bug.
- **Single write gateway.** All AI-driven runtime mutations must pass through one official action gateway (the Atome / eVe commit pipeline). There must be no alternative write path. This makes enforcement trivially auditable: if a mutation does not originate from the gateway, it is invalid. CI and code review must verify that no second write path exists.
- **CI / lint enforcement.** The rules above must not rely on developer discipline alone. CI must fail if forbidden patterns appear in AI or runtime mutation code paths — specifically: direct property assignment on Atome objects outside the action API, regex-based intent classification, or hidden fallback logic. A dedicated lint rule or static analysis pass must enforce this automatically.
- **Mandatory integration tests for AI-driven mutations.** Any AI-driven runtime mutation must prove via integration tests that it: (a) creates a valid history entry, (b) can be undone and redone, (c) triggers the expected observers and side effects, (d) persists through the canonical framework path. These tests are not optional — they are a gate for merging mutation-related code.

### Future engineering concerns (acknowledged, not yet specified)

- **Tool schema versioning**: as MCP tool definitions evolve, a versioning strategy must ensure backward compatibility and regression detection. This is a Phase 6+ concern.
- **System prompt versioning**: the LLM system prompt will evolve. Changes must be tracked, diffable, and testable against behavioral regression suites. This is a Phase 6+ concern.

## Core product objective

eVe AI must provide full, integrated control of:

- mail
- calendar / agenda
- contacts
- messages
- eVe runtime and Atome APIs
- MCP-exposed tools and actions

The assistant must understand user intent from voice or text and execute the action through the correct eVe API or MCP tool.

Beyond reactive command execution, the assistant must also:

- proactively surface relevant information
- maintain conversational memory across turns and sessions
- respond progressively (streaming) rather than waiting for full completion
- degrade gracefully when connectivity or AI services are unavailable
- adapt its behavior to voice vs text modality

## Functional scope

### 1. Contacts

The assistant must support complete contact management through voice and text:

- list contacts
- search contacts
- read contact details
- answer field questions directly
- create contacts
- update existing contacts
- delete contacts
- resolve ambiguities between multiple matching contacts
- ask clarification only when truly necessary

This must integrate with the existing eVe contact system, not bypass it.

The eVe contacts panel remains the visible UI surface, but AI must operate through the same contact model and APIs.

The assistant must be able to answer requests such as:

- "What is Sylvain's phone number?"
- "Add this email address to Regis."
- "When was this contact last updated?"
- "Delete the duplicate Regis contact."

### 2. Calendar / Agenda

The assistant must support complete calendar management through voice and text:

- list events
- search events
- read event details
- create events
- update events
- delete events
- understand dates, time references, participants, and temporal context
- work with the existing eVe calendar system and panel

The assistant must be able to answer or execute requests such as:

- "Do I have meetings tomorrow?"
- "Create a meeting with Paul tomorrow at 3 PM."
- "Move the swimming appointment to Friday."
- "Delete my dentist appointment."

### 3. Mail

The assistant must support complete mail handling through voice and text:

- list mails
- search mails
- read mails
- summarize mails
- compose new outgoing mails
- reply to existing mails
- send prepared drafts
- archive mails
- delete mails
- mark mails as read or unread
- answer mailbox status questions

This must integrate with the existing eVe mail system and panel.

The assistant must understand the difference between:

- reading an existing mail
- replying to an existing mail
- composing a new outgoing mail
- sending a previously prepared draft

These are different operations and must not collapse into each other.

### 4. Messages integration

Mail must be integrated with the eVe messages system.

The long-term target is a unified communication layer where the user can ask for:

- recent messages
- recent mails
- unread communication
- a summary of all communication
- communication with a specific person

The user should be able to retrieve communication in a unified way inside eVe, while preserving the true source of each item:

- mail
- messages
- future communication surfaces if needed

The assistant must be able to search across these surfaces and clearly report what came from where.

## Runtime / Atome / MCP scope

The assistant must also control eVe runtime features and Atome-backed actions through MCP and the runtime APIs.

This includes:

- create text objects
- create shapes and drawn objects
- change color
- resize
- move
- rotate
- duplicate
- delete
- manipulate sound
- manipulate MTrack
- manipulate other runtime tools exposed by eVe

All such actions must be executed through the real eVe / Atome / MCP APIs.

They must not be implemented through ad hoc DOM mutations, direct CSS hacks, or hidden JavaScript shortcuts outside the actual runtime action model.

**Non-negotiable**: runtime objects must never be modified by direct JavaScript property mutation (`object.x = ...`, `object.color = ...`, `object.width = 200`, or any equivalent) outside the official Atome / eVe action APIs. This includes — but is not limited to — setting coordinates, dimensions, colors, opacity, rotation, z-index, visibility, lock state, or any other property by direct assignment on the in-memory object. All AI-driven mutations must pass through the same framework API entry points as manual user actions, so that history, undo/redo, permissions, side effects, observers, and persistence remain fully integrated. Any code path that bypasses this — whether intentional or accidental — breaks historization, breaks undo, breaks sync, breaks observers, and is considered a bug of the highest severity.

If the user performs an action manually in the UI and if the assistant performs the same action, both must go through the same conceptual action system.

That is required for:

- consistency
- history
- undo / redo
- permissions and ACL enforcement
- observer / side-effect triggers
- persistence and sync
- auditability
- predictable behavior

### Runtime-specific challenges

Runtime / Atome objects present unique challenges that business entities (contacts, mails, calendar events) do not:

- **Nameless objects**: many runtime objects have no user-visible name. Identity resolution must fall back to visual attributes (color, shape, position), creation order, or spatial relationships ("the red circle", "the one on the left", "the last thing I created").
- **Visual ambiguity**: multiple objects may look identical. When the assistant cannot distinguish between candidates, it must ask ("There are 3 blue rectangles — which one?") or use spatial/layer context to disambiguate.
- **Multi-selection ambiguity**: the user may say "move these" when multiple objects are selected. The assistant must confirm the selection scope before executing if the selection contains more than a configurable threshold of objects (default: 5).
- **Locked and hidden objects**: some objects or layers may be locked, hidden, or partially visible. The assistant must check lock/visibility state before attempting modifications and report clearly if the target is not modifiable ("That layer is locked. Unlock it first?").
- **Relative spatial commands**: requests like "move this to the left of the text" or "make it bigger than the circle" require spatial reasoning relative to other objects. The identity resolution engine must resolve both the target and the reference object, and the execution layer must compute the concrete coordinates. **Note**: the full spatial reasoning model (reference frames, alignment rules, collision tolerance, distance defaults, z-order intent) is a future specification effort. At this stage, the architecture must support the concept and reserve the extension point; the detailed spatial semantics will be formalized when runtime tool coverage reaches Phase 7.
- **Real-time history implications**: runtime manipulations happen at high frequency (drag, resize, rotate). The assistant's actions must integrate with the same history/undo system as manual gestures. A voice command "move it 50 pixels right" must produce one undoable history entry, not a raw position mutation.
- **Compound runtime operations**: operations like "align all selected objects" or "distribute evenly" are compound actions on multiple objects. These must be treated as a single history entry and must verify that all target objects are modifiable before starting.

## Design principles

### Principle 1. LLM-first understanding

Natural language understanding must be performed by an LLM, not by a large pre-parser made of heuristics, regex branches, or hard-coded phrase trees.

The current or future system must avoid a large local intent layer that tries to "understand" the request before the model.

That approach does not scale and produces:

- brittle behavior
- false positives
- uncontrolled edge cases
- contradictions with the model
- maintenance explosion

### Principle 2. Code-after guarantees

Code must remain responsible for:

- validation
- permissions
- confirmations
- execution
- state transitions
- history and audit
- safety rules
- transport errors
- retries where appropriate

Code must not try to replace model reasoning.

### Principle 3. One conceptual action model

For business actions and runtime actions, the assistant must use one consistent conceptual action model:

- understand request
- map to structured intent
- map to typed tool/action call
- execute through the real API
- return the result

This model must be shared across:

- text
- voice
- MCP
- runtime tools

However, the tool contracts themselves are **specialized per domain family**. Mail tools have mail-specific parameters (recipients, subject, body). Calendar tools have calendar-specific parameters (time, duration, participants). Runtime tools have runtime-specific parameters (coordinates, dimensions, layer). The action model is unified at the pipeline level, not at the schema level. A single undifferentiated schema for all domains would lose the precision needed for reliable execution.

### Principle 4. Environment-aware transport, hidden from the LLM

Transport routing must depend on the runtime environment, but that detail must remain invisible to the LLM.

The LLM should reason in terms of:

- tools
- capabilities
- actions
- structured requests

It should not reason in terms of:

- ports
- Fastify
- Axum
- desktop vs web transport internals

Those details belong to the transport and execution layer.

### Principle 5. Explicit failure with graceful degradation

If the LLM is unavailable because of:

- quota exhaustion
- rate limiting
- auth failure
- provider timeout

the system must say so explicitly. It must not pretend to understand complex business requests through a pseudo-smart fallback layer.

However, unlike a purely explicit-failure model, eVe must also degrade gracefully:

- cached data must remain accessible (contacts, calendar, recent mails) even when the LLM is offline
- local-only operations (stop, cancel, navigate, play/pause) must keep working without any AI
- queued actions must be retried when connectivity returns
- a smaller or local model may be used as a degradation tier for simple requests

The rule is: never fake understanding, but never become useless either.

### Principle 6. Streaming-first response model

eVe must never make the user wait in silence. Responses must be progressive:

- LLM output must be streamed token-by-token whenever supported by the provider
- TTS must start speaking as soon as the first sentence boundary is available, not after the full response
- the UI must show a live transcription or typing indicator while processing
- for voice, an acknowledgment sound or micro-phrase ("OK", "let me check") must be emitted within 300ms of utterance end if the final response will take longer than 1 second

This is critical for the Jarvis experience. A 3-second silence after "What is Sylvain's number?" destroys the illusion of intelligence.

### Principle 7. Memory is a first-class system

The assistant must maintain conversational context and user knowledge across interactions:

- **Turn memory** (within a conversation): what was just asked, what was returned, which entity was referenced. Pronouns like "it", "that one", "the same person" must resolve correctly.
- **Session memory** (within a session): accumulated context for a working period. Survives across multiple turns. Stored in working_memory.js or equivalent.
- **Persistent memory** (across sessions): user preferences, frequently contacted people, common workflows, learned patterns. Stored in ADOLE or local persistence.

Memory management rules:

- turn memory is always available and never pruned within a session
- session memory is explicitly managed (opened / closed with session lifecycle)
- persistent memory is read at session start and updated on explicit save or significant events
- context window management must be explicit: when the context grows too large, older turns are summarized (not silently dropped) before being evicted

The working_memory.js module must be the **canonical session memory authority**. All session state (turns, active entities, filters, preferences) must be owned by working_memory.js. Other components (orchestrator, planner, identity resolver) may cache derived views of session state for performance, but must not maintain divergent session truth. If a derived cache and working_memory.js disagree, working_memory.js wins.

This is a logical authority rule, not a mandate for a single monolithic module. working_memory.js may delegate storage or indexing internally, but must remain the single authoritative interface that other components read from and write to.

### Principle 8. Proactive intelligence

eVe must not be purely reactive. A Jarvis-level assistant anticipates:

- **Startup briefing**: when the user opens eVe, the assistant may offer a summary ("You have 3 unread mails, a meeting with Paul at 2 PM, and a reminder about the dentist tomorrow").
- **Time-based alerts**: "Your meeting starts in 10 minutes."
- **Contextual suggestions**: if the user is composing a mail to someone and a calendar conflict exists, surface it.
- **Pattern learning**: over time, observe that the user checks mail first thing, and proactively prepare a mail summary.

Implementation rules:

- proactive actions must never be intrusive. They must be dismissible.
- proactive actions must be opt-in by default and configurable in eVe preferences
- proactive triggers must run through the same tool/action pipeline as reactive commands (no parallel hidden paths)
- proactive intelligence requires persistent memory to learn patterns

## Recommended architecture

### Preferred strategy: single-call LLM with native tool use

The primary architecture is a single LLM call with native function calling / tool use.

Modern LLMs (GPT-4o, Claude, Gemini) natively support structured tool calling. The model can understand intent AND plan execution in one pass. Splitting this into separate "semantic interpreter" and "action planner" stages adds latency without meaningful benefit for most requests.

#### Default path: single-call tool use

For every user request, the default path is:

1. **Thin local pre-processing** (< 5ms): microphone normalization, STT text cleanup, trivial local commands (stop, cancel, mute). No business logic, no domain routing, no heuristic intent classification.

   **Preprocessing boundary rule**: the preprocessing layer is allowed to perform only character-level and token-level transformations that do not require understanding meaning. Specifically:
   - **allowed**: STT text cleanup (diacritics, casing, punctuation normalization), wake word stripping, whitespace normalization, utterance language detection, trivial literal-match local commands ("stop", "cancel", "mute" — exact strings, not synonyms)
   - **forbidden**: synonym expansion, intent classification, domain routing, entity extraction, semantic similarity matching, keyword-based action selection, any transformation that requires understanding what the user meant

   If a preprocessing step requires a dictionary of domain terms, a list of action verbs, or any form of semantic reasoning, it belongs in the LLM call, not in preprocessing. This boundary must be enforced by code review. Any expansion of the allowed list requires explicit architectural approval.

2. **Single LLM call with tool definitions**: the model receives the user utterance, conversation history (from working memory), available tool definitions (MCP surfaces), and current context. It returns either a direct answer or one or more tool calls with typed arguments.

3. **Deterministic execution layer**: code validates the tool calls, checks permissions, executes through the correct API (mail, contacts, calendar, Atome, runtime), records state/history through ADOLE, and returns the result.

4. **Response delivery**: for simple results, deterministic templates format the reply. For complex results (mail summaries, multi-item lists), a short LLM formatting pass may be used. Response is streamed to TTS.

#### Escalation path: task orchestration

For complex requests that require multiple dependent steps, the system activates a task orchestrator.

This is not a permanent pipeline layer that all requests pass through. It activates **only** when the LLM returns a multi-step tool chain.

**Plan validation**: the tool chain returned by the LLM must never be treated as an executable plan without validation. The orchestrator must:

- **verify each tool call** against the capability registry (tool exists, arguments match schema, required fields present)
- **reject unknown tools** or tool calls with invalid arguments (do not attempt to "fix" them — no silent auto-repair of invalid steps)
- **enforce the complexity boundary** (see below)
- **normalize dependencies** (ensure step ordering is logically consistent, no circular dependencies)
- **truncate or refuse** plans that exceed safety bounds

The LLM proposes a plan. The orchestrator validates, bounds, and executes it. The LLM is not a trusted planner — it is a semantic reasoner whose output must be verified by deterministic code.

**Rejection and replanning sequence**: when the orchestrator rejects a step, the following sequence applies:

1. The invalid step is rejected for direct execution (never silently corrected or auto-repaired).
2. If the rejection makes the remaining plan invalid (e.g., a dependent step needs the rejected step's output), the orchestrator may send the rejection reason back to the LLM for replanning — but only if the autonomy policy allows replanning for this risk tier.
3. The replanned output goes through the same validation. If the replan also fails validation, the chain stops and the user is informed.
4. Maximum one replan attempt per chain. No infinite retry loops.

**Complexity boundary**: to prevent unbounded cascading from vague or ambitious requests, the orchestrator enforces hard limits:

- **max auto-executable steps**: no more than 5 tool calls may be executed without user confirmation in a single chain. Beyond 5, the orchestrator must pause, summarize the plan to the user, and request explicit approval to continue.
- **read vs mutation distinction**: read-only steps (risk tier "read") count toward the step limit but are weighted less strictly. The effective limit is: up to 5 read steps OR up to 3 mutating steps (risk tier "low" or above) without confirmation. A chain of 5 reads is acceptable. A chain of 2 reads + 3 cross-domain mutations already warrants confirmation.
- **max cross-domain scope**: no more than 3 distinct domains (e.g., mail + calendar + contacts) may be touched by mutating steps in a single auto-executed chain. Read-only cross-domain access does not count toward this limit (reading mail + reading calendar + reading contacts to assemble a briefing is fine).
- **cumulative risk escalation**: if the aggregate risk of a chain exceeds the highest individual step's tier (e.g., 4 "moderate" actions), the orchestrator must treat the chain as "high" risk and require confirmation. See the Compound action safety section.

These limits are configurable in eVe preferences but must have safe defaults. They exist to prevent the assistant from improvising 9 actions on a vague request.

**Task graph**: within these bounds, the LLM may return an ordered sequence of tool calls with dependency relationships. The task orchestrator:

- tracks execution state for each step (pending, executing, completed, failed)
- feeds results from completed steps into subsequent steps as input
- maintains progress state so the user can be informed ("Step 2 of 3: summarizing mails...")
- supports interruption: if the user says "stop" or "cancel" mid-chain, halt remaining steps and report what was completed
- supports resumability: if the user says "continue" after an interruption, resume from the last completed step

**Example**: "Summarize my unread mails and create a calendar reminder for any that need follow-up"

1. `mail.list({unread_only: true})` → returns 5 mails
2. LLM formatting pass: summarize + identify follow-ups → 2 need follow-up
3. `calendar.create({...})` for follow-up 1
4. `calendar.create({...})` for follow-up 2

**Recovery strategies**: when a step in the chain fails, the task orchestrator does not simply stop. It applies a recovery strategy:

- **retry**: for transient failures (network timeout, rate limit), retry the failed step up to 2 times with backoff
- **replan**: if the failure suggests the plan is wrong (tool not found, invalid arguments), send the error back to the LLM for replanning
- **partial completion**: if later steps fail but earlier steps succeeded, report what was completed and what failed ("I summarized your mails but could not create the calendar reminders because the calendar service is unavailable.")
- **rollback**: if the failed step makes completed steps invalid AND those steps are undoable (per capability registry), offer rollback
- **clarify**: if the failure is due to ambiguity discovered during execution (e.g., multiple matching contacts), pause and ask for clarification before continuing

Recovery strategy selection is deterministic based on the error type and the tool's metadata (idempotent, undoable). It is not an LLM decision.

#### When to use a second LLM call

A second LLM call is justified only in these cases:

- **Ambiguity resolution**: the first call identifies ambiguity ("There are 3 contacts named Regis — which one?") and a second call processes the user's clarification.
- **Result formatting**: the execution returns raw data (e.g., 15 mail items) and a formatting pass is needed to produce a spoken summary.
- **Complex multi-turn reasoning**: the user's request requires back-and-forth (rare for voice, more common for text chat mode).

In all other cases, one call is the target.

### What this replaces

The old four-stage architecture (semantic interpreter → action planner → execution → response) is replaced by:

- one LLM call (understanding + planning in one pass)
- one execution layer (deterministic, validated)
- one optional formatting pass (only when needed)

This reduces latency from 2-4 LLM round-trips to 1, cutting response time roughly in half.

### Why single-call is better for Jarvis

- **Speed**: "What is Sylvain's number?" should return in well under a second where network and provider allow, not 3-4 seconds.
- **Simplicity**: fewer moving parts, fewer failure modes, easier to debug.
- **Modern LLM capabilities**: function calling is a native feature of all major providers. The model already knows how to map intent to tool calls. A separate interpreter stage duplicates what the model does naturally.
- **Consistency**: one prompt, one context window, one reasoning pass. No information loss between stages.

## What must be removed or reduced

The following patterns should be removed or drastically reduced:

- large pre-LLM intent heuristics (the ~1900-line intent_schema.js keyword/regex cascade)
- regex-heavy domain routing for business actions
- phrase-specific hard-coded behaviors
- local pseudo-intelligence that keeps executing complex actions when the planner is unavailable
- duplicated business understanding logic across intent_schema.js and the ai_planner.js prompt
- giant prompt engineering that re-teaches the LLM what the heuristic already tried to do

Only a very thin local layer should remain before the model, for example:

- microphone / text normalization (STT cleanup, diacritics, casing)
- trivial stop / cancel / mute commands (no LLM needed for these)
- transport sanity checks
- wake word detection (if applicable)

Everything else should be model-led.

## MCP strategy

MCP (Model Context Protocol) must become the typed tool interface between the LLM and eVe capabilities.

### Roles

- **MCP server**: eVe itself. Each eVe capability (mail, contacts, calendar, Atome runtime, MTrack, etc.) exposes a set of typed tools through a unified MCP-compatible tool registry.
- **MCP client**: the LLM orchestration layer. It reads the tool registry, injects tool definitions into the LLM prompt, and dispatches tool calls to the correct eVe capability.
- **Tool definitions**: each tool has a typed schema (name, description, parameters with types, required fields) plus operational metadata. These schemas are generated from the capability APIs, not maintained separately.

### Tool definition schema

Each tool in the registry must declare:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique identifier (e.g., `mail.reply`, `contacts.update`, `runtime.object.move`) |
| `domain` | yes | Business domain (mail, contacts, calendar, runtime, mtrack, etc.) |
| `description` | yes | Human-readable description for the LLM |
| `parameters` | yes | Typed input schema (JSON Schema format) |
| `output_schema` | yes | Typed output schema |
| `risk_tier` | yes | One of: read, low, moderate, high, irreversible (see Autonomy section) |
| `side_effects` | yes | List of side effects (e.g., ["sends_email", "modifies_contact"]) or empty for read-only |
| `idempotent` | yes | Boolean. Can this tool be safely retried without duplication? |
| `undoable` | yes | Boolean. Can this action be reversed through ADOLE history? |
| `supported_environments` | no | List of environments where this tool is available (default: all). E.g., ["tauri", "web"] |
| `permissions_required` | no | List of permission keys needed to execute this tool |
| `preconditions` | no | List of state conditions that must be true before execution (e.g., ["entity_exists", "no_calendar_conflict"]). Checked by the execution layer, not the LLM. |
| `postconditions` | no | List of expected state changes after successful execution (e.g., ["mail_sent", "contact_updated"]). Used for postcondition verification. |
| `rollback_strategy` | no | How to reverse this action if a dependent step fails. One of: "adole_undo", "compensating_action", "none". Defaults to "none". |
| `latency_class` | no | Expected execution time. One of: "instant" (< 100ms, cached), "fast" (< 500ms), "moderate" (< 2s), "slow" (> 2s). Used by the acknowledgment protocol. |
| `requires_user_presence` | no | Boolean. If true, the action should not execute in background/proactive mode without the user actively present. Defaults to false. |
| `freshness_requirements` | no | How stale the input data can be. One of: "realtime", "recent" (< 5min), "cached" (any age). Used by offline/degraded mode to decide if cached data is acceptable. |

This metadata serves multiple purposes:

- the **LLM** uses name, description, parameters to understand what tools are available
- the **autonomy policy** uses risk_tier to decide confirmation behavior
- the **execution layer** uses idempotent to decide retry safety
- the **recovery engine** uses undoable and rollback_strategy to decide rollback capability
- the **observability layer** uses side_effects to classify operations
- the **acknowledgment protocol** uses latency_class to decide whether to emit an acknowledgment sound
- the **world-state reasoning layer** uses preconditions and postconditions for pre/post execution verification
- the **proactive scheduler** uses requires_user_presence to gate background actions
- the **offline mode** uses freshness_requirements to decide if cached data is acceptable

### Architecture

```text
User (voice/text)
    │
    ▼
Thin pre-processor (normalization, local commands only)
    │
    ▼
LLM call (with MCP tool definitions injected)
    │
    ├── tool_call: contacts.search({query: "Sylvain"})
    ├── tool_call: mail.list({unread_only: true})
    ├── tool_call: calendar.create({...})
    └── direct_reply: "It is 25 degrees in Paris."
    │
    ▼
MCP dispatcher (validates, resolves transport, executes)
    │
    ├── Squirrel.contacts.search(...)
    ├── Squirrel.mail.list(...)
    ├── Squirrel.calendar.create(...)
    └── AtomeRuntime.invoke(...)
    │
    ▼
Result → formatted response → streamed to TTS / UI
```

### Tool surface rules

- every eVe capability must expose its operations as typed MCP tools
- tool schemas must be auto-generated or co-located with the API implementation
- the tool registry must be dynamically queryable (the LLM can discover what tools are available)
- no parallel hidden execution paths outside the tool registry
- the same tool definitions serve text, voice, and programmatic access

### Relationship with existing APIs

The existing `Squirrel.mail`, `Squirrel.contacts`, `Squirrel.calendar`, and `AtomeRuntime` APIs remain the actual implementation. MCP tool definitions are a typed wrapper that describes these APIs to the LLM. The MCP dispatcher maps tool calls to the real API methods.

This means:

- `AtomeMail` stays as the mail implementation
- `mail.list`, `mail.read`, `mail.reply` etc. become MCP tool names that map to `AtomeMail.list()`, `AtomeMail.read()`, `AtomeMail.reply()`
- the LLM never calls `AtomeMail` directly — it calls `mail.list` and the dispatcher resolves it

## Streaming and progressive response

### Voice response pipeline

The voice response pipeline must be streaming end-to-end:

1. **LLM streaming**: use streaming API (SSE / WebSocket) for LLM responses. Tokens arrive incrementally.
2. **Sentence boundary detection**: as tokens arrive, detect sentence boundaries (period, question mark, exclamation, or natural pause point).
3. **Progressive TTS**: send each complete sentence to TTS immediately, do not wait for the full response.
4. **Audio playback queue**: TTS chunks are queued and played sequentially. Playback starts as soon as the first chunk is ready.
5. **Barge-in support**: if the user speaks during playback, immediately stop TTS, cancel pending chunks, and process the new utterance.

### Acknowledgment protocol

When processing will take longer than ~800ms:

- emit an acknowledgment within 300ms: a short sound, or a micro-phrase like "OK", "let me check", "one moment"
- the acknowledgment must not be a placeholder answer — it must indicate that processing is underway
- for known-fast operations (cached contacts, local commands), skip the acknowledgment and respond directly

### Text response pipeline

For text input:

- show a typing indicator immediately
- stream partial results to the chat UI as they arrive
- for tool calls, show a discrete "executing..." status until the result returns

## Memory architecture

### Working memory (working_memory.js)

Working memory is the single source of truth for the current session. It stores:

- **conversation turns**: user utterance + assistant response + domain/action metadata for each turn
- **active entities**: the currently referenced contact, mail, calendar event, Atome object (for pronoun resolution)
- **active filters**: if the user said "show me unread mails from Alice", the filters persist so "read the first one" works
- **session preferences**: any in-session overrides (language, verbosity level)

Rules:

- working memory must be passed to the LLM on every call as part of the conversation context
- working memory must be managed by a single module, not spread across orchestrator, planner, and intent_schema
- working memory must have explicit capacity management: when it exceeds the context budget, older turns are summarized before eviction
- working memory must be serializable for debugging and replay

### Persistent memory (ADOLE-backed)

Persistent memory survives across sessions. It stores:

- **user profile**: name, preferred language, timezone, preferred greeting style
- **contact affinity**: frequently contacted people, nicknames, preferred communication channel per contact
- **workflow patterns**: learned sequences (e.g., "user checks mail → reads most recent → replies")
- **preference overrides**: "always summarize mails before reading", "never auto-send replies"

Rules:

- persistent memory is loaded at session start (read from ADOLE)
- persistent memory is updated only on explicit triggers or significant events, not on every turn
- persistent memory items must have timestamps and can be expired / pruned
- the LLM receives a summary of persistent memory, not the raw store

### Context window management

The LLM has a finite context window. The system must manage it explicitly:

1. **System prompt + tool definitions**: fixed budget (~2000-4000 tokens depending on tool count)
2. **Persistent memory summary**: capped at ~500 tokens
3. **Conversation history**: last N turns in full, older turns as summaries
4. **Current request**: the new user utterance
5. **Room for response**: reserved space for the model to generate

When the total exceeds 80% of the context window:

- older conversation turns are summarized (not dropped)
- tool definitions may be filtered to only relevant domains
- persistent memory summary is compressed

## Identity resolution

Identity resolution is the process of mapping natural language references to concrete entities in eVe's data stores and runtime. This is a distinct architectural concern, not merely a side-effect of memory or LLM reasoning.

### The problem

Users refer to entities in ambiguous, contextual, and multi-source ways:

- "Paul" — which Paul? Contact Paul Dupont, calendar participant Paul Martin, or Paul mentioned in the last mail?
- "this contact" — requires knowing the currently displayed contact in the UI
- "the blue object" — requires querying the runtime for visible Atome objects matching a color attribute
- "the last message" — requires resolving across mail and messages, with ordering
- "duplicate Regis" — requires cross-entity matching within contacts

These cannot be resolved by the LLM alone. The LLM does not have direct access to the contact database, the UI state, or the runtime object graph.

### Resolution strategy

Identity resolution runs as a **pre-LLM enrichment step** (not a separate LLM call). Before the LLM call, the system:

1. **Scans the utterance** for entity references (names, pronouns, deictic references like "this", "that one", "the last"). This scan is limited to **shallow candidate spotting** — pattern-matching on proper nouns, pronouns, and deictic tokens. It must not perform semantic interpretation, intent classification, or domain routing. If the scan requires understanding what the user means (as opposed to spotting tokens that might refer to entities), that understanding belongs in the LLM call.
2. **Queries relevant sources** in parallel:
   - working memory (recent mentions, active entity)
   - UI context (currently displayed panel, selected object, focused contact)
   - contacts store (fuzzy name match)
   - calendar store (participant names, event titles)
   - mail store (sender names, subject references)
   - runtime object graph (visible objects, recently created objects)
3. **Produces a resolution context** included in the LLM call:
   - resolved entity IDs with confidence scores
   - ambiguity flags when multiple candidates match
   - suggested clarification prompts when confidence is too low

### Resolution rules

- if there is exactly one high-confidence match, resolve silently and include the entity ID in the LLM context
- if there are multiple candidates with similar confidence, include all candidates and ask the LLM to generate a clarification question
- if the reference is a pronoun or deictic ("it", "this", "that one"), resolve from working memory (last active entity) or UI context first
- identity resolution must be deterministic where possible and must not require an LLM call
- resolution results must be logged for observability (see Observability section)
- **fuzzy match safety bound**: fuzzy name matching may inform candidate retrieval, but must not silently authorize moderate, high, or irreversible actions when the match confidence is below a strict threshold (configurable, default: 0.95 for destructive actions, 0.8 for moderate actions). Below the threshold, the system must present candidates and request explicit confirmation, even if only one fuzzy match was found. This prevents "Regis" / "Régie" / "Régis Martin" / "Regis Dupont" from triggering wrong-target execution.

### Sources priority

For name-based references, search in this order:

1. working memory (most recent mention in conversation)
2. UI context (currently visible entity)
3. contacts store (fuzzy match)
4. calendar store (participant match)
5. mail store (sender/recipient match)
6. runtime objects (Atome name or label match)

For deictic references ("this", "that", "the current"):

1. UI context (what is currently selected or displayed)
2. working memory (last referenced entity)

For ordinal references ("the first one", "the last one", "the third mail"):

1. working memory (last list result + index)

## Compound action safety

Task orchestration and recovery handle the mechanics of multi-step execution. Compound action safety handles the risk semantics of action chains.

### The problem

A sequence of individually moderate actions can produce an aggregate effect that is high-risk. For example:

- "Take my urgent mails, draft replies, create reminders, and archive the threads" — each step is moderate, but the combined effect touches mail (read + write + archive) and calendar (create), with external side effects. The aggregate risk is higher than any single step.

### Aggregate risk evaluation

The orchestrator must compute the aggregate risk of a chain before execution:

- **risk floor**: the aggregate risk is at least as high as the highest individual step's risk tier
- **risk escalation**: if a chain contains 3 or more "moderate" actions, or spans 3+ domains, the aggregate risk escalates to "high" regardless of individual tiers
- **irreversibility propagation**: if any step in the chain is irreversible, the entire chain's aggregate risk must be treated as irreversible, because partial execution cannot be fully rolled back

### Confirmation on mixed-risk chains

When a chain contains steps at different risk tiers:

- execute all "read" steps silently (they gather information)
- pause before the first step that exceeds "low" risk and present the remaining plan: "I will now send a reply to Alice and archive the thread. OK?"
- if the user approves, continue; if not, report what was completed (the read steps) and stop

### Risk change detection

If a step's execution reveals information that changes the risk profile of subsequent steps, the orchestrator must re-evaluate:

- example: step 1 lists mails, step 2 drafts replies. If step 1 reveals that one of the "urgent" mails is from an external client (not an internal colleague), the risk of auto-drafting a reply escalates. The orchestrator must pause and confirm.
- this requires the execution layer to tag results with risk-relevant metadata that the orchestrator checks before proceeding to the next step

## Response modes

The assistant must adapt its response verbosity and structure to the context. Not every response should have the same level of detail.

### Mode taxonomy

| Mode | When used | Behavior |
|------|-----------|----------|
| **brief** | Simple factual answers, single-tool results, voice responses | Minimal response. Just the answer. "Sylvain's number is 06 12 34 56 78." No explanation, no context, no plan description. |
| **explanatory** | When the assistant made an assumption, resolved an ambiguity, or chose between alternatives | State the answer plus the assumption. "I found Sylvain Dupont (not Sylvain Martin). His number is 06 12 34 56 78." |
| **plan summary** | Multi-step tasks, before execution of complex chains | Describe the plan before executing. "I will: 1) list your unread mails, 2) summarize them, 3) create reminders for follow-ups. OK?" |
| **execution report** | After completing a multi-step task | Summarize what was done, what succeeded, what failed. "Done. 3 mails summarized, 2 reminders created. The calendar service was slow but all events were saved." |

### Mode selection rules

- **voice defaults to brief mode** unless the request is complex or an assumption was made
- **text defaults to brief mode** for simple requests, switches to explanatory or execution report for multi-step
- **plan summary mode activates automatically** when the complexity boundary requires user confirmation before execution
- **explanatory mode activates automatically** when:
  - identity resolution had to choose between multiple candidates
  - the assistant used a non-obvious interpretation of the request
  - a degraded model or provider fallback was used
- the user can request a mode switch: "explain that" → switch to explanatory for the previous result; "just do it" → switch to brief and skip plan summary

### Voice brevity rule

Voice responses must always be shorter than their text equivalents. If a text response is 3 sentences, the voice equivalent should be 1-2 sentences. Details that are useful but not essential should be shown in the UI rather than spoken.

## World-state reasoning

Tool selection alone is insufficient for safe operation. The execution layer must verify that the world is in the expected state before and after tool execution.

### Precondition checks

Before executing a tool call, the execution layer checks preconditions declared in the capability registry:

- **entity existence**: the target entity (contact, mail, calendar event, Atome object) actually exists
- **selection validity**: if the action targets a UI selection, the selection is still current and valid
- **conflict detection**: for calendar creation, no overlapping event exists at the same time (or warn if so)
- **permission constraints**: the user has the required permissions for this action
- **runtime state compatibility**: the Atome object is not locked, the layer is visible, the timeline is at a valid position
- **resource availability**: required API or service is reachable (or fail fast if not)

Precondition checks are deterministic code, not LLM reasoning. They use the `preconditions` field from the capability registry.

### Freshness re-check before destructive actions

The world can change between plan creation, user confirmation, and actual execution. For high-risk and irreversible actions, the execution layer must re-validate state immediately before execution if any of the following occurred since the data was last fetched:

- a user confirmation pause (the user took time to approve)
- intermediate steps in a multi-step chain executed between planning and this step
- a streaming delay or network interruption
- the action targets a runtime selection that could have changed

The re-check must verify:

- the target entity still exists (not deleted by another action or another user)
- the target entity still matches the expected state (not modified since the plan was created)
- the UI selection is still current (for runtime actions)

If the re-check detects a mismatch, the execution layer must pause and inform the user ("The contact was modified since I last checked. Proceed anyway?") rather than executing against stale state. This re-check applies only to actions with risk tier "high" or "irreversible" — read and low-risk actions may proceed without re-validation.

### Postcondition verification

After tool execution, the execution layer may verify that the expected state change occurred:

- the contact was actually created (not silently dropped)
- the mail was actually sent (confirmation from the mail API)
- the calendar event exists at the expected time
- the Atome object has the expected new properties

Postcondition verification is optional and applies primarily to high-risk and irreversible actions. It uses the `postconditions` field from the capability registry.

### Compensation triggers

When postcondition verification detects a mismatch:

- **rollback**: if the action is undoable, reverse it through ADOLE history
- **clarify**: if the mismatch is ambiguous (e.g., partial success), report precisely what happened and what didn't
- **retry**: if the failure appears transient and the action is idempotent, retry once
- **replan**: if the world state has changed in a way that invalidates the plan, send the situation back to the LLM

Compensation strategy is selected deterministically based on the tool's metadata (undoable, idempotent, rollback_strategy), not by the LLM.

## Autonomy and safety policy

A Jarvis-level assistant must know when to act silently and when to ask for confirmation. This cannot be hardcoded per action — it must be a configurable policy layer.

### Risk tiers

Every tool in the capability registry has an associated risk level:

| Risk tier | Description | Default behavior |
|-----------|-------------|------------------|
| **read** | No side effects. Reading data only. | Execute silently, no confirmation. |
| **low** | Reversible side effect. Creating a draft, adding a tag, marking as read. | Execute silently, report result. |
| **moderate** | Meaningful side effect. Sending a mail, creating a calendar event, updating a contact. | Execute with brief verbal confirmation before ("Sending the mail to Alice, OK?") unless user has opted out. |
| **high** | Destructive or hard to reverse. Deleting a contact, bulk delete, removing a calendar event. | Always confirm before execution. |
| **irreversible** | Cannot be undone. Sending to external systems, permanent deletion. | Strong confirmation required. User must explicitly approve. |

### Policy configuration

- risk tier assignments are defined per tool in the capability registry
- users can override the default behavior in eVe preferences (e.g., "never ask confirmation for sending mail" or "always confirm before deleting anything")
- overrides are stored in persistent memory and loaded at session start
- the autonomy policy is enforced by the deterministic execution layer, not by the LLM

### Confirmation UX

- for voice: short spoken confirmation ("Send this to Alice?") + wait for "yes" / "no" / "cancel"
- for text: inline confirmation button in the chat UI
- confirmation timeout: if no response within 30 seconds, cancel the pending action and inform the user
- the LLM must not be re-invoked for confirmation handling — it is a deterministic state machine

### Undo integration

For actions that support undo (as declared in the capability registry):

- after execution, offer a brief undo window: "Mail sent to Alice. Say 'undo' within 10 seconds to cancel."
- undo is handled by the execution layer through the ADOLE history system, not by a new LLM call

## Proactive intelligence

### Startup briefing

When the user opens eVe (or starts a new session), the assistant may proactively offer a briefing:

- "Good morning. You have 5 unread mails, including 2 from Alice. Your first meeting is at 10 AM with Paul."
- This is opt-in and configurable in eVe preferences.
- The briefing is assembled by calling the same tools (mail.list, calendar.list) as a reactive request would.

### Time-based notifications

The assistant must support time-triggered alerts:

- "Your meeting with Paul starts in 10 minutes."
- "You have a reminder: call the dentist."
- These are driven by a local scheduler that checks the calendar/reminder store periodically.
- When a trigger fires, it goes through the same response pipeline (format → TTS or notification UI).

### Contextual awareness

The assistant should detect opportunities to help based on current context:

- if the user is viewing a contact and asks "send them a mail", the assistant knows who "them" refers to from the active UI context
- if the user creates a calendar event with a participant and that participant has no email, surface this
- if a received mail mentions a date, suggest creating a calendar event

Rules:

- proactive suggestions must be non-intrusive (visual hint or brief voice mention, easily dismissible)
- proactive features must be individually toggleable in preferences
- all proactive actions go through the standard tool pipeline (no hidden execution paths)

### Attention budget

Proactive intelligence must operate under a bounded attention budget to prevent the assistant from becoming intrusive:

- **confidence threshold**: proactive suggestions fire only when the system's confidence exceeds a configurable threshold (default: 0.8). Below this, stay silent.
- **cooldown period**: after a proactive suggestion is delivered, no new proactive suggestion for the same domain for at least N minutes (configurable, default: 5 minutes per domain).
- **priority scoring**: when multiple proactive triggers fire simultaneously, rank by urgency (imminent meeting > mail summary > contextual hint) and deliver only the top one.
- **snooze capability**: the user can snooze a category of proactive suggestions ("stop telling me about meetings for the next hour").
- **dismiss feedback loop**: when the user dismisses or ignores a proactive suggestion, reduce the confidence score for that trigger pattern in persistent memory. Over time, unhelpful suggestions self-suppress.

### Coalescence rule

When multiple proactive triggers fire within a short interval (configurable, default: 60 seconds), the system must coalesce them into a single output rather than delivering them sequentially:

- combine related triggers into one message ("You have a meeting in 10 minutes and 2 new mails from Alice" rather than two separate notifications)
- apply the priority scoring to select the most important trigger if coalescence would produce a message that is too long for voice delivery (> 2 sentences)
- never deliver more than one proactive output per 60-second window unless the trigger is time-critical (e.g., "meeting starting now")

This prevents the assistant from "politely harassing" the user with a stream of individual notifications when several events coincide.

### Hard constraint

Proactive suggestions may trigger **recommendations only**, never silent autonomous execution of high-risk actions. The assistant may say "You have a meeting in 10 minutes" but must never silently reschedule, delete, or send on the user's behalf without explicit instruction.

## Multimodal coordination

### Voice-specific handling

Voice input has unique requirements that text does not:

- **VAD (Voice Activity Detection)**: must be handled by the existing vad.js module. The AI layer receives finalized utterances only.
- **STT normalization**: spoken "Régis" may arrive as "régie", "Regis", or "regime". The STT normalizer must handle common misrecognitions before passing to the LLM.
- **Disambiguation strategy**: for voice, prefer asking short clarification questions ("Régis Dupont or Régis Martin?") rather than offering a visual list. For text, a clickable list is fine.
- **Acknowledgment during processing**: voice requires audio acknowledgment (see Acknowledgment protocol above). Text only needs a visual indicator.
- **Barge-in / interrupt**: the user must be able to interrupt the assistant mid-speech. The existing interrupt integration must be preserved and connected to the streaming response pipeline.
- **Voice meter feedback**: the existing voice_meter.js provides visual feedback during listening. This must remain active whenever the microphone is open.

### Text-specific handling

Text input allows richer interactions:

- multi-line messages
- copy-paste of emails, addresses, phone numbers
- clickable suggestions and buttons in responses
- inline editing of draft messages before sending

### Shared contract

Both modalities must converge to the same internal contract:

- voice input → STT → normalized text → LLM call with tools → execution → response → TTS
- text input → normalized text → LLM call with tools → execution → response → chat UI

The only difference is the input normalization and the output rendering. The LLM call, tool dispatch, and execution are identical.

## Graceful degradation

### Offline mode (Tauri)

When running in Tauri without internet access:

- **local commands always work**: stop, cancel, navigate, play/pause, mute
- **cached data is accessible**: contacts stored in local ADOLE, recent calendar events, recently fetched mails can be read from cache
- **mutations are queued**: if the user creates a contact or event offline, the action is recorded in a local queue and synced when connectivity returns
- **the assistant says so**: "I cannot reach the AI service right now, but I can show you your cached contacts and calendar. Any changes will be saved and synced when you are back online."

### Degraded AI mode

When the primary LLM provider is unavailable:

- **tier 1**: try alternate provider (if configured in eVe preferences)
- **tier 2**: use a smaller / local model (if available) for simple requests only
- **tier 3**: explicit failure message with local-only capabilities

The tier selection must be automatic and transparent. The user should not have to manually switch providers.

### Degraded model autonomy restriction

When running on a degraded or smaller model (tier 2), the autonomy scope must be explicitly restricted:

**Allowed in degraded mode:**

- read-only operations (list contacts, read mail, check calendar)
- low-risk deterministic operations (mark as read, add a tag, create a draft)
- high-confidence identity matches only (exact single match, no ambiguity)

**Never allowed in degraded mode:**

- high-risk autonomous execution (send mail, delete contact, bulk operations)
- ambiguous identity execution (if multiple candidates match, refuse and explain)
- irreversible external actions (anything that leaves the system boundary)
- multi-step task orchestration (complex workflows require the full model)
- proactive suggestions beyond the startup briefing

The restriction is enforced by the autonomy policy layer checking the current model tier before applying risk-tier rules. A degraded model effectively has its maximum risk tier capped at "low".

### Rate limiting and quota

- track token usage and remaining quota
- when approaching quota limits, warn the user: "AI usage is running low. Complex requests may be delayed."
- never silently fail or produce garbage results from an overloaded API

## Observability

For continuous improvement and debugging, every AI interaction must produce a structured trace.

### Trace structure

Each request produces a trace containing:

- **request_id**: unique identifier
- **timestamp**: start and end time
- **input**: raw utterance, modality (voice/text), locale
- **identity_resolution**: entities resolved, sources queried, confidence scores, ambiguities
- **llm_call**: model used, prompt token count, response token count, latency, tool calls returned
- **autonomy_decision**: risk tier evaluated, confirmation required (yes/no), user response
- **execution**: for each tool call: tool name, arguments, result, latency, success/failure
- **task_orchestration**: if multi-step: step count, steps completed, recovery actions taken
- **response**: final response text, delivery modality (TTS/chat), latency to first byte
- **total_latency**: end-to-end time from utterance to first response byte

### Storage

- traces are stored locally (ADOLE or filesystem) with a configurable retention period
- traces must not contain raw mail content or sensitive personal data — only metadata and entity IDs
- traces are queryable for debugging ("show me the last 10 failed requests", "what is the average latency for mail.list?")

### Metrics

The following metrics must be trackable from traces:

- **latency percentiles**: p50, p95, p99 for end-to-end response time
- **tool call success rate**: per tool, per domain
- **clarification rate**: how often the assistant needs to ask for clarification (lower is better)
- **recovery rate**: how often multi-step tasks require recovery actions
- **identity resolution accuracy**: when the user corrects a resolution, log it as a failed resolution
- **LLM token usage**: per session, per day, for quota management

### Rules

- observability must not add latency to the critical path — traces are written asynchronously after response delivery
- observability must be always-on, not opt-in (it is infrastructure, not a feature)
- traces must be available for local inspection without requiring an external service

## Runtime routing

eVe must support different transport backends depending on the runtime environment.

### Tauri mode

When eVe runs inside Tauri, the preferred default route must be the local Tauri / Axum path.

That means:

- calls should prefer the Tauri backend
- the local Axum-backed route is the primary execution path
- the expected transport endpoint is the Tauri-exposed local port `3000`

This is the preferred default whenever Tauri is available, because it is the most stable and consistently available local execution path in the desktop environment.

### Web mode

When eVe runs in web mode, the transport must use the web backend path.

That means:

- calls should use the Fastify-backed route
- the expected transport endpoint is the Fastify port `3001`

### Transport rule

The routing rule should therefore be:

- if Tauri is available, prefer the Tauri / Axum route on port `3000`
- otherwise, use the web / Fastify route on port `3001`

This routing decision must be implemented in the transport layer, not in prompts and not in business-domain reasoning.

The LLM must stay unaware of ports and backend names.

The model should request a capability.

The runtime should choose the correct backend.

## Rewrite target

The rewrite should aim for the following outcome:

- one LLM call path (single-call with native tool use)
- one execution fabric (MCP dispatcher → real APIs)
- one identity resolution engine (pre-LLM, deterministic, multi-source)
- one autonomy policy layer (risk-tiered, user-configurable, deterministic)
- one memory system (working_memory.js for session, ADOLE for persistence)
- one streaming pipeline (LLM tokens → sentence detection → progressive TTS)
- one task orchestrator (activated only for multi-step, with recovery strategies)
- one communication model for mail + messages
- one runtime action model for Atome and eVe tools
- one degradation strategy (tiered, automatic, transparent)
- one observability layer (always-on, structured traces, async)
- one world-state reasoning layer (precondition/postcondition verification, deterministic compensation)
- one compound action safety layer (aggregate risk, mixed-risk confirmation, risk escalation)
- one response mode system (brief, explanatory, plan summary, execution report)
- one complexity boundary (max steps, max domains, aggregate risk escalation)

## Practical roadmap

### Phase 1. Core contract and single-call architecture

Priority: CRITICAL. Deliverable: eVe answers simple voice/text requests with sub-second latency as a UX target.

- define the canonical MCP tool schema for contacts, calendar, mail (including risk_tier, side_effects, idempotent, undoable metadata)
- implement the single-call LLM path with native tool use (replacing the separate semantic interpreter + action planner)
- implement the MCP dispatcher that maps tool calls to existing Squirrel/Atome APIs
- implement the identity resolution engine (name matching, UI context, working memory references)
- implement the autonomy policy layer (risk tier enforcement, confirmation UX for voice and text)
- reduce intent_schema.js to local commands only (stop, cancel, mute, navigate)
- connect working_memory.js as the single source of conversation context
- wire the response to existing TTS
- implement basic observability (structured traces for every request, stored locally)

### Phase 2. Streaming and progressive response

Priority: HIGH. Deliverable: voice responses feel instant, no more silence gaps.

- implement LLM streaming (SSE or WebSocket depending on provider)
- implement sentence boundary detection on the token stream
- implement progressive TTS (sentence-by-sentence, not full-response)
- implement the 300ms acknowledgment protocol
- connect barge-in / interrupt to the streaming pipeline

### Phase 3. Memory, context, and task orchestration

Priority: HIGH. Deliverable: multi-turn conversations work reliably, pronouns resolve, filters persist, complex multi-step tasks complete with recovery.

- formalize the working memory contract (turn history, active entities, active filters)
- implement context window management (summarize-then-evict strategy)
- implement persistent memory (ADOLE-backed, loaded at session start)
- ensure the LLM receives memory on every call
- implement task orchestrator for multi-step tool chains (state tracking, interruption, resumability)
- implement recovery strategies (retry, replan, partial completion, rollback, clarify)

### Phase 4. Unified communication

Priority: MEDIUM. Deliverable: user can query all communication in one request.

- unify mail and messages retrieval behind a single communication tool surface
- preserve source identity (mail vs message vs future surfaces)
- expose `communication.list`, `communication.search` as MCP tools

### Phase 5. Proactive intelligence

Priority: MEDIUM. Deliverable: eVe greets the user with a useful briefing, alerts before meetings.

- implement startup briefing (opt-in, preference-controlled)
- implement time-based notification scheduler for calendar events and reminders
- implement contextual suggestion hooks (UI context → opportunity detection → suggestion)
- all proactive features use the standard tool pipeline

### Phase 6. Graceful degradation and offline

Priority: MEDIUM. Deliverable: eVe remains useful without internet.

- implement local cache layer for contacts, calendar, recent mails (Tauri/ADOLE)
- implement offline mutation queue (create/update/delete queued and synced on reconnect)
- implement provider fallback tiers (alternate provider → smaller model → explicit failure)
- implement quota tracking and user-facing warnings

### Phase 7. Full runtime coverage

Priority: LOWER. Deliverable: all eVe/Atome capabilities are accessible through voice/text.

- map all Atome runtime actions (create, resize, move, rotate, color, delete, etc.) into MCP tool surfaces
- map MTrack, audio, and media tools into MCP tool surfaces
- ensure runtime tools use the same dispatcher and memory as business tools

### Phase 8. Pattern learning and advanced proactivity

Priority: LOWER. Deliverable: eVe adapts to individual user patterns over time.

- implement workflow pattern detection from persistent memory
- implement preference inference ("user always reads mail first" → prepare briefing accordingly)
- implement smart notification prioritization based on learned urgency signals

## Final statement

The objective is not to make the current heuristic stack slightly better.

The objective is to replace it with an LLM-first, tool-driven, streaming, context-aware, proactive architecture that makes eVe behave like a real personal assistant.

This architecture must support:

- instant response through single-call LLM with native tool use
- progressive voice response through streaming TTS
- reliable multi-turn conversation through explicit memory management
- complete integrated control of contacts, calendar, mail, messages, eVe runtime, Atome actions, and MCP surfaces
- proactive intelligence that anticipates user needs
- graceful degradation when AI or connectivity is unavailable

The system must understand intelligently, execute reliably, respond progressively, remember contextually, anticipate proactively, and fail explicitly when intelligence is unavailable.

## Definition of Done

The work is complete only when:

- eVe behaves like a real tool-using LLM assistant (Jarvis-level)
- common voice requests target sub-second end-to-end latency (UX objective, not guaranteed SLA)
- voice responses start speaking within 500ms (streaming + progressive TTS)
- user phrasing can stay natural
- multi-turn context stays coherent (pronouns, filters, entity references resolve correctly)
- identity resolution correctly maps names, pronouns, and deictic references to entities across all data sources
- the autonomy policy enforces risk-appropriate confirmation behavior, configurable per user
- mail / contacts / calendar actions are reliable
- multi-step tasks complete with proper recovery (retry, replan, partial completion, rollback)
- no hidden fallbacks distort the request
- no unnecessary confirmations block the user (but dangerous actions always confirm)
- no fake placeholder replies are spoken
- the 300ms acknowledgment protocol is active for slow operations
- startup briefing works (opt-in) with real data from tools
- offline mode provides cached data access and queued mutations
- provider fallback tiers work automatically
- settings come from the proper Reve / eVe preferences flow
- platform integrations are designed behind clean abstractions
- working_memory.js is the single source of session context
- the MCP tool registry covers contacts, calendar, mail, and core runtime (with full metadata: risk, side effects, undo, idempotence)
- every request produces a structured observability trace
- world-state precondition checks prevent executing actions against invalid state
- degraded model mode restricts autonomy to read and low-risk operations only
- proactive intelligence operates within a bounded attention budget (confidence threshold, cooldown, coalescence, dismiss feedback)
- compound action chains enforce aggregate risk evaluation and mixed-risk confirmation
- the complexity boundary limits auto-executable steps (max 5) and cross-domain scope (max 3 domains) without confirmation
- LLM-proposed tool chains are validated by the orchestrator before execution (never trusted as raw executable plans)
- response mode adapts to context (brief for voice/simple, explanatory when assumptions made, plan summary for complex chains)
- runtime/Atome actions handle nameless objects, locked layers, relative spatial commands, and multi-selection through explicit resolution
- the preprocessing boundary is enforced: no semantic reasoning, no domain routing, no entity extraction before the LLM
- CI fails on forbidden patterns: direct property mutation on Atome objects outside the action API, regex-based intent classification, hidden fallback logic
- every AI-driven runtime mutation has integration tests proving valid history entry, undo/redo, observer triggers, and canonical persistence
- all AI-driven mutations route through the single write gateway (no alternative write path exists)
- Tauri E2E runs are repeatably green

## Handoff Summary

The mission is to refactor eVe into a real general-purpose, tool-using voice assistant at the Jarvis level.

It must understand natural requests in one LLM call, use native tool calling for mail, contacts, calendar, and Atome runtime actions, respond progressively through streaming TTS, maintain rich conversational memory, anticipate user needs proactively, and degrade gracefully when offline or when AI services are unavailable.

The current failures come from:

- a hybrid architecture where a ~1900-line heuristic intent classifier competes with the LLM
- duplicated business logic between intent_schema.js and the ai_planner.js prompt
- no streaming response pipeline (user waits in silence)
- fragmented memory management across multiple modules
- no identity resolution engine (entity references resolved ad hoc in multiple places)
- no autonomy policy (confirmation behavior inconsistent and hardcoded)
- no task orchestration for multi-step requests (no recovery, no resumability)
- no proactive intelligence layer
- no graceful degradation for offline or quota-exhausted scenarios
- no observability (no structured traces, no latency tracking, no failure analysis)

Mail configuration must come from the existing Reve / eVe preferences system, not from hardcoded values or hidden fallbacks.

The implementation must stay cross-platform and should ideally support real platform data integration for Apple and Windows contacts, calendar, and mail through proper adapters behind a unified internal contract.
