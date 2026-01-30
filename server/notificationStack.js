import { getAtome, updateAtome } from '../database/adole.js';

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
        } catch (_) { }
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
        request_atome_id: input.request_atome_id || input.requestAtomeId || null,
        from_id: input.from_id || input.fromId || null,
        from_name: input.from_name || input.fromName || null,
        from_phone: input.from_phone || input.fromPhone || null,
        to_user_id: input.to_user_id || input.toUserId || null,
        to_phone: input.to_phone || input.toPhone || null,
        timestamp: input.timestamp || input.date || new Date().toISOString(),
        unread: input.unread !== false,
        status: input.status || null
    };
};

export async function pushNotificationToUserStack({
    userId,
    notification,
    maxKeep = 200,
    authorId = null
}) {
    if (!userId || !notification) return { ok: false, error: 'missing_user_or_notification' };
    const normalized = normalizeNotification(notification);
    if (!normalized) return { ok: false, error: 'invalid_notification' };

    const userAtome = await getAtome(userId);
    if (!userAtome) return { ok: false, error: 'user_atome_missing' };

    const existing = resolveStack(userAtome);
    const deduped = existing.filter((item) => {
        const itemId = item?.id || item?.message_id || null;
        return itemId && String(itemId) !== String(normalized.id);
    });
    deduped.push(normalized);
    const trimmed = deduped.length > maxKeep ? deduped.slice(deduped.length - maxKeep) : deduped;

    await updateAtome(userId, {
        message_stack: trimmed,
        notification_stack: trimmed
    }, authorId || userId);
    return { ok: true, count: trimmed.length, stack: trimmed };
}

export async function readNotificationStack(userId) {
    if (!userId) return { ok: false, error: 'missing_user' };
    const userAtome = await getAtome(userId);
    if (!userAtome) return { ok: false, error: 'user_atome_missing' };
    const stack = resolveStack(userAtome);
    return { ok: true, count: stack.length, stack };
}
