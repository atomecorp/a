import {
    createStructuredResult,
    SEMANTIC_DOMAINS
} from './semantic_contract.js';
import { resolveAtomeRuntimeInvocation } from '../atome/runtime_tool_resolution.js';
import { buildContactQueryReply, buildContactsFieldReply } from './contact_reply.js';
import { createOfflineMutationQueue } from '../ai/offline_mutation_queue.js';
import {
    computeTrustScore,
    buildTrustWarning,
    TRUST_THRESHOLD_OK,
    TRUST_THRESHOLD_WARN
} from './mail_trust_scoring.js';

const isEnglish = (locale) => String(locale || '').toLowerCase().startsWith('en');
const OFFLINE_MUTATION_OPERATIONS = new Set(['create', 'update', 'delete']);

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const isOfflineLikeFailure = (value) => {
    if (!value) return false;
    if (value?.offline === true || value?.status === 0) return true;
    const text = String(value?.error || value?.message || value || '').toLowerCase();
    return text.includes('offline')
        || text.includes('unreachable')
        || text.includes('timeout')
        || text.includes('network')
        || text.includes('connection lost')
        || text.includes('fetch failed')
        || text.includes('service unavailable');
};

const executeConnectorCall = async (callback, fallbackError = 'connector_execution_failed') => {
    try {
        const result = await callback();
        return result && typeof result === 'object'
            ? result
            : { ok: result !== false };
    } catch (error) {
        return {
            ok: false,
            error: String(error?.message || error || fallbackError),
            offline: isOfflineLikeFailure(error)
        };
    }
};

const buildOfflineQueuedReply = (domain, operation, locale) => {
    const en = isEnglish(locale);
    const subject = domain === 'contacts'
        ? (en ? 'contact change' : 'modification du contact')
        : domain === 'calendar'
            ? (en ? 'calendar change' : 'modification du calendrier')
            : (en ? 'change' : 'modification');
    if (en) {
        return `I cannot reach the ${domain} service right now. I queued this ${subject} locally and will sync it when connectivity returns.`;
    }
    return `Je ne peux pas joindre le service ${domain === 'calendar' ? 'calendrier' : domain} pour le moment. J'ai mis cette ${subject} en file locale et elle sera synchronisee quand la connexion reviendra.`;
};

const buildVoiceMutationConfirmationRequired = (domain, operation, locale) => createStructuredResult({
    ok: false,
    domain,
    operation,
    error: 'voice_mutation_confirmation_required',
    confirmation_required: true,
    reply_text: isEnglish(locale)
        ? 'I prepared the action, but I need an explicit confirmation before changing data.'
        : "J'ai prepare l'action, mais j'ai besoin d'une confirmation explicite avant de modifier les donnees."
});

const isVoiceMutationConfirmed = (request = {}) => {
    const confirmationId = String(request.confirmation_id || request.confirmationId || '').trim();
    return request.confirmed === true && confirmationId.length > 0;
};

const requireVoiceMutationConfirmation = (request = {}, domain = '', operation = '', locale = 'fr-FR') => (
    isVoiceMutationConfirmed(request)
        ? null
        : buildVoiceMutationConfirmationRequired(domain, operation, locale)
);

const voiceOfflineQueueEnabled = (request = {}) => (
    isVoiceMutationConfirmed(request) && request.allow_offline_queue === true
);

const queueOfflineMutationResult = ({
    offlineQueue = null,
    request = {},
    domain = '',
    operation = '',
    locale = 'fr-FR',
    item = null,
    draft = null
} = {}) => {
    const queueEntry = offlineQueue && typeof offlineQueue.enqueue === 'function'
        ? offlineQueue.enqueue(request)
        : null;
    const queueSize = offlineQueue && typeof offlineQueue.list === 'function'
        ? offlineQueue.list().length
        : (queueEntry ? 1 : 0);
    return createStructuredResult({
        ok: true,
        domain,
        operation,
        item,
        draft,
        executed: false,
        queued: true,
        offline: true,
        queue_entry_id: queueEntry?.id || '',
        transport: 'offline_queue',
        stats: {
            queue_size: queueSize
        },
        reply_text: buildOfflineQueuedReply(domain, operation, locale)
    });
};

const formatSenderLabel = (item) => String(
    item?.from?.name || item?.from?.address || ''
).trim();

const formatSubjectLabel = (item) => {
    const subject = String(item?.subject || '').trim();
    if (subject && !/^[\s?._\uFFFD-]+$/.test(subject) && !/^=\?[^?]+\?[bqBQ]\?/.test(subject)) {
        return subject;
    }
    return String(item?.preview || item?.body_text || '').trim().slice(0, 80) || '';
};

const sanitizeBodyForSpeech = (raw) => {
    let text = String(raw || '').trim();
    if (!text) return '';
    text = text.replace(/--[\w:.+=-]{10,}[\s\S]*?(?=\n[^-]|$)/g, '');
    text = text.replace(/^(Content-[\w-]+|MIME-Version|Message-Id|Date|From|To|Cc|Bcc|Subject|In-Reply-To|References|Return-Path|Received|X-[\w-]+)\s*:.*$/gim, '');
    text = text.replace(/^\s*>+.*$/gm, '');
    text = text.replace(/\s*>+\s*>*/g, ' ');
    text = text.replace(/(^|\s)(Le\s+\d.*?a\s+(e|é)crit\s*:|On\s+.*?wrote\s*:)/gim, ' ');
    text = text.replace(/\b\d{9,}\b/g, '');
    text = text.replace(/<[^>@]+@[^>]+>/g, '');
    text = text.replace(/\b\d{1,2}\s+(?:janv|f[eé]vr|mars|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[eé]c)\w*\s+\d{4}\b/gi, '');
    text = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
    text = text.replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4}\b/gi, '');
    text = text.replace(/(?:a|à)\s+\d{1,2}:\d{2}/gi, '');
    text = text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return text;
};

const buildMailListReply = (items, request) => {
    const locale = request.source?.locale || 'fr-FR';
    const en = isEnglish(locale);
    const unread = request.filters?.read_state === 'unread';
    const order = request.filters?.order ? String(request.filters.order).toLowerCase() : null;
    const oldest = order === 'oldest';
    const count = items.length;
    const excludedSenders = Array.isArray(request.filters?.not_from)
        ? request.filters.not_from.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];
    const includedSenders = Array.isArray(request.filters?.from)
        ? request.filters.from.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];
    const filterSuffix = excludedSenders.length
        ? (en
            ? ` from people other than ${excludedSenders.join(', ')}`
            : ` d'autres personnes que ${excludedSenders.join(', ')}`)
        : (includedSenders.length
            ? (en
                ? ` from ${includedSenders.join(', ')}`
                : ` de ${includedSenders.join(', ')}`)
            : '');

    if (request.status_only) {
        if (count === 0) {
            return en
                ? (unread ? `You do not have any unread mail${filterSuffix}.` : `You do not have any mail${filterSuffix}.`)
                : (unread ? `Tu n'as pas de mail non lu${filterSuffix}.` : `Tu n'as pas de mail${filterSuffix}.`);
        }
        const subjects = items.slice(0, 3).map(formatSubjectLabel).filter(Boolean);
        const subjectSuffix = subjects.length ? `: ${subjects.join(', ')}.` : '.';
        return en
            ? (unread ? `You have ${count} unread mail(s)${filterSuffix}${subjectSuffix}` : `You have ${count} mail(s)${filterSuffix}${subjectSuffix}`)
            : (unread ? `Tu as ${count} mail(s) non lu(s)${filterSuffix}${subjectSuffix}` : `Tu as ${count} mail(s)${filterSuffix}${subjectSuffix}`);
    }

    if (count === 0) {
        return en
            ? (unread ? 'I do not see any unread mail right now.' : 'I do not see any mail right now.')
            : (unread ? 'Je ne vois pas de mail non lu pour le moment.' : 'Je ne vois pas de mail pour le moment.');
    }

    const formatItemLabel = (item) => {
        const sender = formatSenderLabel(item);
        const subject = formatSubjectLabel(item);
        if (sender && subject) return `${subject} (${en ? 'from' : 'de'} ${sender})`;
        return subject || sender || '';
    };
    const labels = items.slice(0, 3).map(formatItemLabel).filter(Boolean);
    if (en) {
        if (unread) return `Here are the unread mails: ${labels.join(', ')}.`;
        if (oldest) return `Here is the oldest mail: ${labels.join(', ')}.`;
        if (order === 'newest') return `Here are the latest mails: ${labels.join(', ')}.`;
        return `Here are the mails: ${labels.join(', ')}.`;
    }
    if (unread) return `Voici les mails non lus : ${labels.join(', ')}.`;
    if (oldest) return `Voici le mail le plus ancien : ${labels.join(', ')}.`;
    if (order === 'newest') return `Voici les derniers mails : ${labels.join(', ')}.`;
    return `Voici les mails : ${labels.join(', ')}.`;
};

const buildMailReadReply = (item, locale, request = null) => {
    const en = isEnglish(locale);
    const sender = formatSenderLabel(item) || (en ? 'unknown sender' : 'expediteur inconnu');
    const subject = formatSubjectLabel(item);
    const rawPreview = String(item?.preview || item?.body_text || '').trim();
    const cleanPreview = sanitizeBodyForSpeech(rawPreview);
    const body = cleanPreview.length > 260 ? `${cleanPreview.slice(0, 259).trim()}...` : cleanPreview;

    const utterance = String(
        request?.source?.utterance_raw || request?.source?.utterance_normalized || ''
    ).toLowerCase();
    const skipSubject = utterance.includes('pas le sujet')
        || utterance.includes('without the subject')
        || utterance.includes('no subject')
        || utterance.includes('just the body')
        || utterance.includes('juste le corps');

    if (skipSubject) {
        if (en) return body ? `Mail from ${sender}. ${body}` : `Mail from ${sender}, no readable content.`;
        return body ? `Mail de ${sender}. ${body}` : `Mail de ${sender}, pas de contenu lisible.`;
    }
    if (en) {
        return body
            ? `Mail from ${sender}. Subject: ${subject}. ${body}`
            : `Mail from ${sender} about "${subject}".`;
    }
    return body
        ? `Mail de ${sender}. Sujet: ${subject}. ${body}`
        : `Mail de ${sender} concernant "${subject}".`;
};

const normalizeCommunicationSurfaces = (value = []) => {
    const valid = new Set(['mail', 'messages']);
    const list = Array.isArray(value) ? value : [value];
    const normalized = list
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter((entry) => valid.has(entry));
    return Array.from(new Set(normalized));
};

