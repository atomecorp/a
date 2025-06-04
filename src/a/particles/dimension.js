// Particle width
defineParticle({
    name: 'width',
    type: 'number',
    category: 'dimension',
    process(el, v) {
        el.style.width = _formatSize(v);  // Uses exposed _formatSize
    }
});

// Particle height
defineParticle({
    name: 'height',
    type: 'number',
    category: 'dimension',
    process(el, v) {
        el.style.height = _formatSize(v);  // Uses exposed _formatSize
    }
});

defineParticle({
    name: 'touch',
    type: 'string',
    category: 'posieventstion',
    process(el, v) {

        // TODO: Touch event implementation
       // el.style.top = _formatSize(v);  // Uses exposed _formatSize
    }
});



// Particle keyboard - Custom Squirrel method
defineParticle({
    name: 'keyboard',
    type: 'function',
    category: 'event',
    process: function(element, handler) {
        // TODO: Custom keyboard event handler
        if (typeof handler === 'function') {
            element.addEventListener('keydown', function(event) {
                // Create Ruby-style key object
                const keyObj = {
                    key: event.key,
                    code: event.code,
                    keyCode: event.keyCode,
                    ctrl: event.ctrlKey,
                    shift: event.shiftKey,
                    alt: event.altKey,
                    meta: event.metaKey,
                    preventDefault: function() {
                        event.preventDefault();
                    },
                    stopPropagation: function() {
                        event.stopPropagation();
                    }
                };
                
                // Call handler with Ruby-style key object
                handler(keyObj);
            });
        }
    }
});

// Export for ES6 modules
export default {};
