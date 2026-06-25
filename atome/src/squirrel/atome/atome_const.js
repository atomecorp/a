// Extracted from atome.js: shared constants/aliases.


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
    'paddingLeft',
    'borderRadius',
    'borderWidth',
    'fontSize',
    'lineHeight',
    'letterSpacing',
    'gap'
]);

const GLOBAL_STYLE_ALIASES = {
    align: 'alignItems',
    alignItems: 'alignItems',
    alignment: 'alignItems',
    justify: 'justifyContent',
    justifyContent: 'justifyContent',
    justification: 'justifyContent',
    justif: 'justifyContent',
    smooth: 'borderRadius',
    smmooth: 'borderRadius',
    radius: 'borderRadius',
    round: 'borderRadius',
    backgroundColor: 'background',
    bg: 'background',
    shadow: 'boxShadow',
    boxShadow: 'boxShadow',
    glow: 'boxShadow',
    color: 'background'
};


export {
    atomeDefaultsParams, hasOwn, DEFAULT_UNIT_PROPS, GLOBAL_STYLE_ALIASES
};
