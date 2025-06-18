/**
 * 🚀 MODULE LOADER - Optimized lazy loading and code splitting
 * Improves startup performance and reduces bundle size
 */

class ModuleLoader {
    constructor() {
        this.cache = new Map();
        this.loading = new Map();
        this.preloadQueue = [];
        this.stats = {
            hits: 0,
            misses: 0,
            errors: 0,
            loadTime: 0
        };
    }

    /**
     * Load a module with caching and error handling
     */
    async load(modulePath, options = {}) {
        const {
            cache = true,
            timeout = 10000,
            retry = 2,
            priority = 'normal'
        } = options;

        const startTime = performance.now();
        
        // Check cache first
        if (cache && this.cache.has(modulePath)) {
            this.stats.hits++;
            return this.cache.get(modulePath);
        }

        // Check if already loading
        if (this.loading.has(modulePath)) {
            return this.loading.get(modulePath);
        }

        // Create loading promise
        const loadPromise = this._loadWithRetry(modulePath, timeout, retry);
        this.loading.set(modulePath, loadPromise);

        try {
            const module = await loadPromise;
            
            if (cache) {
                this.cache.set(modulePath, module);
            }
            
            this.stats.misses++;
            this.stats.loadTime += performance.now() - startTime;
            
            return module;
        } catch (error) {
            this.stats.errors++;
            throw error;
        } finally {
            this.loading.delete(modulePath);
        }
    }

