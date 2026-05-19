# Atome / Squirrel — AI Control via Agent

Goal: allow **any AI/agent** to control the entirety of Atome (Squirrel) through exposed **tools**, in a **secure, deterministic, auditable** way, with **configurable autonomy** and **mandatory validation** for high‑risk actions (e.g. banking).

This document specifies **what must be implemented**. The flexible/modular syntax or DSL used to declare APIs/tools will be defined later.

---

## 0) Non‑negotiable principles

1. **AI never controls Atome directly**: it only produces intentions.
2. **Atome executes through a canonical bus** (ADOLE / Command Bus): validation, permissions, execution, history.
3. **Security by design**: scopes/capabilities, policy engine, audit, idempotence.
4. **Reproducibility**: same inputs → same effects (within external non‑determinism limits).
5. **Fail‑safe**: ambiguity, risk, or inconsistency → block or rollback.

---

## 1) Target architecture (overview)

### 1.1 Components

* **Agent (AI)**: ChatGPT, Claude, local LLM, etc.
* **MCP Server (Atome Agent Gateway)**: agent entry point, exposes tools.
* **Policy Engine**: decides whether an action is auto‑executable or requires confirmation.
* **Auth & Consent**: OAuth, tokens, passkeys/2FA for confirmations.
* **Connectors**: Gmail / Calendar / YouTube / Banking / etc.
* **ADOLE / Command Bus**: canonical execution inside Atome (transactions, audit, idempotence).
* **Audit Log**: immutable action journal.
* **Confirmation UI (Atome)**: approval screens (mobile/desktop), notifications.

### 1.2 Base flow

1. AI calls an **MCP tool**
2. Gateway → **schema validation** + minimal context enrichment
3. Gateway → **simulate / dry‑run** (when possible)
4. Policy Engine → **ALLOW / REQUIRE_CONFIRM / DENY**
5. If confirmation required → create a **Proposal**
6. Execution (ADOLE) → **commit**
7. Post‑action verification + logging

### 1.3 Local Agent Gateway (AtomeAI)

Squirrel exposes a local JS gateway for AI-driven tool calls:

* Global: `window.AtomeAI`
* Core methods: `registerTool`, `callTool`, `listTools`
* Built-ins: `audit.get_recent_actions`

Example:

```js
AtomeAI.registerTool({
  name: 'demo.echo',
  capabilities: ['demo.read'],
  risk_level: 'LOW',
  params_schema: {
    required: ['text'],
    properties: { text: { type: 'string' } }
  },
  handler: async ({ params }) => ({ result: { echo: params.text } })
});

const response = await AtomeAI.callTool({
  tool_name: 'demo.echo',
  params: { text: 'hello' },
  actor: { user_id: 'user_1', agent_id: 'local_demo', session_id: 's1' },
  signals: { overall_confidence: 0.95 },
  idempotency_key: 'demo.echo:hello'
});
```

---

## 2) Security model

### 2.1 Identities

* **User**: human owner identity.
* **Agent**: AI instance (name/driver/version).
* **Session**: short‑lived execution context (device, app, IP, transport).

### 2.2 Scopes / Capabilities

Each tool must declare:

* `capabilities`: e.g. `calendar.write`, `mail.read`, `mail.send`, `youtube.upload`, `bank.transfer`
* `risk_level`: `LOW | MEDIUM | HIGH | CRITICAL`
* `data_classes`: e.g. `PII`, `FINANCIAL`, `HEALTH`, etc.

### 2.3 Consent

* Initial consent: user grants scopes to the system.
* Dynamic consent: some scopes/actions require **per‑action confirmation** (banking, unknown recipients, etc.).

### 2.4 Mandatory confirmation (gated execution)

For high‑risk actions, **the server must refuse execution** without a valid confirmation token.

* Confirmation bound to a **Proposal**
* Short‑lived token (TTL)
* Token bound to **parameter hash** (amount, beneficiary, etc.)
* Methods: passkey / biometrics / 2FA, platform‑dependent

