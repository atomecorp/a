const finite = (value, error) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(error);
    return numeric;
};

// An unanswered field is unknown, never the numeric value zero.
export const parseExplicitNumericInputValue = value => {
    if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))
        throw new Error('squirrel_numeric_input_value_required');
    return finite(value.trim().replace(',', '.'), 'squirrel_numeric_input_value_invalid');
};

const decimalPlaces = (step) => {
    const text = String(step).toLowerCase();
    if (text.includes('e-')) return Math.max(0, Number(text.split('e-')[1]) || 0);
    const point = text.indexOf('.');
    return point < 0 ? 0 : text.length - point - 1;
};

// `locale`: the text shown to a person, its decimal mark theirs (« 1,5 » in French); without it, the typed form (« 1.5 »).
const formatNumericValue = (value, step = 1, locale = null) => {
    const numeric = finite(value, 'squirrel_numeric_input_value_invalid');
    const places = Math.min(8, decimalPlaces(step));
    const text = places ? numeric.toFixed(places).replace(/\.?0+$/, '') : String(Math.round(numeric));
    if (!locale) return text;
    const mark = new Intl.NumberFormat(locale).formatToParts(1.5).find(part => part.type === 'decimal').value;
    return text.replace('.', mark);
};

const normalizeNumericInputPresentation = ({
    value = 0,
    min = -Infinity,
    max = Infinity,
    step = 1,
    unit = '',
    disabled = false,
    // A value shown by its own label (a date, a clock time: the roller's `format`) needs no unit.
    labelled = false
} = {}) => {
    const normalizedMin = min === -Infinity ? -Infinity : finite(min, 'squirrel_numeric_input_min_invalid');
    const normalizedMax = max === Infinity ? Infinity : finite(max, 'squirrel_numeric_input_max_invalid');
    if (normalizedMin > normalizedMax) throw new Error('squirrel_numeric_input_range_invalid');
    const normalizedStep = finite(step, 'squirrel_numeric_input_step_invalid');
    if (normalizedStep <= 0) throw new Error('squirrel_numeric_input_step_invalid');
    const normalizedValue = finite(value, 'squirrel_numeric_input_value_invalid');
    if (normalizedValue < normalizedMin || normalizedValue > normalizedMax) throw new Error('squirrel_numeric_input_value_out_of_range');
    const normalizedUnit = String(unit == null ? '' : unit).trim();
    if (!normalizedUnit && labelled !== true) throw new Error('squirrel_numeric_input_unit_required');
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
