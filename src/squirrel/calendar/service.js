import { createCalendarApiSource } from './calendar_api_source.js';

const DEFAULT_LIMIT = 50;

const toDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const toIso = (value) => {
    const date = toDate(value);
    return date ? date.toISOString() : null;
};

const toText = (value) => String(value || '').trim();

const toLimit = (value, fallback = DEFAULT_LIMIT) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.round(number)) : fallback;
};

const buildEventKey = (event = {}) => {
    const id = toText(event.id);
    if (id) return `id:${id}`;
    const title = toText(event.title).toLowerCase();
    const start = toIso(event.start);
    const end = toIso(event.end);
    return `fallback:${title}|${start || ''}|${end || ''}`;
};

const rolePriority = (role) => {
    const normalized = toText(role).toLowerCase();
    if (normalized === 'primary') return 0;
    if (normalized === 'mirror') return 1;
    if (normalized === 'legacy') return 2;
    return 3;
};

const compareResolutionPriority = (left = {}, right = {}) => {
    const roleDelta = rolePriority(left.source_role) - rolePriority(right.source_role);
    if (roleDelta !== 0) return roleDelta;

    const writableDelta = Number(right.source_writable === true) - Number(left.source_writable === true);
    if (writableDelta !== 0) return writableDelta;

    const leftUpdated = toDate(left.updatedAt)?.getTime?.() || 0;
    const rightUpdated = toDate(right.updatedAt)?.getTime?.() || 0;
    if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

    const leftStart = toDate(left.start)?.getTime?.() || 0;
    const rightStart = toDate(right.start)?.getTime?.() || 0;
    return leftStart - rightStart;
};

const decorateEvent = (event = {}, source = {}) => ({
    ...event,
    id: toText(event.id),
    calendarId: toText(event.calendarId),
    title: toText(event.title),
    description: toText(event.description),
    location: toText(event.location),
    start: toDate(event.start),
    end: toDate(event.end),
    updatedAt: toIso(event.updatedAt || event.updated_at || event.start || null),
    source_id: toText(source.source_id || source.id),
    source_role: toText(source.role || source.contract?.role || 'legacy'),
    source_writable: source.writable === true,
    source_provider: toText(source.contract?.provider || source.source_id || source.id),
    source_protocol: toText(source.contract?.protocol || 'calendar_api')
});

const resolveConflicts = (events = []) => {
    const buckets = new Map();
    events.forEach((event) => {
        const key = buildEventKey(event);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(event);
    });

    const resolved = [];
    buckets.forEach((entries) => {
        const sorted = [...entries].sort(compareResolutionPriority);
        const winner = { ...sorted[0] };
        const alternates = sorted.slice(1).map((entry) => ({
            id: entry.id || null,
            title: entry.title || '',
            source_id: entry.source_id || null,
            source_role: entry.source_role || null,
            updatedAt: entry.updatedAt || null
        }));
        winner.conflicts = alternates;
        winner.conflict_count = alternates.length;
        winner.conflict_resolved_by = winner.source_role === 'primary'
            ? 'prefer_primary_then_latest_update'
            : 'latest_update';
        resolved.push(winner);
    });

    return resolved.sort((left, right) => {
        const leftStart = toDate(left.start)?.getTime?.() || Number.MAX_SAFE_INTEGER;
        const rightStart = toDate(right.start)?.getTime?.() || Number.MAX_SAFE_INTEGER;
        if (leftStart !== rightStart) return leftStart - rightStart;
        return compareResolutionPriority(left, right);
    });
};

const normalizeRange = (options = {}, now = () => new Date()) => {
    const start = toDate(options.start || options.from);
    const end = toDate(options.end || options.to);
    const reference = toDate(options.reference || now()) || new Date();
    return { start, end, reference };
};

const overlapsRange = (event = {}, start = null, end = null) => {
    const eventStart = toDate(event.start);
    const eventEnd = toDate(event.end || event.start);
    if (!eventStart && !eventEnd) return false;
    if (start && eventEnd && eventEnd < start) return false;
    if (end && eventStart && eventStart > end) return false;
    return true;
};

const matchesQuery = (event = {}, query = '') => {
    const needle = toText(query).toLowerCase();
    if (!needle) return true;
    return [
        event.title,
        event.description,
        event.location,
        event.id,
        event.calendarId
    ].some((value) => toText(value).toLowerCase().includes(needle));
};

const startOfDay = (date) => {
    const value = toDate(date) || new Date();
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
};

const endOfDay = (date) => {
    const value = toDate(date) || new Date();
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
};

