/**
 * 🚀 GESTIONNAIRE DE CACHE DOM OPTIMISÉ V2.0
 * Cache intelligent avec prédiction, compression et optimisations avancées
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
        
        // 🆕 NOUVELLES OPTIMISATIONS V2.0
        this.smartCache = new Map(); // Cache prédictif
        this.compressionCache = new Map(); // Cache compressé pour gros objets
        this.accessPatterns = new Map(); // Patterns d'accès pour prédiction
        this.prefetchQueue = new Set(); // Queue de préchargement
        this.virtualDOMCache = new Map(); // Cache de DOM virtuel
        this.lazyLoadQueue = new Set(); // Queue de chargement paresseux
        
        // Métriques avancées
        this.advancedMetrics = {
            cacheCompression: 0,
            prefetchHits: 0,
            virtualDOMHits: 0,
            lazyLoadSaves: 0,
            predictionAccuracy: 0,
            memoryOptimization: 0
        };
        
        // Configuration adaptive
        this.adaptiveConfig = {
            compressionThreshold: 1024, // Compresser si > 1KB
            prefetchLimit: 50,
            maxVirtualNodes: 1000,
            cleanupInterval: 30000,
            adaptiveResize: true
        };
        
        this.init();
        this.initAdvancedOptimizations();
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

    initAdvancedOptimizations() {
        // Observer d'intersections pour lazy loading intelligent
        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.triggerLazyLoad(entry.target);
                }
            });
        }, { 
            rootMargin: '50px',
            threshold: [0, 0.1, 0.5, 1.0]
        });

        // Worker pour compression en arrière-plan
        if (typeof Worker !== 'undefined') {
            this.compressionWorker = this.createCompressionWorker();
        }

        // Monitoring adaptatif de la mémoire
        this.startAdaptiveMemoryMonitoring();

        // Nettoyage intelligent périodique
        this.startIntelligentCleanup();
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
     * 🚀 MISE À JOUR EN LOT OPTIMISÉE
     * Applique plusieurs modifications DOM en une seule opération pour éviter les reflows
     */
    batchUpdate(element, updateCallback) {
        if (!element || typeof updateCallback !== 'function') {
            console.warn('DOMCache.batchUpdate: Invalid element or callback');
            return;
        }

        // Désactiver temporairement les transitions pour optimiser
        const originalTransition = element.style.transition;
        element.style.transition = 'none';

        try {
            // Exécuter les modifications en lot
            updateCallback.call(this, element);
            
            // Invalider les caches associés
            this.invalidateElement(element);
            
        } catch (error) {
            console.error('DOMCache.batchUpdate error:', error);
        } finally {
            // Restaurer les transitions
            if (originalTransition) {
                element.style.transition = originalTransition;
            } else {
                element.style.removeProperty('transition');
            }
        }
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
     * 🧠 CACHE PRÉDICTIF - Anticipe les besoins futurs
     */
    predictiveGet(selector, context = document) {
        const cacheKey = `${selector}@${context.id || 'document'}`;
        
        // Enregistrer le pattern d'accès
        this.recordAccessPattern(cacheKey);
        
        // Vérifier le cache normal d'abord
        const cached = this.getElement(selector, context);
        if (cached) {
            // Déclencher la prédiction pour le prochain élément probable
            this.triggerPredictivePrefetch(cacheKey);
            return cached;
        }
        
        return cached;
    }

    recordAccessPattern(cacheKey) {
        const now = Date.now();
        if (!this.accessPatterns.has(cacheKey)) {
            this.accessPatterns.set(cacheKey, {
                count: 0,
                lastAccess: now,
                averageInterval: 0,
                predictions: []
            });
        }
        
        const pattern = this.accessPatterns.get(cacheKey);
        if (pattern.lastAccess) {
            const interval = now - pattern.lastAccess;
            pattern.averageInterval = (pattern.averageInterval + interval) / 2;
        }
        
        pattern.count++;
        pattern.lastAccess = now;
        
        // Nettoyer les anciennes prédictions
        pattern.predictions = pattern.predictions.filter(p => now - p.timestamp < 10000);
    }

    triggerPredictivePrefetch(currentKey) {
        const relatedSelectors = this.findRelatedSelectors(currentKey);
        relatedSelectors.forEach(selector => {
            if (this.prefetchQueue.size < this.adaptiveConfig.prefetchLimit) {
                this.prefetchQueue.add(selector);
                this.schedulePrefetch(selector);
            }
        });
    }

    /**
     * 🗜️ COMPRESSION INTELLIGENTE - Compresse automatiquement les gros objets
     */
    async setCompressed(key, value) {
        const serialized = JSON.stringify(value);
        
        if (serialized.length > this.adaptiveConfig.compressionThreshold) {
            try {
                const compressed = await this.compressData(serialized);
                this.compressionCache.set(key, {
                    data: compressed,
                    isCompressed: true,
                    originalSize: serialized.length,
                    compressedSize: compressed.length,
                    timestamp: Date.now()
                });
                
                this.advancedMetrics.cacheCompression++;
                this.advancedMetrics.memoryOptimization += (serialized.length - compressed.length);
                
                return true;
            } catch (error) {
                console.warn('Compression failed, storing uncompressed:', error);
            }
        }
        
        // Stocker sans compression
        this.compressionCache.set(key, {
            data: value,
            isCompressed: false,
            timestamp: Date.now()
        });
        
        return false;
    }

    async getCompressed(key) {
        const cached = this.compressionCache.get(key);
        if (!cached) return null;
        
        if (cached.isCompressed) {
            try {
                const decompressed = await this.decompressData(cached.data);
                return JSON.parse(decompressed);
            } catch (error) {
                console.warn('Decompression failed:', error);
                this.compressionCache.delete(key);
                return null;
            }
        }
        
        return cached.data;
    }

    /**
     * 🖥️ DOM VIRTUEL - Cache de structures DOM complexes
     */
    createVirtualDOM(element) {
        if (this.virtualDOMCache.size >= this.adaptiveConfig.maxVirtualNodes) {
            this.cleanupVirtualDOM();
        }
        
        const virtualNode = {
            tagName: element.tagName,
            id: element.id,
            className: element.className,
            attributes: Array.from(element.attributes).map(attr => ({
                name: attr.name,
                value: attr.value
            })),
            computedStyle: this.extractEssentialStyles(element),
            children: Array.from(element.children).map(child => this.createVirtualDOM(child)),
            timestamp: Date.now()
        };
        
        const virtualId = element.id || `virtual_${Date.now()}_${Math.random()}`;
        this.virtualDOMCache.set(virtualId, virtualNode);
        this.advancedMetrics.virtualDOMHits++;
        
        return virtualNode;
    }

    extractEssentialStyles(element) {
        const computed = window.getComputedStyle(element);
        const essential = {};
        
        // Extraire seulement les styles essentiels pour économiser la mémoire
        const essentialProps = [
            'display', 'position', 'width', 'height', 'top', 'left',
            'margin', 'padding', 'border', 'backgroundColor', 'color'
        ];
        
        essentialProps.forEach(prop => {
            essential[prop] = computed[prop];
        });
        
        return essential;
    }

    /**
     * 🔄 LAZY LOADING INTELLIGENT
     */
    enableIntelligentLazyLoading(elements) {
        elements.forEach(element => {
            if (!this.lazyLoadQueue.has(element)) {
                this.lazyLoadQueue.add(element);
                this.intersectionObserver.observe(element);
                this.advancedMetrics.lazyLoadSaves++;
            }
        });
    }

    triggerLazyLoad(element) {
        // Charger le contenu réel
        if (element.dataset.src) {
            element.src = element.dataset.src;
            delete element.dataset.src;
        }
        
        // Déclencher les événements personnalisés
        element.dispatchEvent(new CustomEvent('lazyloaded', {
            detail: { element, timestamp: Date.now() }
        }));
        
        // Nettoyer l'observation
        this.intersectionObserver.unobserve(element);
        this.lazyLoadQueue.delete(element);
    }

    /**
     * 📊 MÉTRIQUES AVANCÉES
     */
    getAdvancedMetrics() {
        const memoryUsage = this.calculateMemoryUsage();
        const efficiency = this.calculateCacheEfficiency();
        
        return {
            ...this.performanceMetrics,
            ...this.advancedMetrics,
            memoryUsage,
            efficiency,
            adaptiveConfig: this.adaptiveConfig,
            cacheStatus: {
                smart: this.smartCache.size,
                compression: this.compressionCache.size,
                virtual: this.virtualDOMCache.size,
                prefetch: this.prefetchQueue.size,
                lazyLoad: this.lazyLoadQueue.size
            }
        };
    }

    calculateMemoryUsage() {
        let totalMemory = 0;
        
        // Calculer l'usage approximatif de chaque cache
        this.elementCache.forEach(value => {
            totalMemory += this.estimateObjectSize(value);
        });
        
        this.compressionCache.forEach(value => {
            totalMemory += value.isCompressed ? value.compressedSize : this.estimateObjectSize(value.data);
        });
        
        return {
            estimated: `${(totalMemory / 1024).toFixed(2)} KB`,
            compressionSaving: `${(this.advancedMetrics.memoryOptimization / 1024).toFixed(2)} KB`,
            efficiency: `${((this.advancedMetrics.memoryOptimization / totalMemory) * 100).toFixed(1)}%`
        };
    }

    /**
     * 🧹 NETTOYAGE INTELLIGENT
     */
    startIntelligentCleanup() {
        setInterval(() => {
            this.performIntelligentCleanup();
        }, this.adaptiveConfig.cleanupInterval);
    }

    performIntelligentCleanup() {
        const now = Date.now();
        const cleanupThreshold = 300000; // 5 minutes
        
        // Nettoyer les caches anciens
        for (const [key, value] of this.compressionCache) {
            if (now - value.timestamp > cleanupThreshold) {
                this.compressionCache.delete(key);
            }
        }
        
        // Nettoyer le DOM virtuel
        this.cleanupVirtualDOM();
        
        // Adapter la configuration selon l'usage
        this.adaptConfiguration();
        
        console.log('🧹 DOM Cache: Intelligent cleanup completed');
    }

    adaptConfiguration() {
        const metrics = this.getAdvancedMetrics();
        
        // Adapter le seuil de compression selon l'efficacité
        if (parseFloat(metrics.efficiency.efficiency) > 30) {
            this.adaptiveConfig.compressionThreshold = Math.max(512, this.adaptiveConfig.compressionThreshold - 128);
        } else {
            this.adaptiveConfig.compressionThreshold = Math.min(2048, this.adaptiveConfig.compressionThreshold + 128);
        }
        
        // Adapter la limite de prefetch selon l'usage mémoire
        const memoryUsage = parseInt(metrics.memoryUsage.estimated);
        if (memoryUsage > 1000) { // > 1MB
            this.adaptiveConfig.prefetchLimit = Math.max(10, this.adaptiveConfig.prefetchLimit - 10);
        } else {
            this.adaptiveConfig.prefetchLimit = Math.min(100, this.adaptiveConfig.prefetchLimit + 5);
        }
    }

    /**
     * Cache des données avec compression automatique
     */
    async set(key, value) {
        // Essayer d'abord le cache normal
        if (this.setElement(key, value)) {
            return true;
        }
        
        // Essayer le cache compressé si échec
        return this.setCompressed(key, value);
    }

    /**
     * Récupérer des données avec décompression automatique
     */
    async get(key) {
        // Essayer d'abord le cache normal
        const cached = this.getElement(key);
        if (cached) {
            return cached;
        }
        
        // Essayer le cache compressé si échec
        return this.getCompressed(key);
    }

    /**
     * Méthodes manquantes pour compléter l'optimisation
     */
    
    findRelatedSelectors(currentKey) {
        // Analyser les patterns d'accès pour trouver des sélecteurs liés
        const related = [];
        const currentPattern = this.accessPatterns.get(currentKey);
        
        if (currentPattern) {
            // Chercher des sélecteurs avec des patterns similaires
            for (const [key, pattern] of this.accessPatterns) {
                if (key !== currentKey && 
                    Math.abs(pattern.averageInterval - currentPattern.averageInterval) < 1000) {
                    related.push(key);
                }
            }
        }
        
        return related.slice(0, 5); // Limiter à 5 sélecteurs
    }

    schedulePrefetch(selector) {
        // Programmer le préchargement en idle time
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
                this.performPrefetch(selector);
            });
        } else {
            setTimeout(() => this.performPrefetch(selector), 100);
        }
    }

    performPrefetch(selector) {
        try {
            const [selectorPart, contextId] = selector.split('@');
            const context = contextId === 'document' ? document : document.getElementById(contextId);
            
            if (context) {
                this.getElement(selectorPart, context);
                this.advancedMetrics.prefetchHits++;
            }
        } catch (error) {
            console.warn('Prefetch failed for:', selector, error);
        } finally {
            this.prefetchQueue.delete(selector);
        }
    }

    async compressData(data) {
        if (this.compressionWorker) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Compression timeout')), 5000);
                
                this.compressionWorker.postMessage({ action: 'compress', data });
                this.compressionWorker.onmessage = (e) => {
                    clearTimeout(timeout);
                    if (e.data.action === 'compress') {
                        resolve(e.data.data);
                    }
                };
            });
        } else {
            // Fallback compression
            return btoa(unescape(encodeURIComponent(data)));
        }
    }

    async decompressData(compressedData) {
        if (this.compressionWorker) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Decompression timeout')), 5000);
                
                this.compressionWorker.postMessage({ action: 'decompress', data: compressedData });
                this.compressionWorker.onmessage = (e) => {
                    clearTimeout(timeout);
                    if (e.data.action === 'decompress') {
                        resolve(e.data.data);
                    }
                };
            });
        } else {
            // Fallback decompression
            return decodeURIComponent(escape(atob(compressedData)));
        }
    }

    cleanupVirtualDOM() {
        const now = Date.now();
        const threshold = 600000; // 10 minutes
        
        for (const [id, node] of this.virtualDOMCache) {
            if (now - node.timestamp > threshold) {
                this.virtualDOMCache.delete(id);
            }
        }
    }

    calculateCacheEfficiency() {
        const total = this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses;
        const hitRate = total > 0 ? (this.performanceMetrics.cacheHits / total) : 0;
        
        return {
            hitRate: `${(hitRate * 100).toFixed(2)}%`,
            totalRequests: total,
            compressionRatio: this.calculateCompressionRatio(),
            memoryEfficiency: this.calculateMemoryEfficiency()
        };
    }

    calculateCompressionRatio() {
        let totalOriginal = 0;
        let totalCompressed = 0;
        
        for (const [key, value] of this.compressionCache) {
            if (value.isCompressed) {
                totalOriginal += value.originalSize;
                totalCompressed += value.compressedSize;
            }
        }
        
        return totalOriginal > 0 ? 
            `${((1 - totalCompressed / totalOriginal) * 100).toFixed(1)}%` : '0%';
    }

    calculateMemoryEfficiency() {
        const cacheCount = this.elementCache.size + this.compressionCache.size + this.virtualDOMCache.size;
        const memoryOptimized = this.advancedMetrics.memoryOptimization;
        
        return {
            totalCaches: cacheCount,
            memoryOptimized: `${(memoryOptimized / 1024).toFixed(2)} KB`,
            averageOptimization: cacheCount > 0 ? `${(memoryOptimized / cacheCount).toFixed(0)} bytes/cache` : '0 bytes'
        };
    }

    estimateObjectSize(obj) {
        // Estimation approximative de la taille d'un objet en bytes
        return JSON.stringify(obj).length * 2; // UTF-16 approximation
    }

    setElement(key, value) {
        // Méthode helper pour compatibilité
        this.elementCache.set(key, {
            element: value,
            timestamp: Date.now()
        });
        return true;
    }

    startAdaptiveMemoryMonitoring() {
        // Monitoring adaptatif de la mémoire avec ajustements automatiques
        setInterval(() => {
            if (performance.memory) {
                const memoryUsage = performance.memory.usedJSHeapSize / 1024 / 1024; // MB
                
                if (memoryUsage > 100) { // Si > 100MB
                    // Réduire les limites de cache
                    this.adaptiveConfig.maxVirtualNodes = Math.max(100, this.adaptiveConfig.maxVirtualNodes - 100);
                    this.adaptiveConfig.prefetchLimit = Math.max(10, this.adaptiveConfig.prefetchLimit - 5);
                    
                    // Forcer un nettoyage
                    this.performIntelligentCleanup();
                } else if (memoryUsage < 50) { // Si < 50MB
                    // Augmenter les limites de cache
                    this.adaptiveConfig.maxVirtualNodes = Math.min(2000, this.adaptiveConfig.maxVirtualNodes + 50);
                    this.adaptiveConfig.prefetchLimit = Math.min(100, this.adaptiveConfig.prefetchLimit + 5);
                }
            }
        }, 15000); // Check toutes les 15 secondes
    }

    /**
     * Cache des données avec compression automatique
     */
    async set(key, value) {
        // Essayer d'abord le cache normal
        if (this.setElement(key, value)) {
            return true;
        }
        
        // Essayer le cache compressé si échec
        return this.setCompressed(key, value);
    }

    /**
     * Récupérer des données avec décompression automatique
     */
    async get(key) {
        // Essayer d'abord le cache normal
        const cached = this.getElement(key);
        if (cached) {
            return cached;
        }
        
        // Essayer le cache compressé si échec
        return this.getCompressed(key);
    }

    /**
     * Worker pour compression en arrière-plan
     */
    createCompressionWorker() {
        const workerBlob = new Blob([`
            onmessage = function(e) {
                const { action, data } = e.data;
                
                if (action === 'compress') {
                    // Compression des données
                    const compressed = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
                    postMessage({ action: 'compress', data: compressed });
                } else if (action === 'decompress') {
                    // Décompression des données
                    const decompressed = JSON.parse(decodeURIComponent(escape(atob(data))));
                    postMessage({ action: 'decompress', data: decompressed });
                }
            };
        `], { type: 'application/javascript' });
        
        const worker = new Worker(URL.createObjectURL(workerBlob));
        worker.onmessage = (e) => {
            const { action, data } = e.data;
            if (action === 'compress' || action === 'decompress') {
                this.handleWorkerResult(action, data);
            }
        };
        
        return worker;
    }

    handleWorkerResult(action, data) {
        // Gérer les résultats de compression/décompression
        console.log(`Worker ${action} completed`, data);
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
export { DOMCache };
export default domCache;

// Compatibilité globale
window.domCache = domCache;
window.DOMCache = DOMCache;
