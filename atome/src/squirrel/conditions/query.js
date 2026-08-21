import { normalizeConditionScope } from './contract.js';
import { cloneJson as clone } from '../shared/scalars.js';

const normalizeId = (value) => String(value == null ? '' : value).trim();
const candidateId = (candidate = {}) => normalizeId(candidate.id || candidate.atome_id || candidate.atomeId);

const projectItem = (item, projection = []) => {
    const fields = Array.isArray(projection) ? projection.map(String).filter(Boolean) : [];
    if (!fields.length) return clone(item);
    const properties = item?.properties || item?.props || item || {};
    return {
        id: candidateId(item),
        type: item?.type || item?.atome_type || properties.type || null,
        properties: Object.fromEntries(fields
            .filter((field) => Object.prototype.hasOwnProperty.call(properties, field))
            .map((field) => [field, clone(properties[field])]))
    };
};

const temporalDeadlines = (node, output = []) => {
    if (Array.isArray(node?.children)) {
        node.children.forEach((child) => temporalDeadlines(child, output));
        return output;
    }
    if (node?.source !== 'time' || node?.field !== 'now') return output;
    const values = Array.isArray(node.value) ? node.value : [node.value];
    values.forEach((value) => {
        const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
        if (Number.isFinite(timestamp)) output.push(timestamp);
    });
    return output;
};

const eventId = (event = {}) => normalizeId(
    event.subjectId || event.candidateId || event.atomeId || event.atome_id
    || event.event?.atome_id || event.state?.id || event.state?.atome_id
);

const eventDependencies = (event, source) => {
    if (Array.isArray(event?.dependencies)) return event.dependencies.map(String);
    const props = event?.event?.payload?.props || event?.event?.props || event?.props || null;
    return props && typeof props === 'object'
        ? Object.keys(props).map((field) => `${source}.${field}`)
        : [];
};

const dependenciesOf = (registry, node, context, result = new Set()) => {
    if (Array.isArray(node?.children)) {
        node.children.forEach((child) => dependenciesOf(registry, child, context, result));
        return result;
    }
    if (!node?.source || !node?.field) return result;
    const property = registry.property(node.source, node.field, context, node);
    (property?.dependencies || [`${node.source}.${node.field}`]).forEach((entry) => result.add(String(entry)));
    return result;
};

const applySort = (items, sort = {}) => {
    const field = String(sort.field || sort.key || '').trim();
    if (!field) return items;
    const direction = sort.direction === 'desc' ? -1 : 1;
    const read = (item) => field.split('.').reduce((value, key) => value?.[key], item);
    return [...items].sort((left, right) => {
        const a = read(left);
        const b = read(right);
        if (Object.is(a, b)) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        return (typeof a === 'string' ? a.localeCompare(String(b)) : (a < b ? -1 : 1)) * direction;
    });
};

