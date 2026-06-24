// Extracted from tool_slider_builder.js: builds the IntuitionX slider tool DOM (shell/hitzone/input/value).
import { createNode, addOptionalClassNames, resolveDesignTokens } from './tool_slider_helpers.js';

const createSliderToolElements = ({
    button,
    contentHost = null,
    classNames = {},
    min,
    max,
    step,
    initialValue,
    label,
    designTokens = {}
} = {}) => {
    const host = contentHost instanceof HTMLElement ? contentHost : button;
    const colors = resolveDesignTokens(designTokens);

    const shell = createNode('div', {
        parent: host,
        attrs: { 'data-role': 'eve_intuitionx-slider-shell' },
        css: {
            width: '100%',
            display: 'grid',
            gridTemplateRows: 'minmax(0, 1fr) auto',
            alignItems: 'stretch',
            gap: '7px',
            pointerEvents: 'none'
        }
    });
    addOptionalClassNames(shell, classNames.shell);

    const hitzone = createNode('div', {
        parent: shell,
        attrs: { 'data-role': 'eve_intuitionx-slider-hitzone' },
        css: {
            width: '100%',
            minWidth: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'stretch',
            minHeight: '0',
            paddingTop: '0',
            paddingBottom: '0',
            pointerEvents: 'auto'
        }
    });
    addOptionalClassNames(hitzone, classNames.hitzone);

    const input = createNode('input', {
        parent: hitzone,
        attrs: {
            'data-role': 'eve_intuitionx-slider-input',
            type: 'range',
            min: String(min),
            max: String(max),
            step: String(step),
            value: String(initialValue),
            'aria-label': label
        },
        css: {
            width: '100%',
            minWidth: '0',
            margin: '0',
            accentColor: 'rgba(255, 255, 255, 0.92)',
            cursor: 'pointer',
            pointerEvents: 'auto'
        }
    });
    addOptionalClassNames(input, classNames.input);

    const infoRow = createNode('div', {
        parent: shell,
        attrs: { 'data-role': 'eve_intuitionx-slider-info' },
        css: {
            width: '100%',
            minWidth: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            pointerEvents: 'auto'
        }
    });
    addOptionalClassNames(infoRow, classNames.infoRow);

    const labelEl = createNode('button', {
        parent: infoRow,
        text: label,
        attrs: {
            'data-role': 'eve_intuitionx-slider-label',
            type: 'button'
        },
        css: {
            flex: '1 1 auto',
            minWidth: '0',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: '11px',
            lineHeight: '1',
            fontWeight: '600',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            color: colors.textMain,
            padding: '0',
            margin: '0',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none'
        }
    });
    addOptionalClassNames(labelEl, classNames.label);

    const valueWrap = createNode('div', {
        parent: infoRow,
        attrs: { 'data-role': 'eve_intuitionx-slider-value-wrap' },
        css: {
            flex: '0 0 auto',
            maxWidth: '56%',
            minWidth: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '4px',
            position: 'relative',
            pointerEvents: 'auto'
        }
    });
    addOptionalClassNames(valueWrap, classNames.valueWrap);

    const valueButton = createNode('button', {
        parent: valueWrap,
        attrs: {
            'data-role': 'eve_intuitionx-slider-value',
            type: 'button'
        },
        css: {
            flex: '0 1 auto',
            minWidth: '0',
            maxWidth: '100%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: '11px',
            lineHeight: '1',
            fontWeight: '600',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            textAlign: 'right',
            background: 'transparent',
            border: 'none',
            color: colors.textMain,
            padding: '0',
            margin: '0',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none'
        }
    });
    addOptionalClassNames(valueButton, classNames.valueButton);

    const unitButton = createNode('button', {
        parent: valueWrap,
        attrs: {
            'data-role': 'eve_intuitionx-slider-unit',
            type: 'button'
        },
        css: {
            display: 'none',
            flex: '0 0 auto',
            whiteSpace: 'nowrap',
            fontSize: '11px',
            lineHeight: '1',
            fontWeight: '600',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: 'transparent',
            border: 'none',
            color: colors.textMuted,
            padding: '0',
            margin: '0',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none'
        }
    });
    addOptionalClassNames(unitButton, classNames.unitButton);

    return {
        shell,
        hitzone,
        input,
        labelEl,
        valueWrap,
        valueButton,
        unitButton
    };
};


export { createSliderToolElements };
