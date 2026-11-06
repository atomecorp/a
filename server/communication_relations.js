// Person-to-person relations — first contact and block — are the Rust front's
// (atome/servers/atome-server/src/social/relations.rs, with its request guard and the
// address-book fingerprint): Fastify's services reach them through SERVICE frames on the
// supervisor's control socket (`relations:<operation>`). An accepted request's note is made
// the conversation's first message there; the peer told (`notify`) comes back as effects
// carried out here in order before the answer, and a request's answer still leaves after
// the guard's floor.

// The guard's floor (request_guard.rs FLOOR_MS): the time taken never tells whether a number has an account.
const CONTACT_REQUEST_FLOOR_MS = 400;

export function createCommunicationRelations({
    provider,
    notify = async () => {},
    // `readCard(peerId)` -> { display_name, user_face } as the peer shares them, or null.
    readCard = async () => null
}) {
    const ask = (operation, payload) => provider.service(`relations:${operation}`, payload);

    const carry = async ({ result, effects }) => {
        for (const effect of effects) {
            if (effect.effect !== 'notify') throw new Error('relation_effect_unknown');
            await notify(effect.target, effect.sender, effect.notification);
        }
        return result;
    };
    // Each accepted contact by the name and photo they share on their card (none when they share none).
    const withPeople = async (result) => {
        const people = [];
        for (const peer of result.contacts) {
            const card = await readCard(peer).catch(() => null);
            if (card?.display_name) people.push({ principal_id: peer, display_name: card.display_name, user_face: card.user_face || '' });
        }
        return { ...result, people };
    };
    const settled = async (run) => {
        const started = Date.now();
        try { return await run(); } finally {
            const wait = started + CONTACT_REQUEST_FLOOR_MS - Date.now();
            if (wait > 0) await new Promise((done) => setTimeout(done, wait));
        }
    };
    const decide = async (operation, payload) => carry(await ask(operation, payload));
    const pair = (owner, peer) => ({ owner: owner ?? null, peer: peer ?? null });

    const canCommunicate = (senderId, recipientId) => decide('can-communicate', { sender: senderId ?? null, recipient: recipientId ?? null });
    const blockedEitherWay = (a, b) => decide('blocked-either-way', { a: a ?? null, b: b ?? null });
    const hasBlocked = (ownerId, peerId) => decide('has-blocked', pair(ownerId, peerId));
    const request = (senderId, targetId, { note = '', phone = '' } = {}) => settled(() => decide('request',
        { sender: senderId ?? null, target: targetId ?? null, note, phone }));
    const respond = (ownerId, peerId, decision) => decide('respond', { ...pair(ownerId, peerId), decision: decision ?? null });
    const block = (ownerId, peerId) => decide('block', pair(ownerId, peerId));
    const unblock = (ownerId, peerId) => decide('unblock', pair(ownerId, peerId));
    const end = (ownerId, peerId) => decide('end', pair(ownerId, peerId));
    const withdrawRequests = (ownerId) => decide('withdraw-requests', { owner: ownerId ?? null });
    const list = async (ownerId) => withPeople(await decide('list', { owner: ownerId ?? null }));
    const handle = async (message, userId) => {
        const action = String(message?.action || '').toLowerCase();
        const run = () => decide('handle', { message, user: userId ?? null });
        if (action === 'request') return settled(run);
        return action === 'list' ? withPeople(await run()) : run();
    };

    return { canCommunicate, blockedEitherWay, hasBlocked, request, respond, block, unblock, end, withdrawRequests, list, handle };
}
