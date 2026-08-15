const MAX_EXPRESSION_DEPTH = 20;
const SAFE_COMPUTED_OPERATORS = new Set([
    'add', 'subtract', 'multiply', 'divide', 'min', 'max', 'abs', 'round',
    'length', 'lower', 'upper', 'coalesce', 'date_diff', 'distance'
]);
const hasObjectShape = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const unavailable = (reasonCode) => ({ available: false, value: undefined, reasonCode });
const available = (value) => ({ available: true, value });

const readPath = (object, path) => {
    let current = object;
    for (const part of String(path || '').split('.').filter(Boolean)) {
        if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
            return unavailable('condition_value_unavailable');
        }
        current = current[part];
    }
    return available(current);
};

const finite = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('condition_computed_number_required');
    return number;
};

const point = (value) => {
    const latitude = Number(value?.latitude ?? value?.lat);
    const longitude = Number(value?.longitude ?? value?.lng ?? value?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error('condition_computed_location_required');
    }
    return { latitude, longitude };
};

const distanceKm = (leftValue, rightValue) => {
    const left = point(leftValue);
    const right = point(rightValue);
    const radians = (degrees) => degrees * (Math.PI / 180);
    const latitudeDelta = radians(right.latitude - left.latitude);
    const longitudeDelta = radians(right.longitude - left.longitude);
    const a = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude))
        * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const dateDifference = (left, right, unit = 'milliseconds') => {
    const delta = new Date(left).getTime() - new Date(right).getTime();
    if (!Number.isFinite(delta)) throw new Error('condition_computed_date_required');
    const divisors = { milliseconds: 1, seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000, years: 31557600000 };
    if (!divisors[unit]) throw new Error('condition_computed_date_unit_invalid');
    return delta / divisors[unit];
};

const applyCall = (operator, values, node) => {
    if (operator === 'add') return values.reduce((sum, value) => sum + finite(value), 0);
    if (operator === 'subtract') return finite(values[0]) - finite(values[1]);
    if (operator === 'multiply') return values.reduce((product, value) => product * finite(value), 1);
    if (operator === 'divide') {
        const divisor = finite(values[1]);
        if (divisor === 0) throw new Error('condition_computed_division_by_zero');
        return finite(values[0]) / divisor;
    }
    if (operator === 'min') return Math.min(...values.map(finite));
    if (operator === 'max') return Math.max(...values.map(finite));
    if (operator === 'abs') return Math.abs(finite(values[0]));
    if (operator === 'round') return Math.round(finite(values[0]));
    if (operator === 'length') return values[0]?.length ?? String(values[0] ?? '').length;
    if (operator === 'lower') return String(values[0]).toLowerCase();
    if (operator === 'upper') return String(values[0]).toUpperCase();
    if (operator === 'coalesce') return values.find((value) => value !== null && value !== undefined);
    if (operator === 'date_diff') return dateDifference(values[0], values[1], node.unit || 'milliseconds');
    if (operator === 'distance') return distanceKm(values[0], values[1]);
    throw new Error('condition_computed_operator_unknown');
};

export const collectComputedDependencies = (expression, dependencies = new Set(), depth = 0) => {
    if (!hasObjectShape(expression) || depth > MAX_EXPRESSION_DEPTH) return dependencies;
    if (expression.kind === 'property') {
        const source = String(expression.source || '').trim();
        const field = String(expression.field || '').trim();
        if (source && field) dependencies.add(`${source}.${field}`);
    }
    (Array.isArray(expression.args) ? expression.args : []).forEach((entry) => (
        collectComputedDependencies(entry, dependencies, depth + 1)
    ));
    return dependencies;
};

