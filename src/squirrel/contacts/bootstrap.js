import { CONTACTS_V1_ARCHITECTURE_DECISION } from './connector_contract.js';
import { createIcloudContactsConnector } from './icloud_connector.js';
import { createMacosContactsSource } from './macos_source.js';
import { createContactsService } from './service.js';
import { emitPerfEvent, perfElapsedMs, perfLog, perfNowMs } from '../../utils/perf_runtime.js';

const SERVICE_KEY = '__SQUIRREL_CONTACTS_SERVICE__';
const API_KEY = '__SQUIRREL_CONTACTS_API__';

const installContactsGlobals = (env, api) => {
    env.Squirrel = env.Squirrel || {};
    env.Squirrel.contacts = api;

    env.atome = env.atome || {};
    env.atome.contacts = api;
    env.atome.tools = env.atome.tools || {};
    env.atome.tools.contacts = api;

    env.AtomeContacts = api;
    return api;
};

const getOrCreateService = (env) => {
    if (env[SERVICE_KEY]) return env[SERVICE_KEY];
    const service = createContactsService();
    env[SERVICE_KEY] = service;
    return service;
};

const resolveSecureAuthOptions = async (env, options = {}) => {
    const authRef = String(options?.auth_ref || options?.authRef || '').trim();
    if (!authRef) {
        return { ...options };
    }
    const securityApi = env?.Squirrel?.security || env?.atome?.security || env?.AtomeSecurity || null;
    if (!securityApi || typeof securityApi.readToken !== 'function') {
        throw new Error('security_token_vault_unavailable');
    }
    const stored = await securityApi.readToken(authRef);
    if (!stored || stored.ok !== true) {
        throw new Error(stored?.error || 'security_token_read_failed');
    }
    return {
        ...options,
        auth: stored.value
    };
};

const buildPrimarySyncOptions = (options = {}) => {
    const normalized = (options && typeof options === 'object') ? { ...options } : {};
    delete normalized.commandRunner;
    if (!normalized.source_id) {
        normalized.source_id = CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id;
    }
    return normalized;
};

const buildContactWritePreview = (options = {}) => {
    if (options?.contact && typeof options.contact === 'object') {
        const contact = options.contact;
        return {
            contact_id: String(contact?.id || contact?.source_contact_id || '').trim() || null,
            name: String(contact?.name || '').trim() || null,
            email: String(contact?.email || '').trim() || null,
            phone: String(contact?.phone || '').trim() || null
        };
    }
    return {
        contact_id: String(options?.contact_id || options?.contactId || options?.id || '').trim() || null,
        name: null,
        email: null,
        phone: null
    };
};

