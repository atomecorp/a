// Source observations are data, never executable actions or credentials.
const SECRET_KEY = /^(password|app_password|auth|authorization|token|secret|credential|command|action)$/i;
export function importData(value, depth = 0) {
    if (depth > 12) throw new Error('import_depth_exceeded');
    if (value === undefined) return undefined;
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('import_number_invalid');
        return value;
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') {
        if (value.length > 1024 * 1024) throw new Error('import_value_too_large');
        return value;
    }
    if (Array.isArray(value)) {
        if (value.length > 10000) throw new Error('import_array_too_large');
        return value.map(entry => importData(entry, depth + 1));
    }
    if (!value || typeof value !== 'object' || Object.keys(value).length > 1000) throw new Error('import_object_invalid');
    return Object.fromEntries(Object.entries(value)
        .filter(([key, entry]) => !SECRET_KEY.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key) && entry !== undefined)
        .map(([key, entry]) => [key, importData(entry, depth + 1)]));
}

export const stableImportValue = value => {
    if (Array.isArray(value)) return `[${value.map(stableImportValue).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableImportValue(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
};
export const sameImportValue = (left, right) => stableImportValue(left) === stableImportValue(right);

/** Three-way merge. Absent/unread fields never mean explicit deletion. */
export function reconcileImport(current = {}, previous = {}, incoming = {}, oldConflicts = {}, groups = []) {
    const properties = { ...current }, conflicts = { ...oldConflicts };
    const held = new Set(groups.filter(group => group.some(field => !sameImportValue(current[field], previous[field])))
        .flat());
    for (const [field, external] of Object.entries(incoming)) {
        const local = current[field], baseline = previous[field];
        if (sameImportValue(local, external)) delete conflicts[field];
        else if (!held.has(field) && sameImportValue(local, baseline)) {
            properties[field] = external;
            delete conflicts[field];
        } else if (!sameImportValue(baseline, external)) {
            conflicts[field] = { baseline, local, external };
        }
    }
    return { properties, conflicts };
}

export function compareImportVersion(incoming, previous) {
    if (incoming == null || previous == null || incoming === previous) return incoming === previous ? 0 : null;
    // ETags and native history tokens are opaque, never lexically ordered.
    if (typeof incoming === 'number' && typeof previous === 'number') return Math.sign(incoming - previous);
    const rank = value => typeof value === 'number' ? { sequence: value } : value || {};
    const left = rank(incoming), right = rank(previous);
    for (const key of ['sequence', 'modified_at', 'observed_at']) {
        if (Number.isFinite(left[key]) && Number.isFinite(right[key]) && left[key] !== right[key])
            return Math.sign(left[key] - right[key]);
    }
    return null;
}
