// A person's notification stack is the Rust front's (atome/servers/atome-server/src/social/
// notification_stack.rs), its one writer: Fastify's services reach it through SERVICE frames
// on the supervisor's control socket (`stack:<operation>`). The push to the person's devices
// after a delivery stays here until the push transports move.
import { communicationPush } from './communication_push.js';

let provider = null;

// The supervisor's client (server/userVaultProvider.js), set once by server_services.js.
export function setNotificationStackProvider(vaultProvider) {
    provider = vaultProvider;
}

const ask = (operation, payload) => {
    if (!provider) throw new Error('notification_stack_provider_missing');
    return provider.service(`stack:${operation}`, payload);
};

export async function pushNotificationToUserStack({ userId, notification, maxKeep = 200, deferPush = false }) {
    const result = await ask('push', { user_id: userId || '', notification: notification ?? null, max_keep: maxKeep });
    if (!result.ok) return result;
    const deliverPush = async () => {
        try { return await communicationPush.deliver(userId, result.notification); }
        catch { return { ok: false, error: 'push_delivery_failed' }; }
    };
    return { ok: true, count: result.count, stack: result.stack,
        ...(deferPush ? { deliverPush } : { push: await deliverPush() }) };
}

export const readNotificationStack = (userId) => ask('read', { user_id: userId || '' });

// Self notices: a retry cannot restore an already-read notice to unread or replace a
// message delivered by another peer.
export const publishOwnNotification = ({ userId, notification }) => ask('publish-own', { user_id: userId, notification });

export const updateNotificationInUserStack = ({ userId, notificationId, patch = {} }) =>
    ask('update', { user_id: userId || '', notification_id: notificationId ?? null, patch });

// Removes the item from this user's own stack only ("retirer pour moi").
export const removeNotificationFromUserStack = ({ userId, notificationId }) =>
    ask('remove', { user_id: userId || '', notification_id: notificationId ?? null });
