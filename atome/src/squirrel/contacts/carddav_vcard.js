import { normalizeText, resolveUrl, makeGeneratedUid } from './carddav_shared.js';
import { buildContentLine, escapeContentText, decodeContentText, splitContentValue, readContentComponents, foldContentLine } from '../shared/content_lines.js';

const normalizeCarddavLabel = params => String(params?.TYPE || 'other').split(',')[0].toLowerCase();
const deriveWritableContactUid = contact => {
    const uid = contact.exchange_uid || contact.uid || contact.id;
    if (!uid) throw new Error('contact_exchange_uid_required');
    return String(uid);
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


const MANAGED = new Set(['VERSION', 'UID', 'FN', 'N', 'NICKNAME', 'ORG', 'TITLE', 'ROLE', 'NOTE', 'TEL', 'EMAIL', 'ADR', 'URL', 'BDAY', 'ANNIVERSARY', 'PHOTO', 'CATEGORIES', 'GENDER']);
const SAFE_EXTRA = /^(?:X-|[A-Z])[A-Z0-9-]*$/;
const PRIVATE_EXTRA = /TOKEN|PASSWORD|SECRET|AUTH|ATOME|CONFLICT/i;
function normalizeWritableContactPayload(contact = {}, options = {}) {
    const field = name => Object.hasOwn(contact, name) ? contact[name] : contact.raw?.[name];
    const output = { ...contact, id: options.uid || deriveWritableContactUid(contact) };
    for (const key of ['phones', 'emails', 'addresses', 'urls', 'extra_properties', 'categories']) output[key] = field(key) || [];
    for (const key of ['first_name', 'last_name', 'middle_name', 'prefix', 'suffix', 'nickname', 'organization', 'title', 'role', 'note', 'birthday', 'anniversary', 'photo', 'gender']) output[key] = field(key) ?? '';
    // The edited projection replaces its original first value, including deletion.
    for (const [singular, plural, label] of [['phone','phones','cell'],['email','emails','home']]) {
        if (!Object.hasOwn(contact, singular)) continue;
        const list = [...output[plural]];
        if (contact[singular]) list.splice(0, 1, { ...(list[0] || { label }), value: contact[singular] });
        else if (list[0]?.value === contact.raw?.[singular]) list.shift();
        output[plural] = list;
    }
    output.href = options.href || contact.href || contact.raw?.href || null;
    output.etag = options.etag || contact.etag || contact.raw?.etag || null;
    output.addressbookId = options.addressbook_url || contact.addressbookId || null;
    return output;
}
function buildWritableVcard(contact = {}, { version = '3.0' } = {}) {
    if (!['3.0','4.0'].includes(version)) throw new Error('vcard_version_unsupported');
    const data = normalizeWritableContactPayload(contact);
    const lines = ['BEGIN:VCARD', 'VERSION:' + version];
    const add = (name, value, params = {}, escaped = true) => {
        lines.push(buildContentLine({ name, params, value: escaped ? escapeContentText(value) : value }, version));
    };
    add('UID', data.id); add('FN', data.name || data.first_name || 'Contact');
    add('N', [data.last_name, data.first_name, data.middle_name, data.prefix, data.suffix].map(escapeContentText).join(';'), {}, false);
    for (const [property, field] of [['NICKNAME','nickname'],['ORG','organization'],['TITLE','title'],['ROLE','role'],['NOTE','note'],['BDAY','birthday'],['ANNIVERSARY','anniversary'],['GENDER','gender']]) {
        if (data[field]) add(property, data[field]);
    }
    for (const [name, field] of [['TEL','phones'],['EMAIL','emails'],['URL','urls']]) {
        for (const entry of data[field]) {
            const value = typeof entry === 'string' ? entry : entry.value;
            if (!value) continue;
            const params = { ...(entry.params || {}) };
            if (entry.label && (!params.TYPE || normalizeCarddavLabel(params) !== entry.label)) params.TYPE = entry.label;
            if (name === 'TEL' && version === '4.0') params.VALUE = 'text';
            if (version === '3.0') delete params.PREF;
            add(name, value, params);
        }
    }
    for (const entry of data.addresses) {
        const values = entry.values || [entry.po_box,entry.extended,entry.street,entry.city,entry.region,entry.postal_code,entry.country];
        add('ADR', values.map(value => escapeContentText(value || '')).join(';'), { ...(entry.params || {}), ...(entry.label ? { TYPE: entry.label } : {}) }, false);
    }
    if (data.categories.length) add('CATEGORIES', data.categories.map(escapeContentText).join(','), {}, false);
    if (data.photo) {
        if (version === '3.0' && /^data:image\//i.test(data.photo)) {
            const match = data.photo.match(/^data:image\/([a-z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/i);
            if (!match) throw new Error('vcard_photo_invalid');
            add('PHOTO', match[2], { ENCODING: 'b', TYPE: match[1].toUpperCase() }, false);
        } else add('PHOTO', data.photo, version === '3.0' ? { VALUE: 'URI' } : {}, false);
    }
    for (const property of data.extra_properties) {
        if (MANAGED.has(property.name) || !SAFE_EXTRA.test(property.name) || PRIVATE_EXTRA.test(property.name)) continue;
        lines.push(buildContentLine(property, version));
    }
    lines.push('END:VCARD'); return lines.map(foldContentLine).join('\r\n') + '\r\n';
}
function parseVcardData(vcard = '') {
    const components = readContentComponents(vcard, 'VCARD');
    if (components.length !== 1) throw new Error('vcard_single_contact_required');
    const properties = components[0];
    const version = properties.find(property => property.name === 'VERSION')?.value;
    if (!['3.0','4.0'].includes(version)) throw new Error('vcard_version_unsupported');
    const state = { id: null, uid: null, name: '', first_name: '', last_name: '', middle_name: '', prefix: '', suffix: '',
        nickname: '', organization: '', title: '', role: '', note: '', birthday: '', anniversary: '', photo: '', gender: '',
        phones: [], emails: [], addresses: [], urls: [], categories: [], extra_properties: [], version };
    const scalar = { FN:'name', NICKNAME:'nickname', ORG:'organization', TITLE:'title', ROLE:'role', NOTE:'note', BDAY:'birthday', ANNIVERSARY:'anniversary', GENDER:'gender' };
    for (const property of properties) {
        const { name, value, params } = property;
        if (name === 'UID') state.id = state.uid = decodeContentText(value);
        else if (name === 'N') {
            const parts = splitContentValue(value).map(decodeContentText);
            ['last_name','first_name','middle_name','prefix','suffix'].forEach((key,index) => { state[key] = parts[index] || ''; });
        } else if (scalar[name]) state[scalar[name]] = decodeContentText(value);
        else if (['TEL','EMAIL','URL'].includes(name)) {
            const field = { TEL:'phones', EMAIL:'emails', URL:'urls' }[name];
            state[field].push({ label: normalizeCarddavLabel(params), params, value: decodeContentText(value) });
        } else if (name === 'ADR') state.addresses.push({ label: normalizeCarddavLabel(params), params, values: splitContentValue(value).map(decodeContentText) });
        else if (name === 'CATEGORIES') state.categories = splitContentValue(value, ',').map(decodeContentText);
        else if (name === 'PHOTO') state.photo = String(params.ENCODING || '').toLowerCase() === 'b'
            ? 'data:image/' + String(params.TYPE || 'jpeg').toLowerCase() + ';base64,' + value : value;
        else if (!MANAGED.has(name) && !PRIVATE_EXTRA.test(name)) state.extra_properties.push(property);
    }
    if (!state.name) state.name = [state.first_name,state.middle_name,state.last_name].filter(Boolean).join(' ') || 'Contact';
    return state;
}
function parseVcards(input) {
    return readContentComponents(input, 'VCARD').map(properties => parseVcardData(['BEGIN:VCARD',...properties.map(property => buildContentLine(property)), 'END:VCARD'].join('\r\n')));
}
export { normalizeCarddavLabel, deriveWritableContactUid, buildAddressbookHref, buildHrefValue,
    normalizeWritableContactPayload, buildWritableVcard, parseVcardData, parseVcards };
