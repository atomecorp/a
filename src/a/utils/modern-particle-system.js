/**
 * 🚀 MODERN PARTICLE SYSTEM - Ultra Performance Core
 * 
 * Système unifié qui bridge Framework A + Web Components avec performance optimale
 * 
 * @version 3.0.0 - MODERN HYBRID SYSTEM
 * @author Squirrel Framework Team
 */

import { sharedParticles } from './shared-particles.js';

// Cache global optimisé
const globalParticleCache = new Map();
const processingQueue = new Map();
let rafId = null;

/**
 * 🎯 MODERN PARTICLE PROCESSOR
 * Processeur unifié ultra-performant
 */
class ModernParticleProcessor {
    constructor() {
        this.particles = new Map();
        this.fallbackEnabled = true;
        this.batchMode = true;
        this.performanceMode = true;
        
        // Charger les particules partagées
        this._loadSharedParticles();
        
        // Initialiser les optimisations
        this._initOptimizations();
    }

    /**
     * 📦 CHARGER PARTICULES PARTAGÉES
     */
    _loadSharedParticles() {
        sharedParticles.forEach(particle => {
            this.defineParticle(particle);
        });
    }

    /**
     * ⚡ INITIALISER OPTIMISATIONS
     */
    _initOptimizations() {
        // Observer la performance
        this._setupPerformanceMonitor();
        
        // Précompiler les particules courantes
        this._precompileCommonParticles();
    }

    /**
     * 📊 MONITEUR DE PERFORMANCE
     */
    _setupPerformanceMonitor() {
        if (typeof window !== 'undefined' && window.PerformanceObserver) {
            try {
                const observer = new PerformanceObserver((list) => {
                    // Ajuster automatiquement les optimisations
                    this._adjustOptimizations(list.getEntries());
                });
                observer.observe({ entryTypes: ['measure'] });
            } catch (e) {
                console.warn('Performance monitoring not available');
            }
        }
    }

    /**
     * 🔧 AJUSTER OPTIMISATIONS AUTOMATIQUEMENT
     */
    _adjustOptimizations(entries) {
        const avgDuration = entries.reduce((sum, entry) => sum + entry.duration, 0) / entries.length;
        
        if (avgDuration > 16) { // Plus de 16ms = 60fps compromis
            this.batchMode = true;
            this.performanceMode = true;
        } else if (avgDuration < 5) {
            this.performanceMode = false; // Peut relaxer les optimisations
        }
    }

    /**
     * 🚀 PRÉCOMPILER PARTICULES COMMUNES
     */
    _precompileCommonParticles() {
        const commonNames = ['x', 'y', 'width', 'height', 'backgroundColor', 'opacity'];
        commonNames.forEach(name => {
            if (this.particles.has(name)) {
                const particle = this.particles.get(name);
                // Précompiler avec des valeurs typiques pour le cache
                const testValues = [0, 10, 100, 200, '50px', '#fff', 'red', 0.5, 1];
                testValues.forEach(value => {
                    try {
                        this._optimizeProcess(particle.process)(null, value, { precompile: true });
                    } catch (e) {
                        // Ignorer les erreurs de précompilation
                    }
                });
            }
        });
    }

    /**
     * ✨ DÉFINIR UNE PARTICULE
     */
    defineParticle(config) {
        if (!config?.name || !config?.process) {
            throw new Error('Invalid particle definition');
        }

        const optimizedConfig = {
            ...config,
            processOptimized: this._optimizeProcess(config.process),
            metadata: {
                defined: Date.now(),
                category: config.category || 'custom',
                type: config.type || 'mixed'
            }
        };

        this.particles.set(config.name, optimizedConfig);
        
        // Intégration Framework A si disponible
        if (typeof window?.defineParticle === 'function') {
            window.defineParticle(config);
        }

        return optimizedConfig;
    }

    /**
     * 🔥 OPTIMISEUR DE PROCESSUS
     */
    _optimizeProcess(processFunc) {
        const funcString = processFunc.toString();
        const cacheKey = `opt_${funcString.slice(0, 100)}`;
        
        if (globalParticleCache.has(cacheKey)) {
            return globalParticleCache.get(cacheKey);
        }

        const optimized = (element, value, options = {}) => {
            // Mode précompilation
            if (options.precompile) {
                return { precompiled: true };
            }

            // Cache par élément et valeur
            const elementId = element?.id || element?.tagName || 'unknown';
            const valueKey = `${elementId}_${JSON.stringify(value)}`;
            
            if (globalParticleCache.has(valueKey) && !options.force) {
                return globalParticleCache.get(valueKey);
            }

            // Mode batch optimisé
            if (this.batchMode && options.batch) {
                return this._queueForBatch(element, processFunc, value, options);
            }

            // Mode performance critique
            if (this.performanceMode && options.async) {
                return new Promise(resolve => {
                    requestAnimationFrame(() => {
                        const result = processFunc(element, value, options);
                        globalParticleCache.set(valueKey, result);
                        resolve(result);
                    });
                });
            }

            // Mode synchrone standard
            const result = processFunc(element, value, options);
            globalParticleCache.set(valueKey, result);
            return result;
        };

        globalParticleCache.set(cacheKey, optimized);
        return optimized;
    }

    /**
     * 📦 QUEUE POUR TRAITEMENT BATCH
     */
    _queueForBatch(element, processFunc, value, options) {
        const elementId = element?.id || element?.tagName || Date.now();
        
        if (!processingQueue.has(elementId)) {
            processingQueue.set(elementId, []);
        }
        
        processingQueue.get(elementId).push({ processFunc, value, options });
        
        // Programmer le traitement batch
        if (!rafId) {
            rafId = requestAnimationFrame(() => this._processBatchQueue());
        }
        
        return Promise.resolve(true);
    }

