# Private-vault history omitted by the Web gateway

Confirmed during the interaction campaign on 2026-09-08: a real curve edit
persisted, but Cmd-Z loaded an empty journal. `handleEvents` obtained events
from the authenticated principal's vault and then filtered them using the
directory database's property ACL. That database does not own these objects.
History commands also looked up the source transaction in the directory DB.

The existing vault router now owns history routing as it already owns commits
and state reads. Its events listing is restricted to the authenticated owner's
database. The worker runs the existing `executeAtomeHistoryCommand`, retaining
canonical preimages, version checks, transaction identity and redo. The gateway
publishes the resulting committed events through its existing sync runtime.
No client-side snapshot rewrite or second history engine was added.

Separately, the client history eligibility contract now recognizes completed
gesture transactions. Start/frame events remain replay-only until gesture end.

Regression: `tests/server/user_vault_provider.probe.mjs` exercises actual
WebSocket handlers and isolated vault workers: journal read, whole-gesture
undo/redo and refusal of another principal's transaction. It passes.
`tests/eve/timeline_undo_source.test.mjs` covers completed-gesture eligibility.
Web vector_history_isolated_origin passes exact curve Cmd-Z and Cmd-Shift-Z
restoration with real pointers and shortcuts on the corrected isolated server
(interaction.localhost:3002). The existing port 3001 process was not restarted;
it must load the changed modules during its next normal restart.

## Structural preimage repair

The next real Molecule undo exposed a separate canonical preimage defect:
parent_id was looked up in particles although it belongs to atomes metadata.
Undo removed Molecule properties but left the children parented to that owner.
Event preparation now reads the identity before mutation. Parent/type preimages
use that identity, and a newly created identity is explicitly recorded as absent.
History undo/redo therefore emits canonical delete/restore for new identities,
in addition to reversing member properties and parents. The isolated vault test
passes complete wrap undo/redo and verifies both parents and deletion state.
Older journal rows without these identity preimages cannot gain missing creation
metadata retroactively; no speculative reconstruction is performed.

## Large journals and latest transaction visibility — 2026-09-09 Web

On the reported project, Undo requested 5,000 events (about 29 MB) and hit the
10-second vault IPC timeout. The worker's response arrived, but the socket
reader appended each chunk to one string and rescanned the whole accumulated
string. `server/userVaultProvider.js` now collects chunks and searches each new
chunk for the line terminator, joining only once. The isolated UTF-8 large
response regression is `tests/server/user_vault_large_response.probe.mjs`.
The actual project history request completed in about 1.7 seconds afterward.

A second defect remained: the first 5,000 events did not include the newest
transaction. `loadTimelineJournal` in `atome_timeline_history_contract.js`
now pages the existing journal API in batches of 1,000 up to its requested
time boundary. The history owner uses that same loader for all journal reads.
The focused test includes an undoable transaction beyond 6,000 prior events.
Actual Web Cmd-Z / Cmd-Shift-Z restored the nested row order; Cmd-Z also
restored the default text duration after a real clip-extension gesture.
The port 3001 server was restarted with this repair during this campaign.
