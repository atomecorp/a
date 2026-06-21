import {
    normalizeText,
    xmlDecode,
    escapeVcardValue,
    resolveUrl,
    makeGeneratedUid
} from './carddav_shared.js';

const unfoldVcard = (value = '') => String(value || '').replace(/\r?\n[ \t]/g, '');

const parseVcardProperty = (line = '') => {
    const separator = line.indexOf(':');
    if (separator === -1) return null;
    const rawKey = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const [namePart, ...paramParts] = rawKey.split(';');
    const params = {};
    paramParts.forEach((part) => {
        const [paramKey, paramValue] = part.split('=');
        if (!paramKey) return;
        params[String(paramKey || '').toUpperCase()] = String(paramValue || '');
    });
    return {
        name: String(namePart || '').toUpperCase(),
        params,
        value
    };
};

const decodeVcardValue = (value = '') => xmlDecode(String(value || '').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, '\n'));

const normalizeCustomFieldLabel = (value) => normalizeText(value || '').toLowerCase();

const normalizeCarddavLabel = (params = {}) => {
    const type = String(params.TYPE || params.type || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    return type[0] || 'other';
};

const normalizeList = (value = []) => (Array.isArray(value) ? value : [])
    .map((entry) => ({
        label: normalizeText(entry?.label || '') || 'other',
        value: normalizeText(entry?.value || '')
    }))
    .filter((entry) => entry.value);

const dedupeByValue = (items = []) => {
    const seen = new Set();
    return normalizeList(items).filter((entry) => {
        const key = `${normalizeCustomFieldLabel(entry.label)}:${entry.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const findCustomFieldValue = (customFields = [], aliases = []) => {
    const labels = (Array.isArray(aliases) ? aliases : [aliases])
        .map((entry) => normalizeCustomFieldLabel(entry))
        .filter(Boolean);
    if (!labels.length) return '';
    const field = (Array.isArray(customFields) ? customFields : []).find((entry) => labels.includes(normalizeCustomFieldLabel(entry?.label || '')));
    return normalizeText(field?.value || '');
};

const deriveWritableContactUid = (contact = {}) => {
    const candidates = [
        contact?.raw?.original_source_contact_id,
        contact?.source_contact_id,
        contact?.id,
        contact?.raw?.id
    ].map((entry) => normalizeText(entry || '')).filter(Boolean);
    const explicit = candidates.find((entry) => !/^(phone:|email:|name:|local:)/i.test(entry));
    return explicit || makeGeneratedUid();
};

const buildAddressbookHref = (addressbookUrl, uid, existingHref = null) => {
    const explicit = normalizeText(existingHref || '');
    if (explicit) return explicit;
    const normalizedUid = normalizeText(uid || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || makeGeneratedUid();
    const base = normalizeText(addressbookUrl || '');
    if (!base) return `${normalizedUid}.vcf`;
    return resolveUrl(base.endsWith('/') ? base : `${base}/`, `${normalizedUid}.vcf`);
};

const buildHrefValue = (addressbookUrl, targetUrl, existingHref = null) => {
    const explicit = normalizeText(existingHref || '');
    if (explicit) return explicit;
    try {
        const target = new URL(String(targetUrl || ''));
        const base = new URL(String(addressbookUrl || ''));
        if (target.origin === base.origin) {
            return `${target.pathname}${target.search || ''}`;
        }
    } catch (_error) {
        return normalizeText(targetUrl || '') || null;
    }
    return normalizeText(targetUrl || '') || null;
};

const normalizeWritableContactPayload = (contact = {}, { uid = null, href = null, etag = null, addressbook_url = null, raw_vcard = null } = {}) => {
    const phones = dedupeByValue([
        ...(Array.isArray(contact?.raw?.phones) ? contact.raw.phones : []),
        ...(contact?.phone ? [{ label: 'cell', value: contact.phone }] : [])
    ]);
    const emails = dedupeByValue([
        ...(Array.isArray(contact?.raw?.emails) ? contact.raw.emails : []),
        ...(contact?.email ? [{ label: 'home', value: contact.email }] : [])
    ]);
    const customFields = Array.isArray(contact?.custom_fields) ? contact.custom_fields : [];
    const organization = normalizeText(contact?.raw?.organization || findCustomFieldValue(customFields, ['organisation', 'organization', 'org']) || '');
    const note = normalizeText(contact?.raw?.note || findCustomFieldValue(customFields, ['note']) || '');
    const firstName = normalizeText(contact?.first_name || contact?.raw?.first_name || '');
    const name = normalizeText(contact?.name || contact?.raw?.name || '') || firstName || emails[0]?.value || phones[0]?.value || 'Contact';
    return {
        id: normalizeText(uid || deriveWritableContactUid(contact)),
        name,
        first_name: firstName,
        nickname: normalizeText(contact?.nickname || contact?.raw?.nickname || ''),
        phones,
        emails,
        organization,
        note,
        href: normalizeText(href || contact?.href || contact?.raw?.href || '') || null,
        etag: normalizeText(etag || contact?.etag || contact?.raw?.etag || '') || null,
        addressbookId: normalizeText(addressbook_url || contact?.addressbookId || contact?.raw?.addressbookId || '') || null,
        raw_vcard: normalizeText(raw_vcard || '') || null
    };
};

const buildWritableVcard = (contact = {}) => {
    const uid = normalizeText(contact.id || '') || makeGeneratedUid();
    const fullName = normalizeText(contact.name || '') || contact.emails?.[0]?.value || contact.phones?.[0]?.value || 'Contact';
    const firstName = normalizeText(contact.first_name || '');
    const lastName = firstName && fullName.startsWith(firstName)
        ? normalizeText(fullName.slice(firstName.length).trim())
        : '';
    const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `UID:${escapeVcardValue(uid)}`,
        `FN:${escapeVcardValue(fullName)}`,
        `N:${escapeVcardValue(lastName)};${escapeVcardValue(firstName)};;;`
    ];
    if (contact.nickname) {
        lines.push(`NICKNAME:${escapeVcardValue(contact.nickname)}`);
    }
    if (contact.organization) {
        lines.push(`ORG:${escapeVcardValue(contact.organization)}`);
    }
    if (contact.note) {
        lines.push(`NOTE:${escapeVcardValue(contact.note)}`);
    }
    dedupeByValue(contact.phones).forEach((entry) => {
        lines.push(`TEL;TYPE=${escapeVcardValue((entry.label || 'other').toUpperCase())}:${escapeVcardValue(entry.value)}`);
    });
    dedupeByValue(contact.emails).forEach((entry) => {
        lines.push(`EMAIL;TYPE=${escapeVcardValue((entry.label || 'other').toUpperCase())}:${escapeVcardValue(entry.value)}`);
    });
    lines.push('END:VCARD');
    return lines.join('\r\n');
};

const parseVcardData = (vcard = '') => {
    const text = unfoldVcard(vcard);
    const lines = text.split(/\r?\n/);
    const state = {
        id: null,
        name: '',
        first_name: '',
        last_name: '',
        middle_name: '',
        nickname: '',
        organization: '',
        note: '',
        phones: [],
        emails: []
    };

    lines.forEach((line) => {
        const trimmed = String(line || '').trim();
        if (!trimmed || /^BEGIN:VCARD$/i.test(trimmed) || /^END:VCARD$/i.test(trimmed) || /^VERSION:/i.test(trimmed)) {
            return;
        }
        const property = parseVcardProperty(trimmed);
        if (!property) return;
        const value = decodeVcardValue(property.value);
        switch (property.name) {
        case 'UID':
            state.id = normalizeText(value) || null;
            break;
        case 'FN':
            state.name = normalizeText(value);
            break;
        case 'N': {
            const [lastName, firstName, middleName] = String(value || '').split(';');
            if (!state.last_name) state.last_name = normalizeText(lastName);
            if (!state.first_name) state.first_name = normalizeText(firstName);
            if (!state.middle_name) state.middle_name = normalizeText(middleName);
            break;
        }
        case 'NICKNAME':
            state.nickname = normalizeText(value);
            break;
        case 'ORG':
            state.organization = normalizeText(String(value || '').split(';').filter(Boolean).join(' '));
            break;
        case 'NOTE':
            state.note = normalizeText(value);
            break;
        case 'TEL':
            state.phones.push({
                label: normalizeCarddavLabel(property.params),
                value: normalizeText(value)
            });
            break;
        case 'EMAIL':
            state.emails.push({
                label: normalizeCarddavLabel(property.params),
                value: normalizeText(value)
            });
            break;
        default:
            break;
        }
    });

    if (!state.name) {
        state.name = [state.first_name, state.middle_name, state.last_name].filter(Boolean).join(' ').trim()
            || state.nickname
            || state.organization
            || state.emails[0]?.value
            || state.phones[0]?.value
            || 'Contact';
    }

    return state;
};

export {
    normalizeCarddavLabel,
    deriveWritableContactUid,
    buildAddressbookHref,
    buildHrefValue,
    normalizeWritableContactPayload,
    buildWritableVcard,
    parseVcardData
};
