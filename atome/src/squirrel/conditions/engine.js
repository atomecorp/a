import {
    CONDITION_STATES,
    CONDITION_UNKNOWN_POLICIES,
    conditionNodeKind,
    normalizeUnknownPolicy
} from './contract.js';

const result = (state, reasonCode, dependencies = []) => Object.freeze({
    state,
    reasonCode,
    dependencies: Object.freeze(Array.from(new Set(dependencies)))
});

const readPath = (object, path) => {
    let current = object;
    for (const part of String(path || '').split('.').filter(Boolean)) {
        if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
            return { available: false, value: undefined };
        }
        current = current[part];
    }
    return { available: true, value: current };
};

const normalizeCase = (value, enabled) => {
    if (!enabled) return value;
    if (typeof value === 'string') return value.toLowerCase();
    if (Array.isArray(value)) return value.map((entry) => normalizeCase(entry, true));
    return value;
};

const combine = (combinator, children) => {
    const dependencies = children.flatMap((entry) => entry.dependencies);
    if (combinator === 'not') {
        if (children.length !== 1) return result(CONDITION_STATES.UNKNOWN, 'condition_not_arity_invalid', dependencies);
        if (children[0].state === CONDITION_STATES.UNKNOWN) return result(CONDITION_STATES.UNKNOWN, children[0].reasonCode, dependencies);
        return result(children[0].state === CONDITION_STATES.TRUE ? CONDITION_STATES.FALSE : CONDITION_STATES.TRUE, 'condition_not_evaluated', dependencies);
    }
    if (combinator === 'and') {
        if (children.some((entry) => entry.state === CONDITION_STATES.FALSE)) return result(CONDITION_STATES.FALSE, 'condition_group_false', dependencies);
        if (children.some((entry) => entry.state === CONDITION_STATES.UNKNOWN)) return result(CONDITION_STATES.UNKNOWN, 'condition_group_unknown', dependencies);
        return result(CONDITION_STATES.TRUE, 'condition_group_true', dependencies);
    }
    if (combinator === 'or') {
        if (children.some((entry) => entry.state === CONDITION_STATES.TRUE)) return result(CONDITION_STATES.TRUE, 'condition_group_true', dependencies);
        if (children.some((entry) => entry.state === CONDITION_STATES.UNKNOWN)) return result(CONDITION_STATES.UNKNOWN, 'condition_group_unknown', dependencies);
        return result(CONDITION_STATES.FALSE, 'condition_group_false', dependencies);
    }
    return result(CONDITION_STATES.UNKNOWN, 'condition_combinator_unknown', dependencies);
};