const createCommunicationItemId = (surface, sourceId) => {
    const normalizedSurface = String(surface || 'mail').trim().toLowerCase() || 'mail';
    const normalizedSourceId = String(sourceId || '').trim();
    if (!normalizedSourceId) return '';
    return `${normalizedSurface}:${normalizedSourceId}`;
};

const parseCommunicationItemId = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return { surface: 'mail', source_id: '' };
    const match = normalized.match(/^(mail|messages):(.*)$/i);
    if (!match) return { surface: 'mail', source_id: normalized };
    return {
        surface: String(match[1] || 'mail').trim().toLowerCase() || 'mail',
        source_id: String(match[2] || '').trim()
    };
};

const normalizeCommunicationItem = (item = {}, surface = 'mail') => {
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
    const senderPhone = String(
        item?.from?.phone
        || item?.phone
        || item?.phone_number
        || item?.from_phone
        || item?.sender_phone
        || ''
    ).trim();
    const senderAddress = String(
        item?.from?.address
        || item?.from?.email
        || item?.email
        || senderPhone
        || ''
    ).trim();
    const senderName = String(
        item?.from?.name
        || item?.sender_name
        || item?.display_name
        || item?.name
        || senderPhone
        || senderAddress
        || ''
    ).trim();
    const preview = String(
        item?.preview
        || item?.body_text
        || item?.text
        || item?.body
        || item?.snippet
        || ''
    ).trim();
    return {
        ...item,
        comm_surface: normalizedSurface,
        source_message_id: sourceId,
        message_id: createCommunicationItemId(normalizedSurface, sourceId) || String(item?.message_id || '').trim(),
        subject: String(item?.subject || '').trim(),
        preview,
        body_text: String(item?.body_text || item?.text || item?.body || preview).trim(),
        unread: typeof item?.unread === 'boolean' ? item.unread : (item?.read === true ? false : !!item?.unread),
        from: {
            name: senderName || null,
            address: senderAddress || null,
            phone: senderPhone || null
        },
        received_at: item?.received_at
            || item?.sent_at
            || item?.updated_at
            || item?.date
            || item?.created_at
            || null
    };
};

const sortCommunicationItems = (items = [], order = null) => {
    const safeItems = Array.isArray(items) ? [...items] : [];
    safeItems.sort((left, right) => {
        const leftTime = Date.parse(String(left?.received_at || '')) || 0;
        const rightTime = Date.parse(String(right?.received_at || '')) || 0;
        return rightTime - leftTime;
    });
    if (String(order || '').trim().toLowerCase() === 'oldest') {
        safeItems.reverse();
    }
    return safeItems;
};

const buildCommunicationCountsReply = (items = [], locale = 'fr-FR', {
    unreadOnly = false
} = {}) => {
    const en = isEnglish(locale);
    const mailCount = items.filter((entry) => entry?.comm_surface === 'mail').length;
    const messageCount = items.filter((entry) => entry?.comm_surface === 'messages').length;
    const total = items.length;
    if (total === 0) {
        return en
            ? (unreadOnly ? 'I do not see any unread mail or message right now.' : 'I do not see any mail or message right now.')
            : (unreadOnly ? 'Je ne vois ni mail ni message non lu pour le moment.' : 'Je ne vois ni mail ni message pour le moment.');
    }
    const parts = [];
    if (mailCount > 0) parts.push(en ? `${mailCount} mail(s)` : `${mailCount} mail(s)`);
    if (messageCount > 0) parts.push(en ? `${messageCount} message(s)` : `${messageCount} message(s)`);
    return en
        ? `${unreadOnly ? 'You have' : 'I found'} ${total} item(s): ${parts.join(' and ')}.`
        : `${unreadOnly ? 'Tu as' : "J'ai trouve"} ${total} element(s) : ${parts.join(' et ')}.`;
};

const buildCommunicationListReply = (items = [], request, locale = 'fr-FR') => {
    if (!Array.isArray(items) || items.length === 0) {
        return buildCommunicationCountsReply([], locale, {
            unreadOnly: request?.filters?.read_state === 'unread' || request?.status_only === true
        });
    }
    const allMail = items.every((entry) => entry?.comm_surface !== 'messages');
    if (allMail) return buildMailListReply(items, request);
    const en = isEnglish(locale);
    if (request?.status_only === true) {
        return buildCommunicationCountsReply(items, locale, {
            unreadOnly: request?.filters?.read_state === 'unread'
        });
    }
    const labels = items.slice(0, 4).map((item) => {
        const sender = formatSenderLabel(item);
        const subject = formatSubjectLabel(item);
        const kind = item?.comm_surface === 'messages'
            ? (en ? 'message' : 'message')
            : (en ? 'mail' : 'mail');
        if (sender && subject) return `${kind}: ${subject} (${en ? 'from' : 'de'} ${sender})`;
        return `${kind}: ${subject || sender || ''}`.trim();
    }).filter(Boolean);
    return en
        ? `Here are the latest items: ${labels.join(', ')}.`
        : `Voici les derniers elements : ${labels.join(', ')}.`;
};

const buildCommunicationReadReply = (item, locale, request = null) => {
    if (item?.comm_surface !== 'messages') {
        return buildMailReadReply(item, locale, request);
    }
    const en = isEnglish(locale);
    const sender = formatSenderLabel(item) || (en ? 'unknown sender' : 'expediteur inconnu');
    const body = sanitizeBodyForSpeech(item?.body_text || item?.preview || '');
    if (en) {
        return body
            ? `Message from ${sender}. ${body}`
            : `Message from ${sender}.`;
    }
    return body
        ? `Message de ${sender}. ${body}`
        : `Message de ${sender}.`;
};

const loadCommunicationList = async ({
    request,
    mailApi,
    messagesApi,
    queryText,
    baseOpts
}) => {
    const surfaces = normalizeCommunicationSurfaces(request?.surfaces || ['mail']);
    const items = [];
    if (surfaces.includes('mail') && mailApi) {
        const mailResult = queryText && typeof mailApi.search === 'function'
            ? await mailApi.search(queryText, baseOpts)
            : (typeof mailApi.list === 'function' ? await mailApi.list(baseOpts) : { ok: false, items: [] });
        const mailItems = Array.isArray(mailResult?.items) ? mailResult.items : [];
        items.push(...mailItems.map((entry) => normalizeCommunicationItem(entry, 'mail')));
    }
    if (surfaces.includes('messages') && messagesApi) {
        const messagesResult = queryText && typeof messagesApi.search === 'function'
            ? await messagesApi.search(queryText, baseOpts)
            : (typeof messagesApi.list === 'function' ? await messagesApi.list(baseOpts) : { ok: false, items: [] });
        const messageItems = Array.isArray(messagesResult?.items) ? messagesResult.items : [];
        items.push(...messageItems.map((entry) => normalizeCommunicationItem(entry, 'messages')));
    }
    return sortCommunicationItems(items, request?.filters?.order || 'newest').slice(0, Math.max(1, Number(baseOpts?.limit) || 10));
};

const buildContactsReply = (items, locale) => {
    const en = isEnglish(locale);
    const labels = items.map((c) => String(c?.name || c?.display_name || c?.email || '').trim()).filter(Boolean).slice(0, 3);
    if (!items.length) {
        return en ? 'I do not see any matching contact right now.' : 'Je ne vois pas de contact correspondant pour le moment.';
    }
    return en
        ? `I found ${items.length} contact(s): ${labels.join(', ')}.`
        : `J'ai trouve ${items.length} contact(s) : ${labels.join(', ')}.`;
};

const normalizePhoneForContactCreate = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    const cleaned = text.replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) {
        return `+${cleaned.slice(1).replace(/\+/g, '')}`;
    }
    return cleaned.replace(/\+/g, '');
};

