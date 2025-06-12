/**
 * 🚀 UNIVERSAL PARTICLE PROCESSOR
 * 
 * Solution universelle d'intégration des particles pour tous les Web Components.
 * - Fonctionne avec tous les Web Components (actuels et futurs)
 * - Supporte toutes les particles (actuelles et futures) 
 * - Maintient la compatibilité avec la classe A
 * - Gère les styles complexes (containerStyle, boxShadow, smooth, etc.)
 * 
 * @version 1.0.0 - SOLUTION UNIVERSELLE
 * @author Squirrel Framework Team
 */

import { sharedParticles } from './shared-particles.js';

/**
 * 🎯 PROCESSEUR UNIVERSEL DES PARTICLES
 */
export class UniversalParticleProcessor {
    constructor() {
        // Cache pour performance
        this._particleCache = new Map();
        this._cssPropertiesCache = new Set();
        this._initializeCSSProperties();
        
        // Système de fallback intelligent
        this._fallbackSystem = new ParticleFallbackSystem();
        
        // Compteurs pour debugging
        this._stats = {
            processed: 0,
            fallbacks: 0,
            cached: 0
        };
    }

    /**
     * 🚀 POINT D'ENTRÉE PRINCIPAL
     * Traite n'importe quelle particle sur n'importe quel élément
     */
    process(element, particleName, value, options = {}) {
        this._stats.processed++;
        
        try {
            // 1. Vérifier le cache
            const cacheKey = this._generateCacheKey(element, particleName, value);
            if (this._particleCache.has(cacheKey) && !options.force) {
                this._stats.cached++;
                return this._particleCache.get(cacheKey);
            }

            let result = false;

            // 2. Traitement par priorité
            if (this._isContainerStyle(particleName, value)) {
                result = this._processContainerStyle(element, particleName, value, options);
            }
            else if (this._isSharedParticle(particleName)) {
                result = this._processSharedParticle(element, particleName, value, options);
            }
            else if (this._isFrameworkAParticle(particleName)) {
                result = this._processFrameworkAParticle(element, particleName, value, options);
            }
            else if (this._isCSSProperty(particleName)) {
                result = this._processCSSProperty(element, particleName, value, options);
            }
            else {
                result = this._processFallback(element, particleName, value, options);
            }

            // 3. Mettre en cache le résultat
            this._particleCache.set(cacheKey, result);
            
            return result;

        } catch (error) {
            console.error(`UniversalParticleProcessor: Error processing '${particleName}':`, error);
            return this._processFallback(element, particleName, value, options);
        }
    }

    /**
     * 🎨 TRAITEMENT CONTAINER STYLE
     * Gère les styles complexes comme containerStyle: { smooth: 120, boxShadow: [...] }
     */
    _processContainerStyle(element, particleName, value, options) {
        if (particleName === 'containerStyle' && typeof value === 'object') {
            let allSuccess = true;
            
            // Traiter chaque propriété de style
            for (const [styleProp, styleValue] of Object.entries(value)) {
                const success = this._processStyleProperty(element, styleProp, styleValue, options);
                if (!success) allSuccess = false;
            }
            
            return allSuccess;
        }
        
        return false;
    }

    /**
     * 🎯 TRAITEMENT PROPRIÉTÉ DE STYLE
     * Traite une propriété individuelle de style (smooth, boxShadow, etc.)
     */
    _processStyleProperty(element, property, value, options) {
        // Cas spéciaux avec logique métier
        switch (property) {
            case 'smooth':
                return this._processSmooth(element, value, options);
            
            case 'boxShadow':
                return this._processBoxShadow(element, value, options);
            
            case 'border':
            case 'borderRadius':
            case 'backgroundColor':
            case 'color':
            case 'padding':
            case 'margin':
                return this._processStandardCSS(element, property, value, options);
            
            default:
                // Essayer comme propriété CSS standard
                return this._processCSSProperty(element, property, value, options);
        }
    }

