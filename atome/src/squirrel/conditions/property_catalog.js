import { listAtomeTypes } from '../../shared/atome_universal_contract.js';
import { listCoreAtomeTypeDefinitions } from '../../shared/core_atome_types.js';

const MAX_DISCOVERY_DEPTH = 3;
const GENERIC_SOURCES = Object.freeze([
    'atome', 'record', 'contact', 'profile', 'actor', 'operation', 'property',
    'runtime', 'session', 'calendar'
]);

const hasObjectShape = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const normalizeText = (value) => String(value == null ? '' : value).trim();
const normalizeFieldId = (value) => normalizeText(value).toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const inferType = (value) => {
    if (value instanceof Date) return 'datetime';
    if (Array.isArray(value)) return 'array';
    if (value === null || value === undefined) return 'any';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') {
        const text = value.trim();
        if (/^\d{4}-\d{2}-\d{2}(?:[T ][^ ]+)?$/.test(text) && Number.isFinite(Date.parse(text))) {
            return text.length > 10 ? 'datetime' : 'date';
        }
        return 'string';
    }
    return 'object';
};

const readPath = (object, path) => {
    let current = object;
    for (const part of normalizeText(path).split('.').filter(Boolean)) {
        if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
            return { available: false, value: undefined };
        }
        current = current[part];
    }
    return { available: true, value: current };
};

const candidateEnvelope = (candidate = {}) => {
    const properties = hasObjectShape(candidate.properties)
        ? candidate.properties
        : (hasObjectShape(candidate.props) ? candidate.props : candidate);
    return {
        ...properties,
        id: candidate.id ?? candidate.atome_id ?? properties.id,
        type: candidate.type ?? candidate.atome_type ?? properties.type,
        owner_id: candidate.owner_id ?? candidate.meta?.owner_id ?? properties.owner_id,
        project_id: candidate.project_id ?? candidate.meta?.project_id ?? properties.project_id,
        created_at: candidate.created_at ?? candidate.meta?.created_at ?? properties.created_at,
        updated_at: candidate.updated_at ?? candidate.meta?.updated_at ?? properties.updated_at,
        custom_fields: candidate.custom_fields ?? properties.custom_fields
    };
};

const customFieldValue = (candidate, field) => {
    const customId = normalizeText(field).slice('custom.'.length);
    const fields = candidateEnvelope(candidate).custom_fields;
    if (!Array.isArray(fields)) return { available: false, value: undefined };
    const match = fields.find((entry) => normalizeFieldId(entry?.id || entry?.label) === customId);
    return match ? { available: true, value: match.value } : { available: false, value: undefined };
};

export const resolveCandidatePath = (candidate, field) => (
    normalizeText(field).startsWith('custom.')
        ? customFieldValue(candidate, field)
        : readPath(candidateEnvelope(candidate), field)
);

const operatorsForType = (registry, type) => registry.operators(type).map((entry) => entry.id);

const descriptor = ({ registry, source, field, type = 'any', label = field, group = 'all', unit = null }) => ({
    value: `${source}.${field}`,
    source,
    field,
    type,
    label,
    group,
    unit,
    operators: operatorsForType(registry, type),
    dependencies: [`${source}.${field}`]
});

const flattenObject = ({ registry, source, object, prefix = '', group, output, depth = 0, canRead, ancestors = new Set() }) => {
    if (!hasObjectShape(object) || depth > MAX_DISCOVERY_DEPTH) return;
    if (ancestors.has(object)) return;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(object);
    for (const [key, value] of Object.entries(object)) {
        const field = prefix ? `${prefix}.${key}` : key;
        if (!canRead(field)) continue;
        const type = inferType(value);
        if (type === 'object' && depth < MAX_DISCOVERY_DEPTH) {
            flattenObject({
                registry,
                source,
                object: value,
                prefix: field,
                group,
                output,
                depth: depth + 1,
                canRead,
                ancestors: nextAncestors
            });
            continue;
        }
        output.push(descriptor({ registry, source, field, type, label: key, group: prefix ? 'relation' : group }));
    }
};

const registeredTypeDefinitions = () => {
    const byType = new Map();
    for (const definition of [...listCoreAtomeTypeDefinitions(), ...listAtomeTypes()]) {
        if (definition?.type) byType.set(String(definition.type), definition);
    }
    return Array.from(byType.values());
};

