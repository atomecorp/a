import {
    CONTACTS_V1_ARCHITECTURE_DECISION,
    createContactsConnectorContract
} from './connector_contract.js';

const normalizeText = (value) => String(value || '').trim();
const isNodeRuntime = () => typeof process !== 'undefined' && !!process.versions?.node;

const toFiniteNumber = (value, fallback = null) => {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const normalizeAuthConfig = (auth = {}) => {
    const username = normalizeText(auth.username || auth.user || auth.apple_id || auth.appleId || auth.email);
    const password = normalizeText(auth.password || auth.app_password || auth.appPassword);
    return {
        username: username || null,
        password: password || null
    };
};

export const normalizeIcloudContactsConnectorConfig = ({
    provider = 'icloud_carddav',
    source_id = 'icloud_contacts',
    auth = {},
    carddav = {},
    addressbook_url = null,
    addressbook_id = null
} = {}) => ({
    provider: String(provider || 'icloud_carddav'),
    source_id: String(source_id || 'icloud_contacts'),
    auth: normalizeAuthConfig(auth),
    addressbook_id: normalizeText(addressbook_id || carddav.addressbook_id || '') || null,
    carddav: {
        addressbook_url: normalizeText(addressbook_url || carddav.addressbook_url || carddav.url || '') || null,
        timeout_ms: toFiniteNumber(carddav.timeout_ms || carddav.timeoutMs, 15000)
    }
});

let nodeFactoriesPromise = null;

const getNodeProtocolFactories = async () => {
    if (!isNodeRuntime()) return null;
    if (!nodeFactoriesPromise) {
        nodeFactoriesPromise = import('./node_protocol_clients.js');
    }
    return nodeFactoriesPromise;
};

const createFactoryError = (code, message, extra = {}) => ({
    ok: false,
    error: code,
    message,
    ...extra
});

const withProtocolClient = async ({
    factory,
    config
} = {}, callback) => {
    if (typeof factory !== 'function') {
        throw new Error('carddav_client_factory_missing');
    }
    const client = await factory(config);
    if (!client || typeof client !== 'object') {
        throw new Error('carddav_client_missing');
    }
    if (typeof callback !== 'function') {
        throw new Error('carddav_callback_missing');
    }
    return callback(client);
};

export const createIcloudContactsConnector = ({
    provider = 'icloud_carddav',
    source_id = 'icloud_contacts',
    auth = {},
    carddav = {},
    addressbook_url = null,
    addressbook_id = null,
    carddavClientFactory = null
} = {}) => {
    const config = normalizeIcloudContactsConnectorConfig({
        provider,
        source_id,
        auth,
        carddav,
        addressbook_url,
        addressbook_id
    });
    const contactsById = new Map();
    const contactIdByHref = new Map();
    let cursor = null;
    let hydrated = false;

    const contract = createContactsConnectorContract({
        provider: config.provider,
        protocol: 'carddav',
        role: CONTACTS_V1_ARCHITECTURE_DECISION.import_source.role,
        read_capabilities: ['contacts_list', 'contacts_search', 'contacts_sources'],
        write_capabilities: ['contacts_push']
    });

    const resolveClientFactory = async () => {
        if (typeof carddavClientFactory === 'function') return carddavClientFactory;
        const mod = await getNodeProtocolFactories();
        if (mod?.createNodeCarddavClient) {
            return (clientConfig) => mod.createNodeCarddavClient(clientConfig);
        }
        return null;
    };

    const applyRemoteBatch = (items = [], {
        removed_hrefs = [],
        removed_ids = []
    } = {}) => {
        const normalizedItems = (Array.isArray(items) ? items : []).map((entry) => ({
            id: normalizeText(entry.id || entry.source_contact_id || ''),
            source_contact_id: normalizeText(entry.id || entry.source_contact_id || ''),
            name: normalizeText(entry.name || ''),
            first_name: normalizeText(entry.first_name || ''),
            nickname: normalizeText(entry.nickname || ''),
            phone: normalizeText(entry.phones?.[0]?.value || entry.phone || ''),
            email: normalizeText(entry.emails?.[0]?.value || entry.email || ''),
            user_face: '',
            access: 'private',
            visibility: 'private',
            read_only: true,
            source_provider: config.provider,
            source_label: 'iCloud Contacts',
            source_writable: false,
            custom_fields: [
                ...(entry.organization ? [{ label: 'organisation', value: normalizeText(entry.organization) }] : []),
                ...(entry.note ? [{ label: 'note', value: normalizeText(entry.note) }] : [])
            ],
            raw: {
                ...entry,
                imported_from_source: config.source_id,
                imported_from_label: 'iCloud Contacts'
            },
            href: normalizeText(entry.href || '') || null,
            etag: normalizeText(entry.etag || '') || null
        }));

        normalizedItems.forEach((entry) => {
            contactsById.set(entry.source_contact_id, entry);
            if (entry.href) {
                contactIdByHref.set(entry.href, entry.source_contact_id);
            }
        });

        const removedIds = [];
        (Array.isArray(removed_ids) ? removed_ids : []).forEach((entry) => {
            const contactId = normalizeText(entry || '');
            if (!contactId) return;
            const previous = contactsById.get(contactId);
            if (previous?.href) contactIdByHref.delete(previous.href);
            contactsById.delete(contactId);
            removedIds.push(contactId);
        });

        (Array.isArray(removed_hrefs) ? removed_hrefs : []).forEach((href) => {
            const normalizedHref = normalizeText(href || '');
            if (!normalizedHref) return;
            const contactId = contactIdByHref.get(normalizedHref);
            if (!contactId) return;
            const previous = contactsById.get(contactId);
            if (previous?.href) contactIdByHref.delete(previous.href);
            contactsById.delete(contactId);
            removedIds.push(contactId);
        });

        return {
            items: normalizedItems.map((entry) => ({ ...entry })),
            removed_ids: Array.from(new Set(removedIds.filter(Boolean)))
        };
    };

    const runClientSync = async (mode = 'delta', options = {}) => {
        const factory = await resolveClientFactory();
        if (!factory) {
            return createFactoryError(
                'icloud_contacts_client_factory_missing',
                'A CardDAV client factory is required for direct iCloud contacts access',
                { provider: config.provider, source_id: config.source_id }
            );
        }

        try {
            return await withProtocolClient({
                factory,
                config: {
                    auth: config.auth,
                    carddav: {
                        ...config.carddav,
                        addressbook_url: options.addressbook_url || config.carddav.addressbook_url
                    }
                }
            }, async (client) => {
                const methodName = mode === 'initial' ? 'fetchInitialContacts' : 'fetchDelta';
                if (typeof client?.[methodName] !== 'function') {
                    throw new Error(`missing_client_method:${methodName}`);
                }
                const response = await client[methodName]({
                    addressbook_url: options.addressbook_url || config.carddav.addressbook_url,
                    cursor: options.cursor !== undefined ? options.cursor : cursor
                });
                if (!response || response.ok !== true) {
                    return response || createFactoryError('icloud_contacts_sync_failed', 'The CardDAV sync returned an invalid response', {
                        provider: config.provider,
                        source_id: config.source_id
                    });
                }
                const applied = applyRemoteBatch(response.items, {
                    removed_hrefs: response.removed_hrefs,
                    removed_ids: response.removed_ids
                });
                cursor = response.cursor ?? cursor ?? null;
                hydrated = true;
                return {
                    ok: true,
                    provider: config.provider,
                    source_id: config.source_id,
                    addressbook_url: response.addressbook_url || config.carddav.addressbook_url || null,
                    cursor,
                    items: Array.from(contactsById.values()).map((entry) => ({ ...entry })),
                    changes: applied.items,
                    removed_ids: applied.removed_ids
                };
            });
        } catch (error) {
            return createFactoryError(
                mode === 'initial' ? 'icloud_contacts_initial_failed' : 'icloud_contacts_delta_failed',
                error?.message || String(error),
                { provider: config.provider, source_id: config.source_id }
            );
        }
    };

    return {
        provider: config.provider,
        source_id: config.source_id,
        role: CONTACTS_V1_ARCHITECTURE_DECISION.import_source.role,
        writable: true,
        contract,
        async listContacts(options = {}) {
            if (!hydrated && options.autosync !== false) {
                const result = await runClientSync('initial', options);
                if (result.ok !== true) return result;
            }
            return {
                ok: true,
                source_id: config.source_id,
                items: Array.from(contactsById.values()).map((entry) => ({ ...entry }))
            };
        },
        async getContact(contactId) {
            const key = normalizeText(contactId || '');
            const contact = contactsById.get(key);
            if (!contact) {
                return {
                    ok: false,
                    error: 'contacts_not_found',
                    source_id: config.source_id,
                    contact_id: key || null
                };
            }
            return {
                ok: true,
                source_id: config.source_id,
                contact: { ...contact }
            };
        },
        async fetchInitialContacts(options = {}) {
            return runClientSync('initial', options);
        },
        async fetchDelta(options = {}) {
            return runClientSync('delta', options);
        },
        async syncInitial(options = {}) {
            return runClientSync('initial', options);
        },
        async syncIncremental(options = {}) {
            return runClientSync('delta', options);
        },
        async pushContact(contact = {}, options = {}) {
            const factory = await resolveClientFactory();
            if (!factory) {
                return createFactoryError(
                    'icloud_contacts_client_factory_missing',
                    'A CardDAV client factory is required for direct iCloud contacts access',
                    { provider: config.provider, source_id: config.source_id }
                );
            }
            try {
                return await withProtocolClient({
                    factory,
                    config: {
                        auth: config.auth,
                        carddav: {
                            ...config.carddav,
                            addressbook_url: options.addressbook_url || config.carddav.addressbook_url
                        }
                    }
                }, async (client) => {
                    if (typeof client?.createOrUpdateContact !== 'function') {
                        throw new Error('missing_client_method:createOrUpdateContact');
                    }
                    const response = await client.createOrUpdateContact({
                        contact,
                        addressbook_url: options.addressbook_url || config.carddav.addressbook_url,
                        href: options.href || contact?.href || contact?.raw?.href || null,
                        etag: options.etag || contact?.etag || contact?.raw?.etag || null
                    });
                    if (!response || response.ok !== true || !response.contact) {
                        return response || createFactoryError(
                            'icloud_contacts_push_failed',
                            'The CardDAV push returned an invalid response',
                            { provider: config.provider, source_id: config.source_id }
                        );
                    }
                    const applied = applyRemoteBatch([response.contact]);
                    hydrated = true;
                    return {
                        ok: true,
                        provider: config.provider,
                        source_id: config.source_id,
                        addressbook_url: response.addressbook_url || config.carddav.addressbook_url || null,
                        cursor,
                        created: response.created === true,
                        updated: response.updated === true,
                        href: response.href || null,
                        etag: response.etag || null,
                        contact: applied.items[0] || null,
                        items: Array.from(contactsById.values()).map((entry) => ({ ...entry }))
                    };
                });
            } catch (error) {
                return createFactoryError(
                    'icloud_contacts_push_failed',
                    error?.message || String(error),
                    { provider: config.provider, source_id: config.source_id }
                );
            }
        },
        syncStatus() {
            return {
                ok: true,
                sync: {
                    provider: config.provider,
                    source_id: config.source_id,
                    cursor,
                    hydrated,
                    contacts: contactsById.size
                }
            };
        }
    };
};
