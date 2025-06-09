/**
 * 🔍 PERFORMANCE MONITOR - Real-time performance tracking and optimization
 * Monitors memory, rendering, and operation performance
 */

class PerformanceMonitor {
    constructor(options = {}) {
        this.config = {
            sampleInterval: 1000, // 1 second
            maxSamples: 300, // 5 minutes of data
            alertThresholds: {
                memoryUsage: 100, // MB
                renderTime: 16, // ms (60fps)
                cacheHitRate: 70, // %
                domNodes: 5000
            },
            autoOptimize: true,
            ...options
        };
        
        this.metrics = {
            memory: [],
            rendering: [],
            operations: [],
            cache: [],
            dom: []
        };
        
        this.alerts = [];
        this.isMonitoring = false;
        this.optimizations = new Map();
        
        this.observers = {
            performance: null,
            mutation: null,
            resize: null
        };
    }

    /**
     * Start monitoring
     */
    start() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        
        // Start metric collection
        this.intervalId = setInterval(() => {
            this._collectMetrics();
        }, this.config.sampleInterval);
        
        // Setup observers
        this._setupObservers();
        
        console.log('🔍 Performance monitoring started');
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        // Disconnect observers
        Object.values(this.observers).forEach(observer => {
            if (observer) observer.disconnect();
        });
        