    /**
     * ✨ TRAITEMENT SMOOTH UNIVERSEL
     * Gère smooth: number (borderRadius) et autres usages futurs
     */
    _processSmooth(element, value, options) {
        if (typeof value === 'number') {
            // Smooth comme borderRadius (cas principal)
            element.style.borderRadius = `${value}px`;
            
            // Ajouter transition si demandé
            if (options.withTransition !== false) {
                element.style.transition = element.style.transition || 'all 0.3s ease';
            }
            
            return true;
        }
        
        if (typeof value === 'string') {
            // Smooth comme valeur CSS directe (50%, 10px, etc.)
            element.style.borderRadius = value;
            return true;
        }
        
        if (typeof value === 'object') {
            // Smooth complexe (futur usage)
            const { borderRadius, transition, corners } = value;
            
            if (borderRadius !== undefined) {
                element.style.borderRadius = this._formatValue(borderRadius, 'px');
            }
            
            if (transition !== undefined) {
                element.style.transition = transition;
            }
            
            if (corners) {
                // Coins individuels
                if (corners.topLeft) element.style.borderTopLeftRadius = this._formatValue(corners.topLeft, 'px');
                if (corners.topRight) element.style.borderTopRightRadius = this._formatValue(corners.topRight, 'px');
                if (corners.bottomLeft) element.style.borderBottomLeftRadius = this._formatValue(corners.bottomLeft, 'px');
                if (corners.bottomRight) element.style.borderBottomRightRadius = this._formatValue(corners.bottomRight, 'px');
            }
            
            return true;
        }
        
        return false;
    }

    /**
     * 💫 TRAITEMENT BOX SHADOW UNIVERSEL
     * Gère les arrays de shadows et les formats complexes
     */
    _processBoxShadow(element, value, options) {
        if (Array.isArray(value)) {
            // Multiple shadows
            element.style.boxShadow = value.join(', ');
            return true;
        }
        
        if (typeof value === 'string') {
            // Single shadow string
            element.style.boxShadow = value;
            return true;
        }
        
        if (typeof value === 'object') {
            // Shadow object format
            const { x = 0, y = 0, blur = 0, spread = 0, color = 'rgba(0,0,0,0.1)', inset = false } = value;
            const insetStr = inset ? 'inset ' : '';
            element.style.boxShadow = `${insetStr}${x}px ${y}px ${blur}px ${spread}px ${color}`;
            return true;
        }
        
        return false;
    }

    /**
     * 🎨 TRAITEMENT CSS STANDARD
     * Propriétés CSS avec gestion intelligente des unités
     */
    _processStandardCSS(element, property, value, options) {
        const cssProperty = this._camelToCss(property);
        
        if (typeof value === 'number' && this._needsPx(cssProperty)) {
            element.style[property] = `${value}px`;
        } else {
            element.style[property] = value;
        }
        
        return true;
    }

    /**
     * 🚀 TRAITEMENT SHARED PARTICLES
     */
    _processSharedParticle(element, particleName, value, options) {
        const particle = sharedParticles.find(p => p.name === particleName);
        if (!particle) return false;

        try {
            const extendedOptions = {
                ...options,
                webComponent: this._isWebComponent(element),
                shadowRoot: element.shadowRoot,
                baseElement: element
            };

            return particle.process(element, value, extendedOptions);
        } catch (error) {
            console.warn(`Shared particle '${particleName}' failed:`, error);
            return false;
        }
    }

    /**
     * 🎯 TRAITEMENT FRAMEWORK A
     */
    _processFrameworkAParticle(element, particleName, value, options) {
        if (typeof window?.setParticle === 'function') {
            try {
                window.setParticle(element, particleName, value, options);
                return true;
            } catch (error) {
                console.warn(`Framework A particle '${particleName}' failed:`, error);
                return false;
            }
        }
        return false;
    }

