import { getAtome } from '../database/adole.js';
import { commitAtomeEvent } from './atomeRoutes.orm.js';
import { communicationPush } from './communication_push.js';
import { normalizeCommunicationPriority, normalizeCommunicationAction } from '../atome/src/shared/communication_contract.js';

const stackWrites = new Map();
const serializeStack = (userId, write) => {
    const key = String(userId || '');
    const pending = (stackWrites.get(key) || Promise.resolve()).catch(() => null).then(write);
    const tail = pending.catch(() => null); stackWrites.set(key, tail);
    void tail.then(() => { if (stackWrites.get(key) === tail) stackWrites.delete(key); });
    return pending;
};

const writeStack = async (userId, stack) => {
    const result = await commitAtomeEvent({ authenticatedUserId: userId, event: {
        atome_id: userId, kind: 'set', payload: { scope: 'global', props: { message_stack: stack, notification_stack: stack } },
        actor: { type: 'user', id: userId }, source: 'communication.notifications'
    } });
    if (!result.ok) throw new Error(result.error || 'notification_commit_failed');
};

const normalizeStackValue = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.slice();
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
            if (parsed && typeof parsed === 'object') {
                const nested = parsed.items || parsed.data || null;
                return Array.isArray(nested) ? nested.slice() : [];
            }
        } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    }
    if (value && typeof value === 'object') {
        const nested = value.items || value.data || null;
        return Array.isArray(nested) ? nested.slice() : [];
    }
    return [];
};

const resolveStack = (atome) => {
    if (!atome || typeof atome !== 'object') return [];
    const data = atome.data || atome.properties || atome.particles || {};
    const stack = data.message_stack
        || data.messageStack
        || data.notification_stack
        || data.notificationStack
        || data.notifications
        || null;
    return normalizeStackValue(stack);
};

const normalizeNotification = (input = {}) => {
    const id = input.message_id || input.messageId || input.id || null;
    if (!id) return null;
    return {
        id,
        message_id: id,
        kind: input.kind || input.command || input.type || 'message',
        subject: input.subject || '',
        message: input.message || input.text || '',
        atome_ids: Array.isArray(input.atome_ids || input.atomeIds) ? (input.atome_ids || input.atomeIds) : [],
        mode: input.mode || input.share_mode || input.shareMode || null,
        share_type: input.share_type || input.shareType || null,
        request_atome_id: input.request_atome_id || input.requestAtomeId || null,
        from_id: input.from_id || input.fromId || null,
        from_name: input.from_name || input.fromName || null,
        from_phone: input.from_phone || input.fromPhone || null,
        to_user_id: input.to_user_id || input.toUserId || null,
        to_phone: input.to_phone || input.toPhone || null,
        timestamp: input.timestamp || input.date || new Date().toISOString(),
        unread: input.unread !== false,
        status: input.status || null,
        archived: input.archived === true,
        todo: input.todo === true,
        urgent: input.urgent === true,
        priority: normalizeCommunicationPriority(input.priority),
        action: normalizeCommunicationAction(input.action),
        severity: input.severity === 'critical' ? 'critical' : input.severity === 'warning' ? 'warning' : 'info',
        publication: input.publication && typeof input.publication === 'object' ? input.publication : null,
        // Visio : la salle a rejoindre et la raison d'un refus survivent au rechargement.
        room_id: input.room_id || input.roomId || null,
        reason: input.reason || null,
        call_mode: input.call_mode || null,
        expires_at: input.expires_at || null,
        starts_at: input.starts_at || input.startsAt || null,
        ends_at: input.ends_at || input.endsAt || null
    };
};

async function pushToStack({
    userId,
    notification,
    maxKeep = 200,
    authorId = null,
    deferPush = false
}) {
    if (!userId || !notification) return { ok: false, error: 'missing_user_or_notification' };
    const normalized = normalizeNotification(notification);
    if (!normalized) return { ok: false, error: 'invalid_notification' };

    const userAtome = await getAtome(userId);
    if (!userAtome) return { ok: false, error: 'user_atome_missing' };

    const existing = resolveStack(userAtome);
    const previous = existing.find(item => String(item?.id || item?.message_id) === String(normalized.id));
    if (previous) for (const flag of ['unread', 'archived', 'todo', 'urgent']) normalized[flag] = previous[flag] === true;
    const deduped = existing.filter((item) => {
        const itemId = item?.id || item?.message_id || null;
        return itemId && String(itemId) !== String(normalized.id);
    });
    deduped.push(normalized);
    const pending = deduped.filter(item => item.unread !== false && item.archived !== true);
    const retained = new Set(pending.map(item => String(item.id || item.message_id)));
    deduped.slice(-maxKeep).forEach(item => retained.add(String(item.id || item.message_id)));
    const trimmed = deduped.filter(item => retained.has(String(item.id || item.message_id)));

    await writeStack(userId, trimmed);
    const deliverPush = async () => {
        try { return await communicationPush.deliver(userId, normalized); }
        catch { return { ok: false, error: 'push_delivery_failed' }; }
    };
    return { ok: true, count: trimmed.length, stack: trimmed,
        ...(deferPush ? { deliverPush } : { push: await deliverPush() }) };
}

