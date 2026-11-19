// Two accounts on one isolated server: a message sent to an offline person is pushed once at their next connection,
// kept once in their message stack, marked read, and still read at the connection after. The server is atome-server
// with its Rust vault supervisor, from the binaries already built (tests/helpers/probe_server.mjs).
import assert from 'node:assert/strict';
import { connectUser, makeContacts, sleep, startServer } from '../helpers/probe_server.mjs';

const server = await startServer();
try {
    const alice = await connectUser(server, { phone: `+33992${String(process.pid % 50000).padStart(5, '0')}`, name: 'communication_alice' });
    const bob = await connectUser(server, { phone: `+33993${String(process.pid % 50000).padStart(5, '0')}`, name: 'communication_bob' });
    // A message goes between contacts only.
    await makeContacts(alice, bob);
    bob.close();
    const messageId = `communication_hello_${Date.now()}`;
    // A message (a publication is no message since R-190: only the News broadcast makes one, message_guard.rs).
    const response = await alice.call({
        type: 'direct-message',
        toUserId: bob.id,
        message: JSON.stringify({
            command: 'eve-comm-share',
            params: { id: messageId, subject: '', message: 'Hello', kind: 'message' }
        })
    });
    assert.equal(response.success, true, JSON.stringify(response));
    assert.equal(response.queued, true, JSON.stringify(response));
    alice.close();

    const firstReconnect = await connectUser(server, { session: bob });
    await firstReconnect.waitFor((entry) => entry.type === 'console-message');
    await sleep(150);
    const pushed = firstReconnect.inbox.filter((entry) => entry.type === 'console-message');
    assert.equal(pushed.length, 1, JSON.stringify(firstReconnect.inbox));
    const stackResponse = await firstReconnect.call({
        type: 'atome', action: 'get', atome_id: bob.id, token: bob.token
    });
    const user = stackResponse.atome || stackResponse.data?.atome || stackResponse.data;
    const stack = user?.properties?.message_stack || user?.data?.message_stack || [];
    const matching = stack.filter((entry) => entry.id === messageId || entry.message_id === messageId);
    assert.equal(matching.length, 1, JSON.stringify(stack));
    assert.equal(matching[0].message, 'Hello');
    assert.equal(matching[0].subject || '', '');
    assert.equal(matching[0].unread, true);
    const markedRead = await firstReconnect.call({
        type: 'notification-stack', action: 'update', notificationId: messageId,
        patch: { unread: false }
    });
    assert.equal(markedRead.success, true, JSON.stringify(markedRead));
    firstReconnect.close();

    const secondReconnect = await connectUser(server, { session: bob });
    const repeated = await secondReconnect.call({
        type: 'atome', action: 'get', atome_id: bob.id, token: bob.token
    });
    const repeatedUser = repeated.atome || repeated.data?.atome || repeated.data;
    const repeatedStack = repeatedUser?.properties?.message_stack || repeatedUser?.data?.message_stack || [];
    assert.equal(repeatedStack.filter((entry) => entry.id === messageId || entry.message_id === messageId).length, 1);
    assert.equal(
        repeatedStack.find((entry) => entry.id === messageId || entry.message_id === messageId)?.unread,
        false
    );
    secondReconnect.close();
    console.log('communication_two_user_server: PASS');
} finally {
    await server.stop();
}
