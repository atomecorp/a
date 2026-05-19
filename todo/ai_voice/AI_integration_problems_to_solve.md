# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

# eVe AI Integration Problems To Solve

This document is the recovery and execution brief for the eVe voice / AI / tools integration work.

It is meant to let another engineer or agent understand, without prior context:

- what the product is supposed to achieve
- what is currently broken
- why regressions keep coming back
- what architectural changes are still required
- which constraints are non-negotiable
- which files are central to the work

Last reference update: 2026-03-23.

## Product Goal

The target is not a command-based assistant with hardcoded routines.

The target is a real general-purpose LLM-powered assistant that:

- understands natural user requests in voice and text
- knows which capabilities are available
- decides when to answer directly and when to use a tool
- executes the requested action without unnecessary confirmation
- speaks back using the real execution result

In practice, eVe must be able to handle requests such as:

- `Do I have new emails?`
- `Do I have messages from people other than Jean-Eric?`
- `What does this email say?`
- `Read me the oldest email`
- `Reply that everything is fine`
- `Archive it`
- `Delete it`
- `Search for mails from Paul`
- `Is Babeth in my contacts?`
- `Create an appointment tomorrow at 3pm`
- `Create an Atome object`

The user must not need to learn rigid command phrasing.

## Non-Negotiable Product Rules

- eVe must behave like a real LLM, not a fixed command router.
- No silent fallback should transform the user's request into a different request.
- No implicit confirmation should be asked unless the user explicitly asked for confirmation.
- If an action is executable, it should be executed directly.
- If an action fails, the failure must be explicit and truthful.
- eVe must not say placeholder sentences such as `I am checking`, `I am preparing`, `Done`, or equivalent unless there is a real result behind them.
- All business actions must return real user-facing output based on real execution results.
- The implementation must stay cross-platform.
- No solution must rely on a macOS-only behavior unless it is behind a proper platform abstraction.

## System Preferences / User Preferences Requirement

This is a required part of the scope.

Mail configuration must not live in code, and it must not rely on hidden developer fallbacks.

The source of truth for user-facing credentials and service configuration must be the eVe user preferences system inside Rêve.

More specifically:

- the email address must come from the user preferences UI
- the mail password must come from the user preferences UI
- mail settings must be centralized in the existing user preferences area
- this belongs in the existing user panel / preferences panel, not in an ad hoc dialog
- configuration must be persisted and reusable by the runtime
- runtime code must not depend on the settings panel being open

The desired UX is:

- the user opens the existing eVe / Rêve preferences
- the user enters email and password there
- eVe uses those settings consistently for mail features

Where domain-specific defaults are safe and explicit, they may be inferred.

Example:

- for `@atome.one` accounts, shared IMAP / SMTP host defaults may be inferred

But this inference must be implemented cleanly as provider configuration, not as a hidden patch.

## Native Data Integration Requirement

This also needs to be explicit in scope.

eVe should ideally be able to access the user's real platform data sources for:

- mail
- contacts
- calendar / appointments

This must be designed in a cross-platform way.

### macOS target

On macOS, the system should ideally be able to access:

- Apple Mail compatible accounts or synchronized mail access through standard protocols
- Apple Contacts data
- Apple Calendar data

### Windows target

On Windows, the system should ideally be able to access:

- standard mail sources or configured mail accounts
- system or account-level contacts
- calendar data

### Cross-platform rule

The implementation must not become a macOS-only feature set.

The correct model is:

- define a standard internal contract for `mail`, `contacts`, `calendar`
- provide per-platform adapters behind that contract
- keep the voice / AI / orchestration layers platform-agnostic

In other words:

- the voice and orchestration layers ask for `mail.list`, `contacts.search`, `calendar.create`, etc.
- adapters decide whether the data comes from:
  - IMAP / SMTP / CardDAV / CalDAV
  - Apple platform integration
  - Windows platform integration
  - other standard connectors

## MCP / Tooling Direction

