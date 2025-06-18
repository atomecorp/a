/**
 * 🎯 SHARED PARTICLES - Particules communes pour tous les composants
 * 
 * Définit les particules utilisées à la fois par:
 * - Framework A traditionnel
 * - Web Components modernes
 * - Système de fallback
 * 
 * @version 3.0.0 - MODERN SHARED SYSTEM
 * @author Squirrel Framework Team
 */

import { ParticleFactory } from './particle-factory.js';

/**
 * 🎯 PARTICULES COMMUNES DE BASE
 * Ces particules sont disponibles pour tous les types de composants
 */
export const COMMON_PARTICLES = [
    // === POSITIONING PARTICLES ===
    {
        name: 'x',
        type: 'number',
        category: 'position',
        process(el, v) {
            el.style.position = el.style.position || 'absolute';
            el.style.left = ParticleFactory._formatSize(v);
        }
    },
    {
        name: 'y',
        type: 'number',
        category: 'position',
        process(el, v) {
            el.style.position = el.style.position || 'absolute';
            el.style.top = ParticleFactory._formatSize(v);
        }
    },

    // === DIMENSION PARTICLES ===
    {
        name: 'width',
        type: 'number|string',
        category: 'dimension',
        process(el, v) {
            el.style.width = ParticleFactory._formatSize(v);
        }
    },
    {
        name: 'height',
        type: 'number|string',
        category: 'dimension',
        process(el, v) {
            el.style.height = ParticleFactory._formatSize(v);
        }
    },

    // === APPEARANCE PARTICLES ===
    {
        name: 'backgroundColor',
        type: 'string',
        category: 'appearance',
        process(el, v) {
            el.style.backgroundColor = v;
        }
    },
    {
        name: 'color',
        type: 'string',
        category: 'appearance',
        process(el, v) {
            el.style.color = v;
        }
    },
    {
        name: 'smooth',
        type: 'number',
        category: 'appearance',
        process(el, v) {
            el.style.borderRadius = ParticleFactory._formatSize(v);
        }
    },

    // === LAYOUT PARTICLES ===
    {
        name: 'padding',
        type: 'number|string',
        category: 'layout',
        process(el, v) {
            el.style.padding = ParticleFactory._formatSize(v);
        }
    },
    {
        name: 'margin',
        type: 'number|string',
        category: 'layout',
        process(el, v) {
            el.style.margin = ParticleFactory._formatSize(v);
        }
    },

    // === STRUCTURAL PARTICLES ===
    {
        name: 'id',
        type: 'string',
        category: 'structural',
        process(el, v, _, instance) {
            el.id = v;
            // Enregistrer dans le registry global si disponible
            if (v && typeof window !== 'undefined' && window._registry) {
                window._registry[v] = instance || el;
            }
        }
    },
    {
        name: 'attach',
        type: 'any',
        category: 'structural',
        process(el, v, _, instance) {
            // Déléguer l'attachement à l'instance si elle a la méthode
            if (instance && typeof instance._handleAttach === 'function') {
                instance._handleAttach(v);
            } else {
                // Fallback pour attachement direct
                let container;
                if (v === 'body') {
                    container = document.body;
                } else if (typeof v === 'string') {
                    container = document.querySelector(v);
                } else if (v instanceof HTMLElement) {
                    container = v;
                }
                
                if (container && el.parentElement !== container) {
                    container.appendChild(el);
                }
            }
        }
    },

    // === EFFECTS PARTICLES ===
    {
        name: 'opacity',
        type: 'number',
        category: 'effects',
        process(el, v) {
            el.style.opacity = String(v);
        }
    },
    {
        name: 'transform',
        type: 'string',
        category: 'effects',
        process(el, v) {
            el.style.transform = v;
        }
    },

    // === TYPOGRAPHY PARTICLES ===
    {
        name: 'fontSize',
        type: 'number|string',
        category: 'typography',
        process(el, v) {
            el.style.fontSize = ParticleFactory._formatSize(v);
        }
    },
    {
        name: 'fontWeight',
        type: 'string|number',
        category: 'typography',
        process(el, v) {
            el.style.fontWeight = String(v);
        }
    },

    // === BORDER PARTICLES ===
    {
        name: 'border',
        type: 'string',
        category: 'border',
        process(el, v) {
            el.style.border = v;
        }
    },
    {
        name: 'borderRadius',
        type: 'number|string',
        category: 'border',
        process(el, v) {
            el.style.borderRadius = ParticleFactory._formatSize(v);
        }
    }
];

/**
 * 🎯 PARTICULES WEB COMPONENT SPÉCIFIQUES
 * Particules optimisées pour les Web Components avec Shadow DOM
 */
