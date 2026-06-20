export const resolveIntentLocale = (intent = {}, options = {}) => String(
    intent?.locale
    || options?.locale
    || options?.lang
    || 'fr-FR'
).trim().toLowerCase();

export const flattenResultPayload = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6) return value;
    if (Array.isArray(value)) return value;
    if (value.result !== undefined) {
        return flattenResultPayload(value.result, depth + 1);
    }
    return value;
};

export const buildRuntimeIntentMeta = (result, {
    phase = 'executed',
    replyText = ''
} = {}) => {
    const resolved = flattenResultPayload(result);
    const atomeId = String(
        resolved?.atome_id
        || resolved?.elementId
        || resolved?.id
        || ''
    ).trim() || null;
    const selectedIds = Array.isArray(resolved?.selected_ids)
        ? resolved.selected_ids.map((value) => String(value || '').trim()).filter(Boolean)
        : [];
    return {
        phase,
        ...(replyText ? { reply_text: replyText, spoken_reply: replyText } : {}),
        ...(atomeId ? { atome_id: atomeId } : {}),
        ...(selectedIds.length ? { selected_ids: selectedIds } : {}),
        result: {
            ok: resolved?.ok !== false,
            ...(atomeId ? { atome_id: atomeId } : {}),
            ...(selectedIds.length ? { selected_ids: selectedIds } : {})
        }
    };
};

const pickFirstArray = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6) return [];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.events)) return value.events;
    if (Array.isArray(value.contacts)) return value.contacts;
    if (Array.isArray(value.atomes)) return value.atomes;
    if (Array.isArray(value.results)) {
        for (const entry of value.results) {
            const nested = pickFirstArray(entry, depth + 1);
            if (nested.length) return nested;
        }
    }
    for (const nestedValue of Object.values(value)) {
        const nested = pickFirstArray(nestedValue, depth + 1);
        if (nested.length) return nested;
    }
    return [];
};

const pickNamedObject = (value, keys = [], depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6) return null;
    for (const key of keys) {
        if (value[key] && typeof value[key] === 'object') {
            return value[key];
        }
    }
    if (value.result && typeof value.result === 'object') {
        return pickNamedObject(value.result, keys, depth + 1);
    }
    if (Array.isArray(value.results)) {
        for (const entry of value.results) {
            const nested = pickNamedObject(entry, keys, depth + 1);
            if (nested) return nested;
        }
    }
    return null;
};

const formatCalendarItemLabel = (item = {}) => String(
    item?.title
    || item?.summary
    || item?.name
    || ''
).trim();

const formatContactLabel = (item = {}) => String(
    item?.name
    || item?.display_name
    || item?.full_name
    || item?.nickname
    || item?.email
    || item?.phone
    || ''
).trim();

const formatMailItemLabel = (item = {}) => String(
    item?.subject
    || item?.preview
    || item?.body_text
    || ''
).trim();

