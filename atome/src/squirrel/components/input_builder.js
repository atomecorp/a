import { $, define } from '../squirrel.js';

define('input-container', {
    tag: 'input',
    class: 'hs-input',
    css: {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        boxSizing: 'border-box',
        width: '100%',
        minHeight: '32px',
        padding: '6px 10px',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        borderRadius: '8px',
        backgroundColor: 'rgba(37, 42, 49, 0.92)',
        color: 'rgba(244, 246, 248, 0.96)',
        fontSize: '13px',
        lineHeight: '1.2',
        fontFamily: 'system-ui, sans-serif',
        outline: 'none',
        boxShadow: 'none',
        transition: 'border-color 140ms linear, box-shadow 140ms linear, background-color 140ms linear'
    },
    attrs: {
        type: 'text'
    }
});

const inputTemplates = {
    squirrel_design: {
        css: {
            minHeight: '26px',
            padding: '4px 8px',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            backgroundColor: 'rgba(57, 64, 73, 0.84)',
            color: 'rgba(244, 246, 248, 0.96)',
            fontSize: '12px'
        },
        focusStyle: {
            borderColor: 'rgba(231, 241, 255, 0.42)',
            boxShadow: '0 0 0 2px rgba(148, 163, 184, 0.18)'
        },
        disabledStyle: {
            opacity: '0.55',
            cursor: 'not-allowed'
        }
    }
};

const applyTemplate = (config, templateName) => {
    const template = inputTemplates[templateName];
    if (!template) return config;
    return {
        ...config,
        css: {
            ...(template.css || {}),
            ...(config.css || {})
        },
        focusStyle: {
            ...(template.focusStyle || {}),
            ...(config.focusStyle || {})
        },
        disabledStyle: {
            ...(template.disabledStyle || {}),
            ...(config.disabledStyle || {})
        },
        _templateName: templateName,
        _templateInfo: template
    };
};

const createInput = (config = {}) => {
    const templateName = config.template || 'squirrel_design';
    const {
        id,
        value = '',
        type = 'text',
        placeholder = '',
        name,
        disabled = false,
        readOnly = false,
        template = 'squirrel_design',
        css = {},
        attrs = {},
        focusStyle = {},
        disabledStyle = {},
        onInput,
        onChange,
        onFocus,
        onBlur,
        ...otherProps
    } = applyTemplate(config, templateName);

    const inputId = id || `input_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const baseCss = {
        ...(css || {})
    };

    const input = $('input-container', {
        id: inputId,
        css: baseCss,
        attrs: {
            ...(attrs || {}),
            type,
            value,
            placeholder,
            ...(name ? { name } : {}),
            ...(disabled ? { disabled: true } : {}),
            ...(readOnly ? { readonly: true } : {})
        },
        ...otherProps
    });

    input._config = {
        type,
        value,
        placeholder,
        name,
        disabled,
        readOnly,
        css: baseCss,
        focusStyle: { ...(focusStyle || {}) },
        disabledStyle: { ...(disabledStyle || {}) }
    };

    const defaultCss = { ...baseCss };

    if (disabled) {
        input.$({ css: { ...defaultCss, ...(disabledStyle || {}) } });
    }

    input.addEventListener('input', (event) => {
        input._config.value = event?.target?.value ?? '';
        if (typeof onInput === 'function') onInput(event);
    });

    input.addEventListener('change', (event) => {
        input._config.value = event?.target?.value ?? '';
        if (typeof onChange === 'function') onChange(event);
    });

    input.addEventListener('focus', (event) => {
        if (!disabled) {
            input.$({ css: { ...defaultCss, ...(focusStyle || {}) } });
        }
        if (typeof onFocus === 'function') onFocus(event);
    });

    input.addEventListener('blur', (event) => {
        if (disabled) {
            input.$({ css: { ...defaultCss, ...(disabledStyle || {}) } });
        } else {
            input.$({ css: { ...defaultCss } });
        }
        if (typeof onBlur === 'function') onBlur(event);
    });

    input.setValue = (nextValue = '') => {
        input.value = nextValue;
        input._config.value = nextValue;
        return input;
    };

    input.getValue = () => input.value;

    input.setDisabled = (nextDisabled = true) => {
        const normalized = nextDisabled === true;
        input.disabled = normalized;
        input._config.disabled = normalized;
        input.$({ css: normalized ? { ...defaultCss, ...(disabledStyle || {}) } : { ...defaultCss } });
        return input;
    };

    return input;
};

createInput.templates = inputTemplates;
createInput.getTemplateList = () => Object.keys(inputTemplates);
createInput.getTemplate = (name) => inputTemplates[name];
createInput.addTemplate = (name, template) => {
    inputTemplates[name] = template;
    return createInput;
};

createInput.removeTemplate = (name) => {
    if (inputTemplates[name]) {
        delete inputTemplates[name];
    }
    return createInput;
};

export { createInput };

const Input = createInput;
Input.templates = createInput.templates;
Input.getTemplateList = createInput.getTemplateList;
Input.getTemplate = createInput.getTemplate;
Input.addTemplate = createInput.addTemplate;
Input.removeTemplate = createInput.removeTemplate;

export { Input };
export default createInput;