    /**
     * 💎 TRAITEMENT PROPRIÉTÉ CSS
     */
    _processCSSProperty(element, property, value, options) {
        try {
            const cssProperty = this._camelToCss(property);
            
            if (typeof value === 'number' && this._needsPx(cssProperty)) {
                element.style[cssProperty] = `${value}px`;
            } else {
                element.style[cssProperty] = value;
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 🛡️ SYSTÈME DE FALLBACK
     */
    _processFallback(element, particleName, value, options) {
        this._stats.fallbacks++;
        return this._fallbackSystem.process(element, particleName, value, options);
    }

    // === HELPER METHODS ===

    _generateCacheKey(element, particleName, value) {
        const elementId = element.id || element.tagName || 'unknown';
        return `${elementId}_${particleName}_${JSON.stringify(value)}`;
    }

    _isContainerStyle(particleName, value) {
        return particleName === 'containerStyle' && typeof value === 'object';
    }

    _isSharedParticle(particleName) {
        return sharedParticles.some(p => p.name === particleName);
    }

    _isFrameworkAParticle(particleName) {
        return typeof window?.setParticle === 'function';
    }

    _isCSSProperty(particleName) {
        return this._cssPropertiesCache.has(particleName) || 
               this._cssPropertiesCache.has(this._camelToCss(particleName));
    }

    _isWebComponent(element) {
        return element.shadowRoot !== undefined || element.tagName.includes('-');
    }

    _camelToCss(str) {
        return str.replace(/([A-Z])/g, '-$1').toLowerCase();
    }

    _formatValue(value, unit = '') {
        if (typeof value === 'number' && unit) {
            return `${value}${unit}`;
        }
        return value;
    }

    _needsPx(cssProperty) {
        const pxProperties = new Set([
            'width', 'height', 'top', 'left', 'right', 'bottom',
            'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
            'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
            'font-size', 'line-height', 'text-indent', 'letter-spacing', 'word-spacing',
            'max-width', 'max-height', 'min-width', 'min-height',
            'outline-width', 'outline-offset'
        ]);
        return pxProperties.has(cssProperty);
    }

    _initializeCSSProperties() {
        // Liste complète des propriétés CSS supportées
        const cssProperties = new Set([
            'alignContent', 'alignItems', 'alignSelf', 'animation', 'animationDelay', 'animationDirection',
            'animationDuration', 'animationFillMode', 'animationIterationCount', 'animationName', 'animationPlayState',
            'animationTimingFunction', 'backfaceVisibility', 'background', 'backgroundAttachment', 'backgroundColor',
            'backgroundImage', 'backgroundPosition', 'backgroundRepeat', 'backgroundSize', 'border', 'borderBottom',
            'borderBottomColor', 'borderBottomLeftRadius', 'borderBottomRightRadius', 'borderBottomStyle', 'borderBottomWidth',
            'borderCollapse', 'borderColor', 'borderLeft', 'borderLeftColor', 'borderLeftStyle', 'borderLeftWidth',
            'borderRadius', 'borderRight', 'borderRightColor', 'borderRightStyle', 'borderRightWidth', 'borderSpacing',
            'borderStyle', 'borderTop', 'borderTopColor', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderTopStyle',
            'borderTopWidth', 'borderWidth', 'bottom', 'boxShadow', 'boxSizing', 'captionSide', 'clear', 'clip',
            'color', 'columnCount', 'columnFill', 'columnGap', 'columnRule', 'columnRuleColor', 'columnRuleStyle',
            'columnRuleWidth', 'columns', 'columnSpan', 'columnWidth', 'content', 'counterIncrement', 'counterReset',
            'cursor', 'direction', 'display', 'emptyCells', 'filter', 'flex', 'flexBasis', 'flexDirection',
            'flexFlow', 'flexGrow', 'flexShrink', 'flexWrap', 'float', 'font', 'fontFamily', 'fontSize',
            'fontStretch', 'fontStyle', 'fontVariant', 'fontWeight', 'height', 'justifyContent', 'left',
            'letterSpacing', 'lineHeight', 'listStyle', 'listStyleImage', 'listStylePosition', 'listStyleType',
            'margin', 'marginBottom', 'marginLeft', 'marginRight', 'marginTop', 'maxHeight', 'maxWidth',
            'minHeight', 'minWidth', 'opacity', 'order', 'outline', 'outlineColor', 'outlineOffset',
            'outlineStyle', 'outlineWidth', 'overflow', 'overflowX', 'overflowY', 'padding', 'paddingBottom',
            'paddingLeft', 'paddingRight', 'paddingTop', 'position', 'quotes', 'resize', 'right',
            'tableLayout', 'textAlign', 'textDecoration', 'textDecorationColor', 'textDecorationLine',
            'textDecorationStyle', 'textIndent', 'textOverflow', 'textShadow', 'textTransform', 'top',
            'transform', 'transformOrigin', 'transformStyle', 'transition', 'transitionDelay',
            'transitionDuration', 'transitionProperty', 'transitionTimingFunction', 'userSelect',
            'verticalAlign', 'visibility', 'whiteSpace', 'width', 'wordBreak', 'wordSpacing',
            'wordWrap', 'zIndex'
        ]);
        
        this._cssPropertiesCache = cssProperties;
    }

    // === DEBUG & STATS ===

    getStats() {
        return { ...this._stats };
    }

    clearCache() {
        this._particleCache.clear();
        this._stats.cached = 0;
    }

    resetStats() {
        this._stats = { processed: 0, fallbacks: 0, cached: 0 };
    }
}

/**
 * 🛡️ SYSTÈME DE FALLBACK AVANCÉ
 */
class ParticleFallbackSystem {
    constructor() {
        this._fallbackRules = new Map();
        this._initializeFallbacks();
    }

    process(element, particleName, value, options) {
        // 1. Fallbacks spécifiques
        if (this._fallbackRules.has(particleName)) {
            const fallback = this._fallbackRules.get(particleName);
            try {
                return fallback(element, value, options);
            } catch (error) {
                console.warn(`Fallback for '${particleName}' failed:`, error);
            }
        }

        // 2. Fallback CSS générique
        try {
            const cssProperty = particleName.replace(/([A-Z])/g, '-$1').toLowerCase();
            
            if (typeof value === 'number' && this._needsPx(cssProperty)) {
                element.style[cssProperty] = `${value}px`;
            } else {
                element.style[cssProperty] = value;
            }
            
            return true;
        } catch (error) {
            console.warn(`Generic CSS fallback for '${particleName}' failed:`, error);
        }

        // 3. Fallback ultime
        console.warn(`No fallback available for particle '${particleName}'`);
        return false;
    }

    _initializeFallbacks() {
        // Position
        this._fallbackRules.set('x', (el, val) => {
            el.style.position = el.style.position || 'absolute';
            el.style.left = typeof val === 'number' ? `${val}px` : val;
            return true;
        });

        this._fallbackRules.set('y', (el, val) => {
            el.style.position = el.style.position || 'absolute';
            el.style.top = typeof val === 'number' ? `${val}px` : val;
            return true;
        });

        // Dimensions
        this._fallbackRules.set('width', (el, val) => {
            el.style.width = typeof val === 'number' ? `${val}px` : val;
            return true;
        });

        this._fallbackRules.set('height', (el, val) => {
            el.style.height = typeof val === 'number' ? `${val}px` : val;
            return true;
        });

        // Apparence
        this._fallbackRules.set('backgroundColor', (el, val) => {
            el.style.backgroundColor = val;
            return true;
        });

        this._fallbackRules.set('color', (el, val) => {
            el.style.color = val;
            return true;
        });

        this._fallbackRules.set('opacity', (el, val) => {
            el.style.opacity = val;
            return true;
        });

        // Transitions & Animations
        this._fallbackRules.set('smooth', (el, val) => {
            if (typeof val === 'boolean') {
                el.style.transition = val ? 'all 0.3s ease' : 'none';
            } else if (typeof val === 'number') {
                el.style.borderRadius = `${val}px`;
                el.style.transition = el.style.transition || 'all 0.3s ease';
            } else {
                el.style.transition = val;
            }
            return true;
        });

        this._fallbackRules.set('transition', (el, val) => {
            el.style.transition = val;
            return true;
        });

        this._fallbackRules.set('transform', (el, val) => {
            el.style.transform = val;
            return true;
        });
    }

    _needsPx(cssProperty) {
        const pxProperties = new Set([
            'width', 'height', 'top', 'left', 'right', 'bottom',
            'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'border-width', 'border-radius', 'font-size', 'line-height'
        ]);
        return pxProperties.has(cssProperty);
    }
}

/**
 * 🎯 INSTANCE SINGLETON
 * Une seule instance pour toute l'application
 */
export const universalProcessor = new UniversalParticleProcessor();

/**
 * 🚀 API SIMPLE POUR LES WEB COMPONENTS
 */
export function processParticle(element, particleName, value, options = {}) {
    return universalProcessor.process(element, particleName, value, options);
}

/**
 * 🎨 API BATCH POUR MULTIPLES PARTICLES
 */
export function processParticles(element, particles, options = {}) {
    const results = [];
    
    for (const [name, value] of Object.entries(particles)) {
        const result = universalProcessor.process(element, name, value, options);
        results.push({ name, value, success: result });
    }
    
    return results;
}

/**
 * 🎯 API SPÉCIALISÉE POUR CONTAINER STYLE
 */
export function processContainerStyle(element, containerStyle, options = {}) {
    return universalProcessor.process(element, 'containerStyle', containerStyle, options);
}

// Export par défaut pour compatibilité
export default universalProcessor;