/**
 * 🎯 UNIFIED PARTICLES - All particles consolidated in one file
 * Eliminates all code redundancy across the framework
 */

// Wait for defineParticle to be available before defining particles
function initializeParticles() {
    if (typeof defineParticle === 'undefined' && typeof window?.defineParticle === 'undefined') {
        setTimeout(initializeParticles, 10);
        return;
    }
    
    // Use global defineParticle if local is not available
    const defineParticleFunc = typeof defineParticle !== 'undefined' ? defineParticle : window.defineParticle;

// === STRUCTURAL PARTICLES ===

defineParticleFunc({
    name: 'id',
    type: 'string',
    category: 'structural',
    process(el, v, _, instance) {
        el.id = v;
        if (v) _registry[v] = instance;
    }
});

defineParticleFunc({
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
});

defineParticleFunc({
    name: 'attach',
    type: 'any',
    category: 'structural',
    process(el, v, _, instance) {
        instance._handleAttach(v);
    }
});

// === DIMENSION PARTICLES ===

defineParticleFunc({
    name: 'width',
    type: 'number',
    category: 'dimension',
    process(el, v) {
        el.style.width = _formatSize(v);
    }
});

defineParticleFunc({
    name: 'height',
    type: 'number',
    category: 'dimension',
    process(el, v) {
        el.style.height = _formatSize(v);
    }
});

defineParticleFunc({
    name: 'padding',
    type: 'number',
    category: 'dimension',
    process(el, v) {
        el.style.padding = _formatSize(v);
    }
});

defineParticleFunc({
    name: 'margin',
    type: 'number',
    category: 'dimension',
    process(el, v) {
        el.style.margin = _formatSize(v);
    }
});

// === POSITION PARTICLES ===

defineParticleFunc({
    name: 'x',
    type: 'number',
    category: 'position',
    process(el, v) {
        el.style.left = _formatSize(v);
    }
});

defineParticleFunc({
    name: 'y',
    type: 'number',
    category: 'position',
    process(el, v) {
        el.style.top = _formatSize(v);
    }
});

defineParticleFunc({
    name: 'position',
    type: 'string',
    category: 'position',
    process(el, v) {
        el.style.position = v;
    }
});

defineParticleFunc({
    name: 'zIndex',
    type: 'number',
    category: 'position',
    process(el, v) {
        el.style.zIndex = v;
    }
});

// === APPEARANCE PARTICLES ===

function formatColorValue(value) {
    if (typeof value === 'string') {
        return value; // Already a valid CSS color string
    } else if (typeof value === 'object' && value !== null) {
        const { red = 0, green = 0, blue = 0, alpha = 1 } = value;
        return `rgba(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)}, ${alpha})`;
    }
    return 'transparent'; // Default fallback
}

defineParticleFunc({
    name: 'backgroundColor',
    type: 'string|object',
    category: 'appearance',
    process(el, v) {
            var color_f= formatColorValue(v);
            el.style.backgroundColor = color_f;
    }
});


defineParticleFunc({
    name: 'color',
    type: 'string|object',
    category: 'appearance',
    process(el, v) {
    
           var color_f= formatColorValue(v);
            el.style.color = color_f;
    }
});


defineParticleFunc({
    name: 'smooth',
    type: 'number',
    category: 'appearance',
    process(el, v) {
        el.style.borderRadius = _formatSize(v);
    }
});

defineParticleFunc({
    name: 'borderRadius',
    type: 'number',
    category: 'appearance',
    process(el, v) {
        el.style.borderRadius = _formatSize(v);
    }
});

defineParticleFunc({
    name: 'opacity',
    type: 'number',
    category: 'appearance',
    process(el, v) {
        el.style.opacity = v;
    }
});

defineParticleFunc({
    name: 'display',
    type: 'string',
    category: 'appearance',
    process(el, v) {
        el.style.display = v;
    }
});

defineParticleFunc({
    name: 'overflow',
    type: 'string',
    category: 'appearance',
    process(el, v) {
        el.style.overflow = v;
    }
});

defineParticleFunc({
    name: 'transform',
    type: 'string',
    category: 'appearance',
    process(el, v) {
        el.style.transform = v;
    }
});

defineParticleFunc({
    name: 'transition',
    type: 'string',
    category: 'appearance',
    process(el, v) {
        el.style.transition = v;
    }
});

defineParticleFunc({
    name: 'boxShadow',
    type: 'string',
    category: 'appearance',
    process(el, v) {
        el.style.boxShadow = v;
    }
});

defineParticleFunc({
    name: 'shadow',
    type: 'object',
    category: 'appearance',
    process(el, v) {
        if (Array.isArray(v)) {
            el.style.boxShadow = v.map(shadowItem => {
                const {blur = 0, x = 0, y = 0, color = {}, invert = false} = shadowItem;
                const {red = 0, green = 0, blue = 0, alpha = 1} = color;
                const rgba = `rgba(${red * 255},${green * 255},${blue * 255},${alpha})`;
                return `${invert ? 'inset ' : ''}${x}px ${y}px ${blur}px ${rgba}`;
            }).join(', ');
        } else if (typeof v === 'string') {
            el.style.boxShadow = v;
        }
    }
});

// === TEXT PARTICLES ===

defineParticleFunc({
    name: 'text',
    type: 'string',
    category: 'content',
    process(el, v) {
        el.textContent = v;
    }
});

defineParticleFunc({
    name: 'fontSize',
    type: 'number',
    category: 'text',
    process(el, v) {
        el.style.fontSize = _formatSize(v);
    }
});

defineParticleFunc({
    name: 'fontWeight',
    type: 'string',
    category: 'text',
    process(el, v) {
        el.style.fontWeight = v;
    }
});

defineParticleFunc({
    name: 'textAlign',
    type: 'string',
    category: 'text',
    process(el, v) {
        el.style.textAlign = v;
    }
});

defineParticleFunc({
    name: 'lineHeight',
    type: 'string',
    category: 'text',
    process(el, v) {
        el.style.lineHeight = v;
    }
});

// === BEHAVIOR PARTICLES ===

defineParticleFunc({
    name: 'contenteditable',
    type: 'boolean',
    category: 'behavior',
    process(el, v) {
        el.contentEditable = v;
    }
});

defineParticleFunc({
    name: 'cursor',
    type: 'string',
    category: 'behavior',
    process(el, v) {
        el.style.cursor = v;
    }
});

// === EVENT PARTICLES ===

defineParticleFunc({
    name: 'onclick',
    type: 'function',
    category: 'event',
    process(el, handler) {
        el.onclick = handler;
    }
});

defineParticleFunc({
    name: 'onmouseover',
    type: 'function',
    category: 'event',
    process(el, handler) {
        el.onmouseover = handler;
    }
});

defineParticleFunc({
    name: 'keyboard',
    type: 'function',
    category: 'event',
    process(el, handler) {
        if (typeof handler === 'function') {
            el.addEventListener('keydown', function(event) {
                const keyObj = {
                    key: event.key,
                    code: event.code,
                    keyCode: event.keyCode,
                    ctrl: event.ctrlKey,
                    shift: event.shiftKey,
                    alt: event.altKey,
                    meta: event.metaKey,
                    preventDefault: () => event.preventDefault(),
                    stopPropagation: () => event.stopPropagation()
                };
                handler(keyObj);
            });
        }
    }
});

defineParticleFunc({
    name: 'touch',
    type: 'function',
    category: 'event',
    process(el, handler) {
        if (typeof handler === 'function') {
            el.addEventListener('touchstart', handler);
            el.addEventListener('touchmove', handler);
            el.addEventListener('touchend', handler);
        }
    }
});

// === UNIT PARTICLE ===

defineParticleFunc({
    name: 'unit',
    type: 'object',
    category: 'dimension',
    priority: 100,
    process(el, unitMap) {
        setTimeout(() => {
            if (typeof unitMap === 'object' && unitMap !== null) {
                Object.entries(unitMap).forEach(([property, unit]) => {
                    let currentValue;
                    
                    if (el.style[property]) {
                        currentValue = parseFloat(el.style[property]);
                    } else {
                        const aInstance = window.A?.instances?.find(instance => 
                            instance.html_object === el || instance.element === el
                        );
                        
                        if (aInstance?.particles?.[property] !== undefined) {
                            const originalValue = aInstance.particles[property];
                            currentValue = typeof originalValue === 'string' ? 
                                parseFloat(originalValue) : originalValue;
                        }
                    }
                    
                    if (currentValue === undefined || isNaN(currentValue)) {
                        currentValue = parseFloat(getComputedStyle(el)[property]) || 0;
                    }
                    
                    if (currentValue >= 0) {
                        const newValue = currentValue + unit;
                        el.style[property] = newValue;
                        
                        const aInstance = window.A?.instances?.find(instance => 
                            instance.html_object === el || instance.element === el
                        );
                        if (aInstance?.particles) {
                            aInstance.particles[property] = newValue;
                        }
                    } else {
                        console.warn(`⚠️ No valid value found for ${property}:`, currentValue);
                    }
                });
            }
        }, 10);
    }
});

}

// Initialize particles when the script loads
initializeParticles();

// Export for ES6 modules
export default {};
