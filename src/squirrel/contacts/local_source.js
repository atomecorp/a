import {
    CONTACTS_V1_ARCHITECTURE_DECISION,
    createContactsConnectorContract
} from './connector_contract.js';

const toText = (value) => String(value || '').trim();

const normalizeLabel = (value) => toText(value).toLowerCase();

const normalizePhoneKey = (value) => toText(value).replace(/[^\d+]/g, '');
const normalizeEmailKey = (value) => toText(value).toLowerCase();

const cloneValue = (value) => {
    if (value === undefined) return undefined;
    try {
        if (typeof structuredClone === 'function') {
            return structuredClone(value);
        }
    } catch (_) {
        // Fall through.
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return null;
    }
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const normalizeCustomFields = (fields = []) => ensureArray(fields)
    .map((entry) => ({
        label: toText(entry?.label || ''),
        value: toText(entry?.value || '')
    }))
    .filter((entry) => entry.label || entry.value);

const dedupeCustomFields = (fields = []) => {
    const seen = new Set();
    return normalizeCustomFields(fields).filter((entry) => {
        const key = `${normalizeLabel(entry.label)}:${entry.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const matchesQuery = (contact = {}, query = '') => {
    const needle = toText(query).toLowerCase();
    if (!needle) return true;
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

const buildStableSourceContactId = (record = {}) => {
    const explicit = toText(record.source_contact_id || record.id || '');
    if (explicit) return explicit;
    const phone = normalizePhoneKey(record.phone);
    if (phone) return `phone:${phone}`;
    const email = normalizeEmailKey(record.email);
    if (email) return `email:${email}`;
    const name = toText(record.name || record.first_name || record.nickname).toLowerCase();
    return name ? `name:${name}` : `local:${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const mergeImportedMetadataFields = (record = {}, meta = {}) => {
    const fields = normalizeCustomFields(record.custom_fields);
    const extra = [];
    const importedFromLabel = toText(meta.imported_from_label || meta.imported_from_source_label || '');
    const importedFromSource = toText(meta.imported_from_source || '');
    if (importedFromLabel) extra.push({ label: 'importe depuis', value: importedFromLabel });
    if (importedFromSource) extra.push({ label: 'source import', value: importedFromSource });
    return dedupeCustomFields([...fields, ...extra]);
};

export const normalizeLocalContact = (record = {}, meta = {}) => {
    const sourceContactId = buildStableSourceContactId(record);
    const importedFromSource = toText(meta.imported_from_source || record?.raw?.imported_from_source || '');
    const importedFromLabel = toText(meta.imported_from_label || record?.raw?.imported_from_label || '');
    return {
        id: '',
        source_contact_id: sourceContactId,
        name: toText(record.name || record.first_name || record.nickname || record.email || record.phone || 'Contact'),
        first_name: toText(record.first_name || ''),
        nickname: toText(record.nickname || ''),
        phone: toText(record.phone || ''),
        email: toText(record.email || ''),
        user_face: toText(record.user_face || ''),
        access: toText(record.access || 'private') || 'private',
        visibility: toText(record.visibility || record.access || 'private') || 'private',
        read_only: record.read_only !== false,
        source_provider: CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id,
        source_label: 'eVe Contacts',
        source_writable: false,
        custom_fields: mergeImportedMetadataFields(record, {
            imported_from_source: importedFromSource,
            imported_from_label: importedFromLabel
        }),
        raw: {
            ...(record.raw && typeof record.raw === 'object' ? cloneValue(record.raw) || {} : {}),
            imported_from_source: importedFromSource || null,
            imported_from_label: importedFromLabel || null,
            original_source_contact_id: toText(record.source_contact_id || record.id || '') || null
        }
    };
};

const buildContactKey = (contact = {}) => {
    const phone = normalizePhoneKey(contact.phone);
    if (phone) return `phone:${phone}`;
    const email = normalizeEmailKey(contact.email);
    if (email) return `email:${email}`;
    const sourceContactId = toText(contact.source_contact_id || contact.id || '');
    if (sourceContactId) return `id:${sourceContactId}`;
    const name = toText(contact.name).toLowerCase();
    return name ? `name:${name}` : '';
};

const createMemoryStorage = () => {
    const map = new Map();
    return {
        getItem(key) {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            map.set(key, String(value));
        }
    };
};

const isStorageLike = (value) => {
    return !!value
        && typeof value.getItem === 'function'
        && typeof value.setItem === 'function';
};

export const createLocalContactsSource = ({
    source_id = CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id,
    role = CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.role,
    writable = CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.writable,
    storageKey = CONTACTS_V1_ARCHITECTURE_DECISION.local_storage_key,
    storage = null
} = {}) => {
    const contract = createContactsConnectorContract({
        provider: CONTACTS_V1_ARCHITECTURE_DECISION.provider,
        protocol: CONTACTS_V1_ARCHITECTURE_DECISION.protocol,
        role,
        write_capabilities: writable ? ['contacts_import'] : []
    });
    const fallbackStorage = createMemoryStorage();
    const globalStorage = (typeof globalThis !== 'undefined' && isStorageLike(globalThis.localStorage))
        ? globalThis.localStorage
        : null;
    const resolvedStorage = isStorageLike(storage)
        ? storage
        : (globalStorage || fallbackStorage);

    const readState = () => {
        try {
            const raw = resolvedStorage.getItem(storageKey);
            const parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || typeof parsed !== 'object') {
                return { cursor: null, items: [] };
            }
            return {
                cursor: toText(parsed.cursor || '') || null,
                items: ensureArray(parsed.items).map((entry) => normalizeLocalContact(entry, {
                    imported_from_source: entry?.raw?.imported_from_source || '',
                    imported_from_label: entry?.raw?.imported_from_label || ''
                }))
            };
        } catch (_) {
            return { cursor: null, items: [] };
        }
    };

    const writeState = (state = {}) => {
        const payload = {
            cursor: toText(state.cursor || '') || null,
            items: ensureArray(state.items).map((entry) => normalizeLocalContact(entry, {
                imported_from_source: entry?.raw?.imported_from_source || '',
                imported_from_label: entry?.raw?.imported_from_label || ''
            }))
        };
        resolvedStorage.setItem(storageKey, JSON.stringify(payload));
        return payload;
    };

    const listItems = ({ query = '', limit = null } = {}) => {
        const state = readState();
        const normalizedLimit = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : null;
        const items = state.items
            .filter((entry) => matchesQuery(entry, query))
            .slice(0, normalizedLimit || undefined)
            .map((entry) => ({ ...entry, custom_fields: cloneValue(entry.custom_fields) || [], raw: cloneValue(entry.raw) || null }));
        return {
            cursor: state.cursor,
            items
        };
    };

    const syncStatus = () => {
        const state = readState();
        return {
            cursor: state.cursor,
            synced: state.items.length > 0,
            persisted: true
        };
    };

    return {
        source_id,
        role,
        writable,
        contract,
        syncStatus,
        async listContacts(options = {}) {
            const listed = listItems(options);
            return {
                ok: true,
                source_id,
                cursor: listed.cursor,
                items: listed.items
            };
        },
        async getContact(contactId) {
            const key = toText(contactId || '');
            const listed = listItems({});
            const contact = listed.items.find((entry) => {
                return toText(entry.source_contact_id) === key || toText(entry.id) === key || buildContactKey(entry) === buildContactKey({ source_contact_id: key });
            }) || null;
            if (!contact) {
                return { ok: false, error: 'contacts_not_found', source_id, contact_id: key || null };
            }
            return {
                ok: true,
                source_id,
                contact
            };
        },
        async syncInitial() {
            const listed = listItems({});
            return {
                ok: true,
                source_id,
                cursor: listed.cursor,
                mode: 'initial',
                items: listed.items
            };
        },
        async syncIncremental() {
            const listed = listItems({});
            return {
                ok: true,
                source_id,
                cursor: listed.cursor,
                mode: 'delta',
                items: listed.items
            };
        },
        async importContacts(items = [], meta = {}) {
            const state = readState();
            const bucket = new Map();
            ensureArray(state.items).forEach((entry) => {
                const key = buildContactKey(entry);
                if (key) bucket.set(key, normalizeLocalContact(entry, {
                    imported_from_source: entry?.raw?.imported_from_source || '',
                    imported_from_label: entry?.raw?.imported_from_label || ''
                }));
            });
            ensureArray(items).forEach((entry) => {
                const normalized = normalizeLocalContact(entry, {
                    imported_from_source: meta.imported_from_source || entry?.source_provider || '',
                    imported_from_label: meta.imported_from_label || entry?.source_label || ''
                });
                const key = buildContactKey(normalized);
                if (!key) return;
                bucket.set(key, normalized);
            });
            const nextState = writeState({
                cursor: new Date().toISOString(),
                items: Array.from(bucket.values())
            });
            return {
                ok: true,
                source_id,
                imported: ensureArray(items).length,
                cursor: nextState.cursor,
                items: nextState.items.map((entry) => ({ ...entry, custom_fields: cloneValue(entry.custom_fields) || [], raw: cloneValue(entry.raw) || null }))
            };
        },
        async replaceContacts(items = [], meta = {}) {
            const nextState = writeState({
                cursor: new Date().toISOString(),
                items: ensureArray(items).map((entry) => normalizeLocalContact(entry, {
                    imported_from_source: meta.imported_from_source || entry?.source_provider || '',
                    imported_from_label: meta.imported_from_label || entry?.source_label || ''
                }))
            });
            return {
                ok: true,
                source_id,
                imported: ensureArray(items).length,
                cursor: nextState.cursor,
                items: nextState.items.map((entry) => ({ ...entry, custom_fields: cloneValue(entry.custom_fields) || [], raw: cloneValue(entry.raw) || null }))
            };
        }
    };
};
