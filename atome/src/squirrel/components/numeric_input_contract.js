const finite = (value, error) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(error);
    return numeric;
};

const decimalPlaces = (step) => {
    const text = String(step).toLowerCase();
    if (text.includes('e-')) return Math.max(0, Number(text.split('e-')[1]) || 0);
    const point = text.indexOf('.');
    return point < 0 ? 0 : text.length - point - 1;
};

const formatNumericValue = (value, step = 1) => {
    const numeric = finite(value, 'squirrel_numeric_input_value_invalid');
    const places = Math.min(8, decimalPlaces(step));
    return places ? numeric.toFixed(places).replace(/\.?0+$/, '') : String(Math.round(numeric));
};

const normalizeNumericInputPresentation = ({
    value = 0,
    min = -Infinity,
    max = Infinity,
    step = 1,
    unit = '',
    disabled = false
} = {}) => {
    const normalizedMin = min === -Infinity ? -Infinity : finite(min, 'squirrel_numeric_input_min_invalid');
    const normalizedMax = max === Infinity ? Infinity : finite(max, 'squirrel_numeric_input_max_invalid');
    if (normalizedMin > normalizedMax) throw new Error('squirrel_numeric_input_range_invalid');
    const normalizedStep = finite(step, 'squirrel_numeric_input_step_invalid');
    if (normalizedStep <= 0) throw new Error('squirrel_numeric_input_step_invalid');
    const normalizedValue = finite(value, 'squirrel_numeric_input_value_invalid');
    if (normalizedValue < normalizedMin || normalizedValue > normalizedMax) throw new Error('squirrel_numeric_input_value_out_of_range');
    const normalizedUnit = String(unit == null ? '' : unit).trim();
    if (!normalizedUnit) throw new Error('squirrel_numeric_input_unit_required');
    return Object.freeze({
        value: normalizedValue,
        min: normalizedMin,
        max: normalizedMax,
        step: normalizedStep,
        unit: normalizedUnit,
        disabled: disabled === true
    });
};

export {
    formatNumericValue,
    normalizeNumericInputPresentation
};
