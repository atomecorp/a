// A live device session whose account this server does not hold opens nothing on /ws/api: every family answers
// remote_account_not_provisioned (atome-server src/ws_api/identity.rs#principal_of, `provisioned`: a `user` atome in
// the central base), the communication families their own communication_auth_unavailable (ws_api/message_ops.rs,
// the code adole_apis.js reads), on a real, isolated server (tests/helpers/probe_server.mjs). A bare JWT with no device session
// is refused before that, auth_session_invalid (auth/mod.rs#assert_device_session). The /ws/sync side is
// tests/atome_server/ws_sync.rs.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { connectUser, startServer } from '../helpers/probe_server.mjs';

const server = await startServer();
try {
    const phone = `+33995${String(process.pid % 50000).padStart(5, '0')}`;
    const person = await connectUser(server, { phone });
    const token = person.token;
    assert.equal((await person.call({ type: 'auth', action: 'me', token })).success, true, 'the account answers first');

    // The account leaves this server's base while its device session stays live (an account held elsewhere).
    const base = new DatabaseSync(path.join(server.dir, 'adole.db'));
    base.exec('PRAGMA busy_timeout = 5000');
    const gone = base.prepare("UPDATE atomes SET deleted_at = datetime('now') WHERE atome_id = ? AND atome_type = 'user'")
        .run(person.id);
    base.close();
    assert.equal(gone.changes, 1, 'the account atome was in the base');

    const families = [
        { type: 'sync', action: 'pull', token },
        { type: 'share', action: 'create', atome_id: 'missing-atome', principal_id: person.id, token },
        { type: 'state-current', action: 'list', atome_type: 'user', token },
        { type: 'file', action: 'download-info', file_id: 'missing-file', token }
    ];
    for (const payload of families) {
        const response = await person.call(payload);
        assert.equal(response.error, 'remote_account_not_provisioned', `${payload.type}: ${JSON.stringify(response)}`);
    }
    const message = await person.call({ type: 'direct-message', toUserId: crypto.randomUUID(), message: 'blocked', token });
    assert.equal(message.error, 'communication_auth_unavailable', JSON.stringify(message));
    person.close();
    console.log('remote_account_not_provisioned_ws_runtime_probe: PASS');
} finally {
    await server.stop();
}
