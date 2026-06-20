import { cloneValue } from './mcp_core.js';
import { ensureMailApi, ensureMessagesApi } from './mcp_bridges.js';

export function normalizeCommunicationSourceItem(item = {}, surface = 'mail') {
    const normalizedSurface = String(surface || 'mail').trim().toLowerCase() || 'mail';
    const sourceId = String(
        item?.source_message_id
        || item?.message_id
        || item?.id
        || item?.uid
        || item?.thread_id
        || item?.conversation_id
        || ''
    ).trim();
    return {
        ...cloneValue(item),
        comm_surface: normalizedSurface,
        source_message_id: sourceId,
        message_id: sourceId ? `${normalizedSurface}:${sourceId}` : String(item?.message_id || '').trim(),
        body_text: String(item?.body_text || item?.text || item?.body || item?.preview || '').trim()
    };
}

export async function listCommunicationItems(params = {}) {
    const surfaces = Array.isArray(params?.surfaces) && params.surfaces.length
        ? params.surfaces.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
        : ['mail', 'messages'];
    const limit = Number.isFinite(Number(params?.limit)) ? Math.max(1, Math.round(Number(params.limit))) : 20;
    const items = [];

    if (surfaces.includes('mail')) {
        try {
            const mail = ensureMailApi();
            const result = await Promise.resolve(mail.list(params || {}));
            (Array.isArray(result?.items) ? result.items : []).forEach((item) => {
                items.push(normalizeCommunicationSourceItem(item, 'mail'));
            });
        } catch (_) {
            // Keep best-effort multi-surface behavior.
        }
    }

    if (surfaces.includes('messages')) {
        try {
            const messages = ensureMessagesApi();
            const result = await Promise.resolve(messages.list(params || {}));
            (Array.isArray(result?.items) ? result.items : []).forEach((item) => {
                items.push(normalizeCommunicationSourceItem(item, 'messages'));
            });
        } catch (_) {
            // Keep best-effort multi-surface behavior.
        }
    }

    items.sort((left, right) => {
        const leftDate = Date.parse(left?.received_at || left?.sent_at || left?.updated_at || 0) || 0;
        const rightDate = Date.parse(right?.received_at || right?.sent_at || right?.updated_at || 0) || 0;
        return rightDate - leftDate;
    });

    return {
        ok: true,
        items: items.slice(0, limit)
    };
}

export async function searchCommunicationItems(params = {}) {
    const query = String(params?.query || params?.q || '').trim().toLowerCase();
    if (!query) return listCommunicationItems(params);
    const listed = await listCommunicationItems(params);
    const items = (Array.isArray(listed?.items) ? listed.items : []).filter((item) => {
        const haystack = [
            item?.subject,
            item?.preview,
            item?.body_text,
            item?.from?.name,
            item?.from?.address
        ].map((entry) => String(entry || '').toLowerCase()).join(' ');
        return haystack.includes(query);
    });
    return {
        ok: true,
        query,
        items
    };
}

export async function readCommunicationItem(params = {}) {
    const messageId = String(params?.message_id || params?.messageId || params?.id || '').trim();
    const match = messageId.match(/^(mail|messages):(.*)$/i);
    const surface = match ? String(match[1]).toLowerCase() : 'mail';
    const sourceId = match ? String(match[2] || '').trim() : messageId;
    if (!sourceId) throw new Error('communication_message_id_missing');
    if (surface === 'messages') {
        const messages = ensureMessagesApi();
        const item = await Promise.resolve(messages.read(sourceId));
        return {
            ok: true,
            item: normalizeCommunicationSourceItem(item?.item || item, 'messages')
        };
    }
    const mail = ensureMailApi();
    const item = await Promise.resolve(mail.read(sourceId));
    return {
        ok: true,
        item: normalizeCommunicationSourceItem(item?.item || item, 'mail')
    };
}
