const atomeDefaultsParams = {
    left: '0',
    top: '0',
    width: '69',
    height: '69',
    content: '',
    text: '',
    tag: 'default',
    background: '#272727',
    color: 'lightgray',
    units: { left: 'px', top: 'px', width: 'px', height: 'px' }
};
const hasOwn = Object.prototype.hasOwnProperty;
const DEFAULT_UNIT_PROPS = new Set([
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
    'minWidth',
    'minHeight',
    'maxWidth',
    'maxHeight',
    'margin',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft'
]);
let atomeIdCounter = 0;

function resolveParent(candidate) {
    const selector = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : '#view';
    if (typeof document !== 'undefined' && document.querySelector(selector)) return selector;
    return 'body';
}

function normalizeStyleValue(key, value, units) {
    if (value === null || value === undefined) return undefined;

    const resolveUnit = () => {
        if (units && hasOwn.call(units, key)) {
            const unit = units[key];
            if (typeof unit === 'string') {
                const trimmed = unit.trim();
                if (trimmed.length) return trimmed;
            }
        }
        return DEFAULT_UNIT_PROPS.has(key) ? 'px' : '';
    };

    if (typeof value === 'number') {
        const unit = resolveUnit();
        return unit ? `${value}${unit}` : `${value}`;
    }

    if (typeof value === 'string') {
        const trimmedValue = value.trim();
        if (!trimmedValue.length) return undefined;
        if (DEFAULT_UNIT_PROPS.has(key)) {
            const numeric = Number(trimmedValue);
            if (!Number.isNaN(numeric)) {
                const unit = resolveUnit();
                return unit ? `${numeric}${unit}` : `${numeric}`;
            }
        }
        return trimmedValue;
    }

    return value;
}

function Atome(params = {}) {
    if (!(this instanceof Atome)) return new Atome(params);

    const config = { ...params };
    const { units = {}, parent, id, text, content, tag, ...styleProps } = config;

    const trimmedUnits = {};
    for (const key in units) {
        if (!hasOwn.call(units, key)) continue;
        const raw = units[key];
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (trimmed.length) {
                trimmedUnits[key] = trimmed;
                continue;
            }
        }
        trimmedUnits[key] = raw;
    }

    const elementId = id || `atome_${++atomeIdCounter}`;
    const displayText = text ?? content ?? '';

    const styles = {};
    for (const key in styleProps) {
        if (!hasOwn.call(styleProps, key)) continue;
        const normalized = normalizeStyleValue(key, styleProps[key], trimmedUnits);
        if (normalized !== undefined) styles[key] = normalized;
    }

    const element = $('div', {
        id: elementId,
        parent: resolveParent(parent),
        css: styles,
        text: displayText
    });

    if (element && element.dataset && tag !== undefined) element.dataset.tag = tag;

    Object.assign(this, config, { element });
    return this;
}

if (typeof globalThis !== 'undefined') {
    globalThis.Atome = Atome;
    globalThis.atomeDefaultsParams = atomeDefaultsParams;
}