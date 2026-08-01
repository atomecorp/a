const normalizeMultilineText = (value) => String(value == null ? '' : value).replace(/\r\n?/g, '\n');

const normalizeMultilineInputPresentation = ({
    value = '',
    placeholder = '',
    disabled = false,
    readOnly = false
} = {}) => Object.freeze({
    value: normalizeMultilineText(value),
    placeholder: normalizeMultilineText(placeholder),
    disabled: disabled === true,
    readOnly: readOnly === true
});

export {
    normalizeMultilineInputPresentation
};
