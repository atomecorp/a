import { createConditionEngine } from './engine.js';
import { createConditionRegistry } from './registry.js';

const SAFE_SOURCE = new Set(['user', 'atome', 'actor', 'operation', 'property', 'runtime', 'time', 'calendar', 'location']);
const SAFE_FIELD = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;
const OPERATOR_ALIASES = Object.freeze({ ne: 'neq', is: 'eq', is_not: 'neq', after: 'gte', before: 'lte' });
const SAFE_OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in', 'contains', 'starts_with', 'ends_with', 'exists', 'not_exists']);

const normalizeOperator = (value) => OPERATOR_ALIASES[String(value || '').trim().toLowerCase()]
    || String(value || '').trim().toLowerCase();
const leaf = (source, field, operator, value) => ({ source, field, operator: normalizeOperator(operator), value });
const group = (combinator, children) => ({ combinator, children });

const legacyObjectEntries = (source, object) => Object.entries(object).map(([field, rule]) => (
    rule && typeof rule === 'object' && !Array.isArray(rule) && rule.op
        ? leaf(source, field, rule.op, rule.value)
        : leaf(source, field, 'eq', rule)
));

export function migrateLegacyPermissionConditionNode(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.schemaVersion === 1 && node.root) return node.root;
    if (typeof node.source === 'string' && typeof node.field === 'string') {
        return leaf(node.source, node.field, node.operator || node.op, node.value);
    }
    if (typeof node.combinator === 'string' && Array.isArray(node.children)) {
        const children = node.children.map(migrateLegacyPermissionConditionNode);
        return children.every(Boolean) ? group(String(node.combinator).toLowerCase(), children) : null;
    }
    if (Array.isArray(node)) {
        const children = node.map(migrateLegacyPermissionConditionNode);
        return children.every(Boolean) ? group('and', children) : null;
    }
    if (Array.isArray(node.all)) {
        const children = node.all.map(migrateLegacyPermissionConditionNode);
        return children.every(Boolean) ? group('and', children) : null;
    }
    if (Array.isArray(node.any)) {
        const children = node.any.map(migrateLegacyPermissionConditionNode);
        return children.every(Boolean) ? group('or', children) : null;
    }
    if (node.after || node.before) {
        const children = [];
        if (node.after) children.push(leaf('time', 'now', 'gte', node.after));
        if (node.before) children.push(leaf('time', 'now', 'lte', node.before));
        return children.length === 1 ? children[0] : group('and', children);
    }
    if (node.field && node.op) {
        const [source, ...parts] = String(node.field).split('.');
        if (!source || parts.length === 0) return null;
        return leaf(source, parts.join('.'), node.op, node.value);
    }
    if (node.user && typeof node.user === 'object' && !Array.isArray(node.user)) {
        const children = legacyObjectEntries('user', node.user);
        return children.length === 1 ? children[0] : group('and', children);
    }
    if (node.atome && typeof node.atome === 'object' && !Array.isArray(node.atome)) {
        const children = legacyObjectEntries('atome', node.atome);
        return children.length === 1 ? children[0] : group('and', children);
    }
    return null;
}

export function normalizePermissionConditions(input) {
    if (input === null || input === undefined || input === '') return null;
    let parsed = input;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            throw new Error('permission_conditions_invalid_json');
        }
    }
    const root = migrateLegacyPermissionConditionNode(parsed);
    if (!root) throw new Error('permission_conditions_invalid');
    const properties = collectProperties(root);
    const invalid = properties.length === 0 || properties.some(({ source, field, operator }) => (
        !SAFE_SOURCE.has(source)
        || !SAFE_FIELD.test(field)
        || field.split('.').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))
        || !SAFE_OPERATORS.has(operator)
    ));
    if (invalid) throw new Error('permission_conditions_invalid');
    const registry = createConditionRegistry();
    for (const { source, field, operator, value } of properties) {
        registry.registerProperty({
            source,
            field,
            type: propertyType(undefined, source, field, operator, value),
            operators: [operator]
        });
    }
    if (!createConditionEngine({ registry }).validate(root).ok) {
        throw new Error('permission_conditions_invalid');
    }
    return { schemaVersion: 1, root };
}

const collectProperties = (node, entries = []) => {
    if (!node || typeof node !== 'object') return entries;
    if (node.source && node.field) entries.push({
        source: String(node.source).toLowerCase(),
        field: String(node.field),
        operator: normalizeOperator(node.operator),
        value: node.value
    });
    if (Array.isArray(node.children)) node.children.forEach((child) => collectProperties(child, entries));
    return entries;
};

const readPath = (context, source, field) => {
    let current = context?.[source];
    for (const part of String(field).split('.')) {
        if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
        current = current[part];
    }
    return current;
};

const propertyType = (value, source, field, operator, expected) => {
    if (source === 'time' || ['date', 'datetime', 'created_at', 'updated_at', 'start', 'end'].some((part) => field.toLowerCase().includes(part))) return 'datetime';
    if (['gt', 'gte', 'lt', 'lte', 'between'].includes(operator) && Number.isFinite(Number(expected))) return 'number';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    return 'any';
};

export async function evaluatePermissionConditions(input, context = {}) {
    let document;
    try {
        document = normalizePermissionConditions(input);
    } catch {
        return { state: 'unknown', matched: false, decision: 'deny', reasonCode: 'permission_conditions_invalid' };
    }
    if (!document) return { state: 'true', matched: true, decision: 'allow', reasonCode: 'permission_conditions_absent' };
    const registry = createConditionRegistry();
    for (const { source, field, operator, value } of collectProperties(document.root)) {
        registry.registerProperty({
            source,
            field,
            type: propertyType(readPath(context, source, field), source, field, operator, value),
            operators: [operator]
        });
    }
    return createConditionEngine({ registry }).match(document, context, { domain: 'acl' });
}
