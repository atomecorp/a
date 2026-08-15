const normalizeKey = (value) => String(value || '').trim().toLowerCase();
const propertyKey = (source, field) => `${normalizeKey(source)}.${String(field || '').trim()}`;

const sameValue = (left, right) => {
    if (Object.is(left, right)) return true;
    if (left && right && typeof left === 'object' && typeof right === 'object') {
        try {
            return JSON.stringify(left) === JSON.stringify(right);
        } catch {
            return false;
        }
    }
    return false;
};

const comparable = (value, type) => {
    if (type === 'number') {
        const result = Number(value);
        return Number.isFinite(result) ? result : null;
    }
    if (type === 'date' || type === 'datetime' || type === 'time') {
        const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
        return Number.isFinite(result) ? result : null;
    }
    if (type === 'boolean') {
        if (value === true || value === false) return value;
        const normalized = String(value || '').trim().toLowerCase();
        if (['true', '1', 'yes', 'oui'].includes(normalized)) return true;
        if (['false', '0', 'no', 'non'].includes(normalized)) return false;
        return null;
    }
    return value == null ? null : String(value);
};

const sameTypedValue = (actual, expected, type) => {
    if (!['number', 'date', 'datetime', 'time', 'boolean', 'string'].includes(type)) {
        return sameValue(actual, expected);
    }
    const left = comparable(actual, type);
    const right = comparable(expected, type);
    return left !== null && right !== null && Object.is(left, right);
};

const ordered = (actual, expected, type, compare) => {
    const left = comparable(actual, type);
    const right = comparable(expected, type);
    if (left === null || right === null) return null;
    return compare(left, right);
};

const arrayContains = (actual, expected) => Array.isArray(actual)
    && actual.some((entry) => sameValue(entry, expected));

const locationContains = (actual, expected) => {
    if (typeof actual === 'boolean') return actual;
    if (Array.isArray(actual)) return actual.some((entry) => sameValue(entry, expected));
    if (actual && typeof actual === 'object') {
        if (Array.isArray(actual.zones)) return actual.zones.some((entry) => sameValue(entry, expected));
        if (Object.prototype.hasOwnProperty.call(actual, 'inside')) return actual.inside === true;
    }
    return null;
};

const defaultOperators = [
    { id: 'eq', types: ['any'], evaluate: ({ actual, expected, type }) => sameTypedValue(actual, expected, type) },
    { id: 'neq', types: ['any'], evaluate: ({ actual, expected, type }) => !sameTypedValue(actual, expected, type) },
    { id: 'gt', types: ['number', 'date', 'datetime', 'time'], evaluate: ({ actual, expected, type }) => ordered(actual, expected, type, (left, right) => left > right) },
    { id: 'gte', types: ['number', 'date', 'datetime', 'time'], evaluate: ({ actual, expected, type }) => ordered(actual, expected, type, (left, right) => left >= right) },
    { id: 'lt', types: ['number', 'date', 'datetime', 'time'], evaluate: ({ actual, expected, type }) => ordered(actual, expected, type, (left, right) => left < right) },
    { id: 'lte', types: ['number', 'date', 'datetime', 'time'], evaluate: ({ actual, expected, type }) => ordered(actual, expected, type, (left, right) => left <= right) },
    { id: 'between', types: ['number', 'date', 'datetime', 'time'], evaluate: ({ actual, expected, type }) => {
        if (!Array.isArray(expected) || expected.length !== 2) return null;
        const lower = ordered(actual, expected[0], type, (left, right) => left >= right);
        const upper = ordered(actual, expected[1], type, (left, right) => left <= right);
        return lower === null || upper === null ? null : lower && upper;
    } },
    { id: 'in', types: ['any'], evaluate: ({ actual, expected }) => Array.isArray(expected) && expected.some((entry) => sameValue(actual, entry)) },
    { id: 'not_in', types: ['any'], evaluate: ({ actual, expected }) => Array.isArray(expected) && !expected.some((entry) => sameValue(actual, entry)) },
    { id: 'contains', types: ['string', 'array'], evaluate: ({ actual, expected }) => typeof actual === 'string' ? actual.includes(String(expected)) : Array.isArray(actual) && actual.some((entry) => sameValue(entry, expected)) },
    { id: 'not_contains', types: ['string', 'array'], evaluate: ({ actual, expected }) => typeof actual === 'string' ? !actual.includes(String(expected)) : Array.isArray(actual) && !arrayContains(actual, expected) },
    { id: 'contains_any', types: ['array'], evaluate: ({ actual, expected }) => Array.isArray(expected) && expected.some((entry) => arrayContains(actual, entry)) },
    { id: 'contains_all', types: ['array'], evaluate: ({ actual, expected }) => Array.isArray(expected) && expected.every((entry) => arrayContains(actual, entry)) },
    { id: 'starts_with', types: ['string'], evaluate: ({ actual, expected }) => String(actual).startsWith(String(expected)) },
    { id: 'ends_with', types: ['string'], evaluate: ({ actual, expected }) => String(actual).endsWith(String(expected)) },
    { id: 'before', types: ['date', 'datetime', 'time'], evaluate: ({ actual, expected, type }) => ordered(actual, expected, type, (left, right) => left < right) },
    { id: 'after', types: ['date', 'datetime', 'time'], evaluate: ({ actual, expected, type }) => ordered(actual, expected, type, (left, right) => left > right) },
    { id: 'inside', types: ['location', 'array'], evaluate: ({ actual, expected }) => locationContains(actual, expected) },
    { id: 'outside', types: ['location', 'array'], evaluate: ({ actual, expected }) => {
        const inside = locationContains(actual, expected);
        return inside === null ? null : !inside;
    } },
    { id: 'distance_lt', types: ['location', 'number'], evaluate: ({ actual, expected }) => ordered(actual?.distance ?? actual, expected, 'number', (left, right) => left < right) },
    { id: 'distance_gt', types: ['location', 'number'], evaluate: ({ actual, expected }) => ordered(actual?.distance ?? actual, expected, 'number', (left, right) => left > right) },
    { id: 'exists', types: ['any'], evaluate: ({ actual }) => actual !== undefined && actual !== null },
    { id: 'not_exists', types: ['any'], evaluate: ({ actual }) => actual === undefined || actual === null }
];

