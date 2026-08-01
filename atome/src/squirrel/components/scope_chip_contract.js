import { normalizeSelectPresentation } from './select_contract.js';

const normalizeScopeChipPresentation = ({ options, values = [], disabled = false } = {}) => {
    if (!Array.isArray(values)) throw new Error('squirrel_scope_chip_values_array_required');
    const presentation = normalizeSelectPresentation({ options, disabled });
    const seen = new Set();
    const selectedValues = values.map((value) => String(value == null ? '' : value).trim()).map((value) => {
        if (!value) throw new Error('squirrel_scope_chip_value_required');
        if (seen.has(value)) throw new Error(`squirrel_scope_chip_value_duplicate:${value}`);
        seen.add(value);
        const option = presentation.options.find((candidate) => candidate.value === value);
        if (!option) throw new Error(`squirrel_scope_chip_value_unknown:${value}`);
        if (option.disabled) throw new Error(`squirrel_scope_chip_value_disabled:${value}`);
        return value;
    });
    return Object.freeze({
        ...presentation,
        values: Object.freeze(selectedValues)
    });
};

export {
    normalizeScopeChipPresentation
};
