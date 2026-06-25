// Extracted from tool_router.js: mail/communication reply builders + communication-surface
// normalization/loading + mail trust scoring.
import { isEnglish } from './tool_router_shared.js';
import { computeTrustScore, buildTrustWarning, TRUST_THRESHOLD_OK, TRUST_THRESHOLD_WARN } from './mail_trust_scoring.js';

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


export {
    formatSenderLabel, formatSubjectLabel, sanitizeBodyForSpeech, buildMailListReply, buildMailReadReply,
    normalizeCommunicationSurfaces, createCommunicationItemId, parseCommunicationItemId, normalizeCommunicationItem,
    sortCommunicationItems, buildCommunicationCountsReply, buildCommunicationListReply, buildCommunicationReadReply,
    loadCommunicationList, checkMailTrust
};