export const createGlobalContactsApi = ({
    env = globalThis
} = {}) => {
    if (!env || typeof env !== 'object') {
        throw new Error('Global contacts bootstrap requires an object-like environment');
    }
    if (env[API_KEY]) return env[API_KEY];

    const api = {
        get service() {
            return getOrCreateService(env);
        },
        registerSource(source) {
            return getOrCreateService(env).registerSource(source);
        },
        unregisterSource(sourceId) {
            return getOrCreateService(env).unregisterSource(sourceId);
        },
        sources() {
            return getOrCreateService(env).contactsSources();
        },
        configureMacosSource(options = {}) {
            return getOrCreateService(env).setMacosSource({
                ...options,
                commandRunner: options.commandRunner
            });
        },
        ensureMacosSource(options = {}) {
            return api.configureMacosSource(options);
        },
        async importSource(sourceId, options = {}) {
            return getOrCreateService(env).importSource(sourceId, options);
        },
        async importMacosContacts(options = {}) {
            const service = getOrCreateService(env);
            const hasMacosSource = service.contactsSources()?.items?.some((entry) => entry?.source_id === CONTACTS_V1_ARCHITECTURE_DECISION.import_source.id);
            if (!hasMacosSource) {
                service.setMacosSource({
                    ...options,
                    commandRunner: options.commandRunner
                });
            }
            return service.importMacosContacts({
                ...options,
                source_id: CONTACTS_V1_ARCHITECTURE_DECISION.import_source.id
            });
        },
        async configureIcloudConnector(options = {}) {
            const resolvedOptions = await resolveSecureAuthOptions(env, options);
            const connector = createIcloudContactsConnector(resolvedOptions);
            getOrCreateService(env).registerSource(connector);
            return {
                ok: true,
                source: connector.source_id,
                provider: connector.provider
            };
        },
        async importIcloudContacts(options = {}) {
            const service = getOrCreateService(env);
            const sourceId = String(options?.source_id || 'icloud_contacts').trim() || 'icloud_contacts';
            const hasSource = service.contactsSources()?.items?.some((entry) => entry?.source_id === sourceId);
            if (!hasSource) {
                await api.configureIcloudConnector(options);
            }
            return service.importSource(sourceId, options);
        },
        async pushContactToIcloud(options = {}) {
            if (options?.confirmed !== true) {
                return {
                    ok: false,
                    error: 'contacts_confirmation_required',
                    confirmation_required: true,
                    action: 'contacts.push_icloud',
                    preview: buildContactWritePreview(options)
                };
            }
            const service = getOrCreateService(env);
            const sourceId = String(options?.source_id || 'icloud_contacts').trim() || 'icloud_contacts';
            const hasSource = service.contactsSources()?.items?.some((entry) => entry?.source_id === sourceId);
            if (!hasSource) {
                const hasInlineAuth = options?.auth && typeof options.auth === 'object';
                const hasAuthRef = String(options?.auth_ref || options?.authRef || '').trim();
                if (!hasInlineAuth && !hasAuthRef) {
                    return { ok: false, error: 'contacts_icloud_connector_not_configured', source_id: sourceId };
                }
                await api.configureIcloudConnector(options);
            }
            return service.pushContactToSource(sourceId, options);
        },
        async ensureReady(options = {}) {
            const service = getOrCreateService(env);
            const syncResult = await service.syncPull(buildPrimarySyncOptions(options));
            if (syncResult?.ok === true && Array.isArray(syncResult.items) && syncResult.items.length) {
                return syncResult;
            }
            if (syncResult?.ok === true) {
                return syncResult;
            }
            const cached = service.contactsList({
                limit: 1,
                source_id: CONTACTS_V1_ARCHITECTURE_DECISION.primary_read_source.id
            });
            if (Array.isArray(cached?.items) && cached.items.length) {
                return {
                    ok: true,
                    cached: true,
                    sync_error: syncResult?.error || null,
                    items: cached.items,
                    stats: cached.stats || null
                };
            }
            return syncResult;
        },
        list(options = {}) {
            return getOrCreateService(env).contactsList({
                source_id: options?.source_id || undefined,
                ...options
            });
        },
        async createLocalContact(contact = {}, options = {}) {
            return getOrCreateService(env).createLocalContact(contact, options);
        },
        async updateLocalContact(contactId, changes = {}, options = {}) {
            return getOrCreateService(env).updateLocalContact(contactId, changes, options);
        },
        async deleteLocalContact(contactId, options = {}) {
            return getOrCreateService(env).deleteLocalContact(contactId, options);
        },
        search(query, options = {}) {
            return getOrCreateService(env).contactsSearch(query, options);
        },
        read(contactId) {
            return getOrCreateService(env).contactsRead(contactId);
        },
        syncInitial(options = {}) {
            return getOrCreateService(env).syncInitial(options);
        },
        syncIncremental(options = {}) {
            return getOrCreateService(env).syncIncremental(options);
        },
        syncPull(options = {}) {
            return getOrCreateService(env).syncPull(options);
        },
        syncStatus() {
            return getOrCreateService(env).syncStatus();
        },
        async openPanel() {
            const panelPerfStart = perfNowMs();
            const openPanel = env?.open_contact_panel
                || env?.window?.open_contact_panel
                || globalThis?.open_contact_panel
                || null;
            if (typeof openPanel !== 'function') {
                emitPerfEvent('contacts.open_panel', {
                    ok: false,
                    totalMs: perfElapsedMs(panelPerfStart),
                    error: 'contact_panel_unavailable'
                });
                return { ok: false, error: 'contact_panel_unavailable' };
            }
            await openPanel();
            const totalMs = perfElapsedMs(panelPerfStart);
            perfLog('[Perf] contacts.openPanel', { totalMs });
            emitPerfEvent('contacts.open_panel', { ok: true, totalMs });
            return { ok: true };
        },
        closePanel() {
            const closePanel = env?.close_contact_panel
                || env?.window?.close_contact_panel
                || globalThis?.close_contact_panel
                || null;
            if (typeof closePanel !== 'function') {
                return { ok: false, error: 'contact_panel_unavailable' };
            }
            closePanel();
            return { ok: true };
        }
    };

    env[API_KEY] = installContactsGlobals(env, api);
    return env[API_KEY];
};

export const bootstrapGlobalContacts = (options = {}) => createGlobalContactsApi(options);

if (typeof globalThis !== 'undefined') {
    try {
        bootstrapGlobalContacts({ env: globalThis });
    } catch (_error) {
        // Ignore bootstrap errors in non-browser/non-tauri contexts.
    }
}
