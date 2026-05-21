import { $ } from '../squirrel.js';

const VALUE_DOUBLE_CLICK_GUARD_MS = 180;
const DEFAULT_TOOL_SLIDER_COLORS = Object.freeze({
    textMain: 'rgba(244, 246, 248, 0.96)',
    textMuted: 'rgba(198, 204, 210, 0.84)'
});

const CANONICAL_SLIDER_TOOL_SHELL_SELECTOR = '[data-role="eve_intuitionx-slider-shell"]';
const CANONICAL_SLIDER_TOOL_HITZONE_SELECTOR = '[data-role="eve_intuitionx-slider-hitzone"]';
const CANONICAL_SLIDER_TOOL_INPUT_SELECTOR = '[data-role="eve_intuitionx-slider-input"]';
const CANONICAL_SLIDER_TOOL_VALUE_SELECTOR = '[data-role="eve_intuitionx-slider-value"]';
const CANONICAL_SLIDER_TOOL_VALUE_INPUT_SELECTOR = '[data-role="eve_intuitionx-slider-value-input"]';

const ensureString = (value, fallback = '') => {
    const normalized = typeof value === 'string' ? value : (value == null ? '' : String(value));
    return normalized.trim() || fallback;
};

const toFiniteNumber = (value, defaultValue = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const resolveDecimalPlaces = (step) => {
    const normalized = String(step ?? '').trim();
    if (!normalized || !normalized.includes('.')) return 0;
    return Math.max(0, normalized.split('.').pop()?.length || 0);
};

const formatSliderValue = ({
    value = 0,
    step = 1
} = {}) => {
    const numeric = toFiniteNumber(value, 0);
    const decimals = resolveDecimalPlaces(step);
    return decimals > 0
        ? numeric.toFixed(decimals).replace(/\.?0+$/, '')
        : String(Math.round(numeric));
};

const normalizeUnitOptions = (definition = {}, currentUnit = '') => {
    const raw = definition?.extraInput?.unitOptions
        ?? definition?.unitOptions
        ?? definition?.extraInput?.units
        ?? definition?.units
        ?? null;
    let options = [];
    if (Array.isArray(raw)) {
        options = raw.map((entry) => {
            if (entry && typeof entry === 'object') {
                const value = ensureString(entry.value ?? entry.unit ?? entry.label, '');
                const label = ensureString(entry.label ?? entry.value ?? entry.unit, value);
                return value ? { value, label } : null;
            }
            const value = ensureString(entry, '');
            return value ? { value, label: value } : null;
        }).filter(Boolean);
    } else if (typeof raw === 'string' && raw.trim()) {
        options = raw.split(',').map((entry) => {
            const value = ensureString(entry, '');
            return value ? { value, label: value } : null;
        }).filter(Boolean);
    }
    const unit = ensureString(currentUnit, '');
    if (!options.length && (unit === 'px' || unit === '%')) {
        options = ['px', '%'].map((value) => ({ value, label: value }));
    }
    if (unit && !options.some((entry) => entry.value === unit)) {
        options.unshift({ value: unit, label: unit });
    }
    return options;
};

const addOptionalClassNames = (element, rawValue = '') => {
    if (!(element instanceof Element)) return;
    const classNames = String(rawValue || '').trim().split(/\s+/).filter(Boolean);
    if (!classNames.length) return;
    element.classList.add(...classNames);
};

const createNode = (tag, {
    parent,
    text,
    attrs,
    css,
    className
} = {}) => {
    const element = $(tag, {
        parent,
        ...(text != null ? { text: String(text) } : {}),
        ...(attrs ? { attrs } : {}),
        ...(css ? { css } : {}),
        ...(className ? { class: className } : {})
    });
    return element;
};

const setStyles = (element, styles = {}) => {
    if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return element;
    Object.entries(styles).forEach(([key, value]) => {
        const styleValue = value == null ? '' : String(value);
        element.style[key] = styleValue;
    });
    return element;
};

const resolveDesignTokens = (designTokens = {}) => ({
    textMain: ensureString(designTokens.textMain, DEFAULT_TOOL_SLIDER_COLORS.textMain),
    textMuted: ensureString(designTokens.textMuted, DEFAULT_TOOL_SLIDER_COLORS.textMuted)
});

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

const createDirectSliderDragController = ({
    input,
    hitzone,
    expandedWidth,
    step,
    min,
    max,
    initialValue,
    quantizeSliderValue,
    syncInputValue,
    commitInputValue,
    isPinned,
    openForTransientDrag,
    collapseAfterTransientDrag,
    stopAndPrevent,
    onStart,
    onEnd
} = {}) => {
    let dragSession = null;

    const clear = () => {
        if (!dragSession || typeof window === 'undefined') {
            dragSession = null;
            return;
        }
        window.removeEventListener('pointermove', onPointerMove, true);
        window.removeEventListener('pointerup', onPointerUp, true);
        window.removeEventListener('pointercancel', onPointerCancel, true);
        try {
            if (Number.isFinite(dragSession.pointerId)) {
                input.releasePointerCapture?.(dragSession.pointerId);
            }
        } catch (_) { }
        dragSession = null;
    };

    const resolveTrackWidth = () => {
        const inputRect = input.getBoundingClientRect?.();
        const hitzoneRect = hitzone.getBoundingClientRect?.();
        return Math.max(
            1,
            Number(inputRect?.width) || 0,
            Number(hitzoneRect?.width) || 0,
            expandedWidth
        );
    };

    const readValue = (clientX) => {
        if (!dragSession) return null;
        const dx = Number(clientX) - Number(dragSession.startX || 0);
        const range = Math.max(step, max - min);
        const deltaRatio = dx / Math.max(1, dragSession.trackWidth || expandedWidth);
        return quantizeSliderValue(Number(dragSession.startValue || initialValue) + (deltaRatio * range));
    };

    const begin = (event) => {
        if (Number(event?.button || 0) !== 0 || dragSession) return;
        stopAndPrevent(event);
        openForTransientDrag();
        dragSession = {
            pointerId: Number.isFinite(Number(event?.pointerId)) ? Number(event.pointerId) : null,
            startX: Number(event?.clientX) || 0,
            startValue: quantizeSliderValue(input.value),
            trackWidth: resolveTrackWidth(),
            moved: false
        };
        if (typeof onStart === 'function') {
            onStart({
                value: dragSession.startValue,
                pointerType: String(event?.pointerType || '').trim() || 'unknown'
            });
        }
        try {
            if (Number.isFinite(dragSession.pointerId)) {
                input.setPointerCapture?.(dragSession.pointerId);
            }
        } catch (_) { }
        if (typeof window !== 'undefined') {
            window.addEventListener('pointermove', onPointerMove, true);
            window.addEventListener('pointerup', onPointerUp, true);
            window.addEventListener('pointercancel', onPointerCancel, true);
        }
    };

    function onPointerMove(event) {
        if (!dragSession) return;
        if (Number.isFinite(dragSession.pointerId) && Number(event?.pointerId) !== dragSession.pointerId) return;
        const nextValue = readValue(event?.clientX);
        if (!Number.isFinite(nextValue)) return;
        dragSession.moved = true;
        stopAndPrevent(event);
        syncInputValue(nextValue, 'slider.direct.drag');
    }

    function onPointerUp(event) {
        if (!dragSession) return;
        if (Number.isFinite(dragSession.pointerId) && Number(event?.pointerId) !== dragSession.pointerId) return;
        const moved = dragSession.moved === true;
        let finalValue = quantizeSliderValue(input.value);
        if (moved) {
            stopAndPrevent(event);
            const nextValue = readValue(event?.clientX);
            finalValue = commitInputValue(Number.isFinite(nextValue) ? nextValue : input.value, 'slider.direct.drag');
        }
        clear();
        if (typeof onEnd === 'function') {
            onEnd({
                value: finalValue,
                cancelled: false,
                moved,
                pointerType: String(event?.pointerType || '').trim() || 'unknown'
            });
        }
        if (isPinned() !== true) collapseAfterTransientDrag();
    }

    function onPointerCancel(event) {
        if (!dragSession) return;
        if (Number.isFinite(dragSession.pointerId) && Number(event?.pointerId) !== dragSession.pointerId) return;
        stopAndPrevent(event);
        const moved = dragSession.moved === true;
        const finalValue = quantizeSliderValue(input.value);
        clear();
        if (typeof onEnd === 'function') {
            onEnd({
                value: finalValue,
                cancelled: true,
                moved,
                pointerType: String(event?.pointerType || '').trim() || 'unknown'
            });
        }
        if (isPinned() !== true) collapseAfterTransientDrag();
    }

    const bind = () => {
        hitzone.addEventListener('pointerdown', begin, true);
        input.addEventListener('pointerdown', begin, true);
    };

    return {
        bind,
        clear
    };
};

const mountIntuitionXSliderToolContent = ({
    button,
    contentHost = null,
    classNames = {},
    definition = {},
    collapsedWidthPx = null,
    expandedWidthPx = null,
    onInput = null,
    onChange = null,
    onExpandedChange = null,
    onUnitChange = null,
    onDragStart = null,
    onDragEnd = null,
    designTokens = {}
} = {}) => {
    if (!(button instanceof HTMLElement)) return null;
    const toolSizePx = Math.max(1, Math.round(toFiniteNumber(collapsedWidthPx, 57)));
    const expandedWidth = Math.max(toolSizePx, Math.round(toFiniteNumber(expandedWidthPx, Math.round(toolSizePx * 3))));
    const min = toFiniteNumber(definition.sliderMin, 0);
    const max = Math.max(min, toFiniteNumber(definition.sliderMax, 100));
    const step = Math.max(0.0001, toFiniteNumber(definition.sliderStep, 1));
    const initialValue = clamp(toFiniteNumber(definition.sliderValue, min), min, max);
    const label = ensureString(definition.label, 'tool');
    const colors = resolveDesignTokens(designTokens);

    let expanded = false;
    let expandedPinned = false;
    let currentUnit = ensureString(definition.sliderUnit, '');
    let valueEditorInput = null;
    let unitEditorSelect = null;
    let valueDragSession = null;
    let valueClickTimer = 0;
    let valueClickSuppressUntil = 0;
    let directSliderDragController = null;
    button.dataset.sliderCollapsedWidthPx = String(toolSizePx);
    button.dataset.sliderExpandedWidthPx = String(expandedWidth);
    button.dataset.sliderExpanded = 'false';

    const {
        shell,
        hitzone,
        input,
        labelEl,
        valueWrap,
        valueButton,
        unitButton
    } = createSliderToolElements({
        button,
        contentHost,
        classNames,
        min,
        max,
        step,
        initialValue,
        label,
        designTokens: colors
    });
    const stopBubble = (event) => {
        if (!event) return;
        event.stopPropagation?.();
    };
    const stopAndPrevent = (event) => {
        if (!event) return;
        event.preventDefault?.();
        event.stopPropagation?.();
    };
    const emitInput = (value, source = 'slider.input') => {
        if (typeof onInput !== 'function') return;
        onInput(value, {
            input,
            button,
            labelEl,
            valueButton,
            unitButton,
            unit: currentUnit,
            source
        });
    };
    const emitChange = (value, source = 'slider.change') => {
        if (typeof onChange !== 'function') return;
        onChange(value, {
            input,
            button,
            labelEl,
            valueButton,
            unitButton,
            unit: currentUnit,
            source
        });
    };
    const emitUnitChange = (unit, source = 'slider.unit.change') => {
        if (typeof onUnitChange !== 'function') return;
        onUnitChange(unit, {
            input,
            button,
            labelEl,
            valueButton,
            unitButton,
            unit,
            source
        });
    };
    const syncValueVisual = () => {
        const currentValue = clamp(toFiniteNumber(input.value, initialValue), min, max);
        valueButton.textContent = formatSliderValue({
            value: currentValue,
            step
        });
        const showUnit = expanded === true && ensureString(currentUnit, '') !== '';
        unitButton.textContent = currentUnit;
        setStyles(unitButton, {
            display: showUnit ? 'inline-flex' : 'none'
        });
    };
    const quantizeSliderValue = (raw) => {
        const clamped = clamp(toFiniteNumber(raw, initialValue), min, max);
        const steps = Math.round((clamped - min) / step);
        return clamp(min + (steps * step), min, max);
    };
    const destroyUnitEditor = () => {
        if (!unitEditorSelect) return;
        try { unitEditorSelect.remove(); } catch (_) { }
        unitEditorSelect = null;
        syncValueVisual();
    };
    const destroyValueEditor = () => {
        if (!valueEditorInput) return;
        try { valueEditorInput.remove(); } catch (_) { }
        valueEditorInput = null;
        setStyles(valueButton, {
            display: 'inline-flex'
        });
        syncValueVisual();
    };
    const clearValueClickTimer = () => {
        if (!valueClickTimer) return;
        clearTimeout(valueClickTimer);
        valueClickTimer = 0;
    };
    const applyExpandedState = (nextExpanded) => {
        const previousExpanded = expanded;
        expanded = nextExpanded === true;
        button.dataset.sliderExpanded = expanded ? 'true' : 'false';
        setStyles(button, {
            width: `${expanded ? expandedWidth : toolSizePx}px`,
            minWidth: `${expanded ? expandedWidth : toolSizePx}px`,
            maxWidth: `${expanded ? expandedWidth : toolSizePx}px`,
            zIndex: expanded ? '6' : ''
        });
        if (!expanded) {
            expandedPinned = false;
            directSliderDragController?.clear();
            destroyUnitEditor();
            destroyValueEditor();
        }
        syncValueVisual();
        if (previousExpanded !== expanded && typeof onExpandedChange === 'function') {
            onExpandedChange(expanded, {
                button,
                input,
                labelEl,
                valueButton,
                unitButton,
                shell,
                hitzone
            });
        }
    };
    const toggleExpanded = (event) => {
        stopAndPrevent(event);
        const nextExpanded = !expanded;
        expandedPinned = nextExpanded;
        applyExpandedState(nextExpanded);
    };
    const syncInputValue = (raw, source) => {
        const nextValue = quantizeSliderValue(raw);
        input.value = String(nextValue);
        syncValueVisual();
        emitInput(nextValue, source);
        return nextValue;
    };
    const commitInputValue = (raw, source) => {
        const nextValue = quantizeSliderValue(raw);
        input.value = String(nextValue);
        syncValueVisual();
        emitChange(nextValue, source);
        return nextValue;
    };
    directSliderDragController = createDirectSliderDragController({
        input,
        hitzone,
        expandedWidth,
        step,
        min,
        max,
        initialValue,
        quantizeSliderValue,
        syncInputValue,
        commitInputValue,
        isPinned: () => expandedPinned === true,
        openForTransientDrag: () => {
            if (expanded !== true) {
                expandedPinned = false;
            }
            applyExpandedState(true);
        },
        collapseAfterTransientDrag: () => applyExpandedState(false),
        stopAndPrevent,
        onStart: ({ value, pointerType }) => {
            if (typeof onDragStart !== 'function') return;
            onDragStart(value, {
                input,
                button,
                labelEl,
                valueButton,
                unitButton,
                unit: currentUnit,
                pointerType,
                source: 'slider.direct.drag'
            });
        },
        onEnd: ({ value, cancelled, moved, pointerType }) => {
            if (typeof onDragEnd !== 'function') return;
            onDragEnd(value, {
                input,
                button,
                labelEl,
                valueButton,
                unitButton,
                unit: currentUnit,
                cancelled: cancelled === true,
                moved: moved === true,
                pointerType,
                source: 'slider.direct.drag'
            });
        }
    });
    const clearValueDragSession = () => {
        if (!valueDragSession || typeof window === 'undefined') {
            valueDragSession = null;
            return;
        }
        window.removeEventListener('pointermove', onValuePointerMove, true);
        window.removeEventListener('pointerup', onValuePointerUp, true);
        window.removeEventListener('pointercancel', onValuePointerCancel, true);
        try {
            if (Number.isFinite(valueDragSession.pointerId)) {
                valueButton.releasePointerCapture?.(valueDragSession.pointerId);
            }
        } catch (_) { }
        valueDragSession = null;
    };
    const readDraggedValue = (clientX, clientY) => {
        if (!valueDragSession) return null;
        const dx = Number(clientX) - Number(valueDragSession.startX || 0);
        const dy = Number(clientY) - Number(valueDragSession.startY || 0);
        const range = Math.max(step, max - min);
        const pxForRange = Math.max(96, expandedWidth);
        const deltaRatio = (dx - dy) / pxForRange;
        return quantizeSliderValue(Number(valueDragSession.startValue || initialValue) + (deltaRatio * range));
    };
    function onValuePointerMove(event) {
        if (!valueDragSession) return;
        if (Number.isFinite(valueDragSession.pointerId) && Number(event?.pointerId) !== valueDragSession.pointerId) return;
        const dx = Number(event?.clientX) - Number(valueDragSession.startX || 0);
        const dy = Number(event?.clientY) - Number(valueDragSession.startY || 0);
        if (!valueDragSession.moved && Math.hypot(dx, dy) < 4) return;
        valueDragSession.moved = true;
        stopAndPrevent(event);
        const nextValue = readDraggedValue(event?.clientX, event?.clientY);
        if (!Number.isFinite(nextValue)) return;
        syncInputValue(nextValue, 'slider.value.drag');
    }
    function onValuePointerUp(event) {
        if (!valueDragSession) return;
        if (Number.isFinite(valueDragSession.pointerId) && Number(event?.pointerId) !== valueDragSession.pointerId) return;
        const moved = valueDragSession.moved === true;
        if (moved) {
            stopAndPrevent(event);
            const nextValue = readDraggedValue(event?.clientX, event?.clientY);
            if (Number.isFinite(nextValue)) {
                commitInputValue(nextValue, 'slider.value.drag');
            } else {
                commitInputValue(input.value, 'slider.value.drag');
            }
            valueClickSuppressUntil = Date.now() + 260;
        }
        clearValueDragSession();
    }
    function onValuePointerCancel(event) {
        if (!valueDragSession) return;
        if (Number.isFinite(valueDragSession.pointerId) && Number(event?.pointerId) !== valueDragSession.pointerId) return;
        stopAndPrevent(event);
        clearValueDragSession();
    }
    const beginValueEditor = (event) => {
        stopAndPrevent(event);
        clearValueClickTimer();
        clearValueDragSession();
        expandedPinned = expandedPinned || expanded === true;
        destroyUnitEditor();
        if (valueEditorInput) return;
        const currentValue = clamp(toFiniteNumber(input.value, initialValue), min, max);
        setStyles(valueButton, {
            display: 'none'
        });
        valueEditorInput = createNode('input', {
            parent: valueWrap,
            attrs: {
                'data-role': 'eve_intuitionx-slider-value-input',
                type: 'number',
                min: String(min),
                max: String(max),
                step: String(step),
                value: String(currentValue)
            },
            css: {
                width: '72px',
                minWidth: '52px',
                fontSize: '11px',
                lineHeight: '1',
                fontWeight: '600',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                textAlign: 'right',
                color: colors.textMain,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '5px',
                padding: '2px 4px',
                outline: 'none'
            }
        });
        addOptionalClassNames(valueEditorInput, classNames.valueEditorInput);
        const commit = () => {
            if (!valueEditorInput) return;
            const raw = valueEditorInput.value;
            destroyValueEditor();
            const nextValue = commitInputValue(raw, 'slider.value.change');
            emitInput(nextValue, 'slider.value.input');
        };
        valueEditorInput.addEventListener('pointerdown', stopBubble, true);
        valueEditorInput.addEventListener('click', stopBubble, true);
        valueEditorInput.addEventListener('input', (evt) => {
            stopBubble(evt);
        }, true);
        valueEditorInput.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter') {
                stopAndPrevent(evt);
                commit();
                return;
            }
            if (evt.key === 'Escape') {
                stopAndPrevent(evt);
                destroyValueEditor();
                return;
            }
            stopBubble(evt);
        }, true);
        valueEditorInput.addEventListener('blur', () => commit(), true);
        try {
            valueEditorInput.focus();
            valueEditorInput.select();
        } catch (_) { }
    };
    const beginUnitEditor = (event) => {
        stopAndPrevent(event);
        clearValueClickTimer();
        expandedPinned = true;
        applyExpandedState(true);
        clearValueDragSession();
        destroyValueEditor();
        if (unitEditorSelect) return;
        const options = normalizeUnitOptions(definition, currentUnit);
        if (options.length <= 1) return;
        unitEditorSelect = createNode('select', {
            parent: valueWrap,
            attrs: {
                'data-role': 'eve_intuitionx-slider-unit-select'
            },
            css: {
                minWidth: '52px',
                fontSize: '11px',
                lineHeight: '1',
                fontWeight: '600',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: colors.textMain,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '5px',
                padding: '2px 4px',
                outline: 'none'
            }
        });
        addOptionalClassNames(unitEditorSelect, classNames.unitEditorSelect);
        options.forEach((entry) => {
            createNode('option', {
                parent: unitEditorSelect,
                text: entry.label,
                attrs: {
                    value: entry.value,
                    ...(entry.value === currentUnit ? { selected: true } : {})
                }
            });
        });
        setStyles(unitButton, {
            display: 'none'
        });
        const commit = () => {
            if (!unitEditorSelect) return;
            currentUnit = ensureString(unitEditorSelect.value, currentUnit);
            destroyUnitEditor();
            syncValueVisual();
            emitUnitChange(currentUnit, 'slider.unit.change');
        };
        unitEditorSelect.addEventListener('pointerdown', stopBubble, true);
        unitEditorSelect.addEventListener('click', stopBubble, true);
        unitEditorSelect.addEventListener('change', (evt) => {
            stopBubble(evt);
            commit();
        }, true);
        unitEditorSelect.addEventListener('blur', () => commit(), true);
        try {
            unitEditorSelect.focus();
        } catch (_) { }
    };
    directSliderDragController.bind();
    hitzone.addEventListener('click', stopAndPrevent, true);
    input.addEventListener('click', stopAndPrevent, true);
    input.addEventListener('input', (event) => {
        stopBubble(event);
        syncInputValue(input.value, 'slider.input');
    }, true);
    input.addEventListener('change', (event) => {
        stopBubble(event);
        commitInputValue(input.value, 'slider.change');
    }, true);
    labelEl.addEventListener('click', toggleExpanded, true);
    valueWrap.addEventListener('click', (event) => {
        if (event.target === valueButton) return;
        if (event.target === unitButton || event.target === unitEditorSelect || event.target === valueEditorInput) return;
        toggleExpanded(event);
    }, true);
    valueButton.addEventListener('pointerdown', (event) => {
        if (expanded !== true) return;
        stopBubble(event);
        destroyUnitEditor();
        destroyValueEditor();
        clearValueDragSession();
        valueDragSession = {
            pointerId: Number.isFinite(Number(event?.pointerId)) ? Number(event.pointerId) : null,
            startX: Number(event?.clientX) || 0,
            startY: Number(event?.clientY) || 0,
            startValue: quantizeSliderValue(input.value),
            moved: false
        };
        try {
            if (Number.isFinite(valueDragSession.pointerId)) {
                valueButton.setPointerCapture?.(valueDragSession.pointerId);
            }
        } catch (_) { }
        if (typeof window !== 'undefined') {
            window.addEventListener('pointermove', onValuePointerMove, true);
            window.addEventListener('pointerup', onValuePointerUp, true);
            window.addEventListener('pointercancel', onValuePointerCancel, true);
        }
    }, true);
    valueButton.addEventListener('click', (event) => {
        stopAndPrevent(event);
        if (Date.now() < valueClickSuppressUntil) return;
        if (Number(event?.detail) > 1) return;
        clearValueClickTimer();
        valueClickTimer = window.setTimeout(() => {
            valueClickTimer = 0;
            if (valueEditorInput || unitEditorSelect) return;
            expandedPinned = expanded !== true;
            applyExpandedState(!expanded);
        }, VALUE_DOUBLE_CLICK_GUARD_MS);
    }, true);
    valueButton.addEventListener('dblclick', beginValueEditor, true);
    unitButton.addEventListener('click', beginUnitEditor, true);
    applyExpandedState(false);
    syncValueVisual();
    return {
        input,
        labelEl,
        valueEl: valueButton,
        unitEl: unitButton,
        get expanded() {
            return expanded;
        },
        setExpanded: applyExpandedState,
        syncValueVisual
    };
};

const ToolSlider = {
    CANONICAL_SLIDER_TOOL_HITZONE_SELECTOR,
    CANONICAL_SLIDER_TOOL_INPUT_SELECTOR,
    CANONICAL_SLIDER_TOOL_SHELL_SELECTOR,
    CANONICAL_SLIDER_TOOL_VALUE_INPUT_SELECTOR,
    CANONICAL_SLIDER_TOOL_VALUE_SELECTOR,
    createDirectSliderDragController,
    createSliderToolElements,
    formatSliderValue,
    mountIntuitionXSliderToolContent
};

export {
    CANONICAL_SLIDER_TOOL_HITZONE_SELECTOR,
    CANONICAL_SLIDER_TOOL_INPUT_SELECTOR,
    CANONICAL_SLIDER_TOOL_SHELL_SELECTOR,
    CANONICAL_SLIDER_TOOL_VALUE_INPUT_SELECTOR,
    CANONICAL_SLIDER_TOOL_VALUE_SELECTOR,
    ToolSlider,
    createDirectSliderDragController,
    createSliderToolElements,
    formatSliderValue,
    mountIntuitionXSliderToolContent
};

export default ToolSlider;