---

## 3) Policy Engine

### 3.1 Role

Automatically decide:

* whether a tool can execute without validation,
* whether a Proposal must be created,
* or whether execution must be denied.

### 3.2 Minimal inputs

* `user_context`: preferences, habits, constraints (calendar), whitelists.
* `tool_meta`: capabilities, risk_level.
* `request`: tool parameters + extracted entities.
* `signals`: NLU/voice confidence, novelty, anomalies, history.

### 3.3 Outputs

* `ALLOW` (auto)
* `REQUIRE_CONFIRM` (proposal)
* `DENY` (with reason)

### 3.4 Rule examples

* Banking: `bank.transfer` → `REQUIRE_CONFIRM` always.
* Email: `mail.send` →

  * `ALLOW` if recipient whitelisted + no attachment + no sensitive content detected.
  * otherwise `REQUIRE_CONFIRM`.
* YouTube:

  * upload private/unlisted → `ALLOW`
  * public publish → `REQUIRE_CONFIRM`.
* Calendar: create/move within allowed windows → `ALLOW`.

---

## 4) Proposals (prepare / confirm / execute)

### 4.1 Proposal model

A Proposal is a persistent object representing a pending action.

Minimum fields:

* `proposal_id`
* `created_at`, `expires_at`
* `requested_by` (agent/session)
* `tool_name`
* `params` (normalized)
* `params_hash`
* `summary_human` (human‑readable summary)
* `risk_report` (why gating is required)
* `required_confirmation` (method, level)
* `status`: `PROPOSED | NEEDS_CONFIRMATION | APPROVED | REJECTED | EXECUTED | FAILED`

### 4.2 Internal API

* `proposal.create(...)`
* `proposal.get(id)`
* `proposal.approve(id, confirmation_token)`
* `proposal.execute(id)`
* `proposal.reject(id)`

---

## 5) ADOLE / Command Bus (execution core)

### 5.1 Role

The Command Bus is the **only execution path** for effects on Atome.

It must guarantee:

* schema validation
* property‑level permissions (when applicable)
* transactions
* idempotence
* audit
* rollback (when possible)

### 5.2 Minimal command contract

Required fields:

* `intent_id` (uuid)
* `trace_id` (correlation)
* `source` = `ai | human | system`
* `actor` (user_id, agent_id)
* `action` / `target` / `patch`
* `preconditions` (optional)
* `idempotency_key`
* `dry_run` (boolean)

### 5.3 States / results

* `ACCEPTED` / `REJECTED`
* `EXECUTED` / `FAILED`

Standard return:

* `effect_summary`
* `diff` (before/after)
* `events_emitted`
* `rollback_hint` (if available)

---

## 6) Logging and audit (immutable)

### 6.1 Requirements

Every action (ALLOW or Proposal) must generate a log:

* who, what, when
* tool called, params (or hash + redaction)
* policy decision + justification
* result + effects

### 6.2 Redaction / confidentiality

* Support sensitive fields: encrypted or hashed storage
* Logs visible to the user (transparency)

---

## 7) Idempotence, retries, robustness

### 7.1 Mandatory idempotence

* Every tool accepts `idempotency_key`
* Every connector execution (email, YouTube, banking) must prevent double send / double payment.

### 7.2 Normalized errors

* `INVALID_PARAMS`
* `UNAUTHORIZED`
* `POLICY_DENIED`
* `CONFIRMATION_REQUIRED`
* `EXTERNAL_SERVICE_ERROR`
* `TIMEOUT`

### 7.3 Compensation

* Non‑reversible: log + notify + remediation proposal.
* Reversible: rollback/undo via Command Bus.

---

## 8) Connectors (Gmail / Calendar / YouTube / Banking / etc.)

### 8.1 Rules

* A connector contains no complex business logic; it wraps the external API.
* Rules (habits, priorities, whitelists) live in **Policy / Tools**.

### 8.2 OAuth / tokens

* Secure storage
* Rotation/refresh
* Minimal scopes
* Scope usage logged

