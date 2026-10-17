import { resolveWsApiPrincipal, isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { readNotificationStack, publishOwnNotification, updateNotificationInUserStack, removeNotificationFromUserStack } from './notificationStack.js';
import { normalizeCommunicationAction } from '../atome/src/shared/communication_contract.js';

export const normalizeOwnNotification = (input, userId) => {
    if (!input || !['calendar', 'system'].includes(input.kind) || typeof input.id !== 'string' || !input.id || input.id.length > 200
        || typeof input.message !== 'string' || input.message.length > 8000 || (input.subject != null && (typeof input.subject !== 'string' || input.subject.length > 200)))
        throw new Error('notification_payload_invalid');
    return { id: input.id, kind: input.kind, message: input.message, subject: input.subject || '',
        timestamp: typeof input.timestamp === 'string' && Number.isFinite(Date.parse(input.timestamp)) ? input.timestamp : new Date().toISOString(),
        from_id: userId, to_user_id: userId, priority: 'normal', severity: 'info', action: normalizeCommunicationAction(input.action) };
};

// Same family and authenticated principal as the existing read/update/remove
// endpoint. No user-supplied destination, sender, urgency or executable action.
export async function handleWsNotificationOperation(data, connection) {
    const requestId = data.requestId || data.request_id;
    const envelope = { type: 'notification-stack-response', requestId };
    try {
        const userId = resolveWsApiPrincipal(connection);
        if (!userId || !await isWsApiPrincipalProvisioned(userId)) throw new Error('communication_auth_unavailable');
        let result;
        if (data.action === 'read') result = await readNotificationStack(userId);
        else if (data.action === 'publish') result = await publishOwnNotification({ userId, notification: normalizeOwnNotification(data.notification, userId) });
        else if (['update', 'remove'].includes(data.action)) {
            const input = { userId, authorId: userId, notificationId: data.notificationId || data.notification_id || data.id || null };
            result = data.action === 'remove' ? await removeNotificationFromUserStack(input)
                : await updateNotificationInUserStack({ ...input, patch: data.patch && typeof data.patch === 'object' ? data.patch : {} });
        } else throw new Error('notification_stack_action_unsupported');
        return { ...envelope, success: result.ok === true, ...result };
    } catch (error) { return { ...envelope, success: false, ok: false, error: error.message }; }
}
