/**
 * 🚀 SYSTÈME DE CACHE DOM INTELLIGENT
 * Optimise les accès DOM et réduit les reflows/repaints
 */

class DOMCache {
    constructor() {
        this.elementCache = new Map();
        this.computedStyleCache = new Map();
        this.boundingRectCache = new Map();
        this.observedElements = new WeakSet();
        this.mutationObserver = null;
        this.resizeObserver = null;
        this.performanceMetrics = {
            cacheHits: 0,
            cacheMisses: 0,
            invalidations: 0
        };
        
        this.init();
    }

    init() {
        // Observer pour invalidation automatique du cache
        this.mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' || mutation.type === 'childList') {
                    this.invalidateElement(mutation.target);
                }
            });
        });

        // Observer pour invalidation des dimensions
        this.resizeObserver = new ResizeObserver((entries) => {
            entries.forEach((entry) => {
                this.invalidateBoundingRect(entry.target);
            });
        });

        // Nettoyage périodique
        this.startPeriodicCleanup();
    }

    /**
     * Cache intelligent d'éléments DOM
     */
    getElement(selector, context = document) {
        const cacheKey = `${selector}@${context.id || 'document'}`;
        
        if (this.elementCache.has(cacheKey)) {
            const cached = this.elementCache.get(cacheKey);
            if (cached.element && document.contains(cached.element)) {
                this.performanceMetrics.cacheHits++;
                return cached.element;
            } else {
                this.elementCache.delete(cacheKey);
            }
        }

        this.performanceMetrics.cacheMisses++;
        const element = context.querySelector(selector);
        
        if (element) {
            this.elementCache.set(cacheKey, {
                element,
                timestamp: Date.now()
            });
            
            // Observer l'élément pour invalidation automatique
            if (!this.observedElements.has(element)) {
                this.mutationObserver.observe(element, {
                    attributes: true,
                    childList: true,
                    subtree: false
                });
                this.observedElements.add(element);
            }
        }

        return element;
    }

    /**
     * Cache des styles calculés
     */
    getComputedStyle(element, property) {
        const elementId = this.getElementId(element);
        const cacheKey = `${elementId}:${property}`;
        
        if (this.computedStyleCache.has(cacheKey)) {
            const cached = this.computedStyleCache.get(cacheKey);
            if (Date.now() - cached.timestamp < 5000) { // 5s de validité
                this.performanceMetrics.cacheHits++;
                return cached.value;
            }
        }

        this.performanceMetrics.cacheMisses++;
        const computedStyle = window.getComputedStyle(element);
        const value = property ? computedStyle[property] : computedStyle;
        
        this.computedStyleCache.set(cacheKey, {
            value,
            timestamp: Date.now()
        });

        return value;
    }

    /**
     * Cache des dimensions (getBoundingClientRect)
     */
    getBoundingClientRect(element) {
        const elementId = this.getElementId(element);
        
        if (this.boundingRectCache.has(elementId)) {
            const cached = this.boundingRectCache.get(elementId);
            if (Date.now() - cached.timestamp < 1000) { // 1s de validité
                this.performanceMetrics.cacheHits++;
                return cached.rect;
            }
        }

        this.performanceMetrics.cacheMisses++;
        const rect = element.getBoundingClientRect();
        
        this.boundingRectCache.set(elementId, {
            rect: {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                right: rect.right,
                bottom: rect.bottom
            },
            timestamp: Date.now()
        });

        // Observer les changements de taille
        if (!this.observedElements.has(element)) {
            this.resizeObserver.observe(element);
            this.observedElements.add(element);
        }

        return this.boundingRectCache.get(elementId).rect;
    }

    /**
     * Invalidation intelligente
     */
    invalidateElement(element) {
        const elementId = this.getElementId(element);
        
        // Supprimer tous les caches liés à cet élément
        for (const [key, _] of this.computedStyleCache) {
            if (key.startsWith(elementId + ':')) {
                this.computedStyleCache.delete(key);
                this.performanceMetrics.invalidations++;
            }
        }
        
        this.invalidateBoundingRect(element);
    }

    invalidateBoundingRect(element) {
        const elementId = this.getElementId(element);
        this.boundingRectCache.delete(elementId);
        this.performanceMetrics.invalidations++;
    }

    /**
     * Batch DOM operations pour performance
     */
    batchDOMOperations(operations) {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                const results = [];
                
                // Désactiver les transitions temporairement si beaucoup d'opérations
                const disableTransitions = operations.length > 10;
                if (disableTransitions) {
                    document.body.style.transition = 'none';
                }

                operations.forEach((operation, index) => {
                    try {
                        const result = operation();
                        results[index] = result;
                    } catch (error) {
                        console.warn('DOM operation failed:', error);
                        results[index] = null;
                    }
                });

                if (disableTransitions) {
                    // Force reflow puis réactiver
                    document.body.offsetHeight;
                    document.body.style.transition = '';
                }

                resolve(results);
            });
        });
    }

    /**
     * Optimisation des recherches multiples
     */
    batchQuerySelector(selectors, context = document) {
        const results = {};
        const fragment = document.createDocumentFragment();
        
        // Utiliser querySelectorAll quand possible
        if (selectors.every(s => typeof s === 'string')) {
            const combinedSelector = selectors.join(', ');
            const elements = context.querySelectorAll(combinedSelector);
            
            selectors.forEach((selector, index) => {
                results[selector] = Array.from(elements).filter(el => 
                    el.matches(selector)
                );
            });
        } else {
            // Fallback pour sélecteurs complexes
            selectors.forEach(selector => {
                results[selector] = this.getElement(selector, context);
            });
        }

        return results;
    }

    /**
     * Utilitaires
     */
    getElementId(element) {
        if (element.id) return element.id;
        if (element._cacheId) return element._cacheId;
        
        // Générer un ID unique basé sur position dans le DOM
        const path = this.getElementPath(element);
        element._cacheId = `elem_${this.hashCode(path)}`;
        return element._cacheId;
    }

    getElementPath(element) {
        const path = [];
        let current = element;
        
        while (current && current !== document.body) {
            const index = Array.from(current.parentNode?.children || []).indexOf(current);
            path.unshift(`${current.tagName.toLowerCase()}:${index}`);
            current = current.parentNode;
        }
        
        return path.join('/');
    }

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    startPeriodicCleanup() {
        setInterval(() => {
            this.cleanup();
        }, 30000); // Nettoyage toutes les 30s
    }

    cleanup() {
        const now = Date.now();
        const maxAge = 60000; // 1 minute

        // Nettoyer les caches expirés
        for (const [key, cached] of this.elementCache) {
            if (now - cached.timestamp > maxAge) {
                this.elementCache.delete(key);
            }
        }

        for (const [key, cached] of this.computedStyleCache) {
            if (now - cached.timestamp > maxAge) {
                this.computedStyleCache.delete(key);
            }
        }

        for (const [key, cached] of this.boundingRectCache) {
            if (now - cached.timestamp > maxAge) {
                this.boundingRectCache.delete(key);
            }
        }
    }

    /**
     * Métriques de performance
     */
    getPerformanceMetrics() {
        const total = this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses;
        const hitRate = total > 0 ? (this.performanceMetrics.cacheHits / total * 100).toFixed(2) : 0;
        
        return {
            ...this.performanceMetrics,
            hitRate: `${hitRate}%`,
            cacheSize: {
                elements: this.elementCache.size,
                computedStyles: this.computedStyleCache.size,
                boundingRects: this.boundingRectCache.size
            }
        };
    }

    /**
     * Nettoyage complet
     */
    destroy() {
        this.mutationObserver?.disconnect();
        this.resizeObserver?.disconnect();
        this.elementCache.clear();
        this.computedStyleCache.clear();
        this.boundingRectCache.clear();
    }
}

// Singleton global
const domCache = new DOMCache();

// Export pour ES6
export default domCache;

// Compatibilité globale
window.domCache = domCache;
