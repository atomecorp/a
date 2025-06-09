/**
 * 🚀 OPTIMIZED PARTICLES - Refactored using ParticleFactory
 * Eliminates code duplication and improves performance
 */

import { ParticleFactory } from '../utils/particle-factory.js';

// === STRUCTURAL PARTICLES ===
ParticleFactory.batch([
    {
        name: 'id',
        type: 'string',
        category: 'structural',
        process(el, v, _, instance) {
            el.id = v;
            if (v) _registry[v] = instance;
        }
    },
    {
        name: 'markup',
        type: 'string',
        category: 'structural',
        process(el, v, data, instance) {
            if (!v || typeof v !== 'string') return;
            const newEl = document.createElement(v);
            for (const attr of el.attributes) {
                newEl.setAttribute(attr.name, attr.value);
            }
            newEl.style.cssText = el.style.cssText;
            instance.element = newEl;
        }
    },
    {
        name: 'attach',
        type: 'any',
        category: 'structural',
        process(el, v, _, instance) {
            instance._handleAttach(v);
        }
    }
]);

// === DIMENSION PARTICLES (Using Factory) ===
ParticleFactory.createCSSProperties([
    'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'
], 'dimension', true); // formatSize = true

// === POSITION PARTICLES ===
ParticleFactory.createCSSProperties([
    'top', 'right', 'bottom', 'left'
], 'position', true);

// === SPACING PARTICLES ===
ParticleFactory.createCSSProperties([
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'
], 'spacing', true);

// === COLOR PARTICLES ===
ParticleFactory.createColorProperties([
    'color', 'backgroundColor', 'borderColor', 'outlineColor'
], 'color');

// === BORDER PARTICLES ===
ParticleFactory.createCSSProperties([
    'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
    'borderWidth', 'borderStyle', 'borderRadius'
], 'border');

// === TYPOGRAPHY PARTICLES ===
ParticleFactory.createCSSProperties([
    'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
    'textAlign', 'textDecoration', 'lineHeight', 'letterSpacing'
], 'typography');

// === LAYOUT PARTICLES ===
ParticleFactory.createCSSProperties([
    'display', 'position', 'float', 'clear', 'overflow', 'overflowX', 'overflowY',
    'visibility', 'zIndex', 'flex', 'flexDirection', 'flexWrap', 'justifyContent',
    'alignItems', 'alignContent', 'order', 'flexGrow', 'flexShrink', 'flexBasis'
], 'layout');

// === TRANSFORM & ANIMATION PARTICLES ===
ParticleFactory.createCSSProperties([
    'transform', 'transformOrigin', 'transition', 'animation',
    'animationName', 'animationDuration', 'animationTimingFunction',
    'animationDelay', 'animationIterationCount', 'animationDirection'
], 'transform');

// === FILTER & EFFECT PARTICLES ===
ParticleFactory.createCSSProperties([
    'filter', 'backdropFilter', 'opacity', 'boxShadow', 'textShadow'
], 'effects');

// === EVENT PARTICLES (Using Factory) ===
ParticleFactory.createEventProperties([
    'click', 'dblclick', 'mousedown', 'mouseup', 'mouseover', 'mouseout',
    'mousemove', 'mouseenter', 'mouseleave', 'keydown', 'keyup', 'keypress',
    'focus', 'blur', 'change', 'input', 'submit', 'load', 'resize', 'scroll'
], 'events');

// === ATTRIBUTE PARTICLES ===
ParticleFactory.createAttributeProperties([
    'src', 'href', 'alt', 'title', 'placeholder', 'value', 'name',
    'type', 'method', 'action', 'target', 'rel', 'download'
], 'attributes');

// === CUSTOM PARTICLES FOR FRAMEWORK SPECIFICS ===

// Squirrel-specific particles that need custom logic
defineParticle({
    name: 'text',
    type: 'any',
    category: 'content',
    process(el, v) {
        if (v === null || v === undefined) {
            el.textContent = '';
        } else {
            el.textContent = String(v);
        }
    }
});

defineParticle({
    name: 'html',
    type: 'string',
    category: 'content',
    process(el, v) {
        if (typeof v === 'string') {
            el.innerHTML = v;
        }
    }
});