const mergeDescriptor = (map, entry) => {
    const key = `${entry.source}.${entry.field}`;
    const current = map.get(key);
    if (!current) return void map.set(key, entry);
    const type = current.type === 'any' ? entry.type
        : (entry.type === 'any' || current.type === entry.type ? current.type : 'mixed');
    map.set(key, {
        ...current,
        type,
        operators: type === 'mixed'
            ? current.operators.filter((operator) => ['eq', 'neq', 'in', 'not_in', 'exists', 'not_exists'].includes(operator))
            : operatorsForType(current._registry, type)
    });
};

export function registerCanonicalConditionSources(registry) {
    for (const source of GENERIC_SOURCES) {
        registry.registerSource({
            source,
            describe: (field, unused, condition) => ({
                source,
                field,
                type: condition?.valueType || inferType(condition?.value)
            }),
            resolve: (context, field) => {
                const root = context?.[source];
                return resolveCandidatePath(root, field);
            }
        });
    }
    registry.registerSource({
        source: 'time',
        describe: (field) => ({ source: 'time', field, type: field === 'now' ? 'datetime' : 'any' }),
        resolve: (context, field) => field === 'now'
            ? { available: true, value: context?.now || new Date() }
            : readPath(context?.time, field)
    });
    return registry;
}

export async function discoverConditionProperties({
    registry,
    candidates = [],
    scope = {},
    source = scope.candidateSource || scope.candidate_source || 'atome',
    search = '',
    preferred = [],
    canReadProperty = () => true
} = {}) {
    if (!registry) throw new Error('condition_registry_required');
    const discovered = new Map();
    const add = (entry) => {
        if (!entry?.field || !entry?.source) return;
        const enriched = { ...entry, _registry: registry };
        mergeDescriptor(discovered, enriched);
    };
    const allowedTypes = new Set((scope.types || []).map((entry) => String(entry).toLowerCase()));
    for (const definition of registeredTypeDefinitions()) {
        if (allowedTypes.size && !allowedTypes.has(String(definition.type).toLowerCase())) continue;
        for (const [field, schema] of Object.entries(definition.schema || {})) {
            if (!canReadProperty(null, field)) continue;
            add(descriptor({
                registry,
                source,
                field,
                type: String(schema?.type || 'any').toLowerCase(),
                label: field,
                group: 'atome'
            }));
        }
    }
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
        const canRead = (field) => canReadProperty(candidate, field) !== false;
        const output = [];
        flattenObject({ registry, source, object: candidateEnvelope(candidate), group: 'all', output, canRead });
        output.forEach(add);
        const fields = candidateEnvelope(candidate).custom_fields;
        if (Array.isArray(fields)) {
            fields.forEach((entry) => {
                const id = normalizeFieldId(entry?.id || entry?.label);
                if (!id || !canRead(`custom.${id}`)) return;
                add(descriptor({
                    registry,
                    source,
                    field: `custom.${id}`,
                    type: inferType(entry?.value),
                    label: normalizeText(entry?.label) || id,
                    group: 'custom'
                }));
            });
        }
    }
    registry.properties().forEach((entry) => add({
        value: `${entry.source}.${entry.field}`,
        ...entry,
        group: entry.group || (entry.source === source ? 'context' : 'live')
    }));
    (await registry.discover({ candidates, scope })).forEach((entry) => add({
        value: `${entry.source}.${entry.field}`,
        ...entry,
        group: entry.group || 'live'
    }));
    const preferredOrder = new Map(preferred.map((entry, index) => [String(entry), index]));
    const normalizedSearch = normalizeText(search).toLowerCase();
    const result = Array.from(discovered.values()).map(({ _registry, ...entry }) => entry)
        .filter((entry) => !normalizedSearch || `${entry.label} ${entry.source}.${entry.field}`.toLowerCase().includes(normalizedSearch))
        .sort((left, right) => {
            const leftRank = preferredOrder.get(left.value) ?? Number.MAX_SAFE_INTEGER;
            const rightRank = preferredOrder.get(right.value) ?? Number.MAX_SAFE_INTEGER;
            return leftRank - rightRank || left.label.localeCompare(right.label);
        });
    result.forEach((entry) => registry.registerProperty(entry));
    return result;
}

export { inferType, normalizeFieldId };
