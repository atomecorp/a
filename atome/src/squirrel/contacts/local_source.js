import { createContactsConnectorContract } from './connector_contract.js';
import { createCanonicalImport, createImportSnapshot, importRecordId, importRecordProps, importRecordDeleted, IMPORT_ORIGIN_TYPE, preferExistingImportValues } from '../shared/canonical_import.js';
import { importData, sameImportValue } from '../shared/import_reconciliation.js';
import { matchesQuery } from './service_contact_utils.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';
import { persistContactPhoto, CONTACT_PHOTO_PERMANENT_ERRORS } from './photo_media.js';
import { contactBookPhone } from '../../shared/contact_book_hash.js';
import { createPersonalContactImport } from './personal_profile.js';

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
// Numeros E.164 d'une fiche (meme normalisation que le carnet du serveur).
export const contactPhoneKeys = (props = {}) => [...new Set([props.phone, ...(Array.isArray(props.phones) ? props.phones.map(entry => entry?.value ?? entry) : [])]
    .map(value => contactBookPhone(value)).filter(Boolean).map(value => `phone:${value}`))];
// La photo d'une fiche reprise par son numero. Fiche nee d'un import : sa photo
// appartient a la source, l'import la remplace (y compris un lien perime). Fiche
// faite a la main : sa photo reste, sauf si elle n'en a pas ou si c'est le meme media.
const PHOTO_FIELDS = ['photo', 'user_face', 'photo_asset_id'];
const mergeContactIntoExisting = (current = {}, incoming = {}, { recordId = '' } = {}) => {
    const merged = preferExistingImportValues(current, incoming);
    const imported = IMPORT_RESERVED_ID.test(String(recordId));
    const samePhoto = incoming.photo_asset_id && incoming.photo_asset_id === current.photo_asset_id;
    const noPhoto = !current.photo && !current.user_face && !current.photo_asset_id;
    // Absent de l'import = absent de la fiche (et non vide) : la reconciliation suivante
    // y lit la meme valeur que la base observee et accepte la photo reessayee.
    if (imported) for (const key of PHOTO_FIELDS) { if (key in incoming) merged[key] = incoming[key]; else delete merged[key]; }
    else if ((samePhoto || noPhoto) && (incoming.photo || incoming.user_face)) {
        for (const key of PHOTO_FIELDS) if (key in incoming) merged[key] = incoming[key];
    }
    return merged;
};
// Cards created before the phone identity (Oct. 2026) can hold one person twice:
// cards sharing a number, directly or through a card carrying both, form a group.
const duplicateGroups = (rows) => {
    const parent = new Map(), byKey = new Map();
    const find = (id) => { while (parent.get(id) !== id) id = parent.get(id); return id; };
    for (const row of rows) {
        const id = importRecordId(row);
        parent.set(id, id);
        for (const key of contactPhoneKeys(importRecordProps(row))) {
            if (byKey.has(key)) parent.set(find(id), find(byKey.get(key))); else byKey.set(key, id);
        }
    }
    const groups = new Map();
    for (const row of rows) { const root = find(importRecordId(row)); groups.set(root, [...(groups.get(root) || []), row]); }
    return [...groups.values()].filter(group => group.length > 1);
};
const hasPhoto = props => !!(props.photo || props.user_face || props.photo_asset_id);
const filledFields = props => Object.values(props).reduce((count, value) => count + (Array.isArray(value) ? value.length : value !== '' && value != null ? 1 : 0), 0);
// The card kept: the one made by hand, else the one with a photo, else the most complete.
const keeperOrder = (a, b) => (IMPORT_RESERVED_ID.test(a.id) - IMPORT_RESERVED_ID.test(b.id)) || (hasPhoto(b.props) - hasPhoto(a.props))
    || (filledFields(b.props) - filledFields(a.props)) || a.id.localeCompare(b.id);