### 8.3 Banking / Open Banking

* Separate read (AIS) and payment (PIS)
* PIS → mandatory confirmation + SCA (bank‑dependent)
* Never store raw credentials

### 8.4 AI keys storage (per user)

Provider keys are stored per user as a `type: secret` atome.

* Keys are encrypted client-side before storage.
* Secrets are never committed to git.
* The UI selects a provider and saves the key to the user vault.
* Decryption happens locally before calling the provider API.

Suggested secret shape (particles):

```jsonc
{
  "provider": "openai|anthropic|mistral|google|deepseek",
  "payload": "{...encrypted...}",
  "created_at": "iso",
  "updated_at": "iso"
}
```

---

## 9) MCP tool design

### 9.1 Core rule

Expose **high‑level task‑oriented tools**, not raw CRUD endpoints.

### 9.2 Minimal set (v1)

**Calendar / tasks**

* `calendar.smart_schedule`
* `tasks.reschedule_incomplete`

**Email**

* `mail.summarize_inbox`
* `mail.draft_reply`
* `mail.send_reply` (policy‑gated)

**Banking**

* `bank.get_report`
* `bank.prepare_transfer`
* `bank.execute_transfer` (blocked without confirmation)

**YouTube + Atome**

* `atome.collect_assets`
* `youtube.upload_pipeline` (private/unlisted)
* `youtube.publish_public` (policy‑gated)

**General**

* `audit.get_recent_actions`

### 9.3 Standard tool return

Each tool returns:

* `status`: `OK | CONFIRMATION_REQUIRED | DENIED | ERROR`
* `result` (if OK)
* `proposal_id` (if confirmation)
* `human_summary`
* `machine_events` (events, ids)

---

## 10) Atome UI/UX for confirmations

### 10.1 Proposal inbox

* List of pending Proposals
* Clear detail: *who*, *what*, *impact*, *risk*
* Actions: Approve / Reject
* Methods: biometrics / passkey / 2FA

### 10.2 Notifications

* Push (mobile), toast (desktop)
* Direct links to proposal

---

## 11) Observability

* Metrics: auto vs confirmed actions, external errors, latency
* Traces: cross‑system `trace_id`
* Alerts: anomalies (e.g. email spikes)

---

## 12) Deployment modes

The system must support **voice-first control** and must run in:

* a **browser** (web client) talking to a **Fastify** backend,
* and **Tauri** (desktop/mobile) with local capabilities.

This implies a shared, transport-agnostic tool layer and consistent security semantics across environments.

### 12.1 Browser + Fastify (remote)

* A web client (PWA or standard web app) captures voice/text.
* Requests are sent to a **Fastify** service hosting:

  * the MCP Server (or MCP-compatible gateway),
  * Policy Engine,
  * Proposal Service,
  * Connectors (OAuth to external services),
  * Audit logging.
* Strong auth + rate limiting are mandatory.
* This mode is the default for cloud-dependent actions (Gmail/YouTube/Banking).

### 12.2 Tauri (local / hybrid)

* Tauri can host:

  * a local MCP server (stdio or local HTTP),
  * a local Policy Engine (subset or full),
  * local storage (vault, SQLite/libSQL),
  * optional local connectors when permitted.
* Tauri must support offline-first behavior where applicable:

  * queue tool calls,
  * create local Proposals,
  * sync audit and state when online.
* High-risk actions must keep the same confirmation semantics as remote.

### 12.3 Hybrid routing

* The client decides per tool call:

  * **local execution** (Tauri) when possible,
  * **remote execution** (Fastify) when needed.
* A single `trace_id` must follow calls across local/remote.

---

## 13) Voice control (voice-first requirements)

Everything exposed by this protocol must be controllable by **voice**, with the same safety guarantees as text input.

### 13.1 Voice pipeline (mandatory)

Add a voice front-end layer that converts speech into normalized tool calls:

