import { CONTACTS_V1_ARCHITECTURE_DECISION } from './connector_contract.js';
import { createLocalContactsSource } from './local_source.js';
import { createMacosContactsSource } from './macos_source.js';
import {
    buildContactKey,
    cloneContact,
    cloneSourceInfo,
    hasFiniteLimit,
    matchesContactIdentifier,
    matchesQuery,
    mergeContacts,
    toText
} from './service_contact_utils.js';

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
        const primary = getPrimarySource();
        const activeSources = primary ? [primary] : [];
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

    const refreshLocalIndexFromSyncSource = (options = {}) => {
        const requestedSourceId = toText(options.source_id || '');
        const primarySourceEntry = getPrimarySource();
        if (!primarySourceEntry || typeof primarySourceEntry.listContactsSync !== 'function') return;
        if (requestedSourceId && requestedSourceId !== primarySourceEntry.source_id) return;
        const listed = primarySourceEntry.listContactsSync(options);
        if (listed?.ok !== true || !Array.isArray(listed.items)) return;
        storeContacts(listed.items, {
            mode: 'local',
            cursor: listed.cursor || null
        });
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

        const checkSession = primarySourceEntry.captureImportSession?.();
        const pullMethod = options.incremental === true ? source.syncIncremental : source.syncInitial;
        const sourcePull = typeof pullMethod === 'function'
            ? await pullMethod.call(source, options)
            : (typeof source.listContacts === 'function' ? await source.listContacts({ ...options, autosync: true }) : null);
        checkSession?.();
        if (!sourcePull || sourcePull.ok !== true) {
            return sourcePull || { ok: false, error: 'contacts_import_pull_failed', source_id: normalizedSourceId };
        }

        const imported = await primarySourceEntry.importContacts(Array.isArray(sourcePull.items) ? sourcePull.items : [], {
            imported_from_source: source.source_id,
            imported_from_label: toText(source.contract?.provider || source.source_id),
            source_key: options.source_key || source.source_key || source.source_id,
            cursor: sourcePull.cursor, complete: sourcePull.complete === true,
            removed_ids: sourcePull.removed_ids || [], removed_hrefs: sourcePull.removed_hrefs || [], groups: sourcePull.groups || [],
            device_id: options.device_id, signal: options.signal, checkSession
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

    const mutatePrimary = async (method, ...args) => {
        const primary = getPrimarySource();
        if (typeof primary?.[method] !== 'function') return { ok: false, error: 'contacts_primary_mutation_unavailable' };
        const result = await primary[method](...args);
        if (result.ok) storeContacts(result.items || [], { mode: 'local' });
        return result;
    };
    const createLocalContact = (input, options) => mutatePrimary('createContact', input, options);
    const updateLocalContact = (id, changes, options) => mutatePrimary('updateContact', id, changes, options);
    const deleteLocalContact = (id, options) => mutatePrimary('deleteContact', id, options);

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
            refreshLocalIndexFromSyncSource(options);
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
            const direct = Array.from(contactIndex.values()).find((entry) => matchesContactIdentifier(entry, contactId)) || null;
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
