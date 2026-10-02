import { createContactsConnectorContract } from './connector_contract.js';
import { createCanonicalImport, importRecordId, importRecordProps, importRecordDeleted } from '../shared/canonical_import.js';
import { importData } from '../shared/import_reconciliation.js';
import { matchesQuery } from './service_contact_utils.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';
import { persistContactPhoto } from './photo_media.js';

const TEXT_FIELDS = ['name', 'first_name', 'last_name', 'middle_name', 'prefix', 'suffix', 'nickname', 'phone', 'email', 'user_face',
    'organization', 'title', 'role', 'note', 'birthday', 'anniversary', 'gender', 'photo', 'photo_asset_id', 'exchange_uid'];
const LIST_FIELDS = ['phones', 'emails', 'addresses', 'urls', 'categories', 'custom_fields', 'extra_properties', 'collections'];
export function normalizeContactProperties(input = {}) {
    const props = {};
    for (const field of TEXT_FIELDS) if (Object.hasOwn(input, field)) props[field] = String(input[field] ?? '');
    for (const field of LIST_FIELDS) if (Object.hasOwn(input, field)) {
        if (!Array.isArray(input[field])) throw new Error('contact_field_array_required');
        props[field] = importData(input[field]);
    }
    // Native and DAV collectors expose structured fields in raw; convert once at intake.
    for (const field of [...TEXT_FIELDS, ...LIST_FIELDS]) {
        if (!Object.hasOwn(props, field) && Object.hasOwn(input.raw || {}, field)) props[field] = importData(input.raw[field]);
    }
    if (Object.hasOwn(input, 'user_face') && input.raw && input.user_face !== input.raw.user_face && !Object.hasOwn(input, 'photo_asset_id')) {
        props.photo = String(input.user_face || ''); props.photo_asset_id = '';
    }
    if (Object.hasOwn(input, 'phone') && (!input.raw || input.raw.phone !== input.phone)) {
        const phones = props.phones || [];
        props.phones = input.phone ? [{ ...(phones[0] || { label: 'cell' }), value: String(input.phone) }, ...phones.slice(1)] : phones.slice(1);
    }
    if (Object.hasOwn(input, 'email') && (!input.raw || input.raw.email !== input.email)) {
        const emails = props.emails || [];
        props.emails = input.email ? [{ ...(emails[0] || { label: 'home' }), value: String(input.email) }, ...emails.slice(1)] : emails.slice(1);
    }
    return { ...props, access: 'private', visibility: 'private' };
}
export function normalizeLocalContact(record = {}) {
    const props = record.properties ? importRecordProps(record) : record;
    const id = importRecordId(record) || record.source_contact_id;
    return { ...props, id, source_contact_id: id, name: props.name || props.first_name || props.nickname || 'Contact',
        phone: props.phone ?? props.phones?.[0]?.value ?? '', email: props.email ?? props.emails?.[0]?.value ?? '',
        source_provider: 'eve_contacts_local', source_label: 'eVe Contacts', source_writable: true, read_only: false,
        custom_fields: props.custom_fields || [], raw: { ...props } };
}
export function createLocalContactsSource({ source_id = 'eve_contacts_local', role = 'primary', writable = true,
    api, session } = {}) {
    const store = createCanonicalImport({ type: 'contact', api, session, normalize: normalizeContactProperties });
    const groups = createCanonicalImport({ type: 'contact_group', api, session, normalize: input => ({ name: String(input.name || ''), members: input.members || [] }) });
    let cache = [], cacheOwner = null, persisted = false;
    const clearOnSessionChange = () => {
        const state = (session || getSessionState)();
        const owner = state?.mode === 'authenticated' ? state.user?.id : null;
        if (owner !== cacheOwner) { cache = []; persisted = false; cacheOwner = owner; }
        return owner;
    };
    const hydrate = async () => {
        if (!clearOnSessionChange()) return;
        const rows = await store.list();
        clearOnSessionChange();
        cache = rows.filter(row => !importRecordDeleted(row)).map(normalizeLocalContact);
        persisted = true;
    };
    const listContactsSync = ({ query = '', limit = null } = {}) => {
        clearOnSessionChange();
        return { ok: true, source_id, items: cache.filter(entry => matchesQuery(entry, query))
            .slice(0, limit == null ? undefined : Math.max(1, Number(limit))).map(entry => structuredClone(entry)) };
    };
    const refresh = async () => { await hydrate(); return listContactsSync(); };
    return { source_id, role, writable, contract: createContactsConnectorContract({ provider: source_id, role, write_capabilities: ['contacts_import'] }),
        captureImportSession: () => store.capture().check,
        listContactsSync, async listContacts(options) { await hydrate(); return listContactsSync(options); },
        async getContact(id) { await hydrate(); const contact = cache.find(row => row.id === id); return contact ? { ok: true, contact } : { ok: false, error: 'contacts_not_found' }; },
        syncInitial: refresh, syncIncremental: refresh,
        syncStatus() { return { persisted, hydrated: persisted, durability: persisted ? 'canonical_commit' : null }; },
        async importContacts(items, meta) {
            const context = store.capture(), prepared = [];
            for (const item of items) prepared.push(await persistContactPhoto(item, context, meta.signal));
            items = prepared;
            const contactIds = await store.resolveIds(items, meta.source_key || meta.imported_from_source);
            const groupItems = (meta.groups || []).map(group => ({ ...group,
                members: (group.members || items.filter(item => (item.collections || item.raw?.collections || []).includes(group.id))
                    .map(item => item.source_contact_id || item.uid || item.id)).map(id => contactIds.get(String(id))).filter(Boolean) }));
            const groupResult = await groups.collect(groupItems, { ...meta, complete: false });
            const ids = new Map(groupResult.correspondences.map(p => [p.external_id, p.canonical_id]));
            const result = await store.collect(items.map(item => {
                const collections = item.collections || item.raw?.collections;
                return collections ? { ...item, collections: collections.map(id => ids.get(id) || id) } : item;
            }), meta);
            await hydrate(); return { ...result, items: cache };
        },
        async createContact(input) { const id = await store.create(input); await hydrate(); return { ok: true, created: true, contact: cache.find(row => row.id === id), items: cache }; },
        async replaceContacts(items) { await store.replace(items); await hydrate(); return { ok: true, items: cache }; },
        async updateContact(id, changes) {
            await hydrate(); const current = cache.find(row => row.id === id);
            if (!current) return { ok: false, error: 'contacts_not_found' };
            const next = { ...current, ...changes, id, source_contact_id: id, raw: current.raw };
            if (Object.hasOwn(changes, 'user_face') && !Object.hasOwn(changes, 'photo')) {
                next.photo = changes.user_face || ''; next.photo_asset_id = '';
            }
            await store.replace(cache.map(row => row.id === id ? next : row)); await hydrate();
            return { ok: true, updated: true, contact: cache.find(row => row.id === id), items: cache };
        },
        async deleteContact(id) {
            await hydrate(); if (!cache.some(row => row.id === id)) return { ok: false, error: 'contacts_not_found' };
            await store.replace(cache.filter(row => row.id !== id)); await hydrate(); return { ok: true, deleted: true, contact_id: id, items: cache };
        },
        async importLegacy(items, { owner_id } = {}) {
            if (owner_id !== store.capture().owner) throw new Error('legacy_contact_owner_confirmation_required');
            return store.collect(items, { source_key: 'legacy_contacts_explicit' });
        }
    };
}
