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

        console.log('code to write : Touch event:', v);
       // el.style.top = _formatSize(v);  // Uses exposed _formatSize
    }
});