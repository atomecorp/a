/** Shared, renderer-independent slider options, range and value formatting. */
const finite = (value, defaultValue) => Number.isFinite(Number(value)) ? Number(value) : defaultValue;
export const normalizeSliderRange = ({ min = 0, max = 100, step = 1 } = {}) => {
    const minimum = finite(min, 0);
    return { min: minimum, max: Math.max(minimum, finite(max, 100)), step: Math.max(.0001, finite(step, 1)) };
};
export const quantizeSliderValue = (value, config = {}) => {
    const { min, max, step } = normalizeSliderRange(config);
    const clamped = Math.min(max, Math.max(min, finite(value, min)));
    return Math.min(max, Math.max(min, min + Math.round((clamped - min) / step) * step));
};
export const formatSliderBound = (value, unit = '') => {
    const numeric = Number(Number(value).toFixed(6));
    return unit ? `${numeric} ${unit}` : String(numeric);
};
export const normalizeSliderOptions = (options = {}) => {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('slider_options_invalid');
    const length = options.lengthPx ?? null, inset = options.valueInsetPx ?? 0;
    if (length !== null && length !== 'fill' && (!Number.isFinite(length) || length <= 0)) throw new Error('slider_length_invalid');
    if (!Number.isFinite(inset) || inset < 0) throw new Error('slider_value_inset_invalid');
    return { showBounds: options.showBounds === true, lengthPx: length, valueInsetPx: inset };
};
export const resolveSliderLength = (options, defaultLength, availableLength) => {
    const { lengthPx } = normalizeSliderOptions(options);
    const value = lengthPx === 'fill' ? availableLength : lengthPx ?? defaultLength;
    if (!Number.isFinite(value) || value <= 0) throw new Error('slider_available_length_required');
    return value;
};