defineParticle({
    name: 'class',
    type: 'any',
    category: 'styling',
    process(el, v) {
        if (Array.isArray(v)) {
            el.className = v.filter(Boolean).join(' ');
        } else if (typeof v === 'string') {
            el.className = v;
        } else if (typeof v === 'object' && v !== null) {
            const classes = Object.keys(v).filter(key => v[key]);
            el.className = classes.join(' ');
        }
    }
});

defineParticle({
    name: 'style',
    type: 'object',
    category: 'styling',
    process(el, v) {
        if (typeof v === 'object' && v !== null) {
            Object.assign(el.style, v);
        }
    }
});

defineParticle({
    name: 'data',
    type: 'object',
    category: 'data',
    process(el, v) {
        if (typeof v === 'object' && v !== null) {
            Object.keys(v).forEach(key => {
                el.dataset[key] = v[key];
            });
        }
    }
});

// === CONDITIONAL & LOOP PARTICLES ===

defineParticle({
    name: 'if',
    type: 'any',
    category: 'control',
    process(el, v, _, instance) {
        const shouldShow = Boolean(v);
        if (shouldShow) {
            if (el.style.display === 'none') {
                el.style.display = instance._originalDisplay || '';
            }
        } else {
            if (el.style.display !== 'none') {
                instance._originalDisplay = el.style.display;
                el.style.display = 'none';
            }
        }
    }
});

defineParticle({
    name: 'unless',
    type: 'any',
    category: 'control',
    process(el, v, _, instance) {
        const shouldShow = !Boolean(v);
        if (shouldShow) {
            if (el.style.display === 'none') {
                el.style.display = instance._originalDisplay || '';
            }
        } else {
            if (el.style.display !== 'none') {
                instance._originalDisplay = el.style.display;
                el.style.display = 'none';
            }
        }
    }
});

defineParticle({
    name: 'show',
    type: 'any',
    category: 'control',
    process(el, v, _, instance) {
        const shouldShow = Boolean(v);
        if (shouldShow) {
            if (el.style.visibility === 'hidden') {
                el.style.visibility = 'visible';
            }
        } else {
            el.style.visibility = 'hidden';
        }
    }
});

defineParticle({
    name: 'hide',
    type: 'any',
    category: 'control',
    process(el, v, _, instance) {
        const shouldHide = Boolean(v);
        if (shouldHide) {
            el.style.visibility = 'hidden';
        } else {
            el.style.visibility = 'visible';
        }
    }
});

// === FORM PARTICLES ===

defineParticle({
    name: 'disabled',
    type: 'boolean',
    category: 'form',
    process(el, v) {
        el.disabled = Boolean(v);
    }
});

defineParticle({
    name: 'readonly',
    type: 'boolean',
    category: 'form',
    process(el, v) {
        el.readOnly = Boolean(v);
    }
});

defineParticle({
    name: 'checked',
    type: 'boolean',
    category: 'form',
    process(el, v) {
        if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = Boolean(v);
        }
    }
});

defineParticle({
    name: 'selected',
    type: 'boolean',
    category: 'form',
    process(el, v) {
        if (el.tagName === 'OPTION') {
            el.selected = Boolean(v);
        }
    }
});

// === ANIMATION HELPERS ===

defineParticle({
    name: 'fadeIn',
    type: 'any',
    category: 'animation',
    process(el, v) {
        if (v) {
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.3s ease';
            requestAnimationFrame(() => {
                el.style.opacity = '1';
            });
        }
    }
});

defineParticle({
    name: 'fadeOut',
    type: 'any',
    category: 'animation',
    process(el, v) {
        if (v) {
            el.style.transition = 'opacity 0.3s ease';
            el.style.opacity = '0';
            setTimeout(() => {
                el.style.display = 'none';
            }, 300);
        }
    }
});

defineParticle({
    name: 'slideDown',
    type: 'any',
    category: 'animation',
    process(el, v) {
        if (v) {
            const height = el.scrollHeight;
            el.style.height = '0';
            el.style.overflow = 'hidden';
            el.style.transition = 'height 0.3s ease';
            requestAnimationFrame(() => {
                el.style.height = height + 'px';
            });
        }
    }
});

defineParticle({
    name: 'slideUp',
    type: 'any',
    category: 'animation',
    process(el, v) {
        if (v) {
            el.style.transition = 'height 0.3s ease';
            el.style.height = '0';
            el.style.overflow = 'hidden';
            setTimeout(() => {
                el.style.display = 'none';
            }, 300);
        }
    }
});

// Export for tree shaking
export const particleCount = ParticleFactory.getStats().totalCreated;
