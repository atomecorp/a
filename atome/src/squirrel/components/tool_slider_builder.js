import { $ } from '../squirrel.js';
import { createSliderToolElements } from './tool_slider_elements.js';
import { createDirectSliderDragController } from './tool_slider_drag.js';
import { createSliderEmitters } from './tool_slider_emit.js';
import {
  VALUE_DOUBLE_CLICK_GUARD_MS,
  CANONICAL_SLIDER_TOOL_SHELL_SELECTOR, CANONICAL_SLIDER_TOOL_HITZONE_SELECTOR,
  CANONICAL_SLIDER_TOOL_INPUT_SELECTOR, CANONICAL_SLIDER_TOOL_VALUE_SELECTOR,
  CANONICAL_SLIDER_TOOL_VALUE_INPUT_SELECTOR,
  ensureString, toFiniteNumber, clamp, formatSliderValue, normalizeUnitOptions,
  addOptionalClassNames, createNode, setStyles, resolveDesignTokens, stopBubble, stopAndPrevent
} from './tool_slider_helpers.js';

const mountIntuitionXSliderToolContent = ({
    button,
    contentHost = null,
    classNames = {},
    definition = {},
    orientation = 'horizontal',
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
    const resolvedOrientation = String(orientation || definition?.orientation || 'horizontal').trim().toLowerCase() === 'vertical'
        ? 'vertical'
        : 'horizontal';
    const vertical = resolvedOrientation === 'vertical';
    const toolSizePx = Math.max(1, Math.round(toFiniteNumber(collapsedWidthPx, 57)));
    const expandedLength = Math.max(toolSizePx, Math.round(toFiniteNumber(expandedWidthPx, Math.round(toolSizePx * 3))));
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
    button.dataset.sliderExpandedWidthPx = String(vertical ? toolSizePx : expandedLength);
    button.dataset.sliderCollapsedHeightPx = String(toolSizePx);
    button.dataset.sliderExpandedHeightPx = String(vertical ? expandedLength : toolSizePx);
    button.dataset.sliderOrientation = resolvedOrientation;
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
        orientation: resolvedOrientation,
        designTokens: colors
    });
    const { emitInput, emitChange, emitUnitChange } = createSliderEmitters({
        onInput, onChange, onUnitChange, input, button, labelEl, valueButton, unitButton,
        getUnit: () => currentUnit
    });
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
            width: `${vertical ? toolSizePx : (expanded ? expandedLength : toolSizePx)}px`,
            minWidth: `${vertical ? toolSizePx : (expanded ? expandedLength : toolSizePx)}px`,
            maxWidth: `${vertical ? toolSizePx : (expanded ? expandedLength : toolSizePx)}px`,
            height: `${vertical ? (expanded ? expandedLength : toolSizePx) : toolSizePx}px`,
            minHeight: `${vertical ? (expanded ? expandedLength : toolSizePx) : toolSizePx}px`,
            maxHeight: `${vertical ? (expanded ? expandedLength : toolSizePx) : toolSizePx}px`,
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
        expandedLength,
        orientation: resolvedOrientation,
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
        const pxForRange = Math.max(96, expandedLength);
        const deltaRatio = (vertical ? -dy : (dx - dy)) / pxForRange;
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
