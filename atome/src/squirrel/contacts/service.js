import { CONTACTS_V1_ARCHITECTURE_DECISION } from './connector_contract.js';
import { createLocalContactsSource } from './local_source.js';
import { createMacosContactsSource } from './macos_source.js';

const toText = (value) => String(value || '').trim();

const normalizePhoneKey = (value) => toText(value).replace(/[^\d+]/g, '');
const normalizeEmailKey = (value) => toText(value).toLowerCase();
const hasFiniteLimit = (value) => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
const buildPhoneSearchTokens = (value) => {
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

const cloneSourceInfo = (source = {}) => ({
    source_id: toText(source.source_id),
    role: toText(source.role),
    writable: source.writable === true,
    provider: toText(source.contract?.provider || source.source_id),
    protocol: toText(source.contract?.protocol || 'contacts'),
    sync: typeof source.syncStatus === 'function' ? source.syncStatus() : null,
    read_capabilities: Array.isArray(source.contract?.read_capabilities) ? [...source.contract.read_capabilities] : [],
    write_capabilities: Array.isArray(source.contract?.write_capabilities) ? [...source.contract.write_capabilities] : []
});

const buildContactKey = (contact = {}) => {
    const phone = normalizePhoneKey(contact.phone);
    if (phone) return `phone:${phone}`;
    const email = normalizeEmailKey(contact.email);
    if (email) return `email:${email}`;
    const id = toText(contact.id || contact.source_contact_id);
    if (id) return `id:${id}`;
    const name = toText(contact.name).toLowerCase();
    return name ? `name:${name}` : '';
};

const mergeContacts = (base = {}, incoming = {}) => ({
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

const matchesQuery = (contact = {}, query = '') => {
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

const cloneContact = (contact = {}) => ({
    ...contact,
    custom_fields: Array.isArray(contact?.custom_fields) ? contact.custom_fields.map((entry) => ({ ...entry })) : [],
    raw: contact?.raw && typeof contact.raw === 'object' ? { ...contact.raw } : contact?.raw || null
});

export const createContactsService = ({
    primarySource = createLocalContactsSource(),
    sources = []
} = {}) => {
    const sourceRegistry = new Map();
    const contactIndex = new Map();
    const syncState = {
        mode: null,
        cursor: null,
        ingested: 0,
        source_count: 0
    };

    const registerSource = (source) => {
        if (!source || typeof source !== 'object') {
            throw new Error('contacts_source_invalid');
        }
        const sourceId = toText(source.source_id || source.id);
        if (!sourceId) {
            throw new Error('contacts_source_id_required');
        }
        const normalized = {
            ...source,
            source_id: sourceId,
            role: toText(source.role || source.contract?.role || 'import') || 'import',
            writable: source.writable === true,
            contract: source.contract || {}
        };
        sourceRegistry.set(sourceId, normalized);
        return cloneSourceInfo(normalized);
    };

    const unregisterSource = (sourceId) => sourceRegistry.delete(toText(sourceId));

    const listRegisteredSources = () => Array.from(sourceRegistry.values()).map((entry) => cloneSourceInfo(entry));

    const getSource = (sourceId) => sourceRegistry.get(toText(sourceId)) || null;

    const getPrimarySource = () => getSource(CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id);

    const resolveSources = (sourceId = null) => {
        if (sourceId) {
            const source = getSource(sourceId);
            return source ? [source] : [];
        }
        return Array.from(sourceRegistry.values());
    };

    const storeContacts = (items = [], meta = {}) => {
        contactIndex.clear();
        (Array.isArray(items) ? items : []).forEach((entry) => {
            const key = buildContactKey(entry);
            if (!key) return;
            const existing = contactIndex.get(key);
            contactIndex.set(key, existing ? mergeContacts(existing, entry) : { ...entry });
        });
        syncState.mode = toText(meta.mode || syncState.mode) || null;
        syncState.cursor = toText(meta.cursor || '') || syncState.cursor || null;
        syncState.ingested = contactIndex.size;
        syncState.source_count = resolveSources().length;
        return Array.from(contactIndex.values()).sort((left, right) => {
            const aa = `${left.name || ''} ${left.first_name || ''} ${left.nickname || ''}`.trim().toLowerCase();
            const bb = `${right.name || ''} ${right.first_name || ''} ${right.nickname || ''}`.trim().toLowerCase();
            return aa.localeCompare(bb);
        });
    };

    const syncFromSources = async (mode = 'initial', options = {}) => {
        const activeSources = resolveSources(options.source_id);
        if (!activeSources.length) {
            return { ok: false, error: 'contacts_source_missing', source_id: toText(options.source_id) || null };
        }
        const pulls = await Promise.all(activeSources.map(async (source) => {
            const method = mode === 'initial' ? source.syncInitial : source.syncIncremental;
            if (typeof method === 'function') {
                return method.call(source, options);
            }
            if (typeof source.listContacts === 'function') {
                return source.listContacts({ ...options, autosync: false });
            }
            return { ok: false, error: 'contacts_source_list_missing', source_id: source.source_id };
        }));

        const failed = pulls.find((entry) => entry?.ok !== true);
        if (failed) return failed;

        const merged = [];
        pulls.forEach((entry) => {
            const items = Array.isArray(entry?.items) ? entry.items : [];
            items.forEach((item) => merged.push({ ...item }));
        });
        const stored = storeContacts(merged, {
            mode,
            cursor: pulls.map((entry) => toText(entry?.cursor || '')).filter(Boolean).at(-1) || null
        });
        return {
            ok: true,
            mode,
            cursor: syncState.cursor,
            items: stored,
            stats: {
                contacts: stored.length,
                sources: activeSources.length
            }
        };
    };

    const listStoredContacts = ({ query = '', limit = null, source_id = null } = {}) => {
        const normalizedLimit = hasFiniteLimit(limit) ? Math.max(1, Number(limit)) : null;
        return Array.from(contactIndex.values())
            .filter((entry) => !source_id || toText(entry.source_provider) === toText(source_id) || toText(entry.source_label) === toText(source_id))
            .filter((entry) => matchesQuery(entry, query))
            .slice(0, normalizedLimit || undefined)
            .map((entry) => ({ ...entry }));
    };

    const importSource = async (sourceId, options = {}) => {
        const normalizedSourceId = toText(sourceId || '');
        if (!normalizedSourceId) {
            return { ok: false, error: 'contacts_import_source_required' };
        }
        const source = getSource(normalizedSourceId);
        if (!source) {
            return { ok: false, error: 'contacts_source_missing', source_id: normalizedSourceId };
        }
        const primarySourceEntry = getPrimarySource();
        if (!primarySourceEntry || typeof primarySourceEntry.importContacts !== 'function') {
            return { ok: false, error: 'contacts_primary_import_unavailable', source_id: CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id };
        }

        const sourcePull = typeof source.syncInitial === 'function'
            ? await source.syncInitial(options)
            : (typeof source.listContacts === 'function' ? await source.listContacts({ ...options, autosync: true }) : null);
        if (!sourcePull || sourcePull.ok !== true) {
            return sourcePull || { ok: false, error: 'contacts_import_pull_failed', source_id: normalizedSourceId };
        }

        const imported = await primarySourceEntry.importContacts(Array.isArray(sourcePull.items) ? sourcePull.items : [], {
            imported_from_source: source.source_id,
            imported_from_label: toText(source.contract?.provider || source.source_id)
        });
        if (imported?.ok !== true) {
            return imported || { ok: false, error: 'contacts_import_store_failed', source_id: normalizedSourceId };
        }
        const refreshed = await syncFromSources('initial', {
            ...options,
            source_id: primarySourceEntry.source_id
        });
        return {
            ok: refreshed?.ok === true,
            imported: imported.imported || 0,
            source_id: normalizedSourceId,
            target_source_id: primarySourceEntry.source_id,
            items: refreshed?.items || [],
            stats: refreshed?.stats || null,
            cursor: refreshed?.cursor || imported.cursor || null
        };
    };

    const createLocalContact = async (contact = {}, options = {}) => {
        const primarySourceEntry = getPrimarySource();
        if (!primarySourceEntry || typeof primarySourceEntry.importContacts !== 'function') {
            return { ok: false, error: 'contacts_primary_import_unavailable', source_id: CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id };
        }
        const payload = (contact && typeof contact === 'object') ? { ...contact } : {};
        if (!toText(payload.name || payload.first_name || payload.nickname || payload.phone || payload.email)) {
            return { ok: false, error: 'contacts_create_payload_missing' };
        }
        const createdKey = buildContactKey(payload);
        const imported = await primarySourceEntry.importContacts([payload], {
            imported_from_source: CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id,
            imported_from_label: 'eVe Contacts',
            ...options
        });
        if (imported?.ok !== true) {
            return imported || { ok: false, error: 'contacts_create_store_failed' };
        }
        const refreshed = await syncFromSources('initial', {
            ...options,
            source_id: primarySourceEntry.source_id
        });
        const matchCreatedContact = (items = []) => {
            const pool = Array.isArray(items) ? items : [];
            const direct = pool.find((entry) => buildContactKey(entry) === createdKey);
            if (direct) return cloneContact(direct);
            const fallback = pool.find((entry) => {
                return toText(entry?.name) === toText(payload.name)
                    && toText(entry?.phone) === toText(payload.phone)
                    && toText(entry?.email) === toText(payload.email);
            });
            return fallback ? cloneContact(fallback) : null;
        };
        const createdContact = matchCreatedContact(refreshed?.items) || matchCreatedContact(imported?.items);
        return {
            ok: refreshed?.ok === true,
            created: true,
            source_id: primarySourceEntry.source_id,
            contact: createdContact,
            items: refreshed?.items || [],
            stats: refreshed?.stats || null,
            cursor: refreshed?.cursor || imported?.cursor || null
        };
    };

    const loadPrimaryContacts = async () => {
        const primarySourceEntry = getPrimarySource();
        if (!primarySourceEntry) {
            return { ok: false, error: 'contacts_primary_source_missing', source_id: CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id };
        }
        if (typeof primarySourceEntry.syncInitial === 'function') {
            const synced = await primarySourceEntry.syncInitial({});
            if (synced?.ok !== true) return synced || { ok: false, error: 'contacts_primary_sync_failed', source_id: primarySourceEntry.source_id };
            return {
                ok: true,
                source: primarySourceEntry,
                items: Array.isArray(synced?.items) ? synced.items.map((entry) => cloneContact(entry)) : []
            };
        }
        if (typeof primarySourceEntry.listContacts === 'function') {
            const listed = await primarySourceEntry.listContacts({});
            if (listed?.ok !== true) return listed || { ok: false, error: 'contacts_primary_list_failed', source_id: primarySourceEntry.source_id };
            return {
                ok: true,
                source: primarySourceEntry,
                items: Array.isArray(listed?.items) ? listed.items.map((entry) => cloneContact(entry)) : []
            };
        }
        return { ok: false, error: 'contacts_primary_list_unavailable', source_id: primarySourceEntry.source_id };
    };

    const persistPrimaryContacts = async (items = [], source = null, options = {}) => {
        const primarySourceEntry = source || getPrimarySource();
        if (!primarySourceEntry || typeof primarySourceEntry.replaceContacts !== 'function') {
            return {
                ok: false,
                error: 'contacts_primary_replace_unavailable',
                source_id: primarySourceEntry?.source_id || CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id
            };
        }
        const replaced = await primarySourceEntry.replaceContacts(items, {
            imported_from_source: CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id,
            imported_from_label: 'eVe Contacts',
            ...options
        });
        if (replaced?.ok !== true) {
            return replaced || { ok: false, error: 'contacts_primary_replace_failed', source_id: primarySourceEntry.source_id };
        }
        const refreshed = await syncFromSources('initial', {
            ...options,
            source_id: primarySourceEntry.source_id
        });
        return {
            ok: refreshed?.ok === true,
            source: primarySourceEntry,
            items: refreshed?.items || [],
            stats: refreshed?.stats || null,
            cursor: refreshed?.cursor || replaced?.cursor || null
        };
    };

    const updateLocalContact = async (contactId, changes = {}, options = {}) => {
        const targetId = toText(contactId || changes?.contact_id || changes?.contactId || changes?.id || '');
        if (!targetId) {
            return { ok: false, error: 'contacts_update_contact_missing' };
        }
        const loaded = await loadPrimaryContacts();
        if (loaded?.ok !== true) return loaded;
        const items = Array.isArray(loaded.items) ? loaded.items : [];
        const index = items.findIndex((entry) => {
            return toText(entry.id) === targetId
                || toText(entry.source_contact_id) === targetId
                || buildContactKey(entry) === buildContactKey({ id: targetId, source_contact_id: targetId });
        });
        if (index < 0) {
            return { ok: false, error: 'contacts_not_found', contact_id: targetId };
        }
        const current = items[index];
        const next = {
            ...current,
            ...(changes && typeof changes === 'object' ? { ...changes } : {}),
            id: toText(current.id || ''),
            source_contact_id: toText(current.source_contact_id || current.id || targetId)
        };
        if (Array.isArray(changes?.custom_fields)) {
            next.custom_fields = changes.custom_fields.map((entry) => ({ ...entry }));
        }
        if (changes?.raw && typeof changes.raw === 'object') {
            next.raw = { ...(current.raw && typeof current.raw === 'object' ? current.raw : {}), ...changes.raw };
        }
        items[index] = next;
        const persisted = await persistPrimaryContacts(items, loaded.source, options);
        if (persisted?.ok !== true) return persisted;
        const updatedContact = Array.isArray(persisted.items)
            ? persisted.items.find((entry) => toText(entry.source_contact_id || entry.id) === toText(next.source_contact_id || next.id))
            : null;
        return {
            ok: true,
            updated: true,
            source_id: loaded.source?.source_id || CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id,
            contact: updatedContact ? cloneContact(updatedContact) : cloneContact(next),
            items: persisted.items || [],
            stats: persisted.stats || null,
            cursor: persisted.cursor || null
        };
    };

    const deleteLocalContact = async (contactId, options = {}) => {
        const targetId = toText(contactId || '');
        if (!targetId) {
            return { ok: false, error: 'contacts_delete_contact_missing' };
        }
        const loaded = await loadPrimaryContacts();
        if (loaded?.ok !== true) return loaded;
        const items = Array.isArray(loaded.items) ? loaded.items : [];
        const nextItems = items.filter((entry) => {
            return !(
                toText(entry.id) === targetId
                || toText(entry.source_contact_id) === targetId
                || buildContactKey(entry) === buildContactKey({ id: targetId, source_contact_id: targetId })
            );
        });
        if (nextItems.length === items.length) {
            return { ok: false, error: 'contacts_not_found', contact_id: targetId };
        }
        const persisted = await persistPrimaryContacts(nextItems, loaded.source, options);
        if (persisted?.ok !== true) return persisted;
        return {
            ok: true,
            deleted: true,
            source_id: loaded.source?.source_id || CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id,
            contact_id: targetId,
            items: persisted.items || [],
            stats: persisted.stats || null,
            cursor: persisted.cursor || null
        };
    };

    const resolvePushContactPayload = (options = {}) => {
        if (options?.contact && typeof options.contact === 'object') {
            return cloneContact(options.contact);
        }
        const contactId = toText(options?.contact_id || options?.contactId || options?.id || '');
        if (!contactId) return null;
        const direct = sourceRegistry.get(CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id);
        if (direct && typeof direct.getContact === 'function') {
            // best-effort: getContact may be sync or async on the local source
            return Promise.resolve(direct.getContact(contactId)).then((read) => {
                if (read?.ok === true && read.contact) return cloneContact(read.contact);
                const fallback = Array.from(contactIndex.values()).find((entry) => {
                    return toText(entry.id) === contactId || toText(entry.source_contact_id) === contactId;
                }) || null;
                return fallback ? cloneContact(fallback) : null;
            });
        }
        const fallback = Array.from(contactIndex.values()).find((entry) => {
            return toText(entry.id) === contactId || toText(entry.source_contact_id) === contactId;
        }) || null;
        return Promise.resolve(fallback ? cloneContact(fallback) : null);
    };

    const pushContactToSource = async (sourceId, options = {}) => {
        const normalizedSourceId = toText(sourceId || '');
        if (!normalizedSourceId) {
            return { ok: false, error: 'contacts_push_source_required' };
        }
        const source = getSource(normalizedSourceId);
        if (!source) {
            return { ok: false, error: 'contacts_source_missing', source_id: normalizedSourceId };
        }
        if (typeof source.pushContact !== 'function') {
            return { ok: false, error: 'contacts_source_write_unavailable', source_id: normalizedSourceId };
        }
        const contact = await resolvePushContactPayload(options);
        if (!contact) {
            return { ok: false, error: 'contacts_push_contact_missing', source_id: normalizedSourceId };
        }
        const pushed = await source.pushContact(contact, options);
        if (!pushed || pushed.ok !== true) {
            return pushed || { ok: false, error: 'contacts_push_failed', source_id: normalizedSourceId };
        }
        const primarySourceEntry = getPrimarySource();
        let refreshed = null;
        if (primarySourceEntry && typeof primarySourceEntry.importContacts === 'function' && pushed.contact) {
            await primarySourceEntry.importContacts([pushed.contact], {
                imported_from_source: source.source_id,
                imported_from_label: toText(source.contract?.provider || source.source_id)
            });
            refreshed = await syncFromSources('initial', {
                ...options,
                source_id: primarySourceEntry.source_id
            });
        }
        return {
            ok: true,
            source_id: normalizedSourceId,
            target_source_id: primarySourceEntry?.source_id || null,
            created: pushed.created === true,
            updated: pushed.updated === true,
            contact: pushed.contact ? cloneContact(pushed.contact) : null,
            items: refreshed?.items || [],
            stats: refreshed?.stats || null,
            href: pushed.href || null,
            etag: pushed.etag || null
        };
    };

    registerSource(primarySource);
    sources.forEach((source) => registerSource(source));

    return {
        setMacosSource(options = {}) {
            return registerSource(createMacosContactsSource(options));
        },
        getPrimarySource() {
            return cloneSourceInfo(getPrimarySource() || {});
        },
        registerSource,
        unregisterSource,
        contactsSources() {
            return {
                ok: true,
                items: listRegisteredSources()
            };
        },
        syncInitial(options = {}) {
            return syncFromSources('initial', options);
        },
        syncIncremental(options = {}) {
            return syncFromSources('delta', options);
        },
        async syncPull(options = {}) {
            const preferIncremental = options.prefer_incremental !== false;
            if (preferIncremental && syncState.cursor) {
                return syncFromSources('delta', options);
            }
            return syncFromSources('initial', options);
        },
        importSource(sourceId, options = {}) {
            return importSource(sourceId, options);
        },
        importMacosContacts(options = {}) {
            return importSource(CONTACTS_V1_ARCHITECTURE_DECISION.import_source.id, options);
        },
        createLocalContact(contact = {}, options = {}) {
            return createLocalContact(contact, options);
        },
        updateLocalContact(contactId, changes = {}, options = {}) {
            return updateLocalContact(contactId, changes, options);
        },
        deleteLocalContact(contactId, options = {}) {
            return deleteLocalContact(contactId, options);
        },
        pushContactToSource(sourceId, options = {}) {
            return pushContactToSource(sourceId, options);
        },
        syncStatus() {
            return {
                ok: true,
                sync: { ...syncState },
                sources: listRegisteredSources()
            };
        },
        contactsList(options = {}) {
            return {
                ok: true,
                items: listStoredContacts(options),
                stats: {
                    contacts: contactIndex.size,
                    sources: resolveSources().length
                }
            };
        },
        contactsSearch(query, options = {}) {
            return {
                ok: true,
                query: toText(query),
                items: listStoredContacts({ ...options, query })
            };
        },
        contactsRead(contactId) {
            const key = buildContactKey({
                id: contactId,
                source_contact_id: contactId
            });
            const direct = Array.from(contactIndex.values()).find((entry) => {
                return buildContactKey(entry) === key || toText(entry.source_contact_id) === toText(contactId) || toText(entry.id) === toText(contactId);
            }) || null;
            if (!direct) {
                return { ok: false, error: 'contacts_not_found', contact_id: toText(contactId) || null };
            }
            return {
                ok: true,
                contact: { ...direct }
            };
        }
    };
};