export function createConditionRegistry() {
    const properties = new Map();
    const operators = new Map();
    const sources = new Map();

    const registerOperator = (definition = {}) => {
        const id = normalizeKey(definition.id);
        if (!id || typeof definition.evaluate !== 'function') throw new Error('condition_operator_invalid');
        operators.set(id, Object.freeze({
            id,
            types: Array.isArray(definition.types) && definition.types.length ? definition.types.map(normalizeKey) : ['any'],
            evaluate: definition.evaluate,
            label: String(definition.label || id)
        }));
        return operators.get(id);
    };

    defaultOperators.forEach(registerOperator);

    const normalizeProperty = (definition = {}) => {
        const source = normalizeKey(definition.source);
        const field = String(definition.field || '').trim();
        const type = normalizeKey(definition.type || 'any');
        if (!source || !field) throw new Error('condition_property_invalid');
        const allowed = Array.isArray(definition.operators) && definition.operators.length
            ? definition.operators.map(normalizeKey)
            : Array.from(operators.values())
                .filter((operator) => operator.types.includes('any') || operator.types.includes(type))
                .map((operator) => operator.id);
        for (const operator of allowed) {
            if (!operators.has(operator)) throw new Error(`condition_operator_unknown:${operator}`);
        }
        return Object.freeze({
            source,
            field,
            type,
            operators: Object.freeze(allowed),
            label: String(definition.label || field),
            editor: definition.editor ? String(definition.editor) : null,
            group: definition.group ? String(definition.group) : null,
            unit: definition.unit ? String(definition.unit) : null,
            resolve: typeof definition.resolve === 'function' ? definition.resolve : null,
            dependencies: Array.isArray(definition.dependencies)
                ? Object.freeze(definition.dependencies.map(String))
                : Object.freeze([`${source}.${field}`])
        });
    };

    const registerSource = (definition = {}) => {
        const source = normalizeKey(definition.source || definition.id);
        if (!source || typeof definition.resolve !== 'function') throw new Error('condition_source_invalid');
        const entry = Object.freeze({
            source,
            resolve: definition.resolve,
            describe: typeof definition.describe === 'function' ? definition.describe : null,
            discover: typeof definition.discover === 'function' ? definition.discover : null,
            subscribe: typeof definition.subscribe === 'function' ? definition.subscribe : null
        });
        sources.set(source, entry);
        return entry;
    };

    const registerProperty = (definition = {}) => {
        const provider = sources.get(normalizeKey(definition.source));
        const field = String(definition.field || '').trim();
        const entry = normalizeProperty({
            ...definition,
            resolve: definition.resolve || (provider
                ? ((runtimeContext, node) => provider.resolve(runtimeContext, field, node))
                : null)
        });
        properties.set(propertyKey(entry.source, entry.field), entry);
        return entry;
    };

    return Object.freeze({
        registerOperator,
        registerProperty,
        registerSource,
        property(source, field, context = null, condition = null) {
            const registered = properties.get(propertyKey(source, field));
            if (registered) return registered;
            const provider = sources.get(normalizeKey(source));
            if (!provider) return null;
            const described = provider.describe?.(String(field || ''), context, condition) || {
                source,
                field,
                type: condition?.valueType || 'any'
            };
            return normalizeProperty({
                ...described,
                source,
                field,
                resolve: (runtimeContext, node) => provider.resolve(runtimeContext, String(field || ''), node)
            });
        },
        operator(id) {
            return operators.get(normalizeKey(id)) || null;
        },
        properties(source = null) {
            const normalizedSource = source ? normalizeKey(source) : null;
            return Array.from(properties.values()).filter((entry) => !normalizedSource || entry.source === normalizedSource);
        },
        operators(type = null) {
            const normalizedType = type ? normalizeKey(type) : null;
            return Array.from(operators.values()).filter((entry) => !normalizedType || entry.types.includes('any') || entry.types.includes(normalizedType));
        },
        sources() {
            return Array.from(sources.values());
        },
        async discover(context = {}) {
            const discovered = [];
            for (const provider of sources.values()) {
                if (!provider.discover) continue;
                const entries = await provider.discover(context);
                for (const definition of Array.isArray(entries) ? entries : []) {
                    discovered.push(registerProperty({ ...definition, source: definition.source || provider.source }));
                }
            }
            return discovered;
        }
    });
}
