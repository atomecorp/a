import {
    CALENDAR_V1_ARCHITECTURE_DECISION,
    createCalendarConnectorContract
} from './connector_contract.js';
import { createCalendarSyncState } from './sync_state.js';

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

export const normalizeIcloudLegacyCalendarConnectorConfig = ({
    provider = 'icloud_caldav_legacy',
    source_id = CALENDAR_V1_ARCHITECTURE_DECISION.legacy_read_sources[0]?.id || 'icloud_legacy',
    auth = {},
    caldav = {},
    calendar_url = null,
    calendar_id = null,
    lookback_days = 60,
    lookahead_days = 365
} = {}) => ({
    provider: String(provider || 'icloud_caldav_legacy'),
    source_id: String(source_id || 'icloud_legacy'),
    auth: normalizeAuthConfig(auth),
    calendar_id: normalizeText(calendar_id || caldav.calendar_id || '') || null,
    caldav: {
        calendar_url: normalizeText(calendar_url || caldav.calendar_url || caldav.url || '') || null,
        lookback_days: toFiniteNumber(caldav.lookback_days || lookback_days, 60),
        lookahead_days: toFiniteNumber(caldav.lookahead_days || lookahead_days, 365)
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
        throw new Error('caldav_client_factory_missing');
    }
    const client = await factory(config);
    if (!client || typeof client !== 'object') {
        throw new Error('caldav_client_missing');
    }
    if (typeof callback !== 'function') {
        throw new Error('caldav_callback_missing');
    }
    return callback(client);
};

const normalizeDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeEventRecord = (record = {}, {
    calendar_url = null,
    calendar_id = null
} = {}) => {
    const eventId = normalizeText(record.id || record.uid || record.href || '');
    if (!eventId) {
        throw new Error('icloud_calendar_event_id_missing');
    }
    return {
        id: eventId,
        calendarId: normalizeText(record.calendarId || record.calendar_id || calendar_id || calendar_url || '') || 'icloud_legacy',
        title: normalizeText(record.title || record.summary || ''),
        description: normalizeText(record.description || ''),
        location: normalizeText(record.location || ''),
        start: normalizeDate(record.start),
        end: normalizeDate(record.end || record.start),
        allDay: record.allDay === true,
        updatedAt: normalizeDate(record.updatedAt || record.updated_at || record.start)?.toISOString?.() || null,
        recurrence: record.recurrence && typeof record.recurrence === 'object' ? { ...record.recurrence } : null,
        href: normalizeText(record.href || '') || null,
        etag: normalizeText(record.etag || '') || null,
        raw: record
    };
};

const buildDefaultRange = (config = {}, now = () => new Date()) => {
    const reference = normalizeDate(now()) || new Date();
    const start = new Date(reference.getTime());
    start.setUTCDate(start.getUTCDate() - Number(config?.caldav?.lookback_days || 60));
    const end = new Date(reference.getTime());
    end.setUTCDate(end.getUTCDate() + Number(config?.caldav?.lookahead_days || 365));
    return { start, end };
};

export const createIcloudLegacyCalendarConnector = ({
    provider = 'icloud_caldav_legacy',
    source_id = CALENDAR_V1_ARCHITECTURE_DECISION.legacy_read_sources[0]?.id || 'icloud_legacy',
    auth = {},
    caldav = {},
    calendar_url = null,
    calendar_id = null,
    caldavClientFactory = null,
    now = () => new Date()
} = {}) => {
    const config = normalizeIcloudLegacyCalendarConnectorConfig({
        provider,
        source_id,
        auth,
        caldav,
        calendar_url,
        calendar_id
    });
    const syncState = createCalendarSyncState({
        provider: config.provider,
        now: () => {
            const value = now();
            return value instanceof Date ? value.getTime() : Number(value);
        }
    });
    const eventsById = new Map();
    const eventIdByHref = new Map();
    let hydrated = false;

    const contract = createCalendarConnectorContract({
        provider: config.provider,
        protocol: 'caldav',
        role: 'legacy',
        read_capabilities: ['calendar_today', 'calendar_next', 'calendar_search', 'calendar_sources'],
        write_capabilities: []
    });

    const resolveClientFactory = async () => {
        if (typeof caldavClientFactory === 'function') return caldavClientFactory;
        const mod = await getNodeProtocolFactories();
        if (mod?.createNodeCaldavClient) {
            return (clientConfig) => mod.createNodeCaldavClient(clientConfig);
        }
        return null;
    };

    const applyRemoteBatch = (items = [], {
        removed_hrefs = [],
        removed_ids = []
    } = {}) => {
        const normalizedItems = (Array.isArray(items) ? items : []).map((entry) => normalizeEventRecord(entry, {
            calendar_url: config.caldav.calendar_url,
            calendar_id: config.calendar_id
        }));
        normalizedItems.forEach((entry) => {
            eventsById.set(entry.id, entry);
            if (entry.href) {
                eventIdByHref.set(entry.href, entry.id);
            }
        });

        const removedIds = [];
        (Array.isArray(removed_ids) ? removed_ids : []).forEach((entry) => {
            const eventId = normalizeText(entry || '');
            if (!eventId) return;
            if (eventsById.has(eventId)) {
                const previous = eventsById.get(eventId);
                if (previous?.href) eventIdByHref.delete(previous.href);
                eventsById.delete(eventId);
            }
            removedIds.push(eventId);
        });

        (Array.isArray(removed_hrefs) ? removed_hrefs : []).forEach((href) => {
            const normalizedHref = normalizeText(href || '');
            if (!normalizedHref) return;
            const eventId = eventIdByHref.get(normalizedHref);
            if (!eventId) return;
            const previous = eventsById.get(eventId);
            if (previous?.href) eventIdByHref.delete(previous.href);
            eventsById.delete(eventId);
            removedIds.push(eventId);
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
                'icloud_calendar_client_factory_missing',
                'A CalDAV client factory is required for iCloud legacy calendar access',
                { provider: config.provider, source_id: config.source_id }
            );
        }

        const range = buildDefaultRange(config, now);
        try {
            return await withProtocolClient({
                factory,
                config: {
                    auth: config.auth,
                    caldav: {
                        ...config.caldav,
                        calendar_url: options.calendar_url || config.caldav.calendar_url
                    }
                }
            }, async (client) => {
                const methodName = mode === 'initial' ? 'fetchInitialCalendar' : 'fetchDelta';
                if (typeof client?.[methodName] !== 'function') {
                    throw new Error(`missing_client_method:${methodName}`);
                }
                const previousCursor = syncState.status().cursor;
                const response = await client[methodName]({
                    calendar_url: options.calendar_url || config.caldav.calendar_url,
                    cursor: options.cursor !== undefined ? options.cursor : previousCursor,
                    start: options.start || range.start,
                    end: options.end || range.end
                });
                if (!response || response.ok !== true) {
                    return response || createFactoryError('icloud_calendar_sync_failed', 'The CalDAV sync returned an invalid response', {
                        provider: config.provider,
                        source_id: config.source_id
                    });
                }
                const applied = applyRemoteBatch(response.items, {
                    removed_hrefs: response.removed_hrefs,
                    removed_ids: response.removed_ids
                });
                const sync = syncState.applyBatch(applied.items, {
                    cursor: response.cursor ?? previousCursor ?? null,
                    removed_ids: applied.removed_ids,
                    source: {
                        provider: config.provider,
                        source_id: config.source_id,
                        calendar_url: response.calendar_url || config.caldav.calendar_url || null,
                        mode
                    }
                });
                hydrated = true;
                return {
                    ok: true,
                    provider: config.provider,
                    source_id: config.source_id,
                    calendar_url: response.calendar_url || config.caldav.calendar_url || null,
                    cursor: response.cursor ?? previousCursor ?? null,
                    sync,
                    items: Array.from(eventsById.values()).map((entry) => ({ ...entry })),
                    changes: applied.items,
                    removed_ids: applied.removed_ids
                };
            });
        } catch (error) {
            return createFactoryError(
                mode === 'initial' ? 'icloud_calendar_initial_failed' : 'icloud_calendar_delta_failed',
                error?.message || String(error),
                { provider: config.provider, source_id: config.source_id }
            );
        }
    };

    return {
        provider: config.provider,
        source_id: config.source_id,
        role: 'legacy',
        writable: false,
        contract,
        async listEvents(options = {}) {
            if (!hydrated && options.autosync !== false) {
                const result = await runClientSync('initial', options);
                if (result.ok !== true) return result;
            }
            return {
                ok: true,
                source_id: config.source_id,
                items: Array.from(eventsById.values()).map((entry) => ({ ...entry }))
            };
        },
        async getEvent(eventId) {
            const key = normalizeText(eventId || '');
            const event = eventsById.get(key);
            if (!event) {
                return {
                    ok: false,
                    error: 'calendar_event_not_found',
                    source_id: config.source_id,
                    event_id: key || null
                };
            }
            return {
                ok: true,
                source_id: config.source_id,
                event: { ...event }
            };
        },
        async fetchInitialCalendar(options = {}) {
            return runClientSync('initial', options);
        },
        async fetchDelta(options = {}) {
            return runClientSync('delta', options);
        },
        syncStatus() {
            return {
                ok: true,
                provider: config.provider,
                source_id: config.source_id,
                configured: !!config.caldav.calendar_url,
                sync: syncState.status()
            };
        }
    };
};