const cloneSourceInfo = (source = {}) => ({
    source_id: toText(source.source_id),
    role: toText(source.role),
    writable: source.writable === true,
    provider: toText(source.contract?.provider || source.source_id),
    protocol: toText(source.contract?.protocol || 'calendar_api'),
    sync: typeof source.syncStatus === 'function' ? source.syncStatus() : null,
    read_capabilities: Array.isArray(source.contract?.read_capabilities) ? [...source.contract.read_capabilities] : [],
    write_capabilities: Array.isArray(source.contract?.write_capabilities) ? [...source.contract.write_capabilities] : []
});

export const createCalendarService = ({
    primarySource = createCalendarApiSource(),
    sources = [],
    now = () => new Date()
} = {}) => {
    const sourceRegistry = new Map();

    const registerSource = (source) => {
        if (!source || typeof source !== 'object') {
            throw new Error('calendar_source_invalid');
        }
        const sourceId = toText(source.source_id || source.id);
        if (!sourceId) {
            throw new Error('calendar_source_id_required');
        }
        const normalized = {
            ...source,
            source_id: sourceId,
            role: toText(source.role || source.contract?.role || 'legacy') || 'legacy',
            writable: source.writable === true,
            contract: source.contract || {}
        };
        sourceRegistry.set(sourceId, normalized);
        return cloneSourceInfo(normalized);
    };

    const unregisterSource = (sourceId) => sourceRegistry.delete(toText(sourceId));

    const listRegisteredSources = () => Array.from(sourceRegistry.values()).map((entry) => cloneSourceInfo(entry));

    const getSource = (sourceId) => sourceRegistry.get(toText(sourceId)) || null;

    const resolveTargetSources = (sourceId = null) => {
        if (sourceId) {
            const source = getSource(sourceId);
            if (!source) return [];
            return [source];
        }
        return Array.from(sourceRegistry.values());
    };

    const resolveWritableSource = (sourceId = null) => {
        if (sourceId) {
            const explicit = getSource(sourceId);
            if (!explicit) {
                return { ok: false, error: 'calendar_source_not_found', source_id: toText(sourceId) || null };
            }
            if (explicit.writable !== true) {
                return { ok: false, error: 'calendar_source_read_only', source_id: explicit.source_id };
            }
            return { ok: true, source: explicit };
        }

        const ranked = Array.from(sourceRegistry.values())
            .filter((entry) => entry.writable === true)
            .sort((left, right) => compareResolutionPriority(
                { source_role: left.role, source_writable: left.writable },
                { source_role: right.role, source_writable: right.writable }
            ));
        if (!ranked.length) {
            return { ok: false, error: 'calendar_writable_source_missing' };
        }
        return { ok: true, source: ranked[0] };
    };

    const collectSources = async (options = {}) => {
        const sourceEntries = resolveTargetSources(options?.source_id);
        const pulls = await Promise.all(sourceEntries.map(async (source) => {
            if (typeof source.listEvents !== 'function') {
                return {
                    ok: false,
                    source_id: source.source_id,
                    error: 'calendar_source_list_missing'
                };
            }
            try {
                const response = await source.listEvents(options);
                const items = Array.isArray(response?.items) ? response.items : [];
                return {
                    ok: response?.ok !== false,
                    source_id: source.source_id,
                    items: items.map((entry) => decorateEvent(entry, source))
                };
            } catch (error) {
                return {
                    ok: false,
                    source_id: source.source_id,
                    error: error?.message || String(error)
                };
            }
        }));

        const allItems = pulls.flatMap((entry) => Array.isArray(entry?.items) ? entry.items : []);
        const resolved = resolveConflicts(allItems);
        return {
            ok: true,
            items: resolved,
            sources: listRegisteredSources(),
            sync: pulls
        };
    };

    const listUnified = async (options = {}) => {
        const synced = await collectSources(options);
        if (synced.ok !== true) return synced;
        const range = normalizeRange(options, now);
        const filtered = synced.items
            .filter((entry) => !options?.source_id || entry.source_id === options.source_id)
            .filter((entry) => overlapsRange(entry, range.start, range.end))
            .filter((entry) => matchesQuery(entry, options.query || options.q || ''))
            .slice(0, toLimit(options.limit, DEFAULT_LIMIT));
        return {
            ok: true,
            items: filtered,
            sources: synced.sources,
            total: filtered.length
        };
    };

    const readEvent = async (eventId, options = {}) => {
        const listed = await listUnified({
            ...options,
            limit: 500
        });
        if (listed.ok !== true) return listed;
        const event = listed.items.find((entry) => entry.id === toText(eventId));
        if (!event) {
            return { ok: false, error: 'calendar_event_not_found', event_id: toText(eventId) || null };
        }
        return { ok: true, event };
    };

    const createEvent = async (input = {}, options = {}) => {
        const writable = resolveWritableSource(options?.source_id || input?.source_id);
        if (writable.ok !== true) return writable;
        const source = writable.source;
        if (typeof source.ensureCalendar === 'function') {
            await source.ensureCalendar(input.calendarId || input.calendar_id || 'default');
        }
        const response = await source.createEvent({
            ...input,
            source_id: undefined
        });
        if (response?.ok !== true || !response?.event) {
            return response || { ok: false, error: 'calendar_create_failed', source_id: source.source_id };
        }
        return {
            ok: true,
            source_id: source.source_id,
            event: decorateEvent(response.event, source)
        };
    };

    const updateEvent = async (eventId, changes = {}, options = {}) => {
        const explicitSourceId = options?.source_id || changes?.source_id || null;
        let source = null;
        if (explicitSourceId) {
            source = getSource(explicitSourceId);
            if (!source) {
                return { ok: false, error: 'calendar_source_not_found', source_id: toText(explicitSourceId) || null };
            }
        } else {
            const current = await readEvent(eventId, options);
            if (current.ok !== true) return current;
            source = getSource(current.event.source_id);
        }
        if (!source) {
            return { ok: false, error: 'calendar_source_not_found', event_id: toText(eventId) || null };
        }
        if (source.writable !== true) {
            return { ok: false, error: 'calendar_source_read_only', source_id: source.source_id };
        }
        const payload = { ...changes };
        delete payload.source_id;
        const response = await source.updateEvent(eventId, payload);
        if (response?.ok !== true || !response?.event) {
            return response || { ok: false, error: 'calendar_update_failed', source_id: source.source_id };
        }
        return {
            ok: true,
            source_id: source.source_id,
            event: decorateEvent(response.event, source)
        };
    };

    const runConnectorSync = async (mode = 'delta', options = {}) => {
        const sourceEntries = resolveTargetSources(options?.source_id);
        const results = await Promise.all(sourceEntries.map(async (source) => {
            const methodName = mode === 'initial' ? 'fetchInitialCalendar' : 'fetchDelta';
            if (typeof source?.[methodName] !== 'function') {
                return {
                    ok: true,
                    source_id: source.source_id,
                    skipped: true,
                    reason: 'calendar_source_sync_not_supported'
                };
            }
            try {
                return await source[methodName](options);
            } catch (error) {
                return {
                    ok: false,
                    source_id: source.source_id,
                    error: error?.message || String(error)
                };
            }
        }));
        const unified = await listUnified(options);
        return {
            ok: true,
            mode,
            items: unified.ok === true ? unified.items : [],
            total: unified.ok === true ? unified.total : 0,
            sources: listRegisteredSources(),
            sync: results
        };
    };

    registerSource(primarySource);
    sources.forEach((source) => registerSource(source));

    return {
        registerSource,
        unregisterSource,
        getSource,
        calendarSources() {
            return {
                ok: true,
                items: listRegisteredSources()
            };
        },
        async syncSources(options = {}) {
            return collectSources(options);
        },
        async syncInitial(options = {}) {
            return runConnectorSync('initial', options);
        },
        async syncIncremental(options = {}) {
            return runConnectorSync('delta', options);
        },
        async syncPull(options = {}) {
            return runConnectorSync(options?.initial === true ? 'initial' : 'delta', options);
        },
        syncStatus() {
            return {
                ok: true,
                sources: listRegisteredSources()
            };
        },
        async calendarSearch(query, options = {}) {
            return listUnified({
                ...options,
                query: toText(query)
            });
        },
        async calendarToday(options = {}) {
            const reference = toDate(options.reference || now()) || new Date();
            return listUnified({
                ...options,
                start: startOfDay(reference),
                end: endOfDay(reference)
            });
        },
        async calendarNext(options = {}) {
            const reference = toDate(options.reference || now()) || new Date();
            const listed = await listUnified({
                ...options,
                start: reference,
                limit: toLimit(options.limit, DEFAULT_LIMIT)
            });
            if (listed.ok !== true) return listed;
            return {
                ...listed,
                items: listed.items
                    .filter((entry) => (toDate(entry.start)?.getTime?.() || Number.MAX_SAFE_INTEGER) >= reference.getTime())
                    .slice(0, toLimit(options.limit, DEFAULT_LIMIT))
            };
        },
        async calendarRead(eventId, options = {}) {
            return readEvent(eventId, options);
        },
        async calendarCreate(input = {}, options = {}) {
            return createEvent(input, options);
        },
        async calendarUpdate(eventId, changes = {}, options = {}) {
            return updateEvent(eventId, changes, options);
        }
    };
};
