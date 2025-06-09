/**
 * 🎯 INSTANCE CACHE - Optimized caching for A instances
 * Reduces memory usage and improves performance
 */

class InstanceCache {
    constructor(options = {}) {
        this.cache = new Map();
        this.weakCache = new WeakMap();
        this.pools = new Map();
        this.config = {
            maxSize: options.maxSize || 1000,
            ttl: options.ttl || 300000, // 5 minutes
            cleanupInterval: options.cleanupInterval || 60000, // 1 minute
            poolSizes: {
                small: 50,
                medium: 20,
                large: 10
            },
            ...options
        };
        this.stats = {
            hits: 0,
            misses: 0,
            created: 0,
            recycled: 0,
            evicted: 0
        };
        
        this._startCleanupTimer();
    }

    /**
     * Get cached instance or create new one
     */
    get(key, factory, options = {}) {
        const { ttl = this.config.ttl, pool = null } = options;
        
        // Check cache first
        const cached = this.cache.get(key);
        if (cached && this._isValid(cached, ttl)) {
            this.stats.hits++;
            cached.lastAccess = Date.now();
            return cached.instance;
        }

        // Try to get from pool
        if (pool && this.pools.has(pool)) {
            const pooledInstance = this._getFromPool(pool);
            if (pooledInstance) {
                this.stats.recycled++;
                // Reset instance and cache it
                this._resetInstance(pooledInstance);
                this._cacheInstance(key, pooledInstance, ttl);
                return pooledInstance;
            }
        }

        // Create new instance
        this.stats.misses++;
        this.stats.created++;
        const instance = factory();
        this._cacheInstance(key, instance, ttl);
        
        return instance;
    }

    /**
     * Cache an instance
     */
    _cacheInstance(key, instance, ttl) {
        // Cleanup if cache is full
        if (this.cache.size >= this.config.maxSize) {
            this._evictOldest();
        }

        this.cache.set(key, {
            instance,
            created: Date.now(),
            lastAccess: Date.now(),
            ttl
        });

        // Store weak reference for quick access
        this.weakCache.set(instance, key);
    }

    /**
     * Set instance data (for A framework integration)
     */
    set(instance, data) {
        const key = this.weakCache.get(instance);
        if (key) {
            const cached = this.cache.get(key);
            if (cached) {
                cached.data = data;
                cached.lastAccess = Date.now();
            }
        }
    }

    /**
     * Get instance data
     */
    getData(instance) {
        const key = this.weakCache.get(instance);
        if (key) {
            const cached = this.cache.get(key);
            if (cached && this._isValid(cached)) {
                cached.lastAccess = Date.now();
                return cached.data;
            }
        }
        return null;
    }

    /**
     * Remove instance from cache
     */
    delete(key) {
        const cached = this.cache.get(key);
        if (cached) {
            this.weakCache.delete(cached.instance);
            this.cache.delete(key);
            return true;
        }
        return false;
    }

    /**
     * Return instance to pool for reuse
     */
    returnToPool(instance, poolName = 'default') {
        const key = this.weakCache.get(instance);
        if (key) {
            this.delete(key);
        }

        if (!this.pools.has(poolName)) {
            this.pools.set(poolName, []);
        }

        const pool = this.pools.get(poolName);
        const maxSize = this.config.poolSizes[poolName] || this.config.poolSizes.medium;
        
        if (pool.length < maxSize) {
            this._cleanInstance(instance);
            pool.push(instance);
        }
    }

    /**
     * Get instance from pool
     */
    _getFromPool(poolName) {
        const pool = this.pools.get(poolName);
        return pool && pool.length > 0 ? pool.pop() : null;
    }

    /**
     * Reset instance for reuse
     */
    _resetInstance(instance) {
        if (instance.element) {
            // Clear element content and attributes
            instance.element.innerHTML = '';
            instance.element.className = '';
            instance.element.style.cssText = '';
            
            // Clear custom attributes
            Array.from(instance.element.attributes).forEach(attr => {
                if (attr.name !== 'id') {
                    instance.element.removeAttribute(attr.name);
                }
            });
        }

        // Reset instance properties
        if (instance._data) {
            instance._data = {};
        }
        if (instance._bindings) {
            instance._bindings.clear();
        }
        if (instance._observers) {
            instance._observers.forEach(observer => observer.disconnect());
            instance._observers = [];
        }
    }

    /**
     * Clean instance for pool storage
     */
    _cleanInstance(instance) {
        this._resetInstance(instance);
        
        // Remove from DOM if attached
        if (instance.element && instance.element.parentNode) {
            instance.element.parentNode.removeChild(instance.element);
        }
    }

    /**
     * Check if cached item is valid
     */
    _isValid(cached, customTtl) {
        const ttl = customTtl || cached.ttl;
        return Date.now() - cached.created < ttl;
    }

    /**
     * Evict oldest items
     */
    _evictOldest() {
        const oldest = Array.from(this.cache.entries())
            .sort((a, b) => a[1].lastAccess - b[1].lastAccess)
            .slice(0, Math.floor(this.config.maxSize * 0.1)); // Evict 10%

        oldest.forEach(([key]) => {
            this.delete(key);
            this.stats.evicted++;
        });
    }

    /**
     * Cleanup expired items
     */
    cleanup() {
        const now = Date.now();
        const toDelete = [];

        for (const [key, cached] of this.cache) {
            if (!this._isValid(cached)) {
                toDelete.push(key);
            }
        }

        toDelete.forEach(key => {
            this.delete(key);
            this.stats.evicted++;
        });
    }

    /**
     * Start cleanup timer
     */
    _startCleanupTimer() {
        setInterval(() => {
            this.cleanup();
        }, this.config.cleanupInterval);
    }