    /**
     * Load with retry logic
     */
    async _loadWithRetry(modulePath, timeout, retries) {
        let lastError;
        
        for (let i = 0; i <= retries; i++) {
            try {
                return await this._loadWithTimeout(modulePath, timeout);
            } catch (error) {
                lastError = error;
                if (i < retries) {
                    // Exponential backoff
                    await this._delay(Math.pow(2, i) * 100);
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Load with timeout
     */
    async _loadWithTimeout(modulePath, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const module = await import(modulePath);
            return module;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(`Module load timeout: ${modulePath}`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Preload modules for better performance
     */
    async preload(modules, options = {}) {
        const {
            parallel = 3,
            priority = 'low'
        } = options;

        const chunks = this._chunk(modules, parallel);
        
        for (const chunk of chunks) {
            await Promise.allSettled(
                chunk.map(module => this.load(module, { ...options, priority }))
            );
        }
    }

    /**
     * Load multiple modules in parallel
     */
    async loadMany(modules, options = {}) {
        const results = await Promise.allSettled(
            modules.map(module => this.load(module, options))
        );

        const loaded = {};
        const errors = {};

        results.forEach((result, index) => {
            const module = modules[index];
            if (result.status === 'fulfilled') {
                loaded[module] = result.value;
            } else {
                errors[module] = result.reason;
            }
        });

        return { loaded, errors };
    }

    /**
     * Create a lazy loader function
     */
    createLazy(modulePath, options = {}) {
        let loadPromise = null;
        
        return (...args) => {
            if (!loadPromise) {
                loadPromise = this.load(modulePath, options).then(module => {
                    // Call default export if it's a function
                    if (typeof module.default === 'function') {
                        return module.default(...args);
                    }
                    return module;
                });
            }
            return loadPromise;
        };
    }

    /**
     * Clear cache
     */
    clearCache(pattern) {
        if (pattern) {
            const regex = new RegExp(pattern);
            for (const [key] of this.cache) {
                if (regex.test(key)) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;
        const avgLoadTime = this.stats.misses > 0 ? 
            (this.stats.loadTime / this.stats.misses).toFixed(2) : 0;

        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            avgLoadTime: `${avgLoadTime}ms`,
            cacheSize: this.cache.size,
            loading: this.loading.size
        };
    }

    /**
     * Utility methods
     */
    _chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * 🎯 SQUIRREL-SPECIFIC MODULE PATTERNS
 */

class SquirrelModuleLoader extends ModuleLoader {
    constructor() {
        super();
        this.componentCache = new Map();
        this.particleCache = new Map();
    }

    /**
     * Load Squirrel component with lazy initialization
     */
    async loadComponent(name, options = {}) {
        const componentPath = `../components/${name}.js`;
        
        try {
            const module = await this.load(componentPath, options);
            
            // Cache component constructor
            if (module.default && typeof module.default === 'function') {
                this.componentCache.set(name, module.default);
            }
            
            return module;
        } catch (error) {
            console.warn(`Failed to load component: ${name}`, error);
            return null;
        }
    }

    /**
     * Load particles on demand
     */
    async loadParticles(category, options = {}) {
        const particlePath = `../particles/${category}.js`;
        
        try {
            const module = await this.load(particlePath, options);
            
            // Register particles if they export a registration function
            if (module.register && typeof module.register === 'function') {
                module.register();
            }
            
            return module;
        } catch (error) {
            console.warn(`Failed to load particles: ${category}`, error);
            return null;
        }
    }

    /**
     * Create component factory with lazy loading
     */
    createComponentFactory(name) {
        return this.createLazy(`../components/${name}.js`, {
            cache: true,
            priority: 'high'
        });
    }

    /**
     * Preload core components
     */
    async preloadCore() {
        const coreComponents = ['Matrix', 'Module', 'Slider'];
        const coreParticles = ['structural', 'layout', 'events'];
        
        await Promise.allSettled([
            this.preload(coreComponents.map(name => `../components/${name}.js`)),
            this.preload(coreParticles.map(cat => `../particles/${cat}.js`))
        ]);
    }

    /**
     * Get component from cache or load it
     */
    async getComponent(name) {
        if (this.componentCache.has(name)) {
            return this.componentCache.get(name);
        }
        
        const module = await this.loadComponent(name);
        return module?.default || null;
    }
}

/**
 * 🛠️ BUNDLE ANALYZER
 */

class BundleAnalyzer {
    constructor() {
        this.modules = new Map();
        this.dependencies = new Map();
    }

    /**
     * Track module loading for analysis
     */
    trackModule(path, size, loadTime) {
        this.modules.set(path, {
            size,
            loadTime,
            timestamp: Date.now()
        });
    }

    /**
     * Analyze bundle composition
     */
    analyze() {
        const total = Array.from(this.modules.values());
        const totalSize = total.reduce((sum, mod) => sum + mod.size, 0);
        const totalLoadTime = total.reduce((sum, mod) => sum + mod.loadTime, 0);
        
        const analysis = {
            totalModules: this.modules.size,
            totalSize: this._formatSize(totalSize),
            totalLoadTime: `${totalLoadTime.toFixed(2)}ms`,
            avgModuleSize: this._formatSize(totalSize / this.modules.size),
            avgLoadTime: `${(totalLoadTime / this.modules.size).toFixed(2)}ms`,
            modules: Array.from(this.modules.entries()).map(([path, data]) => ({
                path,
                size: this._formatSize(data.size),
                loadTime: `${data.loadTime.toFixed(2)}ms`,
                percentage: `${(data.size / totalSize * 100).toFixed(2)}%`
            })).sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage))
        };

        return analysis;
    }

    _formatSize(bytes) {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
    }
}

// Create global instances
const moduleLoader = new SquirrelModuleLoader();
const bundleAnalyzer = new BundleAnalyzer();

// Hook into module loading for analysis
const originalLoad = moduleLoader.load.bind(moduleLoader);
moduleLoader.load = async function(path, options) {
    const startTime = performance.now();
    const module = await originalLoad(path, options);
    const loadTime = performance.now() - startTime;
    
    // Estimate module size (rough approximation)
    const moduleSize = JSON.stringify(module).length;
    bundleAnalyzer.trackModule(path, moduleSize, loadTime);
    
    return module;
};

export { ModuleLoader, SquirrelModuleLoader, BundleAnalyzer, moduleLoader, bundleAnalyzer };
