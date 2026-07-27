const TOGGLEABLE_KINDS = Object.freeze(new Set(['checkbox', 'switch']));

const textValue = (value, code) => {
    const normalized = String(value == null ? '' : value).trim();
    if (!normalized) throw new Error(code);
    return normalized;
};

// A radio group carries the same option/value semantics as a Select, so groups
// reuse `select_contract.js` instead of declaring a second option contract.
// This contract owns only the independent two-state controls.
const normalizeToggleablePresentation = ({ kind, label, checked = false, disabled = false } = {}) => {
    const normalizedKind = textValue(kind, 'squirrel_toggleable_kind_required');
    if (!TOGGLEABLE_KINDS.has(normalizedKind)) {
        throw new Error(`squirrel_toggleable_kind_unsupported:${normalizedKind}`);
    }
    if (checked !== true && checked !== false) throw new Error('squirrel_toggleable_checked_boolean_required');
    if (disabled !== true && disabled !== false) throw new Error('squirrel_toggleable_disabled_boolean_required');
    return Object.freeze({
        kind: normalizedKind,
        label: textValue(label, 'squirrel_toggleable_label_required'),
        checked,
        disabled
    });
};

export {
    normalizeToggleablePresentation
};