The strategic direction remains:

- everything business-related should be exposed as tool capabilities
- the LLM should reason over available tools
- tool execution should be deterministic

The preferred direction is to move business features into clean MCP-like tools or a tool contract equivalent to MCP.

That means:

- `mail.list`
- `mail.query`
- `mail.read`
- `mail.summarize`
- `mail.reply`
- `mail.send`
- `mail.archive`
- `mail.delete`
- `mail.mark_read`
- `mail.mark_unread`
- `contacts.search`
- `contacts.read`
- `contacts.create`
- `calendar.list`
- `calendar.read`
- `calendar.create`
- `calendar.update`
- `calendar.delete`
- Atome runtime tools

The LLM should interpret first, then select the tool.

It should not be forced into a pre-baked business route too early.

## Why The Current System Still Fails

The main issue is architectural, not a single isolated bug.

The system is still partially hybrid:

- some intent understanding is heuristic
- some planning is LLM-based
- some business execution is deterministic
- some runtime transport depends on Tauri / browser / local server state

As a result, bugs appear in multiple layers that look similar from the UI:

- semantic bug
- session memory bug
- transport bug
- execution bug
- UI response bug

The user experiences all of them as: `it broke again`.

## Root Problems Identified

### 1. Semantic representation is still too weak

The system still loses meaning between user utterance and business execution.

Examples of semantics that need to survive as first-class fields:

- `read_state = unread | read | any`
- `from`
- `not_from`
- `mailbox`
- `thread_id`
- `order = oldest | newest`
- `scope = current_result_set | inbox | all`
- `target = current | selected | explicit id`

Without this, follow-up phrases degrade.

Typical failures seen:

- `other than Jean-Eric` being turned into an unread-only question
- `read emails` vs `unread emails` not being switched correctly
- `this email` not pointing to the correct current item
- `the oldest one` not selecting by actual temporal order

### 2. Session memory is too shallow

The runtime currently stores an `active_intent`, but that is not enough.

For natural multi-turn behavior, the assistant must remember:

- current selected mail id
- current selected contact id
- current selected event id
- current mail result set ids
- active mail filters
- active ordering
- active scope
- current thread if relevant

Without a real working set, follow-ups become guesswork.

### 3. Business routing still happens in too many places

Mail behavior is currently spread across:

- voice intent schema
- voice orchestrator
- mail bootstrap
- mail service
- mail local index
- runtime/session state

This creates recurring regressions because one layer is fixed while another still behaves differently.

### 4. Transport/runtime detection is fragile in Tauri

A recurring issue has been:

- the mail API being resolved against a partial environment
- the runtime not finding the correct loopback sync endpoint
- the system falling back to `mail_connector_unavailable`

This is not a user-language problem.

It is a runtime resolution problem.

### 5. UI-level fallback responses can hide real failures

Any path that produces:

- `executed: true` without a meaningful reply
- generic replies like `Done`
- placeholder replies like `I am checking`

must be considered structurally unsafe.

The assistant must speak from real structured results only.

## What Has Already Been Improved

This section is intentionally high level. Detailed git history should be consulted for exact diffs.

### Voice / STT / TTS

There is now an end-to-end pipeline:

- microphone to STT
- partial / final transcript handling
- transcript to orchestrator
- orchestrator to action or reply
- reply to TTS

The voice stack is far less broken than at the start.

### Mail execution

Several major fixes have already been implemented:

- direct reply flows can send immediately when the user dictated content
- implicit confirmations were reduced
- read actions can mark mail as read
- MIME / quoted-printable decoding has been improved
- shared `@atome.one` mail host defaults are inferred
- user preferences are now part of the intended mail configuration source
- sender exclusion and ordering have started to be modeled

### Bootstrap / transport

Several fixes were already attempted and partially improved:

- Tauri/browser transport resolution
- loopback origin fallback
- local server sync endpoint targeting
- env resolution fixes between orchestrator and mail bootstrap

