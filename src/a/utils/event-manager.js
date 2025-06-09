/**
 * 🚀 GESTIONNAIRE D'ÉVÉNEMENTS OPTIMISÉ
 * Event delegation, pooling et cleanup automatique des memory leaks
 */

class EventManager {
    constructor() {
        this.delegates = new Map();
        this.listeners = new WeakMap();
        this.throttledEvents = new Map();
        this.debouncedEvents = new Map();
        this.eventPool = new Map();
        this.performanceMetrics = {
            delegatedEvents: 0,
            directEvents: 0,
            throttledCalls: 0,
            debouncedCalls: 0,
            memoryLeaksPrevented: 0
        };

        this.init();
    }

    init() {
        // Nettoyage automatique lors du unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        // Monitor pour détecter les fuites mémoire
        this.startMemoryMonitoring();
    }

    /**
     * Event delegation optimisée
     */
    delegate(container, selector, eventType, handler, options = {}) {
        const containerId = this.getContainerId(container);
        const delegateKey = `${containerId}:${eventType}`;

        if (!this.delegates.has(delegateKey)) {
            this.delegates.set(delegateKey, new Map());
            
            // Créer le délégué principal
            const delegateHandler = (event) => {
                const handlers = this.delegates.get(delegateKey);
                
                for (const [sel, handlerData] of handlers) {
                    const target = event.target.closest(sel);
                    if (target && container.contains(target)) {
                        try {
                            handlerData.handler.call(target, event);
                            this.performanceMetrics.delegatedEvents++;
                        } catch (error) {
                            console.error('Delegated event handler error:', error);
                        }
                    }
                }
            };

            container.addEventListener(eventType, delegateHandler, {
                passive: options.passive !== false,
                capture: options.capture || false
            });
        }

        // Enregistrer le handler pour ce sélecteur
        this.delegates.get(delegateKey).set(selector, {
            handler,
            options
        });

        return () => this.undelegate(container, selector, eventType);
    }

    /**
     * Suppression de delegation
     */
    undelegate(container, selector, eventType) {
        const containerId = this.getContainerId(container);
        const delegateKey = `${containerId}:${eventType}`;
        
        if (this.delegates.has(delegateKey)) {
            const handlers = this.delegates.get(delegateKey);
            handlers.delete(selector);
            
            // Si plus de handlers, supprimer le délégué
            if (handlers.size === 0) {
                this.delegates.delete(delegateKey);
                // Le removeEventListener sera fait automatiquement
                this.performanceMetrics.memoryLeaksPrevented++;
            }
        }
    }

    /**
     * Event listener avec cleanup automatique
     */
    on(element, eventType, handler, options = {}) {
        if (!this.listeners.has(element)) {
            this.listeners.set(element, new Map());
        }

        const elementListeners = this.listeners.get(element);
        const listenerKey = `${eventType}:${handler.toString().slice(0, 50)}`;

        // Éviter les doublons
        if (elementListeners.has(listenerKey)) {
            return elementListeners.get(listenerKey);
        }

        // Wrapper pour nettoyage automatique
        const wrappedHandler = (event) => {
            try {
                handler.call(element, event);
                this.performanceMetrics.directEvents++;
            } catch (error) {
                console.error('Event handler error:', error);
            }
        };

        element.addEventListener(eventType, wrappedHandler, options);
        
        const cleanup = () => {
            element.removeEventListener(eventType, wrappedHandler, options);
            elementListeners.delete(listenerKey);
            this.performanceMetrics.memoryLeaksPrevented++;
        };

        elementListeners.set(listenerKey, cleanup);

        // Auto-cleanup si l'élément est retiré du DOM
        this.observeElementRemoval(element, cleanup);

        return cleanup;
    }

    /**
     * Throttling optimisé
     */
    throttle(element, eventType, handler, delay = 16, options = {}) {
        const throttleKey = `${this.getElementId(element)}:${eventType}:${delay}`;
        
        if (this.throttledEvents.has(throttleKey)) {
            return this.throttledEvents.get(throttleKey);
        }

        let lastCall = 0;
        let timeoutId = null;
        
        const throttledHandler = (event) => {
            const now = Date.now();
            
            if (now - lastCall >= delay) {
                lastCall = now;
                handler.call(element, event);
                this.performanceMetrics.throttledCalls++;
            } else if (!timeoutId) {
                timeoutId = setTimeout(() => {
                    timeoutId = null;
                    lastCall = Date.now();
                    handler.call(element, event);
                    this.performanceMetrics.throttledCalls++;
                }, delay - (now - lastCall));
            }
        };

        const cleanup = this.on(element, eventType, throttledHandler, options);
        
        const wrappedCleanup = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            this.throttledEvents.delete(throttleKey);
            cleanup();
        };

