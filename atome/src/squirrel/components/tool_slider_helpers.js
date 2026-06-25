// Extracted from tool_slider_builder.js: constants, canonical selectors, and pure helpers
// (number/format/unit utilities + createNode/setStyles DOM helpers + design-token resolver).
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


const stopBubble = (event) => {
  if (!event) return;
  event.stopPropagation?.();
};
const stopAndPrevent = (event) => {
  if (!event) return;
  event.preventDefault?.();
  event.stopPropagation?.();
};

export {
  VALUE_DOUBLE_CLICK_GUARD_MS,
  CANONICAL_SLIDER_TOOL_SHELL_SELECTOR, CANONICAL_SLIDER_TOOL_HITZONE_SELECTOR,
  CANONICAL_SLIDER_TOOL_INPUT_SELECTOR, CANONICAL_SLIDER_TOOL_VALUE_SELECTOR,
  CANONICAL_SLIDER_TOOL_VALUE_INPUT_SELECTOR,
  ensureString, toFiniteNumber, clamp, formatSliderValue, normalizeUnitOptions,
  addOptionalClassNames, createNode, setStyles, resolveDesignTokens,
  stopBubble, stopAndPrevent
};