1. **ASR** (speech-to-text) → transcript + timestamps + confidence
2. **NLU / Intent selection** → choose `tool_name`
3. **Parameter extraction** → JSON params
4. **Entity resolution** → map names to IDs (contacts, calendars, beneficiaries, channels, Atome assets)
5. **Confidence scoring** → `speech_confidence`, `entity_confidence`, `overall_confidence`

Output shape (minimum):

* `tool_name`
* `params`
* `confidence`
* `alternatives` (when ambiguous)

### 13.2 Voice clarification rules

* If **overall_confidence** is below a threshold, do **not** execute; ask a clarification question.
* If an entity match is ambiguous (e.g. two “Alex”), ask a disambiguation question.
* For multi-step operations, the system may ask short follow-ups to fill missing params.

### 13.3 Voice confirmation (read-back + binding)

For actions that require confirmation (banking, sensitive email send, public publish, destructive actions):

* The system must generate a **human-readable read-back**:

  * exact amount, beneficiary, date, privacy level, recipient, subject, etc.
* The user must confirm via voice (“confirm” / “cancel”) **and** the system must issue a confirmation token bound to:

  * `proposal_id`
  * `params_hash`
  * short TTL
* Platforms may require a second factor (passkey/biometrics/2FA) even if voice confirmed.

### 13.4 Voice-safe defaults

* Email: default to **draft** when confidence is not high or recipient is not whitelisted.
* YouTube: default to **private/unlisted** unless explicitly confirmed for public.
* Calendar and tasks: can be auto-executed within configured constraints.

---

## 14) Workflow examples

### 13.1 Calendar + tasks (auto)

1. `calendar.smart_schedule(prompt | voice)`
2. `tasks.reschedule_incomplete()`
3. `audit.get_recent_actions()`

### 13.2 Emails (auto + gating)

1. `mail.summarize_inbox()`
2. `mail.draft_reply(thread_id, intent)`
3. `mail.send_reply(draft_id)`

   * if `CONFIRMATION_REQUIRED` → `proposal.approve()` → `proposal.execute()`

### 13.3 Banking (always confirmed)

1. `bank.get_report()`
2. `bank.prepare_transfer(beneficiary_id, amount, reason)` → proposal
3. `proposal.approve()`
4. `bank.execute_transfer(proposal_id)`

### 13.4 Atome → YouTube

1. `atome.collect_assets(type="video", criteria=...)`
2. `youtube.upload_pipeline(queue, privacy="unlisted")`
3. Optional: `youtube.publish_public(video_id)` → proposal

---

## 14) Technical backlog (what must be built)

### 14.1 Core

* [ ] MCP Server (tool registry + schema validation)
* [ ] Tool Runner (timeouts, retries, idempotence)
* [ ] Policy Engine v1 (rules + whitelists + anomalies)
* [ ] Proposal Service (storage + lifecycle + UI hooks)
* [ ] Audit Log (append‑only)
* [ ] ADOLE / Command Bus internal endpoints (dispatch + dry_run)

### 14.2 Connectors

* [ ] Gmail (read, draft, send)
* [ ] Calendar (free slots, create/move)
* [ ] YouTube (upload, metadata, publish)
* [ ] Banking (open banking provider + AIS/PIS) or pluggable abstraction

### 14.3 Atome UI

* [ ] Proposal Inbox + Approval Flow
* [ ] Settings: whitelists, limits, time windows
* [ ] Audit viewer

---

## 15) Annexes (to be defined later)

* Syntax / DSL to declare Atome tools (flexible, modular)
* Tool naming conventions
* Official JSON schemas (tool params/returns, proposal, audit)
* Storage strategy (SQLite / libSQL) and replication

---

## 16) v1 Definition of Done

v1 is considered complete when:

* an agent can:

  * smart‑schedule a meeting,
  * summarize emails and send a reply (with gating),
  * prepare a bank transfer (proposal) and execute it after confirmation,
  * upload an Atome video to YouTube (private/unlisted),
* everything is auditable,
* idempotence works,
* the policy engine correctly blocks risky actions.
