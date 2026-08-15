import {
    CONDITION_LIST_MODES,
    CONDITION_LIST_SCHEMA_VERSION,
    normalizeConditionList
} from './contract.js';

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const propsOf = (record = {}) => record.properties || record.props || {};
const typeOf = (record = {}) => record.type || record.atome_type || propsOf(record).type || null;

const toProps = (entry) => ({
    name: entry.name,
    schema_version: entry.schemaVersion,
    mode: entry.mode,
    scope: entry.scope,
    condition_set_id: entry.conditionSetId,
    member_ids: entry.memberIds,
    sort: entry.sort,
    projection: entry.projection,
    revision: entry.revision,
    created_by: entry.createdBy,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt
});

const fromState = (state, fallbackId = null) => {
    if (!state || typeOf(state) !== 'condition_list') return null;
    const props = propsOf(state);
    return normalizeConditionList({
        id: state.id || state.atome_id || fallbackId,
        name: props.name,
        mode: props.mode,
        scope: props.scope,
        conditionSetId: props.condition_set_id,
        memberIds: props.member_ids,
        sort: props.sort,
        projection: props.projection,
        revision: props.revision,
        createdBy: props.created_by,
        createdAt: props.created_at,
        updatedAt: props.updated_at
    });
};

export function createConditionListService({
    query, getSet, persist, remove, read, list, invalidateSet = null, subscribeChanges = null
} = {}) {
    if (!query || typeof getSet !== 'function') throw new Error('condition_list_dependencies_required');
    const cache = new Map();
    let hydrated = false;

    const get = async (id) => {
        const key = String(id || '').trim();
        if (!key) return null;
        if (cache.has(key)) return clone(cache.get(key));
        if (typeof read !== 'function') return null;
        const entry = fromState(await read(key), key);
        if (entry) cache.set(entry.id, entry);
        return clone(entry);
    };
    const hydrate = async () => {
        if (hydrated || typeof list !== 'function') return;
        const rows = await list({ type: 'condition_list', includeTotal: false });
        for (const row of Array.isArray(rows) ? rows : []) {
            const entry = fromState(row);
            if (entry) cache.set(entry.id, entry);
        }
        hydrated = true;
    };
    const create = async (input = {}, options = {}) => {
        const current = input.id ? await get(input.id) : null;
        let memberIds = input.memberIds || input.member_ids;
        if (String(input.mode).toLowerCase() === CONDITION_LIST_MODES.STATIC && !Array.isArray(memberIds)) {
            const snapshot = await query.once(input.query || options.query || {});
            memberIds = snapshot.ids;
        }
        const entry = normalizeConditionList({
            ...current,
            ...input,
            memberIds,
            schemaVersion: CONDITION_LIST_SCHEMA_VERSION,
            revision: current ? current.revision + 1 : (input.revision || 1),
            createdAt: current?.createdAt || input.createdAt,
            updatedAt: new Date().toISOString()
        });
        if (entry.mode === CONDITION_LIST_MODES.DYNAMIC && !await getSet(entry.conditionSetId)) {
            throw new Error('condition_set_not_found');
        }
        await persist('condition_list', entry.id, toProps(entry), options);
        cache.set(entry.id, entry);
        return clone(entry);
    };
    const staticItems = async (entry, request = {}) => {
        const supplied = new Map((request.items || []).map((item) => [String(item.id || item.atome_id), item]));
        const items = [];
        for (const id of entry.memberIds) {
            let item = supplied.get(id) || null;
            if (!item && typeof read === 'function') item = await read(id);
            items.push(item || { id, unavailable: true });
        }
        return items;
    };
    const resolve = async (id, request = {}) => {
        const entry = await get(id);
        if (!entry) throw new Error('condition_list_not_found');
        if (entry.mode === CONDITION_LIST_MODES.STATIC) {
            const items = await staticItems(entry, request);
            return { items, ids: entry.memberIds.slice(), total: entry.memberIds.length, revision: entry.revision, mode: entry.mode };
        }
        const conditionSet = await getSet(entry.conditionSetId);
        if (!conditionSet) throw new Error('condition_set_not_found');
        return { ...(await query.once({ ...request, conditionSet, scope: entry.scope, sort: entry.sort })), mode: entry.mode };
    };
    const watch = async (id, request = {}, callback) => {
        const entry = await get(id);
        if (!entry) throw new Error('condition_list_not_found');
        if (entry.mode === CONDITION_LIST_MODES.STATIC) {
            const snapshot = await resolve(id, request);
            callback({ type: 'snapshot', ...snapshot });
            let active = true;
            return Object.freeze({ id: `condition_list_static_${entry.id}`, unsubscribe: () => {
                if (!active) return false;
                active = false;
                return true;
            } });
        }
        let active = true;
        let current = null;
        const start = async () => {
            current?.unsubscribe?.();
            const conditionSet = await getSet(entry.conditionSetId);
            if (!conditionSet) throw new Error('condition_set_not_found');
            current = await query.watch({ ...request, conditionSet, scope: entry.scope, sort: entry.sort }, callback);
        };
        await start();
        const releaseChanges = typeof subscribeChanges === 'function'
            ? subscribeChanges([], (event = {}) => {
                const changedId = String(event.atome_id || event.atomeId || event.event?.atome_id || '');
                if (!active || changedId !== entry.conditionSetId) return;
                invalidateSet?.(entry.conditionSetId);
                void start();
            }, entry.scope)
            : null;
        return Object.freeze({
            id: `condition_list_dynamic_${entry.id}`,
            unsubscribe: () => {
                if (!active) return false;
                active = false;
                current?.unsubscribe?.();
                releaseChanges?.();
                return true;
            }
        });
    };

    return Object.freeze({
        get,
        create,
        resolve,
        watch,
        async list() {
            await hydrate();
            return Array.from(cache.values()).map(clone);
        },
        async freeze(id, input = {}, options = {}) {
            const snapshot = await resolve(id, input.query || {});
            return create({
                ...input,
                id: input.id,
                name: input.name,
                mode: CONDITION_LIST_MODES.STATIC,
                scope: (await get(id)).scope,
                memberIds: snapshot.ids
            }, options);
        },
        async remove(id, options = {}) {
            const entry = await get(id);
            if (!entry) return false;
            await remove(entry.id, options);
            return cache.delete(entry.id);
        },
        hydrate
    });
}