const extractContactCreatePayload = (request = {}) => {
    const structuredPayload = request?.payload && typeof request.payload === 'object' && !Array.isArray(request.payload)
        ? { ...request.payload }
        : {};
    const structuredName = String(
        structuredPayload.name
        || structuredPayload.display_name
        || structuredPayload.full_name
        || structuredPayload.nickname
        || ''
    ).trim();
    const structuredPhone = normalizePhoneForContactCreate(
        structuredPayload.phone
        || structuredPayload.mobile
        || structuredPayload.phone_number
        || ''
    );
    const structuredEmail = String(structuredPayload.email || '').trim();
    if (structuredName || structuredPhone || structuredEmail) {
        return {
            ...structuredPayload,
            ...(structuredName ? { name: structuredName } : {}),
            ...(structuredPhone ? { phone: structuredPhone } : {}),
            ...(structuredEmail ? { email: structuredEmail } : {})
        };
    }

    const utterances = [
        request?.source?.utterance_raw,
        request?.source?.utterance_normalized,
        request?.filters?.query_text
    ].map((entry) => String(entry || '').trim()).filter(Boolean);
    const combined = utterances.join(' ').replace(/\s+/g, ' ').trim();
    if (!combined) {
        return { name: '', phone: '' };
    }

    const phoneMatch = combined.match(/(\+?\d(?:[\d\s().-]{6,}\d))/);
    const phone = normalizePhoneForContactCreate(phoneMatch?.[1] || '');

    const namePatterns = [
        /(?:nomm?[ée]?|nom[ée]?|appele?|appel[ée]?|appel[eé])\s+(.+?)(?=\s+(?:qui\b|avec\b|a\b|au\b|tel\b|telephone\b|t[eé]l[eé]phone\b|numero\b|num[eé]ro\b|phone\b)|$)/i,
        /(?:contact|user)\s+(.+?)(?=\s+(?:qui\b|avec\b|a\b|au\b|tel\b|telephone\b|t[eé]l[eé]phone\b|numero\b|num[eé]ro\b|phone\b)|$)/i
    ];

    let name = '';
    for (let index = 0; index < namePatterns.length; index += 1) {
        const match = combined.match(namePatterns[index]);
        if (!match?.[1]) continue;
        name = String(match[1] || '')
            .replace(/\b(?:nomm?[ée]?|nom[ée]?|appele?|appel[ée]?|appel[eé])\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (name) break;
    }

    if (!name && phone) {
        const beforePhone = combined.split(phoneMatch?.[1] || '')[0] || combined;
        name = beforePhone
            .replace(/\b(?:peux tu|peux-tu|merci de|veuillez|stp|s'il te plait|s il te plait)\b/gi, ' ')
            .replace(/\b(?:cr[eé]+r?|cree?r?|ajoute|crée|nouveau|nouvelle|contact|user|nomm?[ée]?|nom[ée]?|avec|qui|a|le|la|un|une|numero|num[eé]ro|telephone|t[eé]l[eé]phone)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    return {
        name: String(name || '').trim(),
        phone
    };
};

const extractContactUpdatePayload = (request = {}) => {
    const payload = request?.payload && typeof request.payload === 'object' && !Array.isArray(request.payload)
        ? { ...request.payload }
        : {};
    delete payload.contact_id;
    delete payload.contactId;
    delete payload.id;
    delete payload.source_id;
    delete payload.query;
    delete payload.query_text;
    delete payload.limit;
    if (payload.phone || payload.mobile || payload.phone_number) {
        payload.phone = normalizePhoneForContactCreate(
            payload.phone || payload.mobile || payload.phone_number
        );
    }
    if (payload.email) payload.email = String(payload.email).trim();
    if (payload.name) payload.name = String(payload.name).trim();
    if (payload.organization) payload.organization = String(payload.organization).trim();
    if (payload.company) payload.company = String(payload.company).trim();
    if (Object.keys(payload).length > 0) {
        return payload;
    }

    const utterances = [
        request?.source?.utterance_raw,
        request?.source?.utterance_normalized
    ].map((entry) => String(entry || '').trim()).filter(Boolean);
    const raw = utterances[0] || '';
    const combined = utterances.join(' ').replace(/\s+/g, ' ').trim();
    if (!combined) return payload;

    const emailMatch = raw.match(/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
    if (emailMatch?.[1]) {
        payload.email = String(emailMatch[1]).trim();
    }

    const phoneMatch = raw.match(/\b(\+?\d(?:[\d\s().-]{6,}\d))\b/);
    if (
        phoneMatch?.[1]
        && /\b(?:numero|num[eé]ro|telephone|t[eé]l[eé]phone|phone|mobile)\b/i.test(combined)
    ) {
        payload.phone = normalizePhoneForContactCreate(phoneMatch[1]);
    }

    const renameMatch = raw.match(/(?:renomme|rename)\s+(.+?)\s+(?:en|to)\s+(.+)$/i);
    if (renameMatch?.[2]) {
        payload.name = String(renameMatch[2] || '').trim();
    }

    return payload;
};

const normalizeContactComparable = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const contactMatchesMutationPayload = (contact = {}, payload = {}) => {
    const payloadEmail = normalizeContactComparable(payload?.email);
    const payloadPhone = normalizePhoneForContactCreate(payload?.phone);
    const payloadName = normalizeContactComparable(
        payload?.name
        || payload?.display_name
        || payload?.full_name
        || payload?.nickname
    );
    const contactEmail = normalizeContactComparable(contact?.email);
    const contactPhone = normalizePhoneForContactCreate(
        contact?.phone
        || contact?.mobile
        || contact?.phone_number
    );
    const contactName = normalizeContactComparable(
        contact?.name
        || contact?.display_name
        || contact?.full_name
        || contact?.nickname
    );

    if (payloadEmail && contactEmail && payloadEmail === contactEmail) return true;
    if (payloadPhone && contactPhone && payloadPhone === contactPhone) return true;
    if (payloadName && contactName && payloadName === contactName) return true;
    return false;
};

const findExistingContactForMutation = async (contactsApi, payload = {}) => {
    if (!contactsApi || typeof contactsApi.search !== 'function') return null;
    const seeds = [
        payload?.email,
        payload?.phone,
        payload?.name,
        payload?.display_name,
        payload?.full_name,
        payload?.nickname
    ].map((entry) => String(entry || '').trim()).filter(Boolean);

    for (const seed of seeds) {
        
            const result = await contactsApi.search(seed, { limit: 5 });
            const items = Array.isArray(result?.items) ? result.items : [];
            const matched = items.find((entry) => contactMatchesMutationPayload(entry, payload));
            if (matched) return matched;
        
    }
    return null;
};

const buildCalendarReply = (items, locale) => {
    const en = isEnglish(locale);
    const labels = items.map((e) => String(e?.title || e?.summary || e?.name || '').trim()).filter(Boolean).slice(0, 3);
    if (!items.length) {
        return en ? 'I do not see any calendar event right now.' : 'Je ne vois pas de rendez-vous pour le moment.';
    }
    return en
        ? `You have ${items.length} calendar event(s): ${labels.join(', ')}.`
        : `Tu as ${items.length} rendez-vous : ${labels.join(', ')}.`;
};

const checkMailTrust = (workingMemory, locale, operation) => {
    if (!workingMemory) return null;
    const currentMail = workingMemory.getCurrentItem('mail');
    if (!currentMail || typeof currentMail !== 'object') return null;
    const trust = computeTrustScore(currentMail);
    if (trust.level === 'trusted') return null;
    const warning = buildTrustWarning(trust, locale);
    if (trust.level === 'blocked') {
        return {
            ok: false,
            domain: 'mail',
            operation,
            error: 'mail_trust_blocked',
            trust_score: trust.score,
            trust_level: trust.level,
            trust_signals: trust.signals,
            reply_text: warning,
            executed: false
        };
    }
    // suspicious — return a result that signals confirmation_required
    return {
        __trust_warning: true,
        trust_score: trust.score,
        trust_level: trust.level,
        trust_signals: trust.signals,
        trust_warning_text: warning
    };
};

const executeMailRequest = async (request, connectors, workingMemory) => {
    const mailApi = connectors.mail;
    const messagesApi = connectors.messages || null;
    if (!mailApi) {
        return createStructuredResult({
            ok: false, domain: 'mail', operation: request.operation,
            error: 'mail_connector_unavailable',
            reply_text: isEnglish(request.source?.locale)
                ? 'I do not have access to your mail here yet.'
                : "Je n'ai pas encore acces a tes mails ici."
        });
    }

    let readyResult = null;
    if (typeof mailApi.ensureReady === 'function') {
        try {
            readyResult = await mailApi.ensureReady({ initial: false, limit: 20 });
        } catch (err) {
            readyResult = { ok: false, error: String(err?.message || err || 'ensureReady_threw') };
        }
        if (readyResult?.ok === false) {
            const en = isEnglish(request.source?.locale);
            const errKey = String(readyResult.error || '');
            if (
                errKey === 'mail_credentials_missing'
                || errKey === 'icloud_mail_live_smoke_missing_credentials'
                || errKey === 'icloud_mail_credentials_missing'
            ) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: request.operation,
                    error: errKey,
                    reply_text: en
                        ? 'I do not see any mail credentials configured in your settings yet.'
                        : 'Je ne trouve pas encore toute la configuration mail dans tes reglages.'
                });
            }
            return createStructuredResult({
                ok: false, domain: 'mail', operation: request.operation,
                error: errKey || 'mail_sync_failed',
                reply_text: en
                    ? `Mail sync failed: ${errKey || 'unknown error'}. Check your connection and credentials.`
                    : `La synchronisation mail a echoue : ${errKey || 'erreur inconnue'}. Verifie ta connexion et tes identifiants.`
            });
        }
    }

    const locale = request.source?.locale || 'fr-FR';
    const filters = request.filters || {};
    const requestedSurfaces = normalizeCommunicationSurfaces(request.surfaces || ['mail']);
    const normalizedMailbox = String(filters.mailbox || '').trim().toLowerCase() || '';
    const baseOpts = {
        limit: filters.limit || 10,
        ...(normalizedMailbox && normalizedMailbox !== 'inbox' ? { mailbox: normalizedMailbox } : {}),
        ...(filters.thread_id ? { thread_id: filters.thread_id } : {}),
        ...(filters.from?.length ? { from: filters.from } : {}),
        ...(filters.not_from?.length ? { not_from: filters.not_from } : {}),
        ...(filters.order ? { order: filters.order } : {}),
        ...(filters.read_state === 'unread' ? { unread_only: true } : {})
    };
    const hasMessagesSurface = requestedSurfaces.includes('messages') && !!messagesApi;

    if (hasMessagesSurface && typeof messagesApi.syncPull === 'function') {
        try { await messagesApi.syncPull({ limit: 100 }); } catch (_) { /* keep going */ }
    }

    switch (request.operation) {
        case 'list': {
            if (hasMessagesSurface) {
                const items = await loadCommunicationList({
                    request,
                    mailApi,
                    messagesApi,
                    queryText: '',
                    baseOpts,
                });
                if (workingMemory) {
                    workingMemory.setResultSet('mail', items, 'message_id');
                    workingMemory.setFilters('mail', { ...filters, communication_surfaces: requestedSurfaces });
                    workingMemory.setOrder('mail', filters.order || null);
                    workingMemory.setLastOperation('mail', 'list');
                    const firstItem = items[0] || null;
                    const firstId = firstItem?.message_id || firstItem?.id || null;
                    if (firstItem && firstId) {
                        workingMemory.setCurrentItem('mail', firstId, firstItem);
                    }
                }
                return createStructuredResult({
                    ok: true, domain: 'mail', operation: 'list',
                    items,
                    reply_text: buildCommunicationListReply(items, request, locale)
                });
            }
            const result = typeof mailApi.list === 'function' ? mailApi.list(baseOpts) : { ok: false, items: [] };
            const items = Array.isArray(result?.items) ? result.items : [];
            if (workingMemory) {
                workingMemory.setResultSet('mail', items, 'message_id');
                workingMemory.setFilters('mail', filters);
                workingMemory.setOrder('mail', filters.order || null);
                workingMemory.setLastOperation('mail', 'list');
                const firstItem = items[0] || null;
                const firstId = firstItem?.message_id || firstItem?.id || null;
                if (firstItem && firstId) {
                    workingMemory.setCurrentItem('mail', firstId, firstItem);
                }
            }
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'mail', operation: 'list',
                items, stats: result?.stats || {},
                reply_text: buildMailListReply(items, request)
            });
        }

        case 'read': {
            let targetId = request.target?.id || null;
            const currentMemoryItem = workingMemory ? workingMemory.getCurrentItem('mail') : null;

            if (!targetId && hasMessagesSurface) {
                const items = await loadCommunicationList({
                    request,
                    mailApi,
                    messagesApi,
                    queryText: filters.query_text || '',
                    baseOpts: { ...baseOpts, limit: 1 },
                });
                if (items.length > 0) targetId = items[0].message_id;
            } else if (!targetId && typeof mailApi.list === 'function') {
                const lookupResult = mailApi.list({ ...baseOpts, limit: 1 });
                const lookupItems = Array.isArray(lookupResult?.items) ? lookupResult.items : [];
                if (lookupItems.length > 0) {
                    targetId = lookupItems[0].message_id;
                }
            }

            if (!targetId && workingMemory) {
                targetId = workingMemory.getCurrentItemId('mail');
            }

            const targetInfo = parseCommunicationItemId(targetId);
            if (targetInfo.surface === 'messages' && messagesApi) {
                const readResult = typeof messagesApi.read === 'function'
                    ? await messagesApi.read(targetInfo.source_id)
                    : { ok: currentMemoryItem?.comm_surface === 'messages', item: currentMemoryItem };
                const readItem = readResult?.item || readResult?.message || currentMemoryItem || null;
                if (readResult?.ok === true && readItem) {
                    const normalizedItem = normalizeCommunicationItem(readItem, 'messages');
                    const readTrust = computeTrustScore(normalizedItem);
                    if (workingMemory) {
                        workingMemory.setCurrentItem('mail', normalizedItem.message_id, normalizedItem);
                        workingMemory.setLastOperation('mail', 'read');
                    }
                    const readWarning = readTrust.level !== 'trusted' ? buildTrustWarning(readTrust, locale) : '';
                    return createStructuredResult({
                        ok: true, domain: 'mail', operation: 'read',
                        item: normalizedItem,
                        trust_score: readTrust.score,
                        trust_level: readTrust.level,
                        trust_signals: readTrust.signals,
                        reply_text: buildCommunicationReadReply(normalizedItem, locale, request)
                            + (readWarning ? '\n\n' + readWarning : '')
                    });
                }
            }

            if (!targetId || typeof mailApi.read !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'read', error: 'mail_not_found',
                    reply_text: isEnglish(locale) ? 'I do not see which mail to read right now.' : 'Je ne vois pas quel mail lire pour le moment.'
                });
            }
            const result = mailApi.read(targetId);
            if (result?.ok === true && result.item) {
                if (typeof mailApi.markRead === 'function') {
                    await mailApi.markRead(targetId, { read: true });
                }
                const mailReadTrust = computeTrustScore(result.item);
                if (workingMemory) {
                    workingMemory.setCurrentItem('mail', targetId, result.item);
                    workingMemory.setLastOperation('mail', 'read');
                }
                const mailReadWarning = mailReadTrust.level !== 'trusted' ? buildTrustWarning(mailReadTrust, locale) : '';
                return createStructuredResult({
                    ok: true, domain: 'mail', operation: 'read',
                    item: result.item,
                    trust_score: mailReadTrust.score,
                    trust_level: mailReadTrust.level,
                    trust_signals: mailReadTrust.signals,
                    reply_text: buildMailReadReply(result.item, locale, request)
                        + (mailReadWarning ? '\n\n' + mailReadWarning : '')
                });
            }
            return createStructuredResult({
                ok: false, domain: 'mail', operation: 'read', error: 'mail_not_found',
                reply_text: isEnglish(locale) ? 'I could not find that mail.' : 'Je ne trouve pas ce mail.'
            });
        }

        case 'summarize': {
            let targetId = request.target?.id || null;

            if (!targetId && workingMemory) {
                targetId = workingMemory.getCurrentItemId('mail');
            }

            if (!targetId && hasMessagesSurface) {
                const items = await loadCommunicationList({
                    request,
                    mailApi,
                    messagesApi,
                    queryText: filters.query_text || '',
                    baseOpts: { ...baseOpts, limit: 5 },
                });
                return createStructuredResult({
                    ok: true, domain: 'mail', operation: 'summarize',
                    items,
                    reply_text: buildCommunicationListReply(items, request, locale)
                });
            }
            if (!targetId && typeof mailApi.list === 'function') {
                const lookupResult = mailApi.list({ ...baseOpts, limit: 1 });
                const lookupItems = Array.isArray(lookupResult?.items) ? lookupResult.items : [];
                if (lookupItems.length > 0) {
                    targetId = lookupItems[0].message_id;
                }
            }

            if (targetId && typeof mailApi.read === 'function') {
                const result = mailApi.read(targetId);
                if (result?.ok === true && result.item) {
                    if (workingMemory) {
                        workingMemory.setCurrentItem('mail', targetId, result.item);
                        workingMemory.setLastOperation('mail', 'summarize');
                    }
                    return createStructuredResult({
                        ok: true, domain: 'mail', operation: 'summarize',
                        item: result.item,
                        reply_text: buildMailReadReply(result.item, locale, request)
                    });
                }
            }
            const listResult = typeof mailApi.list === 'function' ? mailApi.list({ ...baseOpts, limit: 5 }) : { ok: false, items: [] };
            const items = Array.isArray(listResult?.items) ? listResult.items : [];
            return createStructuredResult({
                ok: listResult?.ok !== false, domain: 'mail', operation: 'summarize',
                items, stats: listResult?.stats || {},
                reply_text: buildMailListReply(items, request)
            });
        }

        case 'compose': {
            const composeTrust = checkMailTrust(workingMemory, locale, 'compose');
            if (composeTrust && !composeTrust.__trust_warning) return composeTrust;
            if (composeTrust?.__trust_warning && !request._trust_acknowledged) {
                return {
                    ok: true, domain: 'mail', operation: 'compose',
                    trust_score: composeTrust.trust_score,
                    trust_level: composeTrust.trust_level,
                    trust_signals: composeTrust.trust_signals,
                    confirmation_required: true,
                    reply_text: composeTrust.trust_warning_text,
                    executed: false
                };
            }
            const composeText = request.draft?.reply_text;
            if (!composeText) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'compose', error: 'mail_compose_text_missing',
                    reply_text: isEnglish(locale) ? 'What should I write in the mail?' : 'Que veux-tu que j ecrive dans le mail ?'
                });
            }
            const composeTarget = String(request.draft?.reply_target || '').trim();
            if (!composeTarget) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'compose', error: 'mail_compose_no_recipient',
                    reply_text: isEnglish(locale) ? 'Who should I send the mail to?' : 'A qui dois-je envoyer le mail ?'
                });
            }
            let recipientEmail = null;
            let recipientName = composeTarget;
            const contactsApi = connectors.contacts;
            if (contactsApi && typeof contactsApi.search === 'function') {
                try {
                    const contactResult = await contactsApi.search(composeTarget, { limit: 5 });
                    const contacts = Array.isArray(contactResult?.items) ? contactResult.items : [];
                    const match = contacts.find((c) => {
                        const cName = String(c?.name || '').trim().toLowerCase();
                        const target = composeTarget.toLowerCase();
                        return cName && (cName.includes(target) || target.includes(cName));
                    });
                    if (match) {
                        recipientEmail = match.email || null;
                        recipientName = match.name || composeTarget;
                    }
                } catch (_) { /* contacts lookup failed, continue */ }
            }
            if (!recipientEmail) {
                const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/;
                if (emailPattern.test(composeTarget)) {
                    recipientEmail = composeTarget;
                }
            }
            if (!recipientEmail) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'compose', error: 'mail_compose_no_email',
                    reply_text: isEnglish(locale)
                        ? `I cannot find an email address for ${recipientName}.`
                        : `Je ne trouve pas d adresse email pour ${recipientName}.`
                });
            }
            const subject = request.draft?.subject || '';
            if (typeof mailApi.composeDraft === 'function') {
                const composeResult = mailApi.composeDraft({
                    to: [{ name: recipientName, address: recipientEmail }],
                    subject,
                    body_text: composeText
                });
                if (composeResult?.ok === true) {
                    if (request.draft?.auto_send && typeof mailApi.send === 'function') {
                        const confirmationGate = requireVoiceMutationConfirmation(request, 'mail', 'send', locale);
                        if (confirmationGate) return confirmationGate;
                        const sendResult = await mailApi.send(composeResult.draft.draft_id, { confirmed: true });
                        if (sendResult?.ok === true) {
                            if (workingMemory) {
                                workingMemory.setLastOperation('mail', 'compose_sent');
                                workingMemory.setCurrentItem('mail_draft', null, null);
                            }
                            return createStructuredResult({
                                ok: true, domain: 'mail', operation: 'compose',
                                draft: sendResult?.draft || composeResult?.draft || null,
                                reply_text: isEnglish(locale)
                                    ? `Mail sent to ${recipientName}.`
                                    : `Mail envoye a ${recipientName}.`
                            });
                        }
                    }
                    if (workingMemory) {
                        const rawDraftId = String(composeResult.draft.draft_id || '').trim();
                        const draftId = createCommunicationItemId('mail', rawDraftId);
                        workingMemory.setCurrentItem('mail_draft', draftId, {
                            ...(composeResult.draft || {}),
                            draft_id: draftId,
                            raw_draft_id: rawDraftId,
                            comm_surface: 'mail'
                        });
                        workingMemory.setLastOperation('mail', 'compose_drafted');
                    }
                    return createStructuredResult({
                        ok: true, domain: 'mail', operation: 'compose',
                        draft: composeResult.draft || null,
                        reply_text: isEnglish(locale)
                            ? `Draft mail to ${recipientName} prepared. Say "send the mail" to send it.`
                            : `Brouillon de mail a ${recipientName} prepare. Dis "envoie le mail" pour l'envoyer.`
                    });
                }
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'compose', error: composeResult?.error || 'mail_compose_failed',
                    reply_text: isEnglish(locale) ? 'I could not prepare the mail draft.' : 'Je n ai pas pu preparer le brouillon.'
                });
            }
            return createStructuredResult({
                ok: false, domain: 'mail', operation: 'compose', error: 'mail_compose_unavailable',
                reply_text: isEnglish(locale) ? 'Mail composition is not available.' : 'La composition de mail n est pas disponible.'
            });
        }

        case 'reply_prompt':
            if (!request.draft?.reply_text) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'reply_prompt', error: 'mail_reply_text_missing',
                    reply_text: isEnglish(locale) ? 'What should I reply to this mail?' : 'Que veux-tu que je reponde a ce mail ?'
                });
            }
        // fall through to reply when draft_text is available

        case 'reply': {
            const replyTrust = checkMailTrust(workingMemory, locale, 'reply');
            if (replyTrust && !replyTrust.__trust_warning) return replyTrust;
            if (replyTrust?.__trust_warning && !request._trust_acknowledged) {
                return {
                    ok: true, domain: 'mail', operation: 'reply',
                    trust_score: replyTrust.trust_score,
                    trust_level: replyTrust.trust_level,
                    trust_signals: replyTrust.trust_signals,
                    confirmation_required: true,
                    reply_text: replyTrust.trust_warning_text,
                    executed: false
                };
            }
            const draftText = request.draft?.reply_text;
            if (!draftText) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'reply', error: 'mail_reply_text_missing',
                    reply_text: isEnglish(locale) ? 'What should I reply to this mail?' : 'Que veux-tu que je reponde a ce mail ?'
                });
            }
            let targetId = request.target?.id || null;

            const replyTarget = String(request.draft?.reply_target || '').trim().toLowerCase();
            if (!targetId && replyTarget && typeof mailApi.list === 'function') {
                const candidates = mailApi.list({ ...baseOpts, limit: 30 });
                const items = Array.isArray(candidates?.items) ? candidates.items : [];
                const match = items.find((item) => {
                    const senderName = String(item?.from?.name || '').trim().toLowerCase();
                    const senderAddr = String(item?.from?.address || '').trim().toLowerCase();
                    return (senderName && (senderName.includes(replyTarget) || replyTarget.includes(senderName)))
                        || (senderAddr && senderAddr.includes(replyTarget));
                });
                if (match?.message_id) targetId = match.message_id;
            }

            if (!targetId && workingMemory) {
                targetId = workingMemory.getCurrentItemId('mail');
            }
            const targetInfo = parseCommunicationItemId(targetId);

            if (
                targetInfo.surface === 'messages'
                && messagesApi
                && typeof messagesApi.replyDraft === 'function'
            ) {
                const draftResult = await messagesApi.replyDraft(targetInfo.source_id, { reply_text: draftText });
                if (draftResult?.ok === true) {
                    const rawDraftId = String(draftResult?.draft?.draft_id || draftResult?.draft_id || '').trim();
                    const draftId = createCommunicationItemId('messages', rawDraftId);
                    if (workingMemory) {
                        workingMemory.setCurrentItem('mail_draft', draftId, {
                            ...(draftResult?.draft || {}),
                            draft_id: draftId,
                            raw_draft_id: rawDraftId,
                            comm_surface: 'messages'
                        });
                        workingMemory.setLastOperation('mail', 'reply_drafted');
                    }
                    return createStructuredResult({
                        ok: true, domain: 'mail', operation: 'reply',
                        draft: draftResult?.draft || null,
                        reply_text: isEnglish(locale)
                            ? `Reply draft prepared. Say "send the mail" to send it.`
                            : `Brouillon de reponse prepare. Dis "envoie le mail" pour l'envoyer.`
                    });
                }
            }

            if (!targetId || typeof mailApi.replyDraft !== 'function') {
                const en = isEnglish(locale);
                const msg = replyTarget
                    ? (en ? `I do not see any mail from ${replyTarget} to reply to.` : `Je ne trouve pas de mail de ${replyTarget} pour y repondre.`)
                    : (en ? 'I do not see which mail to reply to.' : 'Je ne vois pas a quel mail repondre.');
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'reply', error: 'mail_not_found',
                    reply_text: msg
                });
            }
            const draftResult = mailApi.replyDraft(targetId, { reply_text: draftText });
            if (draftResult?.ok !== true) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'reply', error: draftResult?.error || 'mail_reply_draft_failed',
                    reply_text: isEnglish(locale) ? 'I could not prepare the reply draft.' : "Je n'ai pas pu preparer le brouillon."
                });
            }
            if (request.draft?.auto_send && typeof mailApi.send === 'function') {
                const confirmationGate = requireVoiceMutationConfirmation(request, 'mail', 'send', locale);
                if (confirmationGate) return confirmationGate;
                const sendResult = await mailApi.send(draftResult.draft.draft_id, { confirmed: true });
                if (sendResult?.ok === true) {
                    if (workingMemory) {
                        workingMemory.setLastOperation('mail', 'reply_sent');
                        workingMemory.setCurrentItem('mail_draft', null, null);
                    }
                    const recipient = formatSenderLabel(sendResult?.draft || {}) || '';
                    return createStructuredResult({
                        ok: true, domain: 'mail', operation: 'reply',
                        draft: sendResult?.draft || draftResult?.draft || null,
                        reply_text: isEnglish(locale)
                            ? (recipient ? `The reply has been sent to ${recipient}.` : 'The reply has been sent.')
                            : (recipient ? `La reponse a ete envoyee a ${recipient}.` : 'La reponse a ete envoyee.')
                    });
                }
            }
            if (workingMemory) {
                const rawDraftId = String(draftResult?.draft?.draft_id || '').trim();
                const draftId = createCommunicationItemId('mail', rawDraftId);
                workingMemory.setCurrentItem('mail_draft', draftId, {
                    ...(draftResult?.draft || {}),
                    draft_id: draftId,
                    raw_draft_id: rawDraftId,
                    comm_surface: 'mail'
                });
                workingMemory.setLastOperation('mail', 'reply_drafted');
            }
            return createStructuredResult({
                ok: true, domain: 'mail', operation: 'reply',
                draft: draftResult?.draft || null,
                reply_text: isEnglish(locale)
                    ? `Reply draft prepared. Say "send the mail" to send it.`
                    : `Brouillon de reponse prepare. Dis "envoie le mail" pour l'envoyer.`
            });
        }

        case 'send': {
            const sendTrust = checkMailTrust(workingMemory, locale, 'send');
            if (sendTrust && !sendTrust.__trust_warning) return sendTrust;
            if (sendTrust?.__trust_warning && !request._trust_acknowledged) {
                return {
                    ok: true, domain: 'mail', operation: 'send',
                    trust_score: sendTrust.trust_score,
                    trust_level: sendTrust.trust_level,
                    trust_signals: sendTrust.trust_signals,
                    confirmation_required: true,
                    reply_text: sendTrust.trust_warning_text,
                    executed: false
                };
            }
            const currentDraft = workingMemory ? workingMemory.getCurrentItem('mail_draft') : null;
            const currentDraftId = request.target?.id
                || (workingMemory ? workingMemory.getCurrentItemId('mail_draft') : null);
            const currentDraftInfo = parseCommunicationItemId(currentDraftId);
            const sendSurface = currentDraft?.comm_surface || currentDraftInfo.surface || 'mail';
            const sendApi = sendSurface === 'messages' ? messagesApi : mailApi;
            if (!sendApi || typeof sendApi.send !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'send', error: 'mail_send_unavailable',
                    reply_text: isEnglish(locale) ? 'Mail sending is not available.' : "L'envoi de mail n'est pas disponible."
                });
            }
            const draftId = String(
                currentDraft?.raw_draft_id
                || currentDraftInfo.source_id
                || ''
            ).trim();
            if (!draftId) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'send', error: 'mail_draft_not_found',
                    reply_text: isEnglish(locale) ? 'I do not have a draft to send.' : "Je n'ai pas de brouillon a envoyer."
                });
            }
            const confirmationGate = requireVoiceMutationConfirmation(request, 'mail', 'send', locale);
            if (confirmationGate) return confirmationGate;
            const result = await sendApi.send(draftId, { confirmed: true });
            if (workingMemory) {
                workingMemory.setLastOperation('mail', 'send');
                workingMemory.setCurrentItem('mail_draft', null, null);
            }
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'mail', operation: 'send',
                draft: result?.draft || null,
                error: result?.ok === false ? (result?.error || 'mail_send_failed') : '',
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The mail has been sent.' : 'Le mail a ete envoye.')
                    : (isEnglish(locale) ? 'I could not send the mail.' : "Je n'ai pas pu envoyer le mail.")
            });
        }

        case 'archive': {
            const en = isEnglish(locale);
            const explicitTarget = request.target?.id || null;
            const wantedCount = filters.limit || 1;

            let targetIds = [];
            if (explicitTarget) {
                targetIds = [explicitTarget];
            } else if (typeof mailApi.list === 'function') {
                const candidates = mailApi.list({ ...baseOpts, limit: wantedCount });
                targetIds = (Array.isArray(candidates?.items) ? candidates.items : [])
                    .map((item) => item.message_id)
                    .filter(Boolean);
            }
            if (!targetIds.length && workingMemory) {
                const wmId = workingMemory.getCurrentItemId('mail');
                if (wmId) targetIds = [wmId];
            }

            if (!targetIds.length || typeof mailApi.archive !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'archive', error: 'mail_not_found',
                    reply_text: en ? 'I do not see which mail to archive.' : 'Je ne vois pas quel mail archiver.'
                });
            }

            let archivedCount = 0;
            let lastError = null;
            for (const id of targetIds) {
                try {
                    const result = await mailApi.archive(id, {});
                    if (result?.ok !== false) {
                        archivedCount++;
                        if (workingMemory) workingMemory.removeFromResultSet('mail', id);
                    } else {
                        lastError = result?.error || 'mail_archive_failed';
                    }
                } catch (err) {
                    lastError = String(err?.message || err || 'mail_archive_threw');
                }
            }

            if (workingMemory) workingMemory.setLastOperation('mail', 'archive');

            if (archivedCount === 0) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'archive',
                    error: lastError || 'mail_archive_failed',
                    reply_text: en
                        ? `I could not archive the mail${targetIds.length > 1 ? 's' : ''}.`
                        : `Je n'ai pas pu archiver ${targetIds.length > 1 ? 'les mails' : 'ce mail'}.`
                });
            }

            const replyText = archivedCount === 1
                ? (en ? 'The mail has been archived.' : 'Le mail a ete archive.')
                : (en ? `${archivedCount} mails have been archived.` : `${archivedCount} mails ont ete archives.`);

            return createStructuredResult({
                ok: true, domain: 'mail', operation: 'archive',
                reply_text: replyText
            });
        }

        case 'delete': {
            const en = isEnglish(locale);

            const explicitTarget = request.target?.id || null;
            const wantedCount = filters.limit || 1;

            let targetIds = [];
            if (explicitTarget) {
                targetIds = [explicitTarget];
            } else if (typeof mailApi.list === 'function') {
                const candidates = mailApi.list({ ...baseOpts, limit: wantedCount });
                targetIds = (Array.isArray(candidates?.items) ? candidates.items : [])
                    .map((item) => item.message_id)
                    .filter(Boolean);
            }

            if (!targetIds.length && workingMemory) {
                const wmId = workingMemory.getCurrentItemId('mail');
                if (wmId) targetIds = [wmId];
            }

            if (!targetIds.length || typeof mailApi.delete !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'delete', error: 'mail_not_found',
                    reply_text: en ? 'I do not see which mail to delete.' : 'Je ne vois pas quel mail supprimer.'
                });
            }

            let deletedCount = 0;
            let lastError = null;
            for (const id of targetIds) {
                try {
                    const result = await mailApi.delete(id, {});
                    if (result?.ok !== false) {
                        deletedCount++;
                        if (workingMemory) workingMemory.removeFromResultSet('mail', id);
                    } else {
                        lastError = result?.error || 'mail_delete_failed';
                    }
                } catch (err) {
                    lastError = String(err?.message || err || 'mail_delete_threw');
                }
            }

            if (workingMemory) workingMemory.setLastOperation('mail', 'delete');

            if (deletedCount === 0) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'delete',
                    error: lastError || 'mail_delete_failed',
                    reply_text: en
                        ? `I could not delete the mail${targetIds.length > 1 ? 's' : ''}.`
                        : `Je n'ai pas pu supprimer ${targetIds.length > 1 ? 'les mails' : 'ce mail'}.`
                });
            }

            const replyText = deletedCount === 1
                ? (en ? 'The mail has been deleted.' : 'Le mail a ete supprime.')
                : (en ? `${deletedCount} mails have been deleted.` : `${deletedCount} mails ont ete supprimes.`);

            return createStructuredResult({
                ok: true, domain: 'mail', operation: 'delete',
                reply_text: replyText
            });
        }

        case 'mark_read': {
            const targetId = request.target?.id
                || (workingMemory ? workingMemory.getCurrentItemId('mail') : null);
            if (!targetId || typeof mailApi.markRead !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'mark_read', error: 'mail_not_found',
                    reply_text: isEnglish(locale) ? 'I do not see which mail to update.' : 'Je ne vois pas quel mail mettre a jour.'
                });
            }
            const result = await mailApi.markRead(targetId, { read: true });
            if (workingMemory) workingMemory.setLastOperation('mail', 'mark_read');
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'mail', operation: 'mark_read',
                reply_text: isEnglish(locale) ? 'The mail has been marked as read.' : 'Le mail a ete marque comme lu.'
            });
        }

        case 'mark_unread': {
            const targetId = request.target?.id
                || (workingMemory ? workingMemory.getCurrentItemId('mail') : null);
            if (!targetId || typeof mailApi.markRead !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'mark_unread', error: 'mail_not_found',
                    reply_text: isEnglish(locale) ? 'I do not see which mail to update.' : 'Je ne vois pas quel mail mettre a jour.'
                });
            }
            const result = await mailApi.markRead(targetId, { read: false });
            if (workingMemory) workingMemory.setLastOperation('mail', 'mark_unread');
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'mail', operation: 'mark_unread',
                reply_text: isEnglish(locale) ? 'The mail has been marked as unread.' : 'Le mail a ete marque comme non lu.'
            });
        }

        case 'search': {
            const queryText = filters.query_text;
            if (!queryText || typeof mailApi.search !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'search', error: 'mail_search_query_missing',
                    reply_text: isEnglish(locale) ? 'What should I search for in your mails?' : 'Que veux-tu que je cherche dans tes mails ?'
                });
            }
            if (hasMessagesSurface) {
                const items = await loadCommunicationList({
                    request,
                    mailApi,
                    messagesApi,
                    queryText,
                    baseOpts,
                });
                if (workingMemory) {
                    workingMemory.setResultSet('mail', items, 'message_id');
                    workingMemory.setFilters('mail', { ...filters, query_text: queryText, communication_surfaces: requestedSurfaces });
                    workingMemory.setLastOperation('mail', 'search');
                }
                return createStructuredResult({
                    ok: true, domain: 'mail', operation: 'search',
                    items,
                    reply_text: buildCommunicationListReply(items, request, locale)
                });
            }
            const result = mailApi.search(queryText, baseOpts);
            const items = Array.isArray(result?.items) ? result.items : [];
            if (workingMemory) {
                workingMemory.setResultSet('mail', items, 'message_id');
                workingMemory.setFilters('mail', { ...filters, query_text: queryText });
                workingMemory.setLastOperation('mail', 'search');
            }
            const subjects = items.slice(0, 3).map(formatSubjectLabel).filter(Boolean);
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'mail', operation: 'search',
                items,
                reply_text: subjects.length
                    ? (isEnglish(locale)
                        ? `I found these mails for "${queryText}": ${subjects.join(', ')}.`
                        : `J'ai trouve ces mails pour "${queryText}" : ${subjects.join(', ')}.`)
                    : (isEnglish(locale)
                        ? `I did not find any mail for "${queryText}".`
                        : `Je n'ai trouve aucun mail pour "${queryText}".`)
            });
        }

        default:
            return createStructuredResult({
                ok: false, domain: 'mail', operation: request.operation,
                error: 'unsupported_mail_operation',
                reply_text: isEnglish(locale) ? 'I do not know this mail action.' : 'Je ne connais pas cette action mail.'
            });
    }
};

