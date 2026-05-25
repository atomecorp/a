export const toText = (value) => String(value || '').trim();

export const normalizePhoneKey = (value) => toText(value).replace(/[^\d+]/g, '');

export const normalizeEmailKey = (value) => toText(value).toLowerCase();

export const hasFiniteLimit = (value) => (
    value !== null
    && value !== undefined
    && String(value).trim() !== ''
    && Number.isFinite(Number(value))
);

export const buildPhoneSearchTokens = (value) => {
    const normalized = normalizePhoneKey(value);
    if (!normalized) return [];
    const digitsOnly = normalized.replace(/[^\d]/g, '');
    const tokens = new Set([normalized, digitsOnly]);
    if (digitsOnly.startsWith('33') && digitsOnly.length >= 11) {
        tokens.add(`0${digitsOnly.slice(2)}`);
    }
    if (digitsOnly.startsWith('0') && digitsOnly.length >= 10) {
        tokens.add(`33${digitsOnly.slice(1)}`);
        tokens.add(`+33${digitsOnly.slice(1)}`);
    }
    return Array.from(tokens).filter(Boolean);
};

export const cloneSourceInfo = (source = {}) => ({
    source_id: toText(source.source_id),
    role: toText(source.role),
    writable: source.writable === true,
    provider: toText(source.contract?.provider || source.source_id),
    protocol: toText(source.contract?.protocol || 'contacts'),
    sync: typeof source.syncStatus === 'function' ? source.syncStatus() : null,
    read_capabilities: Array.isArray(source.contract?.read_capabilities) ? [...source.contract.read_capabilities] : [],
    write_capabilities: Array.isArray(source.contract?.write_capabilities) ? [...source.contract.write_capabilities] : []
});

export const buildContactKey = (contact = {}) => {
    const phone = normalizePhoneKey(contact.phone);
    if (phone) return `phone:${phone}`;
    const email = normalizeEmailKey(contact.email);
    if (email) return `email:${email}`;
    const id = toText(contact.id || contact.source_contact_id);
    if (id) return `id:${id}`;
    const name = toText(contact.name).toLowerCase();
    return name ? `name:${name}` : '';
};

export const matchesContactIdentifier = (contact = {}, contactId = '') => {
    const targetId = toText(contactId);
    if (!targetId) return false;
    return toText(contact.id) === targetId
        || toText(contact.source_contact_id) === targetId
        || buildContactKey(contact) === buildContactKey({ id: targetId, source_contact_id: targetId });
};

export const mergeContacts = (base = {}, incoming = {}) => ({
    id: toText(base.id || incoming.id),
    source_contact_id: toText(base.source_contact_id || incoming.source_contact_id),
    name: toText(base.name || incoming.name),
    first_name: toText(base.first_name || incoming.first_name),
    nickname: toText(base.nickname || incoming.nickname),
    phone: toText(base.phone || incoming.phone),
    email: toText(base.email || incoming.email),
    user_face: toText(base.user_face || incoming.user_face),
    access: toText(base.access || incoming.access || 'private') || 'private',
    visibility: toText(base.visibility || incoming.visibility || 'private') || 'private',
    read_only: base.read_only === true || incoming.read_only === true,
    source_provider: toText(base.source_provider || incoming.source_provider),
    source_label: toText(base.source_label || incoming.source_label),
    source_writable: base.source_writable === true || incoming.source_writable === true,
    custom_fields: Array.isArray(base.custom_fields) && base.custom_fields.length
        ? [...base.custom_fields]
        : (Array.isArray(incoming.custom_fields) ? [...incoming.custom_fields] : []),
    raw: incoming.raw || base.raw || null
});

export const matchesQuery = (contact = {}, query = '') => {
    const needle = toText(query).toLowerCase();
    if (!needle) return true;
    const queryPhoneTokens = buildPhoneSearchTokens(query);
    const contactPhoneTokens = buildPhoneSearchTokens(contact.phone);
    if (queryPhoneTokens.length && contactPhoneTokens.length && contactPhoneTokens.some((contactToken) => {
        return queryPhoneTokens.some((queryToken) => contactToken.includes(queryToken) || queryToken.includes(contactToken));
    })) {
        return true;
    }
    return [
        contact.name,
        contact.first_name,
        contact.nickname,
        contact.phone,
        contact.email,
        contact.source_contact_id,
        ...(Array.isArray(contact.custom_fields) ? contact.custom_fields.flatMap((entry) => [entry?.label, entry?.value]) : [])
    ].some((value) => toText(value).toLowerCase().includes(needle));
};

export const cloneContact = (contact = {}) => ({
    ...contact,
    custom_fields: Array.isArray(contact?.custom_fields) ? contact.custom_fields.map((entry) => ({ ...entry })) : [],
    raw: contact?.raw && typeof contact.raw === 'object' ? { ...contact.raw } : contact?.raw || null
});
