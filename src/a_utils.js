//
// // Particle id
defineParticle({
    name: 'display',
    type: 'string',
    category: 'position',
    process(el, v) {
        el.style.height = v;  // Uses exposed _formatSize
    }
});
