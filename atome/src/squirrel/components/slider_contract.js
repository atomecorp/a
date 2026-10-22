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
const valueKey = value => String(Number(Number(value).toPrecision(15)));
export const isSliderValueValid = (value, config = {}, options = {}) => {
    const { min, max, step } = normalizeSliderRange(config);
    if (!Number.isFinite(value) || value < min || value > max) return false;
    const quantized = quantizeSliderValue(value, config);
    const tolerance = Math.min(step * 1e-7, Number.EPSILON * 8 * Math.max(1, Math.abs(value), Math.abs(quantized)));
    if (Math.abs(value - quantized) > tolerance) return false;
    return options.valueLabels == null || Object.hasOwn(options.valueLabels, valueKey(value));
};
// Captions are presentation only. Consumers retain their numeric formatting when absent.
export const sliderValueCaption = (value, options = {}) => {
    if (options.valueLabels == null) return null;
    const key = valueKey(value);
    if (!Object.hasOwn(options.valueLabels, key)) throw new Error('slider_value_caption_required');
    return options.valueLabels[key];
};
export const formatSliderBound = (value, unit = '') => {
    const numeric = Number(Number(value).toFixed(6));
    return unit ? `${numeric} ${unit}` : String(numeric);
};
// An end of the rail reads its own words (`boundLabels`), else its value caption, else its number.
export const sliderBoundCaption = (options, bound, end, unit = '') => options.boundLabels?.[end]
    ?? (options.valueLabels && Object.hasOwn(options.valueLabels, valueKey(bound)) ? options.valueLabels[valueKey(bound)] : formatSliderBound(bound, unit));
export const normalizeSliderOptions = (options = {}) => {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('slider_options_invalid');
    const length = options.lengthPx ?? null, inset = options.valueInsetPx ?? 0;
    if (length !== null && length !== 'fill' && (!Number.isFinite(length) || length <= 0)) throw new Error('slider_length_invalid');
    if (!Number.isFinite(inset) || inset < 0) throw new Error('slider_value_inset_invalid');
    const normalized = { showBounds: options.showBounds === true, lengthPx: length, valueInsetPx: inset };
    // `valueFontSizePx`: the value read large above an expanded horizontal rail (an event's time).
    if (options.valueFontSizePx != null) {
        if (!Number.isFinite(options.valueFontSizePx) || options.valueFontSizePx <= 0) throw new Error('slider_value_font_size_invalid');
        normalized.valueFontSizePx = options.valueFontSizePx;
    }
    if (options.valueLabels != null) {
        const labels = options.valueLabels;
        if (!labels || typeof labels !== 'object' || Array.isArray(labels) || !Object.keys(labels).length
            || Object.entries(labels).some(([key, label]) => !Number.isFinite(Number(key)) || valueKey(key) !== key
                || typeof label !== 'string' || !label.trim())) throw new Error('slider_value_labels_invalid');
        normalized.valueLabels = { ...labels };
    }
    if (options.boundLabels != null) {
        const labels = options.boundLabels;
        if (!labels || typeof labels !== 'object' || Array.isArray(labels) || Object.keys(labels).some(end => !['min', 'max'].includes(end))
            || Object.values(labels).some(label => typeof label !== 'string' || !label.trim())) throw new Error('slider_bound_labels_invalid');
        normalized.boundLabels = { ...labels };
    }
    return normalized;
};
export const resolveSliderLength = (options, defaultLength, availableLength) => {
    const { lengthPx } = normalizeSliderOptions(options);
    const value = lengthPx === 'fill' ? availableLength : lengthPx ?? defaultLength;
    if (!Number.isFinite(value) || value <= 0) throw new Error('slider_available_length_required');
    return value;
};