export async function readNotificationStack(userId) {
    if (!userId) return { ok: false, error: 'missing_user' };
    const userAtome = await getAtome(userId);
    if (!userAtome) return { ok: false, error: 'user_atome_missing' };
    const stack = resolveStack(userAtome);
    return { ok: true, count: stack.length, stack };
}

async function updateInStack({
    userId,
    notificationId,
    patch = {},
    authorId = null
}) {
    if (!userId || !notificationId) return { ok: false, error: 'missing_user_or_notification_id' };
    const userAtome = await getAtome(userId);
    if (!userAtome) return { ok: false, error: 'user_atome_missing' };
    const allowedPatch = {};
    if (typeof patch.unread === 'boolean') allowedPatch.unread = patch.unread;
    if (typeof patch.archived === 'boolean') allowedPatch.archived = patch.archived;
    if (typeof patch.todo === 'boolean') allowedPatch.todo = patch.todo;
    if (typeof patch.urgent === 'boolean') allowedPatch.urgent = patch.urgent;
    if (Object.prototype.hasOwnProperty.call(patch, 'status')) allowedPatch.status = patch.status || null;
    if (!Object.keys(allowedPatch).length) return { ok: false, error: 'notification_patch_empty' };

    const stack = resolveStack(userAtome);
    let updatedItem = null;
    const next = stack.map((item) => {
        const itemId = item?.id || item?.message_id || null;
        if (!itemId || String(itemId) !== String(notificationId)) return item;
        updatedItem = { ...item, ...allowedPatch };
        return updatedItem;
    });
    if (!updatedItem) return { ok: false, error: 'notification_not_found' };
    await writeStack(userId, next);
    return { ok: true, count: next.length, stack: next, notification: updatedItem };
}

// Removes the item from this user's own stack only ("retirer pour moi").
// Other recipients' stacks and any `type:'message'` atome are untouched.
async function removeFromStack({
    userId,
    notificationId,
    authorId = null
}) {
    if (!userId || !notificationId) return { ok: false, error: 'missing_user_or_notification_id' };
    const userAtome = await getAtome(userId);
    if (!userAtome) return { ok: false, error: 'user_atome_missing' };
    const stack = resolveStack(userAtome);
    const next = stack.filter((item) => {
        const itemId = item?.id || item?.message_id || null;
        return !itemId || String(itemId) !== String(notificationId);
    });
    if (next.length === stack.length) return { ok: false, error: 'notification_not_found' };
    await writeStack(userId, next);
    return { ok: true, count: next.length, stack: next, removed_id: notificationId };
}

export const pushNotificationToUserStack = input => serializeStack(input?.userId, () => pushToStack(input));

// Self notices reuse this same transaction lane. A retry cannot restore an
// already-read notice to unread or replace a message delivered by another peer.
export const publishOwnNotification = input => serializeStack(input?.userId, async () => {
    const current = await readNotificationStack(input.userId);
    if (!current.ok) return current;
    const existing = current.stack.find(item => String(item.id || item.message_id) === input.notification.id);
    if (existing) {
        if (existing.from_id !== input.userId || existing.kind !== input.notification.kind || existing.message !== input.notification.message
            || JSON.stringify(existing.action) !== JSON.stringify(input.notification.action)) throw new Error('notification_id_conflict');
        return { ok: true, duplicate: true, notification: existing, stack: current.stack };
    }
    const result = await pushToStack({ ...input, deferPush: true });
    return { ok: result.ok, notification: result.stack?.find(item => item.id === input.notification.id), stack: result.stack, error: result.error };
});

export const updateNotificationInUserStack = input => serializeStack(input?.userId, () => updateInStack(input));

export const removeNotificationFromUserStack = input => serializeStack(input?.userId, () => removeFromStack(input));
