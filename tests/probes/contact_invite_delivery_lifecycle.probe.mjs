import assert from 'node:assert/strict';
import { installContactInviteDelivery } from '../../eVe/intuition/tools/contact_invite.js';
import { getSessionState, setSessionState } from '../../atome/src/squirrel/apis/unified/adole_api/session.js';

// Importing the operation in a headless consumer must not install a UI runtime.
assert.equal(installContactInviteDelivery(null), null);
const host = () => {
    const listeners = new Map();
    return {
        addEventListener(name, callback) {
            const group = listeners.get(name) || new Set();
            group.add(callback); listeners.set(name, group);
        },
        removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
        dispatchEvent(event) { for (const callback of listeners.get(event.type) || []) callback(event); return true; },
        count: () => [...listeners.values()].reduce((sum, group) => sum + group.size, 0)
    };
};
const first = host(), second = host();
let previous = () => {};
for (let cycle = 0; cycle < 100; cycle++) {
    const release = installContactInviteDelivery(first);
    assert.equal(installContactInviteDelivery(first), release);
    previous();
    assert.equal(first.count(), 3, 'an obsolete release cannot detach the current subscription');
    const releaseOther = installContactInviteDelivery(second);
    assert.equal(first.count(), 0, 'a replacement target releases the previous host');
    assert.equal(second.count(), 3);
    release();
    assert.equal(second.count(), 3);
    releaseOther(); releaseOther();
    assert.equal(second.count(), 0);
    previous = release;
}
// Each existing reconnect event still starts the canonical outbox scan. An empty
// fake outbox exercises subscription wiring without sending any invitation.
const previousWindow = globalThis.window, previousSession = getSessionState();
let reads = 0;
const connected = host();
connected.Atome = { listStateCurrent: async () => { reads++; return []; } };
try {
    globalThis.window = connected;
    setSessionState({ mode: 'authenticated', user: { id: 'invite_probe' } }, { persist: false, silent: true });
    const release = installContactInviteDelivery(connected);
    for (const name of ['online', 'squirrel:auth-transport-open', 'squirrel:user-logged-in']) {
        const before = reads;
        connected.dispatchEvent(new Event(name));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(reads, before + 1, `${name} starts one outbox scan`);
    }
    release();
    connected.dispatchEvent(new Event('online'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 3, 'released subscriptions no longer scan');
} finally {
    installContactInviteDelivery(connected)?.();
    setSessionState(previousSession, { persist: false, silent: true });
    globalThis.window = previousWindow;
}
console.log('contact_invite_delivery_lifecycle: PASS (100 cycles, 3 reconnect events, no invitation sent)');