export const buildStructuredReplyFromPayload = (payload, intent = {}, options = {}) => {
    const locale = resolveIntentLocale(intent, options);
    const english = locale.startsWith('en');
    const domain = String(intent?.domain || '').trim().toLowerCase();
    const action = String(intent?.action || '').trim().toLowerCase();
    const resolved = flattenResultPayload(payload);

    if (!resolved || typeof resolved !== 'object') return '';

    if (domain === 'calendar') {
        const event = pickNamedObject(resolved, ['event']);
        const items = pickFirstArray(resolved).filter((entry) => entry && typeof entry === 'object');
        if (event) {
            const title = formatCalendarItemLabel(event);
            if (title) {
                if (action.includes('create')) return english ? `The event "${title}" has been created.` : `Le rendez-vous "${title}" a ete cree.`;
                if (action.includes('update')) return english ? `The event "${title}" has been updated.` : `Le rendez-vous "${title}" a ete mis a jour.`;
                return english ? `Calendar event: ${title}.` : `Rendez-vous : ${title}.`;
            }
        }
        if (items.length) {
            const labels = items.map((entry) => formatCalendarItemLabel(entry)).filter(Boolean).slice(0, 3);
            const count = items.length;
            if (labels.length) {
                return english
                    ? `You have ${count} calendar event(s): ${labels.join(', ')}.`
                    : `Tu as ${count} rendez-vous: ${labels.join(', ')}.`;
            }
            return english
                ? `You have ${count} calendar event(s).`
                : `Tu as ${count} rendez-vous.`;
        }
        if (resolved?.ok === true && (action.includes('list') || action.includes('search'))) {
            return english ? 'I do not see any calendar event right now.' : "Je ne vois pas de rendez-vous pour le moment.";
        }
    }

    if (domain === 'contacts') {
        const contact = pickNamedObject(resolved, ['contact']);
        const items = pickFirstArray(resolved).filter((entry) => entry && typeof entry === 'object');
        if (contact) {
            const label = formatContactLabel(contact);
            if (label) {
                return english ? `Contact: ${label}.` : `Contact: ${label}.`;
            }
        }
        if (items.length) {
            const labels = items.map((entry) => formatContactLabel(entry)).filter(Boolean).slice(0, 3);
            const count = items.length;
            if (labels.length) {
                return english
                    ? `I found ${count} contact(s): ${labels.join(', ')}.`
                    : `J'ai trouve ${count} contact(s): ${labels.join(', ')}.`;
            }
            return english
                ? `I found ${count} contact(s).`
                : `J'ai trouve ${count} contact(s).`;
        }
        if (resolved?.ok === true && (action.includes('list') || action.includes('search') || action.includes('read'))) {
            return english ? 'I do not see any matching contact right now.' : "Je ne vois pas de contact correspondant pour le moment.";
        }
    }

    if (domain === 'mail') {
        const item = pickNamedObject(resolved, ['item', 'message']);
        const items = pickFirstArray(resolved).filter((entry) => entry && typeof entry === 'object');
        if (item) {
            const label = formatMailItemLabel(item);
            if (action.includes('archive')) return english ? 'The mail has been archived.' : 'Le mail a ete archive.';
            if (action.includes('delete')) return english ? 'The mail has been deleted.' : 'Le mail a ete supprime.';
            if (action.includes('mark_read')) return english ? 'The mail has been marked as read.' : 'Le mail a ete marque comme lu.';
            if (action.includes('mark_unread')) return english ? 'The mail has been marked as unread.' : 'Le mail a ete marque comme non lu.';
            if (label) {
                return english ? `Mail: ${label}.` : `Mail: ${label}.`;
            }
        }
        if (items.length) {
            const labels = items.map((entry) => formatMailItemLabel(entry)).filter(Boolean).slice(0, 3);
            const count = items.length;
            if (labels.length) {
                return english
                    ? `I found ${count} mail item(s): ${labels.join(', ')}.`
                    : `J'ai trouve ${count} mail(s): ${labels.join(', ')}.`;
            }
        }
    }

    if (resolved?.elementId || resolved?.atome_id || resolved?.created === true) {
        return english ? 'The object has been created.' : "L'objet a ete cree.";
    }

    if (domain === 'project' || domain === 'atome' || action.includes('list_atomes') || action.includes('check_atome') || action.includes('alter_atome')) {
        const SYSTEM_TYPES = new Set([
            'tool', 'code', 'user', 'project', 'folder', 'organization',
            'share_request', 'share_link', 'share_policy'
        ]);
        const items = pickFirstArray(resolved).filter((entry) => entry && typeof entry === 'object');
        const userItems = items.filter((a) => !SYSTEM_TYPES.has(String(a?.type || a?.atome_type || '').toLowerCase()));
        const systemCount = items.length - userItems.length;

        const formatContentLabel = (a) => {
            const props = a?.properties || a?.data || {};
            const name = String(props?.name || props?.['meta.name'] || a?.name || '').trim();
            const type = String(a?.type || a?.atome_type || '').trim();
            const color = String(props?.color || props?.fill || props?.backgroundColor || '').trim();
            const shape = String(props?.shape || '').trim();
            const parts = [];
            if (name) { parts.push(name); }
            else {
                if (color) parts.push(color);
                if (shape) parts.push(shape);
                if (!parts.length && type) parts.push(type);
            }
            if (type && type !== name && type !== shape) parts.push(`(${type})`);
            return parts.join(' ') || String(a?.id || a?.atome_id || '').slice(0, 8);
        };

        if (action.includes('alter_atome') || action.includes('alter')) {
            if (resolved?.ok === true || resolved?.status === 'OK' || resolved?.altered || resolved?.updated) {
                return english ? 'Done.' : 'Fait.';
            }
        }

        if (action.includes('check_atome') || action.includes('find_atome') || action.includes('search_atome')) {
            const queryText = String(intent?.query_text || intent?.actions?.[0]?.params?.query_text || '').toLowerCase().trim();
            const queryTerms = queryText.split(/\s+/).filter(Boolean);
            if (queryTerms.length && userItems.length) {
                const matches = userItems.filter((a) => {
                    const props = a?.properties || a?.data || {};
                    const haystack = [
                        String(props?.name || props?.['meta.name'] || a?.name || ''),
                        String(a?.type || a?.atome_type || ''),
                        String(props?.color || ''),
                        String(props?.fill || ''),
                        String(props?.backgroundColor || ''),
                        String(props?.shape || '')
                    ].join(' ').toLowerCase();
                    return queryTerms.every((term) => haystack.includes(term));
                });
                if (matches.length) {
                    const labels = matches.map(formatContentLabel).filter(Boolean).slice(0, 5);
                    return english
                        ? `Yes, I found ${matches.length}: ${labels.join(', ')}.`
                        : `Oui, j'ai trouve ${matches.length}: ${labels.join(', ')}.`;
                }
                return english
                    ? `No, I do not see any "${queryText}" in the project.`
                    : `Non, je ne vois pas de "${queryText}" dans le projet.`;
            }
            if (!userItems.length) {
                return english
                    ? 'The project has no user-created content.'
                    : "Le projet ne contient aucun contenu cree par l'utilisateur.";
            }
        }

        if (userItems.length) {
            const labels = userItems.map(formatContentLabel).filter(Boolean).slice(0, 10);
            const count = userItems.length;
            const sys = systemCount > 0
                ? (english ? ` (plus ${systemCount} system objects)` : ` (plus ${systemCount} objets systeme)`)
                : '';
            if (labels.length) {
                return english
                    ? `The project has ${count} user object(s): ${labels.join(', ')}.${sys}`
                    : `Le projet contient ${count} objet(s) utilisateur: ${labels.join(', ')}.${sys}`;
            }
            return english
                ? `The project has ${count} user object(s).${sys}`
                : `Le projet contient ${count} objet(s) utilisateur.${sys}`;
        }
        if (items.length && !userItems.length) {
            return english
                ? `The project has ${items.length} system object(s) but no user-created content.`
                : `Le projet contient ${items.length} objet(s) systeme mais aucun contenu cree par l'utilisateur.`;
        }
        if (resolved?.ok === true || resolved?.tauri || resolved?.fastify) {
            return english ? 'The project has no atomes.' : "Le projet ne contient aucun atome.";
        }
    }

    return '';
};

export const buildRuntimeFailureReply = (payload, intent = {}, options = {}) => {
    const resolved = flattenResultPayload(payload);
    const explicitReply = String(resolved?.reply_text || '').trim();
    if (explicitReply) return explicitReply;
    const locale = resolveIntentLocale(intent, options);
    return locale.startsWith('en')
        ? 'The action failed.'
        : "L'action a echoue.";
};
