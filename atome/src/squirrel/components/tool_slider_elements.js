// Extracted from tool_slider_builder.js: builds the IntuitionX slider tool DOM (shell/hitzone/input/value).
import { normalizeSliderOptions, formatSliderBound } from './slider_contract.js';
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
    orientation = 'horizontal',
    designTokens = {}, sliderOptions = {}
} = {}) => {
    const host = contentHost instanceof HTMLElement ? contentHost : button;
    const colors = resolveDesignTokens(designTokens);
    const vertical = orientation === 'vertical';
    const options = normalizeSliderOptions(sliderOptions);

    const shell = createNode('div', {
        parent: host,
        attrs: { 'data-role': 'eve_intuitionx-slider-shell' },
        css: {
            width: '100%',
            height: '100%',
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
            height: '100%',
            minWidth: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'stretch',
            ...(options.showBounds ? { flexDirection: vertical ? 'column' : 'row', gap: '7px' } : {}),
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
            width: vertical ? '18px' : '100%',
            height: vertical ? '100%' : 'auto',
            minWidth: '0',
            margin: '0',
            accentColor: 'rgba(255, 255, 255, 0.92)',
            cursor: 'pointer',
            pointerEvents: 'auto',
            writingMode: vertical ? 'vertical-lr' : '',
            direction: vertical ? 'rtl' : ''
        }
    });
    addOptionalClassNames(input, classNames.input);

    const bounds = options.showBounds ? [min, max].map((value, index) => {
        const entry = createNode('span', { attrs: { id: button.id + (index ? '_max' : '_min') },
            text: formatSliderBound(value), css: { fontSize: '11px', lineHeight: '1', color: colors.textMain,
                flex: '0 0 auto', pointerEvents: 'none' } });
        if ((vertical && index === 1) || (!vertical && index === 0)) hitzone.insertBefore(entry, input);
        else hitzone.appendChild(entry);
        return entry;
    }) : [];
    if (bounds.length) input.style.flex = '1 1 auto';

    const infoRow = createNode('div', {
        parent: shell,
        attrs: { 'data-role': 'eve_intuitionx-slider-info' },
        css: {
            width: '100%',
            minWidth: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            ...(options.valueInsetPx ? { paddingTop: options.valueInsetPx + 'px' } : {}),
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
        bounds,
        hitzone,
        input,
        labelEl,
        valueWrap,
        valueButton,
        unitButton
    };
};

/** Both manual-entry controls keep the same canonical typography and frame. */
const createSliderToolEditor = ({ parent, colors, unit = false, value, min, max, step }) => createNode(unit ? 'select' : 'input', {
    parent, attrs: unit ? { 'data-role': 'eve_intuitionx-slider-unit-select' } : {
        'data-role': 'eve_intuitionx-slider-value-input', type: 'number', min: String(min), max: String(max), step: String(step), value: String(value) },
    css: { ...(unit ? { minWidth: '52px' } : { width: '72px', minWidth: '52px', textAlign: 'right' }),
        fontSize: '11px', lineHeight: '1', fontWeight: '600', letterSpacing: '0.04em', textTransform: 'uppercase',
        color: colors.textMain, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: '5px', padding: '2px 4px', outline: 'none' }
});
export { createSliderToolElements, createSliderToolEditor };
