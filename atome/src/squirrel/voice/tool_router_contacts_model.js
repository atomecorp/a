// Extracted from tool_router.js: contacts reply builder + contact create/update payload extraction
// + existing-contact matching for mutations.
import { isEnglish } from './tool_router_shared.js';

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


export {
    buildContactsReply, normalizePhoneForContactCreate, extractContactCreatePayload, extractContactUpdatePayload,
    normalizeContactComparable, contactMatchesMutationPayload, findExistingContactForMutation
};
