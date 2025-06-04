'use strict';

function checkFrameworkLoaded() {
    if (typeof window.defineParticle !== 'function') {
        setTimeout(checkFrameworkLoaded, 50);
        return;
    }
    initParticlesExtension();
}

function initParticlesExtension() {
        function common_treatment(el, v, prop) {
            // console.log(`🔥 [COMMON] Processing property: ${prop}, value:`, v, el);
            // console.log('-----------------');
        }

        // Test particle for 'role'
        window.defineParticle({
            name: 'role',
            type: 'string',
            category: 'attribute',
            process(el, v) {
                common_treatment(el, v, 'role');
                el.setAttribute('role', v);
            }
        });

        // SECTION 1: CSS PROPERTIES
        const nativeStyleProps = [
            'alignContent', 'alignItems', 'alignSelf', 'animation', 'animationDelay', 'animationDirection', 'animationDuration',
            'animationFillMode', 'animationIterationCount', 'animationName', 'animationPlayState', 'animationTimingFunction',
            'backfaceVisibility', 'background', 'backgroundAttachment', 'backgroundBlendMode', 'backgroundClip',
            'backgroundColor', 'backgroundImage', 'backgroundOrigin', 'backgroundPosition', 'backgroundRepeat',
            'backgroundSize', 'border', 'borderBottom', 'borderBottomColor', 'borderBottomLeftRadius', 'borderBottomRightRadius',
            'borderBottomStyle', 'borderBottomWidth', 'borderCollapse', 'borderColor', 'borderImage', 'borderImageOutset',
            'borderImageRepeat', 'borderImageSlice', 'borderImageSource', 'borderImageWidth', 'borderLeft', 'borderLeftColor',
            'borderLeftStyle', 'borderLeftWidth', 'borderRadius', 'borderRight', 'borderRightColor', 'borderRightStyle',
            'borderRightWidth', 'borderSpacing', 'borderStyle', 'borderTop', 'borderTopColor', 'borderTopLeftRadius',
            'borderTopRightRadius', 'borderTopStyle', 'borderTopWidth', 'borderWidth', 'bottom', 'boxShadow', 'boxSizing',
            'captionSide', 'clear', 'clip', 'color', 'columnCount', 'columnFill', 'columnGap', 'columnRule', 'columnRuleColor',
            'columnRuleStyle', 'columnRuleWidth', 'columns', 'columnSpan', 'columnWidth', 'content', 'counterIncrement',
            'counterReset', 'cursor', 'direction', 'display', 'emptyCells', 'filter', 'flex', 'flexBasis', 'flexDirection',
            'flexFlow', 'flexGrow', 'flexShrink', 'flexWrap', 'float', 'font', 'fontFamily', 'fontFeatureSettings', 'fontKerning',
            'fontSize', 'fontSizeAdjust', 'fontStretch', 'fontStyle', 'fontVariant', 'fontVariantCaps', 'fontWeight', 'gap',
            'grid', 'gridArea', 'gridAutoColumns', 'gridAutoFlow', 'gridAutoRows', 'gridColumn', 'gridColumnEnd', 'gridColumnGap',
            'gridColumnStart', 'gridGap', 'gridRow', 'gridRowEnd', 'gridRowGap', 'gridRowStart', 'gridTemplate',
            'gridTemplateAreas', 'gridTemplateColumns', 'gridTemplateRows', 'height', 'justifyContent', 'left', 'letterSpacing',
            'lineHeight', 'listStyle', 'listStyleImage', 'listStylePosition', 'listStyleType', 'margin', 'marginBottom',
            'marginLeft', 'marginRight', 'marginTop', 'maxHeight', 'maxWidth', 'minHeight', 'minWidth', 'objectFit',
            'objectPosition', 'opacity', 'order', 'outline', 'outlineColor', 'outlineOffset', 'outlineStyle', 'outlineWidth',
            'overflow', 'overflowX', 'overflowY', 'padding', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingTop',
            'pageBreakAfter', 'pageBreakBefore', 'pageBreakInside', 'perspective', 'perspectiveOrigin', 'pointerEvents',
            'position', 'quotes', 'resize', 'right', 'rowGap', 'scrollBehavior', 'tabSize', 'tableLayout', 'textAlign',
            'textAlignLast', 'textDecoration', 'textDecorationColor', 'textDecorationLine', 'textDecorationStyle',
            'textIndent', 'textJustify', 'textOverflow', 'textShadow', 'textTransform', 'top', 'transform', 'transformOrigin',
            'transformStyle', 'transition', 'transitionDelay', 'transitionDuration', 'transitionProperty',
            'transitionTimingFunction', 'unicodeBidi', 'userSelect', 'verticalAlign', 'visibility', 'whiteSpace', 'width',
            'wordBreak', 'wordSpacing', 'wordWrap', 'zIndex'
        ];

        const dimensionalProps = new Set(['Width', 'Height', 'Top', 'Left', 'Bottom', 'Right', 'Margin', 'Padding', 'Indent', 'Radius', 'fontSize', 'lineHeight', 'gap', 'Gap']);
        const existingCssParticles = ['width', 'height', 'color', 'backgroundColor', 'x', 'y', 'overflow'];

        function needsPx(prop) {
            if (prop === 'fontSize' || prop === 'lineHeight') return true;
            if (prop === 'gap') return true;
            for (const dimProp of dimensionalProps) {
                if (prop.includes(dimProp)) return true;
            }
            return false;
        }

        nativeStyleProps.forEach(prop => {
       
            if (existingCssParticles.includes(prop)) return;
     console.log(`🔥uglly patch remove asap, for now when removed this method overrides the atome particle, this is not what we want`);
            window.defineParticle({
                name: prop,
                type: 'any',
                category: 'css',
                process(el, v) {
                    common_treatment(el, v, prop);
                    if (typeof v === 'number') {
                        el.style[prop] = needsPx(prop) ? `${v}px` : v;
                    } else {
                        el.style[prop] = v;
                    }
                }
            });
        });

        // SECTION 2: HTML ATTRIBUTES
        const nativeHTMLAttributes = [
            'accesskey', 'autocapitalize', 'class', 'contenteditable', 'contextmenu', 'dir', 'draggable', 'hidden',
            'lang', 'spellcheck', 'style', 'tabindex', 'title', 'translate', 'src', 'href', 'alt', 'type', 'value', 'name',
            'placeholder', 'disabled', 'checked', 'readonly', 'multiple', 'required', 'maxlength', 'minlength', 'pattern',
            'step', 'min', 'max', 'width', 'height', 'autofocus', 'controls', 'download', 'form', 'formaction', 'formenctype',
            'formmethod', 'formnovalidate', 'formtarget', 'label', 'list', 'target'
        ];

        nativeHTMLAttributes.forEach(attr => {
            const particleName = `attr${attr.charAt(0).toUpperCase() + attr.slice(1)}`;
            window.defineParticle({
                name: particleName,
                type: 'any',
                category: 'attribute',
                process(el, v) {
                    common_treatment(el, v, particleName);
                    if (v === null || v === undefined) {
                        el.removeAttribute(attr);
                    } else if (v === true) {
                        el.setAttribute(attr, '');
                    } else if (v === false) {
                        el.removeAttribute(attr);
                    } else {
                        el.setAttribute(attr, v);
                    }
                }
            });
        });

        // SECTION 3: DOM PROPERTIES
        const nativeDOMProperties = [
            'accessKey', 'attributes', 'baseURI', 'childElementCount', 'childNodes', 'children', 'classList', 'className',
            'clientHeight', 'clientLeft', 'clientTop', 'clientWidth', 'contentEditable', 'dataset', 'dir', 'firstChild',
            'firstElementChild', 'hidden', 'innerHTML', 'innerText', 'lang', 'lastChild', 'lastElementChild', 'localName',
            'namespaceURI', 'nextSibling', 'nextElementSibling', 'nodeName', 'nodeType', 'nodeValue', 'offsetHeight',
            'offsetLeft', 'offsetParent', 'offsetTop', 'offsetWidth', 'ownerDocument', 'parentElement', 'parentNode',
            'previousSibling', 'previousElementSibling', 'scrollHeight', 'scrollLeft', 'scrollTop', 'scrollWidth',
            'tabIndex', 'tagName', 'textContent', 'title'
        ];

        const readOnlyProps = new Set([
            'attributes', 'baseURI', 'childElementCount', 'childNodes', 'children', 'clientHeight', 'clientLeft',
            'clientTop', 'clientWidth', 'firstChild', 'firstElementChild', 'lastChild', 'lastElementChild', 'localName',
            'namespaceURI', 'nextSibling', 'nextElementSibling', 'nodeName', 'nodeType', 'offsetHeight', 'offsetLeft',
            'offsetParent', 'offsetTop', 'offsetWidth', 'ownerDocument', 'parentElement', 'parentNode', 'previousSibling',
            'previousElementSibling', 'scrollHeight', 'scrollWidth', 'tagName'
        ]);

        nativeDOMProperties.forEach(prop => {
            if (readOnlyProps.has(prop)) return;
            const particleName = `prop${prop.charAt(0).toUpperCase() + prop.slice(1)}`;
            window.defineParticle({
                name: particleName,
                type: 'any',
                category: 'property',
                process(el, v) {
                    common_treatment(el, v, particleName);
                    if (prop === 'classList' && Array.isArray(v)) {
                        el.className = v.join(' ');
                    } else if (prop === 'dataset' && typeof v === 'object' && v !== null) {
                        const dataset = el.dataset;
                        for (const key in v) {
                            dataset[key] = v[key];
                        }
                    } else {
                        el[prop] = v;
                    }
                }
            });
        });

        // SECTION 4: SPECIAL PARTICLES
        window.defineParticle({
            name: 'class',
            type: 'any',
            category: 'attribute',
            process(el, v) {
                common_treatment(el, v, 'class');
                if (typeof v === 'string') {
                    el.className = v;
                } else if (Array.isArray(v)) {
                    el.className = v.join(' ');
                } else if (v && typeof v === 'object') {
                    const classList = el.classList;
                    for (const className in v) {
                        v[className] ? classList.add(className) : classList.remove(className);
                    }
                }
            }
        });

        window.defineParticle({
            name: 'text',
            type: 'string',
            category: 'content',
            process(el, v) {
                common_treatment(el, v, 'text');
                el.textContent = v;
            }
        });

        window.defineParticle({
            name: 'html',
            type: 'string',
            category: 'content',
            process(el, v) {
                common_treatment(el, v, 'html');
                el.innerHTML = v;
            }
        });

        window.defineParticle({
            name: 'on',
            type: 'object',
            category: 'event',
            process(el, v) {
                common_treatment(el, v, 'on'); // Fixed: was 'eventName', now 'on'
                if (!v || typeof v !== 'object') return;
                for (const eventName in v) {
                    const handler = v[eventName];
                    if (typeof handler !== 'function') continue;
                    const handlerKey = `_a_${eventName}`;
                    if (el[handlerKey]) {
                        el.removeEventListener(eventName, el[handlerKey]);
                    }
                    el[handlerKey] = handler;
                    el.addEventListener(eventName, handler);
                }
            }
        });

        // SECTION 5: INDIVIDUAL EVENT PARTICLES
        const commonEvents = [
            'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
            'onmouseout', 'onmousemove', 'onkeydown', 'onkeyup', 'onkeypress',
            'onfocus', 'onblur', 'onchange', 'oninput', 'onsubmit'
        ];

        commonEvents.forEach(eventName => {
            window.defineParticle({
                name: eventName,
                type: 'function',
                category: 'event',
                process(el, handler) {
                    common_treatment(el, handler, eventName); // Added common_treatment call
                    if (typeof handler === 'function') {
                        el[eventName] = handler;
                    }
                }
            });
        });

        window.dispatchEvent(new CustomEvent('ParticlesExtensionLoaded'));
    }

    // Listen for framework loading or start immediately
    if (window.A && window.defineParticle) {
        initParticlesExtension();
    } else {
        window.addEventListener('AFrameworkLoaded', () => {
            initParticlesExtension();
        });
        // Fallback: polling check
        checkFrameworkLoaded();
    }

// Utility functions
function kebabToCamel(str) {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

function camelToKebab(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function toCamelCase(str) {
    return str.replace(/[-_](.)/g, (_, group1) => group1.toUpperCase());
}

function toKebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

// Export utilities for ES6 compatibility
const utils = {
    checkFrameworkLoaded,
    initParticlesExtension,
    kebabToCamel,
    camelToKebab,
    toCamelCase,
    toKebabCase
};

export default utils;

// Maintain global compatibility
if (typeof window !== 'undefined') {
    window.utils = utils;
}

// Initialize utilities
checkFrameworkLoaded();