        console.log('🔍 Performance monitoring stopped');
    }

    /**
     * Collect all metrics
     */
    _collectMetrics() {
        const timestamp = Date.now();
        
        // Memory metrics
        if (performance.memory) {
            this._addMetric('memory', {
                timestamp,
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            });
        }
        
        // DOM metrics
        this._addMetric('dom', {
            timestamp,
            nodes: document.querySelectorAll('*').length,
            depth: this._calculateDOMDepth(),
            complexity: this._calculateDOMComplexity()
        });
        
        // Check for alerts
        this._checkAlerts();
        
        // Auto-optimize if enabled
        if (this.config.autoOptimize) {
            this._autoOptimize();
        }
    }

    /**
     * Add metric sample
     */
    _addMetric(type, data) {
        this.metrics[type].push(data);
        
        // Keep only recent samples
        if (this.metrics[type].length > this.config.maxSamples) {
            this.metrics[type].shift();
        }
    }

    /**
     * Track rendering performance
     */
    trackRender(name, fn) {
        const startTime = performance.now();
        let result;
        
        try {
            result = fn();
            
            // Handle async functions
            if (result instanceof Promise) {
                return result.finally(() => {
                    this._recordRenderTime(name, performance.now() - startTime);
                });
            }
        } finally {
            this._recordRenderTime(name, performance.now() - startTime);
        }
        
        return result;
    }

    /**
     * Record render time
     */
    _recordRenderTime(operation, duration) {
        this._addMetric('rendering', {
            timestamp: Date.now(),
            operation,
            duration: Math.round(duration * 100) / 100,
            fps: duration > 0 ? Math.round(1000 / duration) : 60
        });
    }

    /**
     * Track operation performance
     */
    trackOperation(name, fn) {
        const startTime = performance.now();
        const startMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
        
        let result;
        try {
            result = fn();
            
            if (result instanceof Promise) {
                return result.finally(() => {
                    this._recordOperation(name, startTime, startMemory);
                });
            }
        } finally {
            this._recordOperation(name, startTime, startMemory);
        }
        
        return result;
    }

    /**
     * Record operation metrics
     */
    _recordOperation(name, startTime, startMemory) {
        const duration = performance.now() - startTime;
        const memoryDelta = performance.memory ? 
            performance.memory.usedJSHeapSize - startMemory : 0;
        
        this._addMetric('operations', {
            timestamp: Date.now(),
            name,
            duration: Math.round(duration * 100) / 100,
            memoryDelta: Math.round(memoryDelta / 1024), // KB
        });
    }

    /**
     * Setup performance observers
     */
    _setupObservers() {
        // Performance Observer for navigation and paint metrics
        if ('PerformanceObserver' in window) {
            try {
                this.observers.performance = new PerformanceObserver((list) => {
                    list.getEntries().forEach(entry => {
                        if (entry.entryType === 'paint') {
                            this._addMetric('rendering', {
                                timestamp: Date.now(),
                                operation: entry.name,
                                duration: entry.startTime,
                                type: 'paint'
                            });
                        }
                    });
                });
                
                this.observers.performance.observe({ 
                    entryTypes: ['paint', 'measure', 'navigation'] 
                });
            } catch (e) {
                console.warn('Performance Observer not supported:', e);
            }
        }

        // Mutation Observer for DOM changes
        this.observers.mutation = new MutationObserver((mutations) => {
            const changes = mutations.length;
            if (changes > 10) { // Only track significant changes
                this._addMetric('dom', {
                    timestamp: Date.now(),
                    mutations: changes,
                    type: 'mutation'
                });
            }
        });
        
        this.observers.mutation.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeOldValue: true
        });

        // Resize Observer for layout thrashing
        if ('ResizeObserver' in window) {
            this.observers.resize = new ResizeObserver((entries) => {
                if (entries.length > 5) { // Detect layout thrashing
                    this._addMetric('rendering', {
                        timestamp: Date.now(),
                        operation: 'layout-thrash',
                        resizes: entries.length,
                        type: 'layout'
                    });
                }
            });
        }
    }

    /**
     * Check for performance alerts
     */
    _checkAlerts() {
        const latestMemory = this.metrics.memory[this.metrics.memory.length - 1];
        const latestDOM = this.metrics.dom[this.metrics.dom.length - 1];
        const recentRenders = this.metrics.rendering.slice(-10);
        
        // Memory alert
        if (latestMemory && latestMemory.used > this.config.alertThresholds.memoryUsage) {
            this._addAlert('memory', `High memory usage: ${latestMemory.used}MB`, 'warning');
        }
        
        // DOM complexity alert
        if (latestDOM && latestDOM.nodes > this.config.alertThresholds.domNodes) {
            this._addAlert('dom', `High DOM complexity: ${latestDOM.nodes} nodes`, 'warning');
        }
        
        // Rendering performance alert
        const avgRenderTime = recentRenders.reduce((sum, r) => sum + r.duration, 0) / recentRenders.length;
        if (avgRenderTime > this.config.alertThresholds.renderTime) {
            this._addAlert('rendering', `Slow rendering: ${avgRenderTime.toFixed(2)}ms avg`, 'error');
        }
    }

    /**
     * Add performance alert
     */
    _addAlert(type, message, severity = 'info') {
        const alert = {
            type,
            message,
            severity,
            timestamp: Date.now(),
            id: Math.random().toString(36).slice(2)
        };
        
        this.alerts.push(alert);
        
        // Keep only recent alerts
        if (this.alerts.length > 50) {
            this.alerts.shift();
        }
        
        // Log critical alerts
        if (severity === 'error') {
            console.error('🚨 Performance Alert:', message);
        } else if (severity === 'warning') {
            console.warn('⚠️ Performance Warning:', message);
        }
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent('performanceAlert', { detail: alert }));
    }

    /**
     * Auto-optimization based on metrics
     */
    _autoOptimize() {
        const latestMemory = this.metrics.memory[this.metrics.memory.length - 1];
        const recentRenders = this.metrics.rendering.slice(-5);
        
        // Memory optimization
        if (latestMemory && latestMemory.used > 80) {
            this._triggerOptimization('memory-cleanup', () => {
                // Trigger garbage collection if available
                if (window.gc) {
                    window.gc();
                }
                
                // Clear caches
                if (window.domCache) {
                    window.domCache.cleanup();
                }
                
                return 'Memory cleanup triggered';
            });
        }
        
        // Rendering optimization
        const slowRenders = recentRenders.filter(r => r.duration > 16);
        if (slowRenders.length > 2) {
            this._triggerOptimization('rendering-optimize', () => {
                // Defer non-critical renders
                this._deferNonCriticalWork();
                return 'Rendering optimization applied';
            });
        }
    }

    /**
     * Trigger optimization
     */
    _triggerOptimization(type, optimizer) {
        const lastRun = this.optimizations.get(type);
        const cooldown = 30000; // 30 seconds
        
        if (lastRun && Date.now() - lastRun < cooldown) {
            return; // Still in cooldown
        }
        
        try {
            const result = optimizer();
            this.optimizations.set(type, Date.now());
            
            console.log(`🚀 Auto-optimization applied: ${type} - ${result}`);
            
            this._addAlert('optimization', `Applied: ${type}`, 'info');
        } catch (error) {
            console.error('Optimization failed:', type, error);
        }
    }

    /**
     * Defer non-critical work
     */
    _deferNonCriticalWork() {
        // Use requestIdleCallback if available
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
                // Perform non-critical work during idle time
                this._performIdleTasks();
            });
        }
    }

    /**
     * Perform idle tasks
     */
    _performIdleTasks() {
        // Cache cleanup
        if (window.domCache) {
            window.domCache.cleanup();
        }
        
        // Instance cache cleanup
        if (window.aInstanceCache) {
            window.aInstanceCache.cleanup();
        }
        
        // Event listener cleanup
        if (window.eventManager) {
            window.eventManager.cleanupOrphaned();
        }
    }

    /**
     * Calculate DOM depth
     */
    _calculateDOMDepth(element = document.body, depth = 0) {
        let maxDepth = depth;
        
        for (const child of element.children) {
            const childDepth = this._calculateDOMDepth(child, depth + 1);
            maxDepth = Math.max(maxDepth, childDepth);
        }
        
        return maxDepth;
    }

    /**
     * Calculate DOM complexity score
     */
    _calculateDOMComplexity() {
        const elements = document.querySelectorAll('*');
        let complexity = 0;
        
        elements.forEach(el => {
            // Base complexity
            complexity += 1;
            
            // Style complexity
            if (el.style.cssText.length > 100) complexity += 2;
            
            // Attribute complexity
            complexity += el.attributes.length * 0.5;
            
            // Event listener complexity (rough estimate)
            if (el.onclick || el.onmouseover) complexity += 3;
        });
        
        return Math.round(complexity);
    }

    /**
     * Get performance report
     */
    getReport() {
        const now = Date.now();
        const timeRange = 60000; // Last minute
        
        const recentMemory = this.metrics.memory.filter(m => now - m.timestamp < timeRange);
        const recentRenders = this.metrics.rendering.filter(r => now - r.timestamp < timeRange);
        const recentOps = this.metrics.operations.filter(o => now - o.timestamp < timeRange);
        
        return {
            timestamp: now,
            summary: {
                monitoring: this.isMonitoring,
                alerts: this.alerts.length,
                optimizations: this.optimizations.size
            },
            memory: {
                current: recentMemory[recentMemory.length - 1],
                average: this._calculateAverage(recentMemory, 'used'),
                trend: this._calculateTrend(recentMemory, 'used')
            },
            rendering: {
                averageTime: this._calculateAverage(recentRenders, 'duration'),
                averageFPS: this._calculateAverage(recentRenders, 'fps'),
                slowOperations: recentRenders.filter(r => r.duration > 16).length
            },
            operations: {
                total: recentOps.length,
                averageTime: this._calculateAverage(recentOps, 'duration'),
                slowest: recentOps.reduce((max, op) => 
                    op.duration > (max?.duration || 0) ? op : max, null)
            },
            dom: {
                current: this.metrics.dom[this.metrics.dom.length - 1],
                complexity: this._calculateDOMComplexity()
            },
            alerts: this.alerts.slice(-10), // Last 10 alerts
            recommendations: this._generateRecommendations()
        };
    }

    /**
     * Calculate average for metric
     */
    _calculateAverage(metrics, property) {
        if (metrics.length === 0) return 0;
        return metrics.reduce((sum, m) => sum + (m[property] || 0), 0) / metrics.length;
    }

    /**
     * Calculate trend for metric
     */
    _calculateTrend(metrics, property) {
        if (metrics.length < 2) return 0;
        
        const recent = metrics.slice(-5);
        const older = metrics.slice(-10, -5);
        
        const recentAvg = this._calculateAverage(recent, property);
        const olderAvg = this._calculateAverage(older, property);
        
        return recentAvg - olderAvg;
    }

    /**
     * Generate performance recommendations
     */
    _generateRecommendations() {
        const recommendations = [];
        const report = this.getReport();
        
        // Memory recommendations
        if (report.memory.current?.used > 50) {
            recommendations.push({
                type: 'memory',
                priority: 'high',
                message: 'Consider implementing memory cleanup strategies',
                action: 'Enable cache cleanup or reduce object retention'
            });
        }
        
        // Rendering recommendations
        if (report.rendering.averageTime > 10) {
            recommendations.push({
                type: 'rendering',
                priority: 'medium',
                message: 'Rendering performance could be improved',
                action: 'Consider debouncing updates or using virtual scrolling'
            });
        }
        
        // DOM recommendations
        if (report.dom.current?.nodes > 3000) {
            recommendations.push({
                type: 'dom',
                priority: 'medium',
                message: 'DOM complexity is high',
                action: 'Consider virtualizing large lists or reducing nesting'
            });
        }
        
        return recommendations;
    }

    /**
     * Export metrics data
     */
    exportData() {
        return {
            config: this.config,
            metrics: this.metrics,
            alerts: this.alerts,
            report: this.getReport()
        };
    }

    /**
     * Clear all data
     */
    clear() {
        Object.keys(this.metrics).forEach(key => {
            this.metrics[key] = [];
        });
        this.alerts = [];
        this.optimizations.clear();
    }
}

