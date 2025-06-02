// Particle id
defineParticle({
    name: 'id',
    type: 'string',
    category: 'structural',
    process(el, v, _, instance) {
        el.id = v;
        if (v) _registry[v] = instance;  // Uses exposed _registry
    }
});

// Particle markup
defineParticle({
    name: 'markup',
    type: 'string',
    category: 'structural',
    process(el, v, data, instance) {
        if (!v || typeof v !== 'string') return;

        const newEl = document.createElement(v);
        // Copy attributes
        for (const attr of el.attributes) {
            newEl.setAttribute(attr.name, attr.value);
        }

        // Copy styles
        newEl.style.cssText = el.style.cssText;

        // Replace element
        instance.element = newEl;
    }
});

// Particle x
defineParticle({
    name: 'x',
    type: 'number',
    category: 'position',
    process(el, v) {
        el.style.left = _formatSize(v);  // Uses exposed _formatSize
    }
});

// Particle y
defineParticle({
    name: 'y',
    type: 'number',
    category: 'position',
    process(el, v) {
        el.style.top = _formatSize(v);  // Uses exposed _formatSize
    }
});


// Particle color
defineParticle({
    name: 'color',
    type: 'string',
    category: 'appearance',
    process(el, v) {
        el.style.backgroundColor = v;
    }
});

// Particle backgroundColor
defineParticle({
    name: 'backgroundColor',
    type: 'string',
    category: 'appearance',
    process(el, v) {
        el.style.backgroundColor = v;
    }
});

// Particle smooth
defineParticle({
    name: 'smooth',
    type: 'number',
    category: 'appearance',
    process(el, v) {
        el.style.borderRadius = _formatSize(v);  // Uses exposed _formatSize
    }
});

// Particle shadow
defineParticle({
    name: 'shadow',
    type: 'object',
    category: 'appearance',
    process(el, v) {
        if (Array.isArray(v)) {
            // Rename to avoid variable shadowing
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
// Particle display
defineParticle({
    name: 'display',
    type: 'string',
    category: 'position',
    process(el, v) {
        el.style.height = v;  // Uses exposed _formatSize
    }
});


// Particle overflow
defineParticle({
    name: 'overflow',
    type: 'string',
    category: 'appearance',
    process(el, v) {
        el.style.overflow = v;
    }
});


// Particle attach
defineParticle({
    name: 'attach',
    type: 'any',
    category: 'structural',
    process(el, v, _, instance) {
        instance._handleAttach(v);
    }
});

defineParticle({
    name: 'onclick',
    process: function(element, handler) {
        element.onclick = handler;
    }
});

defineParticle({
    name: 'onmouseover',
    process: function(element, handler) {
        element.onmouseover = handler;
    }
});