These areas are still sensitive and remain part of the unfinished work.

## What Is Still Broken Or Incomplete

### A. Mail still has recurrent regressions

Observed recurring failures:

- `mail_connector_unavailable` in real Tauri sessions
- wrong message selected for `current mail`
- wrong message selected for `oldest`
- summaries sometimes targeting a set of mails instead of the selected mail
- follow-up instructions reusing the wrong prior filters

### B. STT robustness remains imperfect

Voice recognition may produce misspelled transcripts such as:

- `plsu ancien`
- `nion lues`
- `noueavu`

The system needs a generic robustness strategy for noisy STT, not a long list of manual phrase patches.

### C. Tool routing is still not fully unified

The system is not yet fully `LLM interprets -> tool executes -> result speaks back`.

There are still traces of:

- heuristic intent-first behavior
- planner-first behavior
- deterministic connector fallback

This must be unified.

### D. Cross-platform data access is not complete

We still need a proper plan and implementation for:

- Apple contacts / calendars / possibly mail related platform integration
- Windows contacts / calendars / mail related integration
- standard protocol-based connectors when native platform APIs are not appropriate

## Files That Matter Most

### Voice understanding / orchestration

- [/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/voice/intent_schema.js](/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/voice/intent_schema.js)
- [/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/voice/orchestrator.js](/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/voice/orchestrator.js)
- [/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/voice/session_runtime.js](/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/voice/session_runtime.js)
- [/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/voice/service.js](/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/voice/service.js)
- [/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/voice/bootstrap.js](/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/voice/bootstrap.js)
- [/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/voice/home_surface.js](/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/voice/home_surface.js)

### Mail

- [/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/mail/bootstrap.js](/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/mail/bootstrap.js)
- [/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/mail/service.js](/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/mail/service.js)
- [/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/mail/local_index.js](/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/mail/local_index.js)
- [/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/mail/runtime_preferences.js](/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/mail/runtime_preferences.js)
- [/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/mail/node_protocol_clients.js](/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/mail/node_protocol_clients.js)
- [/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/mail/icloud_connector.js](/Users/jean-ericgodard/RubymineProjects/a/src/squirrel/mail/icloud_connector.js)

### User preferences / profile

- [/Users/jean-ericgodard/RubymineProjects/a/eVe/intuition/tools/user.js](/Users/jean-ericgodard/RubymineProjects/a/eVe/intuition/tools/user.js)
- [/Users/jean-ericgodard/RubymineProjects/a/eVe/domains/user/profile_api.js](/Users/jean-ericgodard/RubymineProjects/a/eVe/domains/user/profile_api.js)
- [/Users/jean-ericgodard/RubymineProjects/a/eVe/i18n/languages.js](/Users/jean-ericgodard/RubymineProjects/a/eVe/i18n/languages.js)

### Server / Tauri transport

- [/Users/jean-ericgodard/RubymineProjects/a/server/mailRoutes.js](/Users/jean-ericgodard/RubymineProjects/a/server/mailRoutes.js)
- [/Users/jean-ericgodard/RubymineProjects/a/scripts/axum_mail_sync_bridge.mjs](/Users/jean-ericgodard/RubymineProjects/a/scripts/axum_mail_sync_bridge.mjs)
- [/Users/jean-ericgodard/RubymineProjects/a/src-tauri/src/server/mod.rs](/Users/jean-ericgodard/RubymineProjects/a/src-tauri/src/server/mod.rs)

### Product notes / debug context

- [/Users/jean-ericgodard/RubymineProjects/a/eVe/documentations/debug_UI.md](/Users/jean-ericgodard/RubymineProjects/a/eVe/documentations/debug_UI.md)

## Required Architecture Direction

This is the intended end state.

### 1. Single semantic contract

We need a single structured request model for mail, and then the same pattern for contacts and calendar.

Example shape:

