import {
    CONTACTS_V1_ARCHITECTURE_DECISION,
    createContactsConnectorContract
} from './connector_contract.js';

const toText = (value) => String(value || '').trim();

const getTauriInvoke = () => {
    if (typeof window === 'undefined') return null;
    if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
        return window.__TAURI__.invoke.bind(window.__TAURI__);
    }
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
        return window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
    }
    return null;
};

const normalizeLabel = (value) => toText(value).replace(/^_\$!<|>!\$$/g, '').replace(/_/g, ' ');

const normalizeList = (items = []) => (Array.isArray(items) ? items : [])
    .map((entry) => ({
        label: normalizeLabel(entry?.label || ''),
        value: toText(entry?.value || '')
    }))
    .filter((entry) => entry.value);

const buildCustomFields = ({ phones = [], emails = [], organization = '', note = '' } = {}) => {
    const fields = [{ label: 'source', value: 'Mac Contacts' }];
    if (organization) fields.push({ label: 'organisation', value: organization });
    normalizeList(phones).forEach((entry, index) => {
        if (index === 0) return;
        fields.push({ label: `tel ${entry.label || index + 1}`.trim(), value: entry.value });
    });
    normalizeList(emails).forEach((entry, index) => {
        if (index === 0) return;
        fields.push({ label: `mail ${entry.label || index + 1}`.trim(), value: entry.value });
    });
    if (note) fields.push({ label: 'note', value: note });
    return fields;
};

export const normalizeMacosContact = (record = {}) => {
    const phones = normalizeList(record.phones);
    const emails = normalizeList(record.emails);
    const firstName = toText(record.first_name || record.firstName || '');
    const lastName = toText(record.last_name || record.lastName || '');
    const nickname = toText(record.nickname || '');
    const organization = toText(record.organization || '');
    const name = toText(record.name || [firstName, lastName].filter(Boolean).join(' ')) || nickname || organization || phones[0]?.value || emails[0]?.value || 'Contact';
    const sourceContactId = toText(record.id || record.source_contact_id || '') || `macos:${name}:${phones[0]?.value || emails[0]?.value || 'unknown'}`;
    return {
        id: '',
        source_contact_id: sourceContactId,
        name,
        first_name: firstName,
        nickname,
        phone: phones[0]?.value || '',
        email: emails[0]?.value || '',
        user_face: '',
        access: 'private',
        visibility: 'private',
        read_only: true,
        source_provider: 'macos_contacts',
        source_label: 'Mac Contacts',
        source_writable: false,
        custom_fields: buildCustomFields({
            phones,
            emails,
            organization,
            note: toText(record.note || '')
        }),
        raw: {
            ...record,
            phones,
            emails
        }
    };
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

export const createMacosContactsSource = ({
    source_id = CONTACTS_V1_ARCHITECTURE_DECISION.legacy_import_source.id,
    role = CONTACTS_V1_ARCHITECTURE_DECISION.legacy_import_source.role,
    writable = false,
    commandRunner = null
} = {}) => {
    const contract = createContactsConnectorContract({
        provider: 'macos_contacts',
        protocol: 'macos_contacts',
        role,
        write_capabilities: writable ? ['contacts_update'] : []
    });
    const invoke = typeof commandRunner === 'function' ? commandRunner : getTauriInvoke();
    const contactsById = new Map();
    let lastCursor = null;

    const syncStatus = () => ({
        cursor: lastCursor,
        synced: contactsById.size > 0
    });

    const fetchSnapshot = async (mode = 'initial') => {
        if (typeof invoke !== 'function') {
            return {
                ok: false,
                error: 'macos_contacts_invoke_unavailable',
                source_id
            };
        }
        const response = await invoke('macos_contacts_snapshot', {});
        if (!response || response.ok !== true) {
            return {
                ok: false,
                error: response?.error || 'macos_contacts_snapshot_failed',
                message: response?.message || null,
                source_id
            };
        }
        contactsById.clear();
        const normalized = (Array.isArray(response.contacts) ? response.contacts : []).map((entry) => normalizeMacosContact(entry));
        normalized.forEach((entry) => {
            contactsById.set(entry.source_contact_id, entry);
        });
        lastCursor = toText(response.fetched_at || '') || new Date().toISOString();
        return {
            ok: true,
            source_id,
            cursor: lastCursor,
            mode,
            items: normalized.map((entry) => ({ ...entry }))
        };
    };

    return {
        source_id,
        role,
        writable,
        contract,
        syncStatus,
        async listContacts(options = {}) {
            if (!contactsById.size && options.autosync !== false) {
                const synced = await fetchSnapshot('initial');
                if (synced.ok !== true) return synced;
            }
            const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Number(options.limit)) : null;
            const query = toText(options.query || '');
            const items = Array.from(contactsById.values())
                .filter((entry) => matchesQuery(entry, query))
                .slice(0, limit || undefined)
                .map((entry) => ({ ...entry }));
            return {
                ok: true,
                source_id,
                cursor: lastCursor,
                items
            };
        },
        async getContact(contactId) {
            const key = toText(contactId || '');
            const contact = contactsById.get(key) || null;
            if (!contact) {
                return { ok: false, error: 'contacts_not_found', source_id, contact_id: key || null };
            }
            return {
                ok: true,
                source_id,
                contact: { ...contact }
            };
        },
        async syncInitial() {
            return fetchSnapshot('initial');
        },
        async syncIncremental() {
            return fetchSnapshot('delta');
        }
    };
};
