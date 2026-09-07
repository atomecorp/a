# Native Undo/Redo without the legacy panel

## Confirmed causes

Cmd-Z had no handler because the keyboard binding belonged to the unloaded
legacy HTML Undo panel. Tool handlers also discarded canonical failure results.
The persisted timeline could retry a transaction already undone, and native
reconnect state bootstrap events appeared as unidentifiable user edits.

## Canonical correction

Default shortcuts route Cmd/Ctrl-Z and Shift-Z through the existing tool gateway.
The legacy keyboard listener and direct-undo global are removed. Tool handlers
return actual outcomes. Undo refreshes the journal and reconstructs transaction
eligibility, treating canonical remote-state-bootstrap identities as state
transport, not user edits. A real edit without a transaction identity remains
an explicit error; it must never cause an unrelated older edit to be undone.

## Evidence

Missing shortcuts, repeated undo and bootstrap eligibility each had failing
regression tests before correction. See tests/eve/history_shortcuts.test.mjs and
tests/eve/timeline_undo_source.test.mjs. In the final Mac bundle, real Cmd-Z,
Cmd-Shift-Z and Cmd-Z produced the expected canonical transaction IDs and
restored the test baseline. Matrix and List depth drags were undone through the
same keyboard path. The native history pipeline also has transaction/preimage,
authorization, idempotency, persistence and conflict tests.

## Native acceptance

Use a specific reversible edit in the real project. Read its transaction
identity immediately before invoking Undo, verify the exact history event,
then Redo and restore. Preserve account state and do not blindly undo an unknown
latest transaction. Repeat after a reconnect with state bootstrap records.