    /**
     * ⚡ TRAITER LA QUEUE BATCH
     */
    _processBatchQueue() {
        rafId = null;
        
        processingQueue.forEach((queue, elementId) => {
            const element = document.getElementById(elementId) || document.querySelector(elementId);
            if (element) {
                queue.forEach(({ processFunc, value, options }) => {
                    try {
                        processFunc(element, value, options);
                    } catch (error) {
                        console.warn(`Batch processing error for ${elementId}:`, error);
                    }
                });
            }
        });
        
        processingQueue.clear();
    }

    /**
     * 🎯 PROCESSUS UNIFIÉ
     */
    processParticle(element, particleName, value, options = {}) {
        performance.mark(`particle-${particleName}-start`);
        
        try {
            const result = this._processParticleCore(element, particleName, value, options);
            
            performance.mark(`particle-${particleName}-end`);
            performance.measure(
                `particle-${particleName}`,
                `particle-${particleName}-start`,
                `particle-${particleName}-end`
            );
            
            return result;
        } catch (error) {
            console.error(`Error processing particle '${particleName}':`, error);
            return this._processFallback(element, particleName, value, options);
        }
    }

    /**
     * 🔧 PROCESSUS CORE
     */
    _processParticleCore(element, particleName, value, options) {
        // 1. Particules modernes
        if (this.particles.has(particleName)) {
            const particle = this.particles.get(particleName);
            
            // Target pour Web Components
            const target = this._getTarget(element, options);
            
            return particle.processOptimized(target, value, {
                ...options,
                webComponent: !!element.shadowRoot,
                shadowRoot: element.shadowRoot
            });
        }
        
        // 2. Framework A traditionnel
        if (typeof window?.setParticle === 'function') {
            return window.setParticle(element, particleName, value, options);
        }
        
        // 3. Fallback
        return this._processFallback(element, particleName, value, options);
    }

    /**
     * 🎯 OBTENIR ÉLÉMENT CIBLE
     */
    _getTarget(element, options) {
        if (options.webComponent && element.shadowRoot) {
            return element.shadowRoot.querySelector('.particle-container') || element;
        }
        return element;
    }

    /**
     * 🛡️ FALLBACK SYSTEM
     */
    _processFallback(element, particleName, value, options) {
        console.warn(`Using fallback for particle '${particleName}'`);
        
        const fallbacks = {
            x: (el, val) => el.style.left = this._formatValue(val, 'px'),
            y: (el, val) => el.style.top = this._formatValue(val, 'px'),
            width: (el, val) => el.style.width = this._formatValue(val, 'px'),
            height: (el, val) => el.style.height = this._formatValue(val, 'px'),
            backgroundColor: (el, val) => el.style.backgroundColor = val,
            opacity: (el, val) => el.style.opacity = val,
            smooth: (el, val) => el.style.transition = val ? 'all 0.3s ease' : 'none'
        };

        const fallback = fallbacks[particleName];
        if (fallback) {
            return fallback(element, value);
        }

        // Fallback ultime
        if (typeof value === 'string' || typeof value === 'number') {
            element.style[particleName] = value;
        }
        
        return false;
    }

    /**
     * 🔧 FORMATER VALEUR
     */
    _formatValue(value, unit = '') {
        if (typeof value === 'number' && unit) {
            return `${value}${unit}`;
        }
        return value;
    }

    /**
     * 🔥 TRAITEMENT BATCH MULTIPLE
     */
    async processBatch(element, particlesData, options = {}) {
        const promises = Object.entries(particlesData).map(([name, value]) => 
            this.processParticle(element, name, value, { ...options, batch: true })
        );

        return Promise.all(promises);
    }

    /**
     * 📊 MÉTRIQUES DE PERFORMANCE
     */
    getMetrics() {
        return {
            particlesCount: this.particles.size,
            cacheSize: globalParticleCache.size,
            queueSize: processingQueue.size,
            batchMode: this.batchMode,
            performanceMode: this.performanceMode,
            fallbackEnabled: this.fallbackEnabled
        };
    }

    /**
     * 🧹 NETTOYER CACHE
     */
    clearCache() {
        globalParticleCache.clear();
        processingQueue.clear();
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }
}

// Instance globale
export const particleProcessor = new ModernParticleProcessor();

// Export des classes
export { ModernParticleProcessor };

/**
 * 🔧 UTILITAIRES GLOBAUX
 */
export const ParticleUtils = {
    /**
     * Créer élément avec particules
     */
    createElement(tag, particles = {}, content = '') {
        const element = document.createElement(tag);
        if (content) element.textContent = content;
        
        Object.entries(particles).forEach(([name, value]) => {
            particleProcessor.processParticle(element, name, value);
        });
        
        return element;
    },

    /**
     * Update en lot optimisé
     */
    updateElements(elements, particles) {
        const promises = elements.map(el => 
            particleProcessor.processBatch(el, particles)
        );
        return Promise.all(promises);
    },

    /**
     * Moniteur de performance
     */
    monitor() {
        return particleProcessor.getMetrics();
    },

    /**
     * Optimiser pour performance
     */
    optimize() {
        particleProcessor.performanceMode = true;
        particleProcessor.batchMode = true;
    },

    /**
     * Reset pour debugging
     */
    reset() {
        particleProcessor.clearCache();
        particleProcessor.performanceMode = false;
        particleProcessor.batchMode = false;
    }
};