/**
 * 🎯 FRAMEWORK INTEGRATION
 */

class SquirrelPerformanceMonitor extends PerformanceMonitor {
    constructor(options = {}) {
        super({
            alertThresholds: {
                memoryUsage: 80, // MB for Squirrel apps
                renderTime: 12, // Tighter constraint
                particleCreation: 100, // particles per second
                instanceCache: 70, // hit rate %
                ...options.alertThresholds
            },
            ...options
        });
        
        this.squirrelMetrics = {
            particles: [],
            instances: [],
            components: []
        };
    }

    /**
     * Track particle creation
     */
    trackParticleCreation(name, count = 1) {
        this._addSquirrelMetric('particles', {
            timestamp: Date.now(),
            name,
            count,
            type: 'creation'
        });
    }

    /**
     * Track instance operations
     */
    trackInstanceOperation(type, duration, cached = false) {
        this._addSquirrelMetric('instances', {
            timestamp: Date.now(),
            type,
            duration,
            cached,
            operation: 'instance'
        });
    }

    /**
     * Track component performance
     */
    trackComponent(name, operation, duration) {
        this._addSquirrelMetric('components', {
            timestamp: Date.now(),
            name,
            operation,
            duration,
            type: 'component'
        });
    }

    /**
     * Add Squirrel-specific metric
     */
    _addSquirrelMetric(type, data) {
        this.squirrelMetrics[type].push(data);
        
        if (this.squirrelMetrics[type].length > this.config.maxSamples) {
            this.squirrelMetrics[type].shift();
        }
    }

