import {
    CONDITION_COMPUTED_PROPERTY_SCHEMA_VERSION,
    normalizeComputedProperty
} from './contract.js';
import {
    collectComputedDependencies,
    evaluateComputedExpression,
    validateComputedExpression
} from './computed_expression.js';

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

const propertiesOf = (record = {}) => record.properties || record.props || {};
const typeOf = (record = {}) => record.type || record.atome_type || propertiesOf(record).type || null;

const toProps = (definition) => ({
    name: definition.name,
    schema_version: definition.schemaVersion,
    result_type: definition.resultType,
    unit: definition.unit,
    expression: definition.expression,
    scope: definition.scope,
    revision: definition.revision,
    created_by: definition.createdBy,
    created_at: definition.createdAt,
    updated_at: definition.updatedAt
});

const fromState = (state, fallbackId = null) => {
    if (!state || typeOf(state) !== 'condition_computed_property') return null;
    const props = propertiesOf(state);
    return normalizeComputedProperty({
        id: state.id || state.atome_id || fallbackId,
        name: props.name,
        resultType: props.result_type,
        unit: props.unit,
        expression: props.expression,
        scope: props.scope,
        revision: props.revision,
        createdBy: props.created_by,
        createdAt: props.created_at,
        updatedAt: props.updated_at
    });
};

export function createComputedPropertyService({ registry, persist, remove, read, list } = {}) {
    if (!registry) throw new Error('condition_registry_required');
    const cache = new Map();
    let hydrated = false;

    const register = (definition) => {
        const dependencies = Array.from(collectComputedDependencies(definition.expression));
        registry.registerProperty({
            source: 'computed',
            field: definition.id,
            type: definition.resultType,
            unit: definition.unit,
            label: definition.name,
            group: 'computed',
            dependencies,
            resolve: async (context = {}) => {
                const stack = Array.isArray(context.__conditionComputedStack)
                    ? context.__conditionComputedStack
                    : [];
                if (stack.includes(definition.id)) {
                    return { available: false, reasonCode: 'condition_computed_cycle' };
                }
                return evaluateComputedExpression(definition.expression, {
                    ...context,
                    __conditionComputedStack: [...stack, definition.id]
                }, registry);
            }
        });
        cache.set(definition.id, definition);
        return definition;
    };

    const get = async (id) => {
        const key = String(id || '').trim();
        if (!key) return null;
        if (cache.has(key)) return clone(cache.get(key));
        if (typeof read !== 'function') return null;
        const definition = fromState(await read(key), key);
        return definition ? clone(register(definition)) : null;
    };

    const hydrate = async () => {
        if (hydrated || typeof list !== 'function') return;
        const rows = await list({ type: 'condition_computed_property', includeTotal: false });
        for (const row of Array.isArray(rows) ? rows : []) {
            const definition = fromState(row);
            if (definition) register(definition);
        }
        hydrated = true;
    };

    const save = async (input, options = {}) => {
        const current = input.id ? await get(input.id) : null;
        const definition = normalizeComputedProperty({
            ...current,
            ...input,
            schemaVersion: CONDITION_COMPUTED_PROPERTY_SCHEMA_VERSION,
            revision: current ? current.revision + 1 : (input.revision || 1),
            createdAt: current?.createdAt || input.createdAt,
            updatedAt: new Date().toISOString()
        });
        const errors = validateComputedExpression(definition.expression);
        if (errors.length) {
            const error = new Error('condition_computed_property_invalid');
            error.details = errors;
            throw error;
        }
        await persist('condition_computed_property', definition.id, toProps(definition), options);
        register(definition);
        return clone(definition);
    };

    return Object.freeze({
        get,
        save,
        async list() {
            await hydrate();
            return Array.from(cache.values()).map(clone);
        },
        async remove(id, options = {}) {
            const definition = await get(id);
            if (!definition) return false;
            await remove(definition.id, options);
            return cache.delete(definition.id);
        },
        hydrate
    });
}