export const validateComputedExpression = (expression, depth = 0, errors = []) => {
    if (!hasObjectShape(expression)) return [...errors, 'condition_computed_expression_invalid'];
    if (depth > MAX_EXPRESSION_DEPTH) return [...errors, 'condition_computed_expression_too_deep'];
    if (expression.kind === 'literal') return errors;
    if (expression.kind === 'property') {
        if (!String(expression.source || '').trim() || !String(expression.field || '').trim()) {
            errors.push('condition_computed_property_reference_invalid');
        }
        return errors;
    }
    if (expression.kind !== 'call' || !String(expression.operator || '').trim()) {
        errors.push('condition_computed_expression_invalid');
        return errors;
    }
    if (!SAFE_COMPUTED_OPERATORS.has(String(expression.operator))) {
        errors.push('condition_computed_operator_unknown');
    }
    const args = Array.isArray(expression.args) ? expression.args : [];
    if (!args.length) errors.push('condition_computed_arguments_required');
    args.forEach((entry) => validateComputedExpression(entry, depth + 1, errors));
    return errors;
};

export const evaluateComputedExpressionSync = (expression, context, registry, depth = 0) => {
    if (depth > MAX_EXPRESSION_DEPTH) return unavailable('condition_computed_expression_too_deep');
    if (expression?.kind === 'literal') return available(expression.value);
    if (expression?.kind === 'property') {
        const property = registry.property(expression.source, expression.field, context, expression);
        if (!property) return unavailable('condition_property_unknown');
        const resolved = property.resolve
            ? property.resolve(context, expression)
            : readPath(context?.[property.source], property.field);
        if (resolved && typeof resolved.then === 'function') return unavailable('condition_async_source_requires_evaluate');
        if (resolved && typeof resolved === 'object' && Object.prototype.hasOwnProperty.call(resolved, 'available')) {
            return resolved.available === true ? available(resolved.value) : unavailable(resolved.reasonCode || 'condition_value_unavailable');
        }
        return resolved === undefined ? unavailable('condition_value_unavailable') : available(resolved);
    }
    if (expression?.kind !== 'call') return unavailable('condition_computed_expression_invalid');
    const evaluated = (expression.args || []).map((entry) => evaluateComputedExpressionSync(entry, context, registry, depth + 1));
    if (expression.operator === 'coalesce') {
        const first = evaluated.find((entry) => entry.available && entry.value !== null && entry.value !== undefined);
        return first || unavailable('condition_value_unavailable');
    }
    const missing = evaluated.find((entry) => !entry.available);
    if (missing) return missing;
    try {
        return available(applyCall(String(expression.operator), evaluated.map((entry) => entry.value), expression));
    } catch (error) {
        return unavailable(error?.message || 'condition_computed_evaluation_failed');
    }
};

export const evaluateComputedExpression = async (expression, context, registry, depth = 0) => {
    if (depth > MAX_EXPRESSION_DEPTH) return unavailable('condition_computed_expression_too_deep');
    if (expression?.kind === 'literal') return available(expression.value);
    if (expression?.kind === 'property') {
        const property = registry.property(expression.source, expression.field, context, expression);
        if (!property) return unavailable('condition_property_unknown');
        const resolved = property.resolve
            ? await property.resolve(context, expression)
            : readPath(context?.[property.source], property.field);
        if (resolved && typeof resolved === 'object' && Object.prototype.hasOwnProperty.call(resolved, 'available')) {
            return resolved.available === true ? available(resolved.value) : unavailable(resolved.reasonCode || 'condition_value_unavailable');
        }
        return resolved === undefined ? unavailable('condition_value_unavailable') : available(resolved);
    }
    if (expression?.kind !== 'call') return unavailable('condition_computed_expression_invalid');
    const evaluated = await Promise.all((expression.args || []).map((entry) => (
        evaluateComputedExpression(entry, context, registry, depth + 1)
    )));
    if (expression.operator === 'coalesce') {
        const first = evaluated.find((entry) => entry.available && entry.value !== null && entry.value !== undefined);
        return first || unavailable('condition_value_unavailable');
    }
    const missing = evaluated.find((entry) => !entry.available);
    if (missing) return missing;
    try {
        return available(applyCall(String(expression.operator), evaluated.map((entry) => entry.value), expression));
    } catch (error) {
        return unavailable(error?.message || 'condition_computed_evaluation_failed');
    }
};