const executeContactsRequest = async (request, connectors, workingMemory, {
    offlineQueue = null,
    allowQueue = true
} = {}) => {
    const contactsApi = connectors.contacts;
    const locale = request.source?.locale || 'fr-FR';
    if (OFFLINE_MUTATION_OPERATIONS.has(request.operation)) {
        const confirmationGate = requireVoiceMutationConfirmation(request, 'contacts', request.operation, locale);
        if (confirmationGate) return confirmationGate;
        allowQueue = allowQueue && voiceOfflineQueueEnabled(request);
    }
    if (!contactsApi) {
        return createStructuredResult({
            ok: false, domain: 'contacts', operation: request.operation,
            error: 'contacts_connector_unavailable',
            reply_text: isEnglish(request.source?.locale)
                ? 'I do not have access to your contacts here yet.'
                : "Je n'ai pas encore acces a tes contacts ici."
        });
    }

    const queryText = request.filters?.query_text || '';
    const limit = request.filters?.limit || 10;

    if (typeof contactsApi.syncPull === 'function') {
        try { await contactsApi.syncPull({ limit: 100 }); } catch (_) { /* keep going */ }
    }

    switch (request.operation) {
        case 'list':
        case 'search': {
            const result = queryText && typeof contactsApi.search === 'function'
                ? await contactsApi.search(queryText, { limit })
                : (typeof contactsApi.list === 'function' ? await contactsApi.list({ limit }) : { ok: false, items: [] });
            const items = Array.isArray(result?.items) ? result.items : [];
            if (workingMemory) {
                workingMemory.setResultSet('contacts', items, 'source_contact_id');
                const firstItem = items[0] || null;
                const firstId = firstItem?.source_contact_id || firstItem?.id || null;
                if (firstItem && firstId) {
                    workingMemory.setCurrentItem('contacts', firstId, firstItem);
                }
                workingMemory.setLastOperation('contacts', queryText ? 'search' : 'list');
            }
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'contacts', operation: queryText ? 'search' : 'list',
                items,
                reply_text: (
                    items.length >= 1
                        ? buildContactsFieldReply(items, {
                            locale,
                            contact_field: request.contact_field || null,
                            utteranceRaw: request.source?.utterance_raw || '',
                            utteranceNormalized: request.source?.utterance_normalized || ''
                        })
                        : ''
                ) || buildContactsReply(items, locale)
            });
        }

        case 'read': {
            let targetId = request.target?.id || null;
            const currentResultSet = workingMemory ? workingMemory.getResultSetItems('contacts') : [];
            if (
                !targetId
                && Array.isArray(currentResultSet)
                && currentResultSet.length > 1
            ) {
                const multiFieldReply = buildContactsFieldReply(currentResultSet, {
                    locale,
                    contact_field: request.contact_field || null,
                    utteranceRaw: request.source?.utterance_raw || '',
                    utteranceNormalized: request.source?.utterance_normalized || ''
                });
                if (multiFieldReply) {
                    return createStructuredResult({
                        ok: true,
                        domain: 'contacts',
                        operation: 'read',
                        items: currentResultSet,
                        reply_text: multiFieldReply
                    });
                }
            }
            if (!targetId && queryText && typeof contactsApi.search === 'function') {
                const lookup = await contactsApi.search(queryText, { limit: 5 });
                const matched = Array.isArray(lookup?.items) ? lookup.items[0] : null;
                targetId = matched?.source_contact_id || matched?.id || '';
                if (matched && workingMemory && typeof workingMemory.setCurrentItem === 'function' && targetId) {
                    workingMemory.setCurrentItem('contacts', targetId, matched);
                }
            }
            if (!targetId && workingMemory && !queryText) {
                targetId = workingMemory.getCurrentItemId('contacts');
            }
            if (!targetId || typeof contactsApi.read !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'read', error: 'contacts_not_found',
                    reply_text: isEnglish(locale) ? 'I do not know which contact to read.' : 'Je ne sais pas quel contact lire.'
                });
            }
            const result = await contactsApi.read(targetId);
            if (result?.ok === true && result.contact) {
                if (workingMemory && typeof workingMemory.setCurrentItem === 'function') {
                    workingMemory.setCurrentItem('contacts', targetId, result.contact);
                }
                if (workingMemory && typeof workingMemory.setLastOperation === 'function') {
                    workingMemory.setLastOperation('contacts', 'read');
                }
                const label = String(result.contact?.name || result.contact?.display_name || result.contact?.email || '').trim();
                return createStructuredResult({
                    ok: true, domain: 'contacts', operation: 'read',
                    item: result.contact,
                    reply_text: buildContactQueryReply(result.contact, {
                        locale,
                        contact_field: request.contact_field || null,
                        utteranceRaw: request.source?.utterance_raw || '',
                        utteranceNormalized: request.source?.utterance_normalized || ''
                    }) || (label ? `Contact: ${label}.` : buildContactsReply([result.contact], locale))
                });
            }
            return createStructuredResult({
                ok: false, domain: 'contacts', operation: 'read', error: 'contacts_not_found',
                reply_text: isEnglish(locale) ? 'I could not find that contact.' : 'Je ne trouve pas ce contact.'
            });
        }

        case 'create': {
            const payload = extractContactCreatePayload(request);
            if (!payload.name && !payload.phone) {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'create', error: 'contacts_create_payload_missing',
                    reply_text: isEnglish(locale)
                        ? 'I need at least a name or a phone number to create the contact.'
                        : "J'ai besoin d'un nom ou d'un numero pour creer le contact."
                });
            }
            const existingContact = await findExistingContactForMutation(contactsApi, payload);
            if (existingContact && typeof contactsApi.updateLocalContact === 'function') {
                const targetId = existingContact.source_contact_id || existingContact.id || '';
                const changes = { ...payload };
                delete changes.source_contact_id;
                delete changes.id;
                delete changes.query;
                delete changes.query_text;
                const updated = await executeConnectorCall(() => contactsApi.updateLocalContact(targetId, changes, {
                    source: 'voice'
                }), 'contacts_update_failed');
                const updatedContact = updated?.contact || existingContact;
                if (allowQueue && offlineQueue && isOfflineLikeFailure(updated)) {
                    return queueOfflineMutationResult({
                        offlineQueue,
                        request: {
                            ...cloneValue(request),
                            operation: 'update',
                            target: {
                                ...(request.target && typeof request.target === 'object' ? cloneValue(request.target) : {}),
                                id: targetId
                            },
                            payload: changes
                        },
                        domain: 'contacts',
                        operation: 'update',
                        locale,
                        item: updatedContact
                    });
                }
                if (workingMemory && targetId) {
                    workingMemory.setCurrentItem('contacts', targetId, updatedContact);
                    workingMemory.setLastOperation('contacts', 'update');
                }
                return createStructuredResult({
                    ok: updated?.ok !== false,
                    domain: 'contacts',
                    operation: 'update',
                    item: updatedContact,
                    reply_text: updated?.ok !== false
                        ? (isEnglish(locale) ? 'The contact has been updated.' : 'Le contact a ete mis a jour.')
                        : (isEnglish(locale) ? 'I could not update the contact.' : "Je n'ai pas pu mettre a jour le contact.")
                });
            }
            if (typeof contactsApi.createLocalContact !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'create', error: 'contacts_create_unavailable',
                    reply_text: isEnglish(locale) ? 'Contact creation is not available yet.' : "La creation de contact n'est pas encore disponible."
                });
            }
            const result = await executeConnectorCall(() => contactsApi.createLocalContact(payload, {
                source: 'voice'
            }), 'contacts_create_failed');
            const createdContact = result?.contact || (Array.isArray(result?.items) ? result.items[0] : null) || null;
            if (allowQueue && offlineQueue && isOfflineLikeFailure(result)) {
                return queueOfflineMutationResult({
                    offlineQueue,
                    request: {
                        ...cloneValue(request),
                        payload
                    },
                    domain: 'contacts',
                    operation: 'create',
                    locale,
                    item: createdContact
                });
            }
            if (result?.ok === true && createdContact && workingMemory) {
                const contactId = createdContact.source_contact_id || createdContact.id || null;
                if (contactId) {
                    workingMemory.setCurrentItem('contacts', contactId, createdContact);
                    workingMemory.setLastOperation('contacts', 'create');
                }
            }
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'contacts', operation: 'create',
                item: createdContact,
                reply_text: result?.ok !== false
                    ? (isEnglish(locale)
                        ? `The contact ${String(createdContact?.name || payload.name || payload.phone || '').trim()} has been created.`
                        : `Le contact ${String(createdContact?.name || payload.name || payload.phone || '').trim()} a ete cree.`)
                    : (isEnglish(locale) ? 'I could not create the contact.' : "Je n'ai pas pu creer le contact.")
            });
        }

        case 'update': {
            let targetId = request.target?.id
                || request.payload?.contact_id
                || request.payload?.contactId
                || request.payload?.id
                || (workingMemory ? workingMemory.getCurrentItemId('contacts') : null);
            const queryTarget = String(
                request.filters?.query_text
                || request.payload?.query_text
                || request.payload?.query
                || ''
            ).trim();
            if (!targetId && queryTarget && typeof contactsApi.search === 'function') {
                const lookup = await contactsApi.search(queryTarget, { limit: 5 });
                const matched = Array.isArray(lookup?.items) ? lookup.items[0] : null;
                targetId = matched?.source_contact_id || matched?.id || '';
                if (matched && workingMemory) {
                    workingMemory.setCurrentItem('contacts', targetId, matched);
                }
            }
            if (!targetId || typeof contactsApi.updateLocalContact !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'update', error: 'contacts_not_found',
                    reply_text: isEnglish(locale) ? 'I do not know which contact to update.' : 'Je ne sais pas quel contact mettre a jour.'
                });
            }
            const changes = extractContactUpdatePayload(request);
            if (!Object.keys(changes).length) {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'update', error: 'contacts_update_payload_missing',
                    reply_text: isEnglish(locale)
                        ? 'I need at least one change to update the contact.'
                        : "J'ai besoin d'au moins une modification pour mettre a jour le contact."
                });
            }
            const result = await executeConnectorCall(() => contactsApi.updateLocalContact(targetId, changes, {
                source: 'voice'
            }), 'contacts_update_failed');
            const updatedContact = result?.contact || null;
            if (allowQueue && offlineQueue && isOfflineLikeFailure(result)) {
                return queueOfflineMutationResult({
                    offlineQueue,
                    request: {
                        ...cloneValue(request),
                        target: {
                            ...(request.target && typeof request.target === 'object' ? cloneValue(request.target) : {}),
                            id: targetId
                        },
                        payload: changes
                    },
                    domain: 'contacts',
                    operation: 'update',
                    locale,
                    item: updatedContact
                });
            }
            if (result?.ok === true && updatedContact && workingMemory) {
                const contactId = updatedContact.source_contact_id || updatedContact.id || targetId;
                workingMemory.setCurrentItem('contacts', contactId, updatedContact);
                workingMemory.setLastOperation('contacts', 'update');
            }
            return createStructuredResult({
                ok: result?.ok !== false,
                domain: 'contacts',
                operation: 'update',
                item: updatedContact,
                error: result?.ok === false ? (result?.error || 'contacts_update_failed') : '',
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The contact has been updated.' : 'Le contact a ete mis a jour.')
                    : (isEnglish(locale) ? 'I could not update the contact.' : "Je n'ai pas pu mettre a jour le contact.")
            });
        }

        case 'delete': {
            const targetId = request.target?.id
                || request.payload?.contact_id
                || request.payload?.contactId
                || request.payload?.id
                || (workingMemory ? workingMemory.getCurrentItemId('contacts') : null);
            if (!targetId || typeof contactsApi.deleteLocalContact !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'delete', error: 'contacts_not_found',
                    reply_text: isEnglish(locale) ? 'I do not know which contact to delete.' : 'Je ne sais pas quel contact supprimer.'
                });
            }
            const result = await executeConnectorCall(() => contactsApi.deleteLocalContact(targetId, {
                source: 'voice'
            }), 'contacts_delete_failed');
            if (allowQueue && offlineQueue && isOfflineLikeFailure(result)) {
                return queueOfflineMutationResult({
                    offlineQueue,
                    request: {
                        ...cloneValue(request),
                        target: {
                            ...(request.target && typeof request.target === 'object' ? cloneValue(request.target) : {}),
                            id: targetId
                        }
                    },
                    domain: 'contacts',
                    operation: 'delete',
                    locale
                });
            }
            if (result?.ok === true && workingMemory) {
                workingMemory.removeFromResultSet('contacts', targetId);
                workingMemory.setLastOperation('contacts', 'delete');
            }
            return createStructuredResult({
                ok: result?.ok !== false,
                domain: 'contacts',
                operation: 'delete',
                error: result?.ok === false ? (result?.error || 'contacts_delete_failed') : '',
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The contact has been deleted.' : 'Le contact a ete supprime.')
                    : (isEnglish(locale) ? 'I could not delete the contact.' : "Je n'ai pas pu supprimer le contact.")
            });
        }

        default:
            return createStructuredResult({
                ok: false, domain: 'contacts', operation: request.operation,
                error: 'unsupported_contacts_operation',
                reply_text: isEnglish(locale) ? 'This contacts action is not available yet.' : "Cette action contacts n'est pas encore disponible."
            });
    }
};