        this.throttledEvents.set(throttleKey, wrappedCleanup);
        return wrappedCleanup;
    }

    /**
     * Debouncing optimisé
     */
    debounce(element, eventType, handler, delay = 300, options = {}) {
        const debounceKey = `${this.getElementId(element)}:${eventType}:${delay}`;
        
        if (this.debouncedEvents.has(debounceKey)) {
            return this.debouncedEvents.get(debounceKey);
        }

        let timeoutId = null;
        
        const debouncedHandler = (event) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            timeoutId = setTimeout(() => {
                handler.call(element, event);
                this.performanceMetrics.debouncedCalls++;
                timeoutId = null;
            }, delay);
        };

        const cleanup = this.on(element, eventType, debouncedHandler, options);
        
        const wrappedCleanup = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            this.debouncedEvents.delete(debounceKey);
            cleanup();
        };

        this.debouncedEvents.set(debounceKey, wrappedCleanup);
        return wrappedCleanup;
    }

    /**
     * Pool d'events pour événements fréquents
     */
    createEventPool(eventType, poolSize = 10) {
        if (this.eventPool.has(eventType)) {
            return this.eventPool.get(eventType);
        }

        const pool = {
            events: [],
            active: new Set(),
            create: () => {
                const event = new Event(eventType, { bubbles: true, cancelable: true });
                return event;
            },
            get: () => {
                let event = pool.events.pop();
                if (!event) {
                    event = pool.create();
                }
                pool.active.add(event);
                return event;
            },
            release: (event) => {
                if (pool.active.has(event)) {
                    pool.active.delete(event);
                    if (pool.events.length < poolSize) {
                        // Reset event properties
                        event.stopPropagation();
                        event.preventDefault();
                        pool.events.push(event);
                    }
                }
            }
        };

        this.eventPool.set(eventType, pool);
        return pool;
    }

    /**
     * Observer pour détection de removal d'éléments
     */
    observeElementRemoval(element, callback) {
        if (!element.parentNode) return;

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.removedNodes.forEach((node) => {
                        if (node === element || (node.contains && node.contains(element))) {
                            callback();
                            observer.disconnect();
                        }
                    });
                }
            });
        });

        observer.observe(element.parentNode, {
            childList: true,
            subtree: true
        });

        return observer;
    }

    /**
     * Monitoring des fuites mémoire
     */
    startMemoryMonitoring() {
        setInterval(() => {
            this.checkMemoryLeaks();
        }, 60000); // Check every minute
    }

    checkMemoryLeaks() {
        let potentialLeaks = 0;
        
        // Vérifier les éléments avec des listeners qui ne sont plus dans le DOM
        for (const [element, listeners] of this.listeners) {
            if (!document.contains(element)) {
                // Nettoyer automatiquement
                for (const cleanup of listeners.values()) {
                    cleanup();
                }
                this.listeners.delete(element);
                potentialLeaks++;
            }
        }

        if (potentialLeaks > 0) {
            console.warn(`🧹 EventManager: Cleaned up ${potentialLeaks} potential memory leaks`);
            this.performanceMetrics.memoryLeaksPrevented += potentialLeaks;
        }
    }

    /**
     * Utilitaires
     */
    getContainerId(container) {
        return container.id || container._eventManagerId || 
               (container._eventManagerId = `container_${Date.now()}_${Math.random()}`);
    }

    getElementId(element) {
        return element.id || element._eventManagerId || 
               (element._eventManagerId = `element_${Date.now()}_${Math.random()}`);
    }

    /**
     * API simplifiée pour patterns courants
     */
    
    // Click avec prévention du double-click
    onClick(element, handler, options = {}) {
        let lastClick = 0;
        const delay = options.doubleClickDelay || 300;
        
        return this.on(element, 'click', (event) => {
            const now = Date.now();
            if (now - lastClick > delay) {
                lastClick = now;
                handler.call(element, event);
            }
        }, options);
    }

    // Hover avec délai
    onHover(element, enterHandler, leaveHandler, delay = 100) {
        let timeoutId = null;
        
        const cleanupEnter = this.on(element, 'mouseenter', () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                enterHandler.call(element);
            }, delay);
        });

        const cleanupLeave = this.on(element, 'mouseleave', () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            leaveHandler.call(element);
        });

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            cleanupEnter();
            cleanupLeave();
        };
    }

    // Scroll optimisé avec throttling automatique
    onScroll(element, handler, options = {}) {
        const throttleDelay = options.throttle || 16; // 60fps
        return this.throttle(element, 'scroll', handler, throttleDelay, {
            passive: true,
            ...options
        });
    }

    // Resize optimisé
    onResize(element, handler, options = {}) {
        const debounceDelay = options.debounce || 250;
        return this.debounce(element, 'resize', handler, debounceDelay, options);
    }

    /**
     * Métriques et debugging
     */
    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            activeDelegates: this.delegates.size,
            activeListeners: Array.from(this.listeners.values()).reduce((sum, map) => sum + map.size, 0),
            activeThrottled: this.throttledEvents.size,
            activeDebounced: this.debouncedEvents.size,
            eventPools: this.eventPool.size
        };
    }

    /**
     * Nettoyage complet
     */
    cleanup() {
        // Nettoyer tous les delegates
        this.delegates.clear();
        
        // Nettoyer tous les listeners
        for (const [element, listeners] of this.listeners) {
            for (const cleanup of listeners.values()) {
                cleanup();
            }
        }
        this.listeners = new WeakMap();
        
        // Nettoyer throttled/debounced
        for (const cleanup of this.throttledEvents.values()) {
            cleanup();
        }
        this.throttledEvents.clear();
        
        for (const cleanup of this.debouncedEvents.values()) {
            cleanup();
        }
        this.debouncedEvents.clear();
        
        // Nettoyer event pools
        this.eventPool.clear();
        
        console.log('🧹 EventManager: Complete cleanup performed');
    }
}

// Singleton global
const eventManager = new EventManager();

// Export pour ES6
export default eventManager;

// Compatibilité globale
window.eventManager = eventManager;
