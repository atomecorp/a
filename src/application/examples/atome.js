

// const atomeDefaultsParams = {
//     left: '0',
//     top: '0',
//     width: '69',
//     height: '69',
//     content: '',
//     text: '',
//     tag: 'default',
//     background: '#272727',
//     color: 'lightgray',
//     units: { left: 'px', top: 'px', width: 'px', height: 'px' }
// };
// const hasOwn = Object.prototype.hasOwnProperty;
// let atomeIdCounter = 0;

// function resolveParent(candidate) {
//     const selector = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : '#view';
//     if (typeof document !== 'undefined' && document.querySelector(selector)) return selector;
//     return 'body';
// }

// function normalizeStyleValue(key, value, units) {
//     if (value === null || value === undefined) return undefined;
//     if (typeof value === 'number' && units && hasOwn.call(units, key)) {
//         const unit = units[key];
//         if (typeof unit === 'string' && unit.length) {
//             return `${value}${unit}`;
//         }
//         return `${value}`;
//     }
//     return value;
// }

// function Atome(params = {}) {
//     if (!(this instanceof Atome)) return new Atome(params);

//     const config = { ...params };
//     const { units = {}, parent, id, text, content, tag, ...styleProps } = config;

//     const trimmedUnits = {};
//     for (const key in units) {
//         if (!hasOwn.call(units, key)) continue;
//         const raw = units[key];
//         if (typeof raw === 'string') {
//             const trimmed = raw.trim();
//             if (trimmed.length) {
//                 trimmedUnits[key] = trimmed;
//                 continue;
//             }
//         }
//         trimmedUnits[key] = raw;
//     }

//     const elementId = id || `atome_${++atomeIdCounter}`;
//     const displayText = text ?? content ?? '';

//     const styles = {};
//     for (const key in styleProps) {
//         if (!hasOwn.call(styleProps, key)) continue;
//         const normalized = normalizeStyleValue(key, styleProps[key], trimmedUnits);
//         if (normalized !== undefined) styles[key] = normalized;
//     }

//     const element = $('div', {
//         id: elementId,
//         parent: resolveParent(parent),
//         css: styles,
//         text: displayText
//     });

//     if (element && element.dataset && tag !== undefined) element.dataset.tag = tag;

//     Object.assign(this, config, { element });
//     return this;
// }

// if (typeof globalThis !== 'undefined') {
//     globalThis.Atome = Atome;
//     globalThis.atomeDefaultsParams = atomeDefaultsParams;
// }

const demoAtome = new Atome({
    width: 100,
    height: 100,
    units: { width: 'px', height: 'px', left: 'px', top: 'px' },
    left: 20,
    top: 20,
    background: '#ff6f61',
    color: '#1d1d1f',
    display: 'flex',
    position: 'relative',
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
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '12px',
    boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
    tag: 'blue',
    text: 'we are cool'
});



function box(params = atomeDefaultsParams) {
    return new Atome({ ...atomeDefaultsParams, ...params });
}


box({
    left: 250,
    top: 150,
    width: 150,
    height: 150,
    background: 'green',
    color: 'white',
    display: 'flex',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '12px',
    boxShadow: '0 10px 24px rgba(0,0,0,0.99)'
});