const executeCalendarRequest = async (request, connectors, workingMemory, {
    offlineQueue = null,
    allowQueue = true
} = {}) => {
    const calendarApi = connectors.calendar;
    const locale = request.source?.locale || 'fr-FR';
    if (OFFLINE_MUTATION_OPERATIONS.has(request.operation)) {
        const confirmationGate = requireVoiceMutationConfirmation(request, 'calendar', request.operation, locale);
        if (confirmationGate) return confirmationGate;
        allowQueue = allowQueue && voiceOfflineQueueEnabled(request);
    }
    if (!calendarApi) {
        return createStructuredResult({
            ok: false, domain: 'calendar', operation: request.operation,
            error: 'calendar_connector_unavailable',
            reply_text: isEnglish(request.source?.locale)
                ? 'I do not have access to your calendar here yet.'
                : "Je n'ai pas encore acces a ton calendrier ici."
        });
    }

    const queryText = request.filters?.query_text || '';
    const limit = request.filters?.limit || 10;
    const temporalRef = request.filters?.temporal_ref || '';

    if (typeof calendarApi.syncPull === 'function') {
        try { await calendarApi.syncPull({}); } catch (_) { /* keep going */ }
    }

    switch (request.operation) {
        case 'list':
        case 'search': {
            let result = null;
            if (queryText && typeof calendarApi.search === 'function') {
                result = await calendarApi.search(queryText, { limit });
            } else if (temporalRef === 'today' && typeof calendarApi.today === 'function') {
                result = await calendarApi.today({ limit });
            } else if (typeof calendarApi.next === 'function') {
                result = await calendarApi.next({ limit });
            }
            const items = Array.isArray(result?.items) ? result.items : [];
            if (workingMemory) {
                workingMemory.setResultSet('calendar', items, 'id');
                workingMemory.setLastOperation('calendar', queryText ? 'search' : 'list');
            }
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'calendar', operation: queryText ? 'search' : 'list',
                items,
                reply_text: buildCalendarReply(items, locale)
            });
        }

        case 'read': {
            let targetId = request.target?.id
                || (workingMemory ? workingMemory.getCurrentItemId('calendar') : null);
            if (!targetId && queryText && typeof calendarApi.search === 'function') {
                const lookup = await calendarApi.search(queryText, { limit: 5 });
                const matched = Array.isArray(lookup?.items) ? lookup.items[0] : null;
                targetId = matched?.id || matched?.event_id || '';
                if (matched && workingMemory && targetId) {
                    workingMemory.setCurrentItem('calendar', targetId, matched);
                }
            }
            if (!targetId || typeof calendarApi.read !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'calendar', operation: 'read', error: 'calendar_event_not_found',
                    reply_text: isEnglish(locale) ? 'I do not see which event to read.' : 'Je ne sais pas quel evenement lire.'
                });
            }
            const result = await calendarApi.read(targetId, {});
            if (result?.ok === true && result.event) {
                if (workingMemory) {
                    workingMemory.setCurrentItem('calendar', targetId, result.event);
                    workingMemory.setLastOperation('calendar', 'read');
                }
                const label = String(result.event?.title || result.event?.summary || '').trim();
                return createStructuredResult({
                    ok: true, domain: 'calendar', operation: 'read',
                    item: result.event,
                    reply_text: label
                        ? (isEnglish(locale) ? `Calendar event: ${label}.` : `Rendez-vous : ${label}.`)
                        : buildCalendarReply([result.event], locale)
                });
            }
            return createStructuredResult({
                ok: false, domain: 'calendar', operation: 'read', error: 'calendar_event_not_found',
                reply_text: isEnglish(locale) ? 'I could not find that event.' : 'Je ne trouve pas cet evenement.'
            });
        }

        case 'create': {
            if (typeof calendarApi.create !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'calendar', operation: 'create', error: 'calendar_create_unavailable',
                    reply_text: isEnglish(locale) ? 'Event creation is not available yet.' : "La creation d'evenement n'est pas encore disponible."
                });
            }
            const requestPayload = request?.payload && typeof request.payload === 'object' && !Array.isArray(request.payload)
                ? { ...request.payload }
                : {};
            const draftPayload = request?.draft && typeof request.draft === 'object' && !Array.isArray(request.draft)
                ? { ...request.draft }
                : {};
            const payload = Object.keys(requestPayload).length ? requestPayload : draftPayload;
            const result = await executeConnectorCall(() => calendarApi.create(payload, request.payload || request.draft || {}), 'calendar_create_failed');
            if (allowQueue && offlineQueue && isOfflineLikeFailure(result)) {
                return queueOfflineMutationResult({
                    offlineQueue,
                    request: {
                        ...cloneValue(request),
                        payload
                    },
                    domain: 'calendar',
                    operation: 'create',
                    locale,
                    item: result?.event || null
                });
            }
            if (workingMemory) workingMemory.setLastOperation('calendar', 'create');
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'calendar', operation: 'create',
                item: result?.event || null,
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The event has been created.' : 'Le rendez-vous a ete cree.')
                    : (isEnglish(locale) ? 'I could not create the event.' : "Je n'ai pas pu creer le rendez-vous.")
            });
        }

        case 'update': {
            const targetId = request.target?.id
                || request.payload?.event_id
                || request.payload?.eventId
                || request.payload?.id
                || (workingMemory ? workingMemory.getCurrentItemId('calendar') : null);
            if (!targetId || typeof calendarApi.update !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'calendar', operation: 'update', error: 'calendar_event_not_found',
                    reply_text: isEnglish(locale) ? 'I do not know which event to update.' : 'Je ne sais pas quel rendez-vous mettre a jour.'
                });
            }
            const changes = request?.payload && typeof request.payload === 'object' && !Array.isArray(request.payload)
                ? { ...request.payload }
                : {};
            delete changes.event_id;
            delete changes.eventId;
            delete changes.id;
            if (!Object.keys(changes).length) {
                return createStructuredResult({
                    ok: false, domain: 'calendar', operation: 'update', error: 'calendar_update_payload_missing',
                    reply_text: isEnglish(locale)
                        ? 'I need at least one change to update the event.'
                        : "J'ai besoin d'au moins une modification pour mettre a jour le rendez-vous."
                });
            }
            const result = await executeConnectorCall(() => calendarApi.update(targetId, changes, request.payload || {}), 'calendar_update_failed');
            if (allowQueue && offlineQueue && isOfflineLikeFailure(result)) {
                return queueOfflineMutationResult({
                    offlineQueue,
                    request: {
                        ...cloneValue(request),
                        target: {
                            ...(request.target && typeof request.target === 'object' ? cloneValue(request.target) : {}),
                            id: targetId
                        },
                        payload: changes
                    },
                    domain: 'calendar',
                    operation: 'update',
                    locale,
                    item: result?.event || null
                });
            }
            if (result?.ok === true && workingMemory) {
                workingMemory.setLastOperation('calendar', 'update');
                if (result?.event) {
                    workingMemory.setCurrentItem('calendar', result.event.id || targetId, result.event);
                }
            }
            return createStructuredResult({
                ok: result?.ok !== false,
                domain: 'calendar',
                operation: 'update',
                item: result?.event || null,
                error: result?.ok === false ? (result?.error || 'calendar_update_failed') : '',
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The event has been updated.' : 'Le rendez-vous a ete mis a jour.')
                    : (isEnglish(locale) ? 'I could not update the event.' : "Je n'ai pas pu mettre a jour le rendez-vous.")
            });
        }

        case 'delete': {
            const targetId = request.target?.id
                || request.payload?.event_id
                || request.payload?.eventId
                || request.payload?.id
                || (workingMemory ? workingMemory.getCurrentItemId('calendar') : null);
            if (!targetId || typeof calendarApi.delete !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'calendar', operation: 'delete', error: 'calendar_event_not_found',
                    reply_text: isEnglish(locale) ? 'I do not know which event to delete.' : 'Je ne sais pas quel rendez-vous supprimer.'
                });
            }
            const result = await executeConnectorCall(() => calendarApi.delete(targetId, request.payload || {}), 'calendar_delete_failed');
            if (allowQueue && offlineQueue && isOfflineLikeFailure(result)) {
                return queueOfflineMutationResult({
                    offlineQueue,
                    request: {
                        ...cloneValue(request),
                        target: {
                            ...(request.target && typeof request.target === 'object' ? cloneValue(request.target) : {}),
                            id: targetId
                        }
                    },
                    domain: 'calendar',
                    operation: 'delete',
                    locale
                });
            }
            if (result?.ok === true && workingMemory) {
                workingMemory.removeFromResultSet('calendar', targetId);
                workingMemory.setLastOperation('calendar', 'delete');
            }
            return createStructuredResult({
                ok: result?.ok !== false,
                domain: 'calendar',
                operation: 'delete',
                error: result?.ok === false ? (result?.error || 'calendar_delete_failed') : '',
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The event has been deleted.' : 'Le rendez-vous a ete supprime.')
                    : (isEnglish(locale) ? 'I could not delete the event.' : "Je n'ai pas pu supprimer le rendez-vous.")
            });
        }

        default:
            return createStructuredResult({
                ok: false, domain: 'calendar', operation: request.operation,
                error: 'unsupported_calendar_operation',
                reply_text: isEnglish(locale) ? 'This calendar action is not available yet.' : "Cette action calendrier n'est pas encore disponible."
            });
    }
};