export function createConditionQueryService({
    registry,
    engine,
    loadCandidates = null,
    subscribeDependencies = null,
    prepare = null,
    executeOnce = null
} = {}) {
    if (!registry || !engine) throw new Error('condition_query_engine_required');
    let nextWatchId = 1;
    const watches = new Map();

    const candidatesFor = async (request, scope) => {
        if (Array.isArray(request.items)) return request.items;
        const loader = request.loadCandidates || loadCandidates;
        if (typeof loader !== 'function') throw new Error('condition_query_candidates_unavailable');
        const result = await loader(scope, request);
        return Array.isArray(result) ? result : [];
    };
    const contextFor = async (request, item, scope) => {
        const id = candidateId(item);
        const base = {
            candidate: item,
            item,
            subjectId: id,
            [scope.candidateSource]: item
        };
        if (typeof request.contextForItem !== 'function') return { ...base, ...(request.context || {}) };
        return { ...base, ...(await request.contextForItem(item, scope)), ...(request.context || {}) };
    };
    const evaluateItem = async (request, condition, scope, item) => {
        const context = await contextFor(request, item, scope);
        const match = await engine.match(condition, context, {
            domain: request.domain || 'search',
            unknownPolicy: request.unknownPolicy
        });
        return {
            id: candidateId(item),
            item,
            matched: match.matched,
            match,
            dependencies: Array.from(dependenciesOf(registry, condition?.root || condition, context))
        };
    };

    const once = async (request = {}) => {
        const condition = request.conditionSet || request.condition || request.root;
        if (!condition) throw new Error('condition_query_condition_required');
        if (!Array.isArray(request.items) && request.authority !== 'local' && typeof executeOnce === 'function') {
            const remote = await executeOnce(request);
            if (remote) return Object.freeze(remote);
        }
        const scope = normalizeConditionScope(request.scope || {});
        const candidates = await candidatesFor(request, scope);
        await prepare?.(request, scope, candidates);
        const entries = await Promise.all(candidates.map((item) => evaluateItem(request, condition, scope, item)));
        const matched = applySort(entries.filter((entry) => entry.matched).map((entry) => entry.item), request.sort);
        const offset = Math.max(0, Number.parseInt(request.cursor, 10) || 0);
        const limit = Math.max(1, Number.parseInt(request.limit, 10) || matched.length || 1);
        const items = matched.slice(offset, offset + limit);
        return Object.freeze({
            items: Object.freeze(items.map((item) => projectItem(item, request.projection))),
            ids: Object.freeze(items.map(candidateId)),
            total: matched.length,
            cursor: offset + items.length < matched.length ? String(offset + items.length) : null,
            revision: 1
        });
    };

    const watch = async (request = {}, callback) => {
        if (typeof callback !== 'function') throw new Error('condition_query_watch_callback_required');
        const condition = request.conditionSet || request.condition || request.root;
        if (!condition) throw new Error('condition_query_condition_required');
        const scope = normalizeConditionScope(request.scope || {});
        const entries = new Map();
        const candidates = await candidatesFor(request, scope);
        await prepare?.(request, scope, candidates);
        for (const item of candidates) {
            const entry = await evaluateItem(request, condition, scope, item);
            if (entry.id) entries.set(entry.id, entry);
        }
        const id = `condition_query_watch_${nextWatchId++}`;
        let revision = 1;
        let releaseSubscriptions = () => {};
        let temporalTimer = null;
        let subscriptionSignature = '';
        let active = true;
        const queuedEvents = [];
        let flushQueued = false;

        const matchingItems = () => applySort(
            Array.from(entries.values()).filter((entry) => entry.matched).map((entry) => entry.item),
            request.sort
        );
        const dependencies = () => Array.from(new Set(
            Array.from(entries.values()).flatMap((entry) => entry.dependencies)
        )).sort();
        const subscribe = () => {
            const nextDependencies = dependencies();
            const signature = nextDependencies.join('\n');
            if (signature === subscriptionSignature) return;
            releaseSubscriptions();
            subscriptionSignature = signature;
            const releases = [];
            const external = request.subscribeDependencies || subscribeDependencies;
            if (typeof external === 'function') {
                const release = external(nextDependencies, queueEvent, scope);
                if (typeof release === 'function') releases.push(release);
            }
            registry.sources().forEach((source) => {
                if (!source.subscribe) return;
                const release = source.subscribe(nextDependencies, queueEvent, scope);
                if (typeof release === 'function') releases.push(release);
            });
            releaseSubscriptions = () => releases.splice(0).forEach((release) => release());
        };
        const reevaluate = async (candidate, changedDependencies, delta) => {
            const previous = entries.get(candidateId(candidate));
            const next = await evaluateItem(request, condition, scope, candidate);
            if (!next.id) return;
            entries.set(next.id, next);
            if (!previous?.matched && next.matched) delta.addedIds.push(next.id);
            else if (previous?.matched && !next.matched) delta.removedIds.push(next.id);
            else if (next.matched && changedDependencies.length) delta.updatedIds.push(next.id);
        };
        async function flush() {
            flushQueued = false;
            const events = queuedEvents.splice(0);
            const delta = { addedIds: [], removedIds: [], updatedIds: [] };
            for (const event of events) {
                const changedId = eventId(event);
                const changedDependencies = eventDependencies(event, scope.candidateSource);
                if (event.deleted === true || event.event?.kind === 'delete') {
                    const previous = entries.get(changedId);
                    if (previous?.matched) delta.removedIds.push(changedId);
                    entries.delete(changedId);
                    continue;
                }
                let candidate = event.candidate || event.item || event.state || entries.get(changedId)?.item || null;
                if (!candidate && changedId && typeof request.loadCandidate === 'function') {
                    candidate = await request.loadCandidate(changedId, scope);
                }
                if (candidate && changedId) {
                    const previous = entries.get(changedId);
                    if (!previous || !changedDependencies.length
                        || previous.dependencies.some((entry) => changedDependencies.includes(entry))) {
                        await reevaluate(candidate, changedDependencies, delta);
                    }
                    continue;
                }
                const affected = Array.from(entries.values()).filter((entry) => (
                    !changedDependencies.length || entry.dependencies.some((dependency) => changedDependencies.includes(dependency))
                ));
                for (const entry of affected) await reevaluate(entry.item, changedDependencies, delta);
            }
            const normalized = Object.fromEntries(Object.entries(delta).map(([key, values]) => [key, Array.from(new Set(values))]));
            if (Object.values(normalized).some((values) => values.length)) {
                revision += 1;
                callback(Object.freeze({ type: 'delta', ...normalized, revision, total: matchingItems().length }));
            }
            subscribe();
        }
        function queueEvent(event = {}) {
            if (!active) return;
            queuedEvents.push(event);
            if (!flushQueued) {
                flushQueued = true;
                queueMicrotask(() => { if (active) void flush(); });
            }
        }
        const scheduleTemporalDeadline = () => {
            if (temporalTimer !== null) clearTimeout(temporalTimer);
            temporalTimer = null;
            const now = Date.now();
            const next = temporalDeadlines(condition?.root || condition)
                .filter((timestamp) => timestamp >= now)
                .sort((left, right) => left - right)[0];
            if (!Number.isFinite(next)) return;
            temporalTimer = setTimeout(() => {
                temporalTimer = null;
                queueEvent({ dependencies: ['time.now'], reason: 'temporal_deadline' });
                scheduleTemporalDeadline();
            }, Math.max(0, next - now + 1));
        };
        const initial = matchingItems();
        callback(Object.freeze({
            type: 'snapshot',
            items: Object.freeze(initial.map(clone)),
            ids: Object.freeze(initial.map(candidateId)),
            total: initial.length,
            revision
        }));
        subscribe();
        scheduleTemporalDeadline();
        const unsubscribe = () => {
            if (!active) return false;
            active = false;
            releaseSubscriptions();
            if (temporalTimer !== null) clearTimeout(temporalTimer);
            temporalTimer = null;
            queuedEvents.length = 0;
            watches.delete(id);
            return true;
        };
        watches.set(id, unsubscribe);
        return Object.freeze({ id, unsubscribe });
    };

    return Object.freeze({ once, watch, unwatch(id) { return watches.get(id)?.() || false; } });
}