    /**
     * Get Squirrel-specific report
     */
    getSquirrelReport() {
        const baseReport = this.getReport();
        const now = Date.now();
        const timeRange = 60000;
        
        const recentParticles = this.squirrelMetrics.particles
            .filter(p => now - p.timestamp < timeRange);
        const recentInstances = this.squirrelMetrics.instances
            .filter(i => now - i.timestamp < timeRange);
        const recentComponents = this.squirrelMetrics.components
            .filter(c => now - c.timestamp < timeRange);
        
        return {
            ...baseReport,
            squirrel: {
                particles: {
                    total: recentParticles.reduce((sum, p) => sum + p.count, 0),
                    rate: recentParticles.length / (timeRange / 1000),
                    popular: this._getMostUsedParticles(recentParticles)
                },
                instances: {
                    total: recentInstances.length,
                    cacheHitRate: this._calculateCacheHitRate(recentInstances),
                    averageTime: this._calculateAverage(recentInstances, 'duration')
                },
                components: {
                    active: new Set(recentComponents.map(c => c.name)).size,
                    slowest: recentComponents
                        .sort((a, b) => b.duration - a.duration)
                        .slice(0, 5)
                }
            }
        };
    }

    _getMostUsedParticles(particles) {
        const counts = particles.reduce((acc, p) => {
            acc[p.name] = (acc[p.name] || 0) + p.count;
            return acc;
        }, {});
        
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));
    }

    _calculateCacheHitRate(instances) {
        const cached = instances.filter(i => i.cached).length;
        return instances.length > 0 ? (cached / instances.length * 100).toFixed(2) : 0;
    }
}

// Create global monitor instance
const perfMonitor = new SquirrelPerformanceMonitor();

// Auto-start monitoring in development
if (process.env.NODE_ENV === 'development') {
    perfMonitor.start();
}

export { PerformanceMonitor, SquirrelPerformanceMonitor, perfMonitor };
