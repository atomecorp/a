import {
    createConditionRegistry,
    createConditionService,
    registerCanonicalConditionSources,
    resolveCandidatePath
} from '../atome/src/squirrel/conditions/index.js';

const idOf = (state = {}) => String(state.id || state.atome_id || state.atomeId || '').trim();
const typeOf = (state = {}) => state.type || state.atome_type || state.properties?.type || null;

const projectedItem = (state, projection = []) => {
    const fields = Array.isArray(projection) ? projection.map(String).filter(Boolean) : [];
    const properties = {};
    for (const field of fields) {
        const resolved = resolveCandidatePath(state, field);
        if (resolved.available) properties[field] = resolved.value;
    }
    return {
        id: idOf(state),
        atome_id: idOf(state),
        type: typeOf(state),
        ...(fields.length ? { properties } : {})
    };
};

export function createServerConditionAuthority({ loadStates, readState } = {}) {
    if (typeof loadStates !== 'function') throw new Error('condition_server_state_loader_required');
    const registry = createConditionRegistry();
    registerCanonicalConditionSources(registry);
    const service = createConditionService({
        registry,
        loadCandidates: (scope, request) => loadStates(scope, request),
        list: (options) => loadStates({ candidateSource: 'atome' }, options),
        read: readState
    });
    const canDiscover = (candidate, field) => Boolean(candidate && resolveCandidatePath(candidate, field).available);

    return Object.freeze({
        async discover(request = {}) {
            const scope = request.scope || {};
            const candidates = await loadStates(scope, request);
            return service.properties.discover({
                ...request,
                candidates,
                scope,
                canReadProperty: canDiscover
            });
        },
        async once(request = {}) {
            let conditionSet = request.conditionSet || request.condition || request.root || null;
            const conditionSetId = request.conditionSetId || request.condition_set_id || null;
            if (!conditionSet && conditionSetId) conditionSet = await service.sets.get(String(conditionSetId));
            if (!conditionSet) throw new Error('condition_query_condition_required');
            const result = await service.query.once({
                ...request,
                conditionSet,
                canReadProperty: canDiscover
            });
            return {
                ...result,
                items: result.items.map((item) => projectedItem(item, request.projection))
            };
        }
    });
}