const mergeDuplicateCard = (kept, other) => {
    const incoming = { ...other };
    // A photo is taken whole from one card, never assembled from two.
    if (hasPhoto(kept)) for (const key of PHOTO_FIELDS) delete incoming[key];
    const merged = preferExistingImportValues(kept, incoming);
    const seen = new Set();
    if (Array.isArray(merged.phones)) merged.phones = merged.phones.filter((entry) => {
        const key = contactBookPhone(entry?.value ?? entry) || JSON.stringify(entry);
        return !seen.has(key) && seen.add(key);
    });
    return merged;
};
const comparable = value => String(value || '').toLowerCase().replace(/[^0-9a-z@.]/g, '');
const contactSignature = props => JSON.stringify([comparable(props.name),
    (props.phones || []).map(entry => comparable(entry?.value).slice(-9)).sort(), (props.emails || []).map(entry => comparable(entry?.value)).sort()]);
const IMPORT_RESERVED_ID = /^contact_[0-9a-f]{64}$/;

/**
 * Copies left by the device-scoped native keys used before Oct. 2026 (a new
 * key per reinstall re-imported the whole book). After a complete read of the
 * book, a record of the same source family that the book no longer reaches and
 * that carries the native identity or the exact name/phones/emails of a reached
 * record is removed — soft and restorable, reason `import_duplicate`.
 */
async function removeFormerImportCopies(store, items, collected, prefix, snapshot) {
    const context = store.capture();
    const reachedIds = new Map(collected.correspondences.map(props => [props.external_id, props.canonical_id]));
    const kept = new Set(items.map(item => reachedIds.get(String(item.source_contact_id || item.uid || item.id))).filter(Boolean));
    const [records, origins] = await Promise.all([store.list('contact', context, snapshot), store.list(IMPORT_ORIGIN_TYPE, context, snapshot)]);
    const live = records.filter(row => !importRecordDeleted(row));
    const keptSignatures = new Set(live.filter(row => kept.has(importRecordId(row))).map(row => contactSignature(importRecordProps(row))));
    const originsOf = new Map();
    for (const props of origins.map(importRecordProps).filter(props => props.domain_type === 'contact'))
        originsOf.set(props.canonical_id, [...(originsOf.get(props.canonical_id) || []), props]);
    let removed = 0;
    for (const row of live) {
        const id = importRecordId(row), own = originsOf.get(id) || [];
        if (kept.has(id)) continue;
        if (own.length ? own.some(props => !String(props.source_key).startsWith(prefix)) : !IMPORT_RESERVED_ID.test(id)) continue;
        if (!own.some(props => reachedIds.has(props.external_id)) && !keptSignatures.has(contactSignature(importRecordProps(row)))) continue;
        await store.remove(id, { reason: 'import_duplicate', snapshot });
        removed += 1;
    }
    return removed;
}

