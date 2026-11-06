// Direct messages and conversations are the Rust front's (atome/servers/atome-server/src/social/
// direct_messages.rs and message_store.rs: the envelope's guard, the rate, the priority, both
// vaults' copies and the recipient's notice): Fastify's services reach them through SERVICE frames
// on the supervisor's control socket (`messages:<operation>`). What stays here is the live delivery
// (the recipient's connections, or their queue) and the push once the answer has left; `visio`
// stays Fastify's.
import { resolveWsApiPrincipal, isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { communicationPush } from './communication_push.js';

export async function handleWsCommunication({ data, connection, safeSend, deliver, enqueue, visio }) {
    const requestId = data.requestId || data.request_id;
    const type = `${data.type}-response`;
    const reply = payload => safeSend({ type, requestId, ...payload });
    try {
        const userId = resolveWsApiPrincipal(connection);
        if (!userId || !await isWsApiPrincipalProvisioned(userId)) throw new Error('communication_auth_unavailable');
        if (data.type === 'visio') {
            const result = await visio.handleCommand(userId, data.action, data.input || {}, connection);
            reply({ success: true, ...result });
            return;
        }
        if (data.type === 'conversation') {
            reply({ success: true, ...await connection._wsApiVaultRouter.provider.service('messages:conversation', { user: userId, data }) });
            return;
        }
        const sent = await sendDirectMessage({ userId, data, vaultRouter: connection._wsApiVaultRouter, deliver, enqueue });
        reply({ success: true, ...sent.result });
        await sent.deliverPush();
    } catch (error) { reply({ success: false, error: error.message || 'communication_failed' }); }
}

// One direct message from `userId` (its envelope in `data.message`, its recipient in `data.toUserId` /
// `data.toPhone`): what the /ws/api frame does, also run by the server itself for a scheduled send
// (server/scheduled_sends.js). Returns the reply's fields and the recipient's push, sent after the reply.
export async function sendDirectMessage({ userId, data, vaultRouter, deliver, enqueue }) {
    const sent = await vaultRouter.provider.service('messages:send', { user: userId, data });
    const deliverPush = async () => {
        if (!sent.push) return null;
        try { return await communicationPush.deliver(sent.target, sent.push); }
        catch { return { ok: false, error: 'push_delivery_failed' }; }
    };
    if (!sent.deliver) return { result: sent.result, deliverPush };
    const delivery = deliver(sent.target, sent.deliver, { scope: 'ws/api', op: 'direct-message', targetUserId: sent.target });
    const queueSize = delivery.delivered ? 0 : enqueue(sent.target, sent.deliver);
    return { result: { ...delivery, queued: !delivery.delivered, queueSize, ...sent.result }, deliverPush };
}
