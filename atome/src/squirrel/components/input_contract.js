const textValue = (value) => String(value == null ? '' : value).replace(/[\r\n]+/g, '');

const normalizeTextInputPresentation = ({
    value = '',
    placeholder = '',
    disabled = false,
    readOnly = false
} = {}) => Object.freeze({
    value: textValue(value),
    placeholder: textValue(placeholder),
    disabled: disabled === true,
    readOnly: readOnly === true
});

export {
    normalizeTextInputPresentation
};
