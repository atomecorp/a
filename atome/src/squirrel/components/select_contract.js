const textValue = (value, code) => {
    const normalized = String(value == null ? '' : value).trim();
    if (!normalized) throw new Error(code);
    return normalized;
};

const normalizeSelectOption = (option, index) => {
    const source = option && typeof option === 'object' ? option : { value: option, label: option };
    const value = textValue(source.value, `squirrel_select_option_value_required:${index}`);
    const label = textValue(source.label ?? value, `squirrel_select_option_label_required:${value}`);
    return Object.freeze({ value, label, disabled: source.disabled === true });
};

const normalizeSelectPresentation = ({ options, value = null, disabled = false } = {}) => {
    if (!Array.isArray(options) || options.length === 0) {
        throw new Error('squirrel_select_options_required');
    }
    const normalizedOptions = options.map(normalizeSelectOption);
    const values = new Set();
    normalizedOptions.forEach(({ value: optionValue }) => {
        if (values.has(optionValue)) throw new Error(`squirrel_select_option_value_duplicate:${optionValue}`);
        values.add(optionValue);
    });
    const selectedValue = value == null ? null : textValue(value, 'squirrel_select_value_required');
    const selectedIndex = selectedValue == null
        ? -1
        : normalizedOptions.findIndex((option) => option.value === selectedValue);
    if (selectedValue != null && selectedIndex < 0) {
        throw new Error(`squirrel_select_value_unknown:${selectedValue}`);
    }
    return Object.freeze({
        options: Object.freeze(normalizedOptions),
        value: selectedValue,
        selectedIndex,
        selectedOption: selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null,
        disabled: disabled === true
    });
};

export {
    normalizeSelectPresentation
};