export const createToolRouter = ({
    connectors = {},
    workingMemory = null,
    bridge = null,
    offlineQueue = null,
    env = globalThis
} = {}) => {
    const activeConnectors = { ...connectors };
    const mutationQueue = offlineQueue && typeof offlineQueue.enqueue === 'function'
        ? offlineQueue
        : createOfflineMutationQueue({ env });
    let flushPromise = null;

    const flushPendingMutations = async ({ limit = 25 } = {}) => {
        if (!mutationQueue || typeof mutationQueue.flush !== 'function') {
            return { processed: 0, failed: 0, remaining: 0 };
        }
        if (flushPromise) return flushPromise;
        flushPromise = mutationQueue.flush(async (queuedRequest) => {
            if (!queuedRequest || typeof queuedRequest !== 'object') {
                return { ok: false, error: 'offline_queue_request_invalid' };
            }
            const domain = String(queuedRequest.domain || '').trim().toLowerCase();
            if (!OFFLINE_MUTATION_OPERATIONS.has(String(queuedRequest.operation || '').trim().toLowerCase())) {
                return { ok: false, error: 'offline_queue_operation_invalid' };
            }
            switch (domain) {
                case 'contacts':
                    return executeContactsRequest(queuedRequest, activeConnectors, workingMemory, {
                        offlineQueue: mutationQueue,
                        allowQueue: false
                    });
                case 'calendar':
                    return executeCalendarRequest(queuedRequest, activeConnectors, workingMemory, {
                        offlineQueue: mutationQueue,
                        allowQueue: false
                    });
                default:
                    return { ok: false, error: 'offline_queue_domain_unsupported' };
            }
        }, { limit }).finally(() => {
            flushPromise = null;
        });
        return flushPromise;
    };

    return {
        setConnector(domain, api) {
            activeConnectors[domain] = api;
        },

        listPendingMutations({ limit = 50 } = {}) {
            if (!mutationQueue || typeof mutationQueue.list !== 'function') return [];
            return mutationQueue.list({ limit });
        },

        async flushPendingMutations(options = {}) {
            return flushPendingMutations(options);
        },

        async execute(request) {
            if (!request || typeof request !== 'object') {
                return createStructuredResult({
                    ok: false, error: 'invalid_request',
                    reply_text: 'Invalid request.'
                });
            }

            await flushPendingMutations();

            switch (request.domain) {
                case 'mail':
                    return executeMailRequest(request, activeConnectors, workingMemory);
                case 'contacts':
                    return executeContactsRequest(request, activeConnectors, workingMemory, {
                        offlineQueue: mutationQueue,
                        allowQueue: true
                    });
                case 'calendar':
                    return executeCalendarRequest(request, activeConnectors, workingMemory, {
                        offlineQueue: mutationQueue,
                        allowQueue: true
                    });
                case 'atome': {
                    if (!bridge) {
                        return createStructuredResult({
                            ok: false, domain: 'atome', operation: request.operation,
                            error: 'atome_bridge_unavailable',
                            reply_text: isEnglish(request.source?.locale)
                                ? 'The Atome runtime is not available.'
                                : "Le runtime Atome n'est pas disponible."
                        });
                    }
                    const runtimeParams = {
                        ...(request.filters && typeof request.filters === 'object' ? request.filters : {}),
                        ...(request.payload && typeof request.payload === 'object' ? request.payload : {}),
                        ...(request.target?.id ? {
                            atome_id: request.target.id,
                            id: request.target.id
                        } : {})
                    };
                    const invocation = resolveAtomeRuntimeInvocation({
                        operation: request.operation,
                        params: runtimeParams
                    });
                    if (!invocation?.tool_id) {
                        return createStructuredResult({
                            ok: false, domain: 'atome', operation: request.operation,
                            error: 'atome_runtime_tool_unresolved',
                            reply_text: isEnglish(request.source?.locale)
                                ? 'I could not resolve this Atome action to a Runtime V2 tool.'
                                : "Je n'ai pas pu resoudre cette action Atome vers un tool Runtime V2."
                        });
                    }
                    const result = await bridge.callRuntimeTool({
                        tool_id: invocation.tool_id,
                        action: invocation.action,
                        input: invocation.input
                    });
                    return createStructuredResult({
                        ok: result?.ok !== false, domain: 'atome', operation: request.operation,
                        item: result,
                        reply_text: result?.ok !== false
                            ? (isEnglish(request.source?.locale) ? 'The action has been completed.' : "L'action a ete executee.")
                            : (isEnglish(request.source?.locale) ? 'The action failed.' : "L'action a echoue.")
                    });
                }
                case 'conversation':
                    return createStructuredResult({
                        ok: true, domain: 'conversation', operation: 'reply', executed: false,
                        reply_text: request.draft?.reply_text || ''
                    });
                default:
                    return createStructuredResult({
                        ok: false, domain: request.domain, operation: request.operation,
                        error: 'unknown_domain',
                        reply_text: isEnglish(request.source?.locale)
                            ? 'I do not know how to handle this request.'
                            : 'Je ne sais pas comment traiter cette demande.'
                    });
            }
        }
    };
};