```json
{
  "domain": "mail",
  "operation": "list|read|summarize|reply|send|archive|delete|mark_read|mark_unread|search",
  "target": {
    "kind": "current|selected|query|thread|message_id"
  },
  "filters": {
    "read_state": "read|unread|any",
    "from": ["..."],
    "not_from": ["..."],
    "mailbox": "inbox|archive|trash",
    "thread_id": "...",
    "query_text": "...",
    "order": "oldest|newest",
    "limit": 10
  },
  "scope": "current_result_set|mailbox|all",
  "draft": {
    "reply_text": "...",
    "auto_send": true
  }
}
```

### 2. Single business execution path

The voice stack must not execute business behavior through several competing paths.

The correct sequence is:

1. understand
2. produce structured request
3. execute one business action
4. return structured result
5. speak based on real result

### 3. Session working memory

The session runtime must store:

- current selected item ids
- current filtered result set ids
- active filters
- active sort order
- active scope

This is required for natural follow-up behavior.

### 4. Strict transport abstraction

The runtime must cleanly separate:

- voice orchestration
- tool selection
- business execution
- transport / connector access

Tauri/browser/Node specifics must not leak upward into semantic behavior.

## Recommended Implementation Order

### Phase 1. Stabilize mail semantics

- define the single internal mail semantic contract
- stop spreading meaning across multiple ad hoc fields
- rewrite mail-specific orchestration around this contract

### Phase 2. Stabilize session memory

- store current result set ids
- store active filters and order
- use this state for `this mail`, `the oldest`, `the next one`, `the others`

### Phase 3. Stabilize transport

- make runtime mail resolution deterministic in Tauri
- remove dependence on partial envs
- ensure mail config is resolved from the Rêve / eVe preferences source of truth

### Phase 4. Add robust STT interpretation layer

- add generic tolerance for noisy STT
- do not implement phrase-by-phrase hacks
- normalize near-miss wording before semantic parsing where justified

### Phase 5. Extend the same architecture to contacts and calendar

- same semantic model pattern
- same deterministic execution pattern
- same session working memory pattern

### Phase 6. Extend to Atome runtime tools

- keep Atome runtime tool access under the same model
- LLM selects the right tool, not a brittle heuristic router

## Testing Requirements

Unit tests alone are not enough.

We need three layers of validation.

### 1. Semantic tests

Examples:

- `other than Jean-Eric`
- `read emails`
- `unread emails`
- `this mail`
- `the oldest one`
- `summarize this mail`
- `reply to it`

### 2. Orchestrator tests

Examples:

- multi-turn flows
- current item persistence
- ordering changes
- sender filter changes
- result set narrowing / widening

### 3. Real E2E tests in Tauri

Must include:

- fresh startup
- real port 3000 exposure
- preferences-based credentials
- voice session startup
- real mail sync
- read / summarize / reply / archive / delete flows
- contacts and calendar flows
- partial or noisy STT-like input

Every real production bug should become a non-regression test.

## What Success Looks Like

The work is complete only when:

- eVe behaves like a real tool-using LLM
- user phrasing can stay natural
- multi-turn context stays coherent
- mail / contacts / calendar actions are reliable
- no hidden fallbacks distort the request
- no unnecessary confirmations block the user
- no fake placeholder replies are spoken
- settings come from the proper Rêve / eVe preferences flow
- platform integrations are designed behind clean abstractions
- Tauri E2E runs are repeatably green

## Short Prompt Summary For Another Agent

The mission is to refactor eVe into a real general-purpose, tool-using voice assistant. It must understand natural requests, use structured tool capabilities for mail, contacts, calendar, and Atome runtime actions, and answer based on actual execution results. The current failures come from a hybrid architecture where semantics, session state, business routing, and Tauri/browser transport are still too fragmented. Mail configuration must come from the existing Rêve / eVe preferences system, not from hardcoded values or hidden fallbacks. The implementation must stay cross-platform and should ideally support real platform data integration for Apple and Windows contacts/calendar/mail through proper adapters behind a unified internal contract.
