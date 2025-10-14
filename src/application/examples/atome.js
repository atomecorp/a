

const DefaultsParams = {
    // left: '0',
    // top: '0',
    // width: '100',
    // height: '100',
    // content: '',
    // text: '',
    // tag: 'default',
    // background: 'red',
    // color: 'yellow',
    // units: { left: 'px', top: 'px', width: 'px', height: 'px' }
};
function resolveParent(candidate) {
    const selector = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : '#view';
    if (typeof document !== 'undefined' && document.querySelector(selector)) return selector;
    return 'body';
}

function normalizeStyleValue(key, value, units) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'number' && units && typeof units[key] === 'string') {
        const unit = units[key].trim();
        return unit ? `${value}${unit}` : `${value}`;
    }
    return value;
}

function Atome(params = {}) {
    if (!(this instanceof Atome)) return new Atome(params);

    const config = { ...DefaultsParams, ...(params || {}) };
    const { units = {}, parent, id, text, content, tag, ...styleProps } = config;

    const elementId = id || `atome_${Date.now()}`;
    const displayText = text ?? content ?? '';

    const styles = {};
    Object.keys(styleProps).forEach((key) => {
        const normalized = normalizeStyleValue(key, styleProps[key], units);
        if (normalized !== undefined) styles[key] = normalized;
    });

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

const demoAtome = new Atome({
    width: 100,
    height: 100,
    units: { width: 'px', height: 'px', left: 'px', top: 'px' },
    left: 20,
    top: 20,
    background: '#ff6f61',
    color: '#1d1d1f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '12px',
    tag: 'red',
    text: 'super'
});

const demo2 = new Atome({
    width: 300,
    height: 100,
    units: { width: 'px', height: '%', left: 'px', top: 'px' },
    left: 120,
    top: 0,
    background: '#2d9cdb',
    color: '#fefefe',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '12px',
    boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
    tag: 'blue',
    text: 'we are cool'
});