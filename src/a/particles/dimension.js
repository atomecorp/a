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



defineParticle({
    name: 'unit',
    type: 'object',
    category: 'dimension',
    priority: 100, // Execute after other particles
    process(el, unitMap) {
        // Petit délai pour s'assurer que tous les autres particles sont appliqués
        setTimeout(() => {
            
            if (typeof unitMap === 'object' && unitMap !== null) {
                Object.entries(unitMap).forEach(([property, unit]) => {
                    // Debug: voir les valeurs actuelles
                 
                    
                    // Récupérer la valeur numérique actuelle
                    let currentValue;
                    
                    // 1. Essayer depuis le style inline
                    if (el.style[property]) {
                        currentValue = parseFloat(el.style[property]);
                    } 
                    // 2. Essayer depuis les particles de l'instance A
                    else {
                        const aInstance = window.A?.instances?.find(instance => 
                            instance.html_object === el || instance.element === el
                        );
                        
                        if (aInstance?.particles?.[property] !== undefined) {
                            const originalValue = aInstance.particles[property];
                            currentValue = typeof originalValue === 'string' ? 
                                parseFloat(originalValue) : originalValue;
                        }
                    }
                    
                    // 3. Fallback sur computed style
                    if (currentValue === undefined || isNaN(currentValue)) {
                        currentValue = parseFloat(getComputedStyle(el)[property]) || 0;
                    }
                    
                    // Appliquer la nouvelle unité
                    if (currentValue >= 0) {
                        const newValue = currentValue + unit;
                        el.style[property] = newValue;
                        
                        // Mettre à jour dans l'instance A si possible
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
        }, 10); // Petit délai pour laisser les autres particles s'exécuter
    }
});


// Export for ES6 modules
export default {};
