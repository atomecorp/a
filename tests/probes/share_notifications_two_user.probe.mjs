// PAR-12: a share request reaches the right recipient, live when they are online and through the share inbox after
// they come back; a third account, outside the share, is told nothing. Real accounts (phone link, SMS mock) on an
// isolated atome-server (tests/helpers/probe_server.mjs), never the developer's 3001.
import crypto from 'node:crypto';
import { commit, connectUser, createReport, makeContacts, sleep, startServer } from '../helpers/probe_server.mjs';

const report = createReport('share_notifications_two_user');
const server = await startServer();
const suffix = String(process.pid % 50000).padStart(5, '0');
const mentions = (message, atomeId) => JSON.stringify(message).includes(atomeId);
const inboxOf = async (user) => {
    const answer = await user.call({ type: 'share', action: 'inbox', box: 'inbox', status: ['pending', 'active'], token: user.token });
    if (answer.success !== true) throw new Error(`share_inbox_failed:${JSON.stringify(answer)}`);
    return answer;
};
const shapeOf = async (owner) => {
    const id = crypto.randomUUID();
    const committed = await commit(owner, {
        id: crypto.randomUUID(), kind: 'set', atome_id: id,
        payload: { props: { type: 'shape', owner_id: owner.id, creator_id: owner.id, width: 60, height: 60 } }
    });
    if (committed.success !== true) throw new Error(`share_fixture_commit_failed:${JSON.stringify(committed)}`);
    return id;
};
const request = (owner, target, atomeId) => owner.call({
    type: 'share', action: 'request', token: owner.token, target_user_id: target.id, atome_ids: [atomeId],
    permissions: { read: true }, mode: 'real-time', share_type: 'copy'
});

try {
    const alice = await connectUser(server, { phone: `+33994${suffix}`, name: 'share_alice' });
    const bob = await connectUser(server, { phone: `+33995${suffix}`, name: 'share_bob' });
    const carol = await connectUser(server, { phone: `+33996${suffix}`, name: 'share_carol' });
    // Carol stays outside the share (and outside Alice's contacts): she is the account that must hear nothing.
    await makeContacts(alice, bob);

    // Bob online: the request is told to him live, and to nobody else.
    const live = await shapeOf(alice);
    const sent = await request(alice, bob, live);
    report.check('request_accepted', sent.success === true, JSON.stringify(sent).slice(0, 200));
    const told = await bob.waitFor((m) => mentions(m, live), 8000).then(() => true, () => false);
    report.check('recipient_told_live', told);
    await sleep(1500);
    report.check('outsider_not_told', !carol.inbox.some((m) => mentions(m, live)), `${carol.inbox.length} frames`);
    report.check('sender_not_told_as_recipient', !(await inboxOf(alice)).data?.some?.((r) => mentions(r, live)));
    report.check('recipient_inbox_lists_it', mentions((await inboxOf(bob)).data, live));
    report.check('outsider_inbox_empty_of_it', !mentions((await inboxOf(carol)).data, live));

    // Bob offline: the request waits; he finds it in his inbox when he comes back, with no new SMS.
    bob.close();
    const offline = await shapeOf(alice);
    const queued = await request(alice, bob, offline);
    report.check('request_while_offline_accepted', queued.success === true, JSON.stringify(queued).slice(0, 200));
    const back = await connectUser(server, { session: bob });
    report.check('recipient_inbox_after_reconnect', mentions((await inboxOf(back)).data, offline));
    report.check('outsider_inbox_still_empty', !mentions((await inboxOf(carol)).data, offline));
    back.close();
    alice.close();
    carol.close();
} catch (error) {
    report.check('probe_ran', false, String(error?.stack || error).slice(0, 400));
} finally {
    await server.stop();
}
process.exitCode = report.done() ? 1 : 0;