export function createLocalContactsSource({ source_id = 'eve_contacts_local', role = 'primary', writable = true,
    api, session, publishProfile } = {}) {
    // Un meme numero = une meme personne : un import repete, un autre appareil ou
    // un autre carnet completent la fiche existante au lieu de la dupliquer.
    const store = createCanonicalImport({ type: 'contact', api, session, normalize: normalizeContactProperties,
        identityKeys: contactPhoneKeys, mergeIntoExisting: mergeContactIntoExisting });
    const groups = createCanonicalImport({ type: 'contact_group', api, session, normalize: input => ({ name: String(input.name || ''), members: input.members || [] }) });
    const personal = createPersonalContactImport({ api, session, publish: publishProfile });
    // One canonical read of the book serves every pull (each home opening, each panel)
    // until a contact changes: a write through this source, or a canonical signal for a
    // contact (a realtime arrival, a native replay, an import). A full read costs one
    // typed page per 1000 contacts and held the local database for seconds on Tauri.
    let cache = [], cacheOwner = null, persisted = false, stale = true;
    const clearOnSessionChange = () => {
        const state = (session || getSessionState)();
        const owner = state?.mode === 'authenticated' ? state.user?.id : null;
        if (owner !== cacheOwner) { cache = []; persisted = false; stale = true; cacheOwner = owner; }
        return owner;
    };
    const hydrate = async ({ fresh = false } = {}) => {
        if (!clearOnSessionChange()) return;
        if (!fresh && persisted && !stale) return;
        stale = false;
        const rows = await store.list();
        clearOnSessionChange();
        cache = rows.filter(row => !importRecordDeleted(row)).map(normalizeLocalContact);
        persisted = true;
    };
    const reread = () => hydrate({ fresh: true });
    const win = globalThis.window;
    if (typeof win?.addEventListener === 'function') {
        const forget = (event) => {
            const detail = event?.detail || {};
            if (event.type === 'squirrel:import-updated' && (detail.changed === 0 || detail.domain !== 'contact')) return;
            if (event.type.startsWith('squirrel:atome-') && detail.atome_type !== 'contact' && !cache.some(row => row.id === detail.atome_id)) return;
            stale = true;
        };
        ['squirrel:atome-created', 'squirrel:atome-updated', 'squirrel:atome-deleted', 'squirrel:atome-restored',
            'squirrel:import-updated', 'squirrel:sync:projection-ready'].forEach(name => win.addEventListener(name, forget));
    }
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
            const own = meta.personal_candidates ? await personal.collect(items, meta.personal_candidates, meta) : null;
            if (own?.external_id) items = items.filter(item => String(item.source_contact_id || item.id) !== own.external_id);
            const context = store.capture(), prepared = [];
            let photoRetry = false;
            for (const item of items) {
                // Une photo illisible ou un envoi refuse ne doit jamais annuler
                // l'import du carnet entier : le contact entre sans photo.
                try { prepared.push(await persistContactPhoto(item, context, meta.signal)); }
                catch (error) {
                    if (meta.signal?.aborted || /import_(cancelled|session_changed)/.test(error?.message || '')) throw error;
                    // Un echec d'envoi est passager : le curseur n'avance pas, le
                    // prochain cycle relit ces contacts. Une image invalide ne
                    // le sera jamais davantage.
                    photoRetry ||= !CONTACT_PHOTO_PERMANENT_ERRORS.has(error?.message);
                    const { photo: _photo, user_face: _face, ...rest } = item;
                    const raw = item.raw ? { ...item.raw } : null;
                    if (raw) { delete raw.photo; delete raw.user_face; }
                    prepared.push(raw ? { ...rest, raw } : rest);
                    globalThis.console?.warn?.('[contacts] photo ignored', { contact: item.source_contact_id || item.id, error: error?.message || String(error) });
                }
            }
            items = prepared;
            const contactIds = await store.resolveIds(items, meta.source_key || meta.imported_from_source, meta);
            const groupItems = (meta.groups || []).map(group => ({ ...group,
                members: (group.members || items.filter(item => (item.collections || item.raw?.collections || []).includes(group.id))
                    .map(item => item.source_contact_id || item.uid || item.id)).map(id => contactIds.get(String(id))).filter(Boolean) }));
            const groupResult = await groups.collect(groupItems, { ...meta, complete: false });
            const ids = new Map(groupResult.correspondences.map(p => [p.external_id, p.canonical_id]));
            const result = await store.collect(items.map(item => {
                const collections = item.collections || item.raw?.collections;
                return collections ? { ...item, collections: collections.map(id => ids.get(id) || id) } : item;
            }), photoRetry ? { ...meta, complete: false } : meta);
            const duplicatesRemoved = meta.legacy_source_prefix && meta.full_snapshot === true && meta.complete === true
                ? await removeFormerImportCopies(store, items, result, meta.legacy_source_prefix, meta.snapshot || createImportSnapshot()) : 0;
            await reread(); return { ...result, personal_profile: own, duplicates_removed: duplicatesRemoved, items: cache };
        },
        async selectPersonalContact(id) {
            await reread();
            const contact = cache.find(row => row.id === id);
            if (!contact) return { ok: false, error: 'contacts_not_found' };
            const context = store.capture();
            const origins = (await store.list(IMPORT_ORIGIN_TYPE, context)).filter(row => {
                const props = importRecordProps(row);
                return props.canonical_id === id && String(props.source_key).startsWith('macos_contacts');
            });
            if (!origins.length) return { ok: false, error: 'personal_native_contact_required' };
            const result = await personal.select({ ...contact, source_contact_id: importRecordProps(origins[0]).external_id });
            for (const group of await store.list('contact_group', context)) {
                const props = importRecordProps(group);
                if (props.members?.includes(id)) await store.write(importRecordId(group), 'contact_group',
                    { ...props, members: [...new Set(props.members.map(member => member === id ? context.owner : member))] }, context);
            }
            await store.remove(id, { reason: 'personal_profile' });
            await reread();
            return { ...result, items: cache };
        },
        async createContact(input) { const id = await store.create(input); await reread(); return { ok: true, created: true, contact: cache.find(row => row.id === id), items: cache }; },
        async replaceContacts(items) { await store.replace(items); await reread(); return { ok: true, items: cache }; },
        async updateContact(id, changes) {
            // A write starts from the current book, never from the shared read.
            await reread(); const current = cache.find(row => row.id === id);
            if (!current) return { ok: false, error: 'contacts_not_found' };
            const next = { ...current, ...changes, id, source_contact_id: id, raw: current.raw };
            if (Object.hasOwn(changes, 'user_face') && !Object.hasOwn(changes, 'photo')) {
                next.photo = changes.user_face || ''; next.photo_asset_id = '';
            }
            await store.update(id, next); await reread();
            return { ok: true, updated: true, contact: cache.find(row => row.id === id), items: cache };
        },
        async deleteContact(id) {
            await reread(); if (!cache.some(row => row.id === id)) return { ok: false, error: 'contacts_not_found' };
            await store.remove(id, { reason: 'user_delete' }); await reread(); return { ok: true, deleted: true, contact_id: id, items: cache };
        },
        /**
         * Explicit user action: each group of live cards sharing a number keeps one
         * card, which receives the others' missing values; the others are deleted
         * through the canonical commit (soft, restorable). Their import origins and
         * group memberships move to the kept card, so a later import updates it.
         */
        async mergeDuplicates() {
            const context = store.capture();
            const [records, origins, groupRows] = await Promise.all([store.list('contact', context),
                store.list(IMPORT_ORIGIN_TYPE, context), store.list('contact_group', context)]);
            const originsOf = new Map();
            for (const origin of origins) {
                const props = importRecordProps(origin);
                if (props.domain_type === 'contact') originsOf.set(props.canonical_id, [...(originsOf.get(props.canonical_id) || []), origin]);
            }
            const merges = [], moved = new Map();
            for (const group of duplicateGroups(records.filter(row => !importRecordDeleted(row)))) {
                const [kept, ...others] = group.map(row => ({ id: importRecordId(row), props: importRecordProps(row) })).sort(keeperOrder);
                const props = others.reduce((merged, other) => mergeDuplicateCard(merged, other.props), kept.props);
                if (!sameImportValue(kept.props, props)) await store.write(kept.id, 'contact', props, context);
                for (const other of others) {
                    for (const origin of originsOf.get(other.id) || [])
                        await store.write(importRecordId(origin), IMPORT_ORIGIN_TYPE, { ...importRecordProps(origin), canonical_id: kept.id }, context);
                    await store.write(other.id, 'contact', null, context, 'delete');
                    moved.set(other.id, kept.id);
                }
                merges.push({ kept_id: kept.id, removed_ids: others.map(other => other.id), phone: contactPhoneKeys(props)[0]?.slice(6) || '' });
            }
            for (const row of groupRows.filter(entry => !importRecordDeleted(entry))) {
                const props = importRecordProps(row), members = Array.isArray(props.members) ? props.members : [];
                if (members.some(id => moved.has(id)))
                    await store.write(importRecordId(row), 'contact_group', { ...props, members: [...new Set(members.map(id => moved.get(id) || id))] }, context);
            }
            await reread();
            return { ok: true, groups: merges.length, duplicates_merged: moved.size, merges, items: cache };
        },
        async importLegacy(items, { owner_id } = {}) {
            if (owner_id !== store.capture().owner) throw new Error('legacy_contact_owner_confirmation_required');
            const collected = await store.collect(items, { source_key: 'legacy_contacts_explicit' });
            stale = true;
            return collected;
        }
    };
}