export function createConditionEngine({ registry } = {}) {
    if (!registry || typeof registry.property !== 'function') throw new Error('condition_registry_required');
    const watches = new Map();
    let nextWatchId = 1;

    const validateNode = (node, path = 'root', errors = [], context = null) => {
        const kind = conditionNodeKind(node);
        if (kind === 'group') {
            const combinator = String(node.combinator || '').trim().toLowerCase();
            if (!['and', 'or', 'not'].includes(combinator)) errors.push({ path, code: 'condition_combinator_unknown' });
            if (!Array.isArray(node.children) || node.children.length === 0) errors.push({ path, code: 'condition_children_required' });
            if (combinator === 'not' && node.children?.length !== 1) errors.push({ path, code: 'condition_not_arity_invalid' });
            node.children?.forEach((child, index) => validateNode(child, `${path}.children.${index}`, errors, context));
            return errors;
        }
        if (kind === 'condition') {
            const property = registry.property(node.source, node.field, context, node);
            const operatorId = String(node.operator || '').trim().toLowerCase();
            if (!property) errors.push({ path, code: 'condition_property_unknown' });
            if (!operatorId || !registry.operator(operatorId)) errors.push({ path, code: 'condition_operator_unknown' });
            if (property && !property.operators.includes(operatorId)) errors.push({ path, code: 'condition_operator_incompatible' });
            return errors;
        }
        errors.push({ path, code: 'condition_node_invalid' });
        return errors;
    };

    const evaluateNode = async (node, context) => {
        const kind = conditionNodeKind(node);
        if (kind === 'group') {
            const children = await Promise.all(node.children.map((child) => evaluateNode(child, context)));
            return combine(String(node.combinator).trim().toLowerCase(), children);
        }
        if (kind !== 'condition') return result(CONDITION_STATES.UNKNOWN, 'condition_node_invalid');
        const property = registry.property(node.source, node.field, context, node);
        const operator = registry.operator(node.operator);
        const dependencies = property?.dependencies || [`${node.source}.${node.field}`];
        if (!property) return result(CONDITION_STATES.UNKNOWN, 'condition_property_unknown', dependencies);
        if (!operator || !property.operators.includes(operator.id)) return result(CONDITION_STATES.UNKNOWN, 'condition_operator_invalid', dependencies);
        try {
            const resolved = property.resolve
                ? await property.resolve(context, node)
                : readPath(context?.[property.source], property.field);
            const available = resolved && typeof resolved === 'object' && Object.prototype.hasOwnProperty.call(resolved, 'available')
                ? resolved.available === true
                : resolved !== undefined;
            const actual = resolved && typeof resolved === 'object' && Object.prototype.hasOwnProperty.call(resolved, 'value')
                ? resolved.value
                : resolved;
            if (!available && operator.id === 'exists') return result(CONDITION_STATES.FALSE, 'condition_not_matched', dependencies);
            if (!available && operator.id === 'not_exists') return result(CONDITION_STATES.TRUE, 'condition_matched', dependencies);
            if (!available) return result(CONDITION_STATES.UNKNOWN, resolved?.reasonCode || 'condition_value_unavailable', dependencies);
            const matched = operator.evaluate({
                actual: normalizeCase(actual, node.caseInsensitive === true),
                expected: normalizeCase(node.value, node.caseInsensitive === true),
                type: node.valueType || property.type,
                unit: node.unit || null,
                context,
                condition: node
            });
            if (typeof matched !== 'boolean') return result(CONDITION_STATES.UNKNOWN, 'condition_operator_result_invalid', dependencies);
            return result(matched ? CONDITION_STATES.TRUE : CONDITION_STATES.FALSE, matched ? 'condition_matched' : 'condition_not_matched', dependencies);
        } catch {
            return result(CONDITION_STATES.UNKNOWN, 'condition_evaluation_failed', dependencies);
        }
    };

    const evaluateNodeSync = (node, context) => {
        const kind = conditionNodeKind(node);
        if (kind === 'group') {
            return combine(
                String(node.combinator).trim().toLowerCase(),
                node.children.map((child) => evaluateNodeSync(child, context))
            );
        }
        if (kind !== 'condition') return result(CONDITION_STATES.UNKNOWN, 'condition_node_invalid');
        const property = registry.property(node.source, node.field, context, node);
        const operator = registry.operator(node.operator);
        const dependencies = property?.dependencies || [`${node.source}.${node.field}`];
        if (!property) return result(CONDITION_STATES.UNKNOWN, 'condition_property_unknown', dependencies);
        if (!operator || !property.operators.includes(operator.id)) return result(CONDITION_STATES.UNKNOWN, 'condition_operator_invalid', dependencies);
        try {
            const resolved = property.resolve ? property.resolve(context, node) : readPath(context?.[property.source], property.field);
            if (resolved && typeof resolved.then === 'function') {
                return result(CONDITION_STATES.UNKNOWN, 'condition_async_source_requires_evaluate', dependencies);
            }
            const available = resolved && typeof resolved === 'object' && Object.prototype.hasOwnProperty.call(resolved, 'available')
                ? resolved.available === true
                : resolved !== undefined;
            const actual = resolved && typeof resolved === 'object' && Object.prototype.hasOwnProperty.call(resolved, 'value')
                ? resolved.value
                : resolved;
            if (!available && operator.id === 'exists') return result(CONDITION_STATES.FALSE, 'condition_not_matched', dependencies);
            if (!available && operator.id === 'not_exists') return result(CONDITION_STATES.TRUE, 'condition_matched', dependencies);
            if (!available) return result(CONDITION_STATES.UNKNOWN, resolved?.reasonCode || 'condition_value_unavailable', dependencies);
            const matched = operator.evaluate({
                actual: normalizeCase(actual, node.caseInsensitive === true),
                expected: normalizeCase(node.value, node.caseInsensitive === true),
                type: node.valueType || property.type,
                unit: node.unit || null,
                context,
                condition: node
            });
            if (typeof matched !== 'boolean') return result(CONDITION_STATES.UNKNOWN, 'condition_operator_result_invalid', dependencies);
            return result(matched ? CONDITION_STATES.TRUE : CONDITION_STATES.FALSE, matched ? 'condition_matched' : 'condition_not_matched', dependencies);
        } catch {
            return result(CONDITION_STATES.UNKNOWN, 'condition_evaluation_failed', dependencies);
        }
    };

    const evaluate = async (conditionSetOrRoot, context = {}) => {
        const root = conditionSetOrRoot?.root || conditionSetOrRoot;
        const errors = validateNode(root, 'root', [], context);
        if (errors.length) return result(CONDITION_STATES.UNKNOWN, errors[0].code);
        return evaluateNode(root, context);
    };

    const match = async (conditionSetOrRoot, context = {}, options = {}) => {
        const evaluation = await evaluate(conditionSetOrRoot, context);
        const policy = normalizeUnknownPolicy(options.unknownPolicy, options.domain);
        return Object.freeze({
            ...evaluation,
            policy,
            matched: evaluation.state === CONDITION_STATES.TRUE,
            decision: evaluation.state === CONDITION_STATES.UNKNOWN && policy === CONDITION_UNKNOWN_POLICIES.WAIT
                ? 'wait'
                : (evaluation.state === CONDITION_STATES.TRUE ? 'allow' : 'deny')
        });
    };

    const evaluateSync = (conditionSetOrRoot, context = {}) => {
        const root = conditionSetOrRoot?.root || conditionSetOrRoot;
        const errors = validateNode(root, 'root', [], context);
        if (errors.length) return result(CONDITION_STATES.UNKNOWN, errors[0].code);
        return evaluateNodeSync(root, context);
    };

    const matchSync = (conditionSetOrRoot, context = {}, options = {}) => {
        const evaluation = evaluateSync(conditionSetOrRoot, context);
        const policy = normalizeUnknownPolicy(options.unknownPolicy, options.domain);
        return Object.freeze({
            ...evaluation,
            policy,
            matched: evaluation.state === CONDITION_STATES.TRUE,
            decision: evaluation.state === CONDITION_STATES.UNKNOWN && policy === CONDITION_UNKNOWN_POLICIES.WAIT
                ? 'wait'
                : (evaluation.state === CONDITION_STATES.TRUE ? 'allow' : 'deny')
        });
    };

    const unwatch = (watchId) => {
        const entry = watches.get(watchId);
        if (!entry) return false;
        watches.delete(watchId);
        entry.unsubscribe?.();
        return true;
    };

    const watch = async (conditionSetOrRoot, context = {}, callback, options = {}) => {
        if (typeof callback !== 'function') throw new Error('condition_watch_callback_required');
        const first = await match(conditionSetOrRoot, context, options);
        const watchId = `condition_watch_${nextWatchId++}`;
        let previous = first;
        const rerun = async () => {
            const next = await match(conditionSetOrRoot, context, options);
            if (next.state !== previous.state || next.reasonCode !== previous.reasonCode) {
                const old = previous;
                previous = next;
                callback(next, old);
            }
        };
        const unsubscribe = typeof context.subscribeDependencies === 'function'
            ? context.subscribeDependencies(first.dependencies, rerun)
            : null;
        watches.set(watchId, { unsubscribe: typeof unsubscribe === 'function' ? unsubscribe : null });
        callback(first, null);
        return Object.freeze({ id: watchId, unsubscribe: () => unwatch(watchId) });
    };

    return Object.freeze({
        validate(conditionSetOrRoot, context = null) {
            const errors = validateNode(conditionSetOrRoot?.root || conditionSetOrRoot, 'root', [], context);
            return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
        },
        evaluate,
        evaluateSync,
        match,
        matchSync,
        async filter(items, conditionSetOrRoot, contextForItem, options = {}) {
            const accepted = [];
            for (const item of Array.isArray(items) ? items : []) {
                const context = typeof contextForItem === 'function' ? await contextForItem(item) : { ...(contextForItem || {}), item };
                if ((await match(conditionSetOrRoot, context, options)).matched) accepted.push(item);
            }
            return accepted;
        },
        watch,
        unwatch
    });
}