    /**
     * Clear all caches
     */
    clear() {
        this.cache.clear();
        this.weakCache = new WeakMap();
        this.pools.clear();
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;
        
        const poolStats = {};
        for (const [name, pool] of this.pools) {
            poolStats[name] = pool.length;
        }

        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            cacheSize: this.cache.size,
            maxSize: this.config.maxSize,
            poolStats,
            memoryUsage: this._estimateMemoryUsage()
        };
    }

    /**
     * Estimate memory usage
     */
    _estimateMemoryUsage() {
        const cacheSize = this.cache.size * 200; // Rough estimate per cached item
        const poolSize = Array.from(this.pools.values())
            .reduce((sum, pool) => sum + pool.length, 0) * 100; // Rough estimate per pooled item
        
        return `${((cacheSize + poolSize) / 1024).toFixed(2)}KB`;
    }
}

/**
 * 🎯 A FRAMEWORK INTEGRATION
 */

class AInstanceCache extends InstanceCache {
    constructor(options = {}) {
        super({
            maxSize: 500,
            ttl: 600000, // 10 minutes for A instances
            poolSizes: {
                div: 30,
                span: 50,
                p: 20,
                button: 25,
                input: 20,
                default: 15
            },
            ...options
        });
    }

    /**
     * Create cached A instance
     */
    createA(element, data = {}, options = {}) {
        const tagName = element?.tagName?.toLowerCase() || 'div';
        const key = this._generateKey(tagName, data, options);
        
        return this.get(key, () => {
            return new A(element, data);
        }, {
            pool: tagName,
            ...options
        });
    }

    /**
     * Generate cache key for A instance
     */
    _generateKey(tagName, data, options) {
        const dataKey = JSON.stringify(data).slice(0, 50); // Limit key length
        const optionsKey = JSON.stringify(options).slice(0, 30);
        return `a:${tagName}:${btoa(dataKey + optionsKey).slice(0, 20)}`;
    }

    /**
     * Cache A instance by element
     */
    cacheByElement(element, instance) {
        if (element._instanceId) {
            this.cache.set(element._instanceId, {
                instance,
                created: Date.now(),
                lastAccess: Date.now(),
                ttl: this.config.ttl
            });
        }
    }

    /**
     * Get A instance by element
     */
    getByElement(element) {
        if (element._instanceId) {
            const cached = this.cache.get(element._instanceId);
            if (cached && this._isValid(cached)) {
                cached.lastAccess = Date.now();
                this.stats.hits++;
                return cached.instance;
            }
        }
        this.stats.misses++;
        return null;
    }

    /**
     * Register A instance with element
     */
    registerWithElement(element, instance) {
        if (!element._instanceId) {
            element._instanceId = `elem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        }
        this.cacheByElement(element, instance);
        this.weakCache.set(instance, element._instanceId);
    }
}

/**
 * 🛠️ CACHE MONITOR
 */

class CacheMonitor {
    constructor(cache) {
        this.cache = cache;
        this.history = [];
        this.maxHistory = 100;
    }

    /**
     * Record cache stats snapshot
     */
    snapshot() {
        const stats = {
            ...this.cache.getStats(),
            timestamp: Date.now()
        };
        
        this.history.push(stats);
        
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        
        return stats;
    }

    /**
     * Get performance trends
     */
    getTrends() {
        if (this.history.length < 2) return null;
        
        const recent = this.history.slice(-10);
        const hitRates = recent.map(s => parseFloat(s.hitRate));
        const cacheSizes = recent.map(s => s.cacheSize);
        
        return {
            avgHitRate: (hitRates.reduce((sum, rate) => sum + rate, 0) / hitRates.length).toFixed(2) + '%',
            hitRateTrend: hitRates[hitRates.length - 1] - hitRates[0],
            avgCacheSize: Math.round(cacheSizes.reduce((sum, size) => sum + size, 0) / cacheSizes.length),
            cacheSizeTrend: cacheSizes[cacheSizes.length - 1] - cacheSizes[0]
        };
    }

    /**
     * Detect performance issues
     */
    getHealthCheck() {
        const stats = this.cache.getStats();
        const trends = this.getTrends();
        const issues = [];
        
        if (parseFloat(stats.hitRate) < 50) {
            issues.push('Low cache hit rate - consider increasing TTL or cache size');
        }
        
        if (stats.cacheSize > stats.maxSize * 0.9) {
            issues.push('Cache nearly full - consider increasing max size or reducing TTL');
        }
        
        if (trends && trends.hitRateTrend < -10) {
            issues.push('Hit rate declining - cache may be thrashing');
        }
        
        return {
            healthy: issues.length === 0,
            issues,
            recommendations: this._getRecommendations(stats, trends)
        };
    }

    _getRecommendations(stats, trends) {
        const recs = [];
        
        if (parseFloat(stats.hitRate) < 70) {
            recs.push('Increase cache size or TTL values');
        }
        
        if (stats.evicted > stats.created * 0.1) {
            recs.push('Reduce eviction rate by increasing max cache size');
        }
        
        if (trends && trends.cacheSizeTrend > 50) {
            recs.push('Monitor for memory leaks');
        }
        
        return recs;
    }
}

// Create global instance cache
const aInstanceCache = new AInstanceCache();
const cacheMonitor = new CacheMonitor(aInstanceCache);

// Start monitoring
setInterval(() => {
    cacheMonitor.snapshot();
}, 30000); // Every 30 seconds

export { 
    InstanceCache, 
    AInstanceCache, 
    CacheMonitor, 
    aInstanceCache, 
    cacheMonitor 
};