export const WEB_COMPONENT_PARTICLES = [
    {
        name: 'shadowStyle',
        type: 'object',
        category: 'web-component',
        process(el, styles, context) {
            // Appliquer des styles spécifiquement au Shadow DOM
            if (context?.shadowRoot) {
                const styleEl = context.shadowRoot.querySelector('style') || 
                               document.createElement('style');
                
                if (!styleEl.parentNode) {
                    context.shadowRoot.appendChild(styleEl);
                }
                
                const cssText = Object.entries(styles)
                    .map(([selector, rules]) => {
                        const ruleText = Object.entries(rules)
                            .map(([prop, value]) => `${prop}: ${value}`)
                            .join('; ');
                        return `${selector} { ${ruleText} }`;
                    })
                    .join('\n');
                
                styleEl.textContent += '\n' + cssText;
            }
        }
    },

    {
        name: 'slotContent',
        type: 'string|HTMLElement',
        category: 'web-component',
        process(el, content, context) {
            if (context?.shadowRoot) {
                let slot = context.shadowRoot.querySelector('slot');
                if (!slot) {
                    slot = document.createElement('slot');
                    context.shadowRoot.appendChild(slot);
                }
                
                if (typeof content === 'string') {
                    slot.innerHTML = content;
                } else if (content instanceof HTMLElement) {
                    slot.appendChild(content);
                }
            }
        }
    }
];

/**
 * 🎯 PARTICULES AVANCÉES
 * Particules avec logique complexe pour effets avancés
 */
export const ADVANCED_PARTICLES = [
    {
        name: 'glow',
        type: 'number|object',
        category: 'effects',
        process(el, config) {
            if (typeof config === 'number') {
                // Simple glow avec intensité
                const intensity = config;
                const color = `rgba(0, 150, 255, ${Math.min(intensity / 100, 1)})`;
                el.style.boxShadow = `0 0 ${intensity}px ${color}`;
            } else if (typeof config === 'object') {
                // Glow configuré
                const { 
                    intensity = 20, 
                    color = 'rgba(0, 150, 255, 0.8)', 
                    spread = 0 
                } = config;
                el.style.boxShadow = `0 0 ${intensity}px ${spread}px ${color}`;
            }
        }
    },

    {
        name: 'gradient',
        type: 'object',
        category: 'appearance',
        process(el, config) {
            const { 
                type = 'linear', 
                direction = 'to right', 
                colors = ['#ff0000', '#0000ff'] 
            } = config;
            
            const colorStops = colors.join(', ');
            el.style.background = `${type}-gradient(${direction}, ${colorStops})`;
        }
    },

    {
        name: 'animate',
        type: 'object',
        category: 'animation',
        process(el, config) {
            const { 
                name, 
                duration = '0.3s', 
                easing = 'ease', 
                iterations = 1,
                fillMode = 'forwards'
            } = config;
            
            if (name) {
                el.style.animation = `${name} ${duration} ${easing} ${iterations} ${fillMode}`;
            }
        }
    },

    {
        name: 'responsive',
        type: 'object',
        category: 'layout',
        process(el, breakpoints) {
            // Créer des media queries dynamiques
            const style = document.createElement('style');
            let css = '';
            
            for (const [breakpoint, styles] of Object.entries(breakpoints)) {
                css += `@media (max-width: ${breakpoint}) {\n`;
                css += `  #${el.id || 'element'} {\n`;
                
                for (const [prop, value] of Object.entries(styles)) {
                    css += `    ${prop}: ${value};\n`;
                }
                
                css += '  }\n}\n';
            }
            
            style.textContent = css;
            document.head.appendChild(style);
        }
    }
];

/**
 * 🎯 EXPORT UNIFIED
 * Export de toutes les particules pour utilisation externe
 */
export const ALL_SHARED_PARTICLES = [
    ...COMMON_PARTICLES,
    ...WEB_COMPONENT_PARTICLES,
    ...ADVANCED_PARTICLES
];

/**
 * 🎯 HELPER FUNCTIONS
 */
export function getParticleByName(name) {
    return ALL_SHARED_PARTICLES.find(p => p.name === name);
}

export function getParticlesByCategory(category) {
    return ALL_SHARED_PARTICLES.filter(p => p.category === category);
}

export function isCommonParticle(name) {
    return COMMON_PARTICLES.some(p => p.name === name);
}

export function isWebComponentParticle(name) {
    return WEB_COMPONENT_PARTICLES.some(p => p.name === name);
}

// Named export for compatibility
export const sharedParticles = ALL_SHARED_PARTICLES;

export default ALL_SHARED_PARTICLES;
