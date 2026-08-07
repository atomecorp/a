# Communication panel — MCP command ledger

Date: 2026-08-07
Status: `in_review` — required before product-owner approval of Package 13.

The rule this satisfies is in `bevy_panel_migration_guide.md`, *Mandatory MCP
command mapping at panel creation*: a panel function is complete only when the
same canonical command can be invoked from the visible panel **and** by an AI
through MCP, preferring `runtime.tools.call` / `runtime.tools.batch_call` when
a runtime V2 tool exists.

## Panel-level entry points

| Function | Canonical runtime tool | MCP entrypoint | Capability / policy | Audit |
|---|---|---|---|---|
| Open the panel | `ui.comm.panel` (`tool_runtime_bootstrap.js:67`, def `tool_runtime_bootstrap_defs_a.js:200`) | `runtime.tools.call { tool_id: 'ui.comm.panel', event: 'open' }` | none | ✅ complete — the bootstrap handler routes to `open_comm_panel`, which the bridge exports under the exact name `panel_definitions.js` declares |
| Close the panel | same | `runtime.tools.call { tool_id: 'ui.comm.panel', event: 'close' }` | none | ✅ complete |
| Toggle from the main menu | `tool.main.communicate` (`tool_runtime.js:134` → `panel_tool_id: 'ui.comm.panel'`) | `runtime.tools.call { tool_id: 'tool.main.communicate' }` | none | ✅ complete |

## Notification functions

| Function | Canonical owner | MCP entrypoint | Capability / policy | Audit |
|---|---|---|---|---|
| List notifications | `communication_notifications.js` → `syncNotificationStack` / `fetchNotificationStack`, both exported by the bridge | `communication.list` (`mcp_handlers_communication.js:16`) | authenticated user; `isAuthenticatedUser()` gates intake | ✅ complete |
| Search notifications | same stack | `communication.search` (`:19`) | authenticated user | ✅ complete |
| Read one notification | same stack | `communication.read` (`:22`) | authenticated user | ✅ complete |
| Mark read | `updateNotificationStackItem(id, { unread: false })` | **gap** — no MCP verb | authenticated user | ⚠️ **incomplete**: the panel intent `comm.notification.read` reaches the canonical owner, but no MCP command exposes it. Needs a `communication.mark_read` handler delegating to the same function. |
| Accept a request | `communication_actions.js` → `handleAction('accept', item)` → `ShareAPI` / `AdoleAPI.sharing` | **gap** — no MCP verb | share ownership checked by `resolveShareableAtomeIds` on the sender side; acceptance validated server-side against the request ref | ⚠️ **incomplete**: needs `communication.respond { id, action }` over `handleAction`. |
| Refuse a request | same | **gap** | same | ⚠️ **incomplete**, same handler |
| Archive | same | **gap** | authenticated user | ⚠️ **incomplete**, same handler |

## Compose and send functions

| Function | Canonical owner | MCP entrypoint | Capability / policy | Audit |
|---|---|---|---|---|
| Draft a reply | `commRuntime.setReply` / `setReplyAttachments` | `communication.reply_draft` (`:25`) | authenticated user; throws `communication_message_id_missing` without a target | ✅ complete |
| Send | the `eve-comm-send` pipeline in `communication_events.js` | `communication.send` (`:49`) | recipients classified through `classifyRecipients` with `loadAcceptedRelationships()`; private users never accepted are rejected. Attachment ids filtered against the current project and `project`-typed records, then through `resolveShareableAtomeIds` | ✅ complete |
| Set recipients | `commRuntime.setRecipients` (also `window.eveCommSetRecipients`) | covered by `communication.send { recipients }` | same classification | ✅ complete |
| Add a manual recipient | `addRecipientFromDraft` → `recordManualRecipient` | covered by `communication.send { recipients }` | local relationship store only | ✅ complete |
| Attach / detach atomes | `commRuntime.setAttachments` / `addAttachments` (also `window.eveCommSetAttachments`, `eveCommAddAttachments`) | covered by `communication.send { atomeIds }` | `resolveShareableAtomeIds` refuses ids the sender cannot share and emits `eve-comm-error` | ✅ complete |
| Drop an atome onto the composer | `getDropAttachment` → same attachment path | not applicable — a pointer gesture, its effect is the attachment path above | ✅ complete |
| Share mode (realtime / one shot / copy) | `resolveCommShareConfig` in `bevy_panel_comm_model.js` | covered by `communication.send { mode }` | server maps `real-time`→`linked`, `manual`→`copy` | ✅ complete |
| Start / End schedule | `commState.advanced.startDate/endDate/…Duration` | **partial** — `communication.send` forwards `duration` from `endDuration` only | none | ⚠️ **incomplete**: `startMode`, `startDate`, `startDuration` and `endDate` are collected by the panel and never reach the wire. This predates the migration; the panel now holds them in one canonical place, which is what a fix would need. |
| Conditions | `commState.advanced.conditions` | **partial** — `communication.send` forwards `condition` as a joined string | none | ⚠️ **incomplete**: the rows are state-backed for the first time (D5), so `condition` stops being unconditionally `null`; the wire format is still a flat join and needs a typed shape. |
| Read / Write property scopes | `commState.advanced.readProps` / `writeProps` | **gap** — not sent | none | ⚠️ **incomplete**: collected by the panel, never transmitted. Pre-existing. |
| Visio | dispatches `eve-comm-visio` | **gap** — nothing listens | none | ⚠️ **blocked on a product decision** (D3 in the surface freeze): implement a visio entry point or remove the control. |

## Search function

| Function | Canonical owner | MCP entrypoint | Capability / policy | Audit |
|---|---|---|---|---|
| Search from the panel | `window.__eveFinder.quickSearch` → `ui.find.panel` | `runtime.tools.call { tool_id: 'ui.find.panel' }` | none | ✅ complete — the panel no longer clones a DOM tool; it calls Finder's canonical entry point, so panel and MCP share one owner |

## Summary

11 functions are complete. **7 gaps are recorded, and 6 of them predate this
migration**: the missing mark-read / respond / archive MCP verbs, the start
schedule and property scopes that the panel collects but never sends, and the
untyped condition format. They are listed here rather than left implicit,
because the guide requires the ledger to be complete before approval — not that
every gap be closed inside the panel package. The seventh, Visio, is a product
decision.

Closing the three notification verbs is the smallest useful next step: they map
onto functions that already exist (`updateNotificationStackItem`, `handleAction`)
and need only a handler in `mcp_handlers_communication.js`.
