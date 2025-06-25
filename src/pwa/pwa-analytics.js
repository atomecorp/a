/**
 * 📊 PWA ANALYTICS - Performance & Usage Tracking
 * Tracks PWA-specific metrics and user engagement
 */

class PWAAnalytics {
  constructor(options = {}) {
    this.config = {
      trackInstalls: options.trackInstalls !== false,
      trackOfflineUsage: options.trackOfflineUsage !== false,
      trackUpdateActions: options.trackUpdateActions !== false,
      trackPerformance: options.trackPerformance !== false,
      ...options
    };
    
    this.metrics = {
      installPromptShown: 0,
      installAccepted: 0,
      installDismissed: 0,
      offlinePageViews: 0,
      updatePromptShown: 0,
      updateAccepted: 0,
      cacheHitRate: 0,
      networkFailures: 0
    };
    
    this.init();
  }
  
  init() {
    if (this.config.trackInstalls) {
      this.trackInstallEvents();
    }
    
    if (this.config.trackOfflineUsage) {
      this.trackOfflineEvents();
    }
    
    if (this.config.trackPerformance) {
      this.trackPerformanceMetrics();
    }
  }
  
  trackInstallEvents() {
    window.addEventListener('beforeinstallprompt', () => {
      this.metrics.installPromptShown++;
      this.logEvent('pwa_install_prompt_shown');
    });
    
    window.addEventListener('appinstalled', () => {
      this.metrics.installAccepted++;
      this.logEvent('pwa_installed');
    });
  }
  
  trackOfflineEvents() {
    window.addEventListener('offline', () => {
      this.logEvent('pwa_went_offline');
    });
    
    window.addEventListener('online', () => {
      this.logEvent('pwa_back_online');
    });
  }
  
  trackPerformanceMetrics() {
    if ('performance' in window && 'measureUserAgentSpecificMemory' in performance) {
      setInterval(() => {
        this.collectPerformanceData();
      }, 30000); // Every 30 seconds
    }
  }
  
  collectPerformanceData() {
    const perfData = {
      memory: performance.memory ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      } : null,
      timing: performance.timing,
      navigation: performance.navigation
    };
    
    this.logEvent('pwa_performance_data', perfData);
  }
  
  logEvent(eventName, data = {}) {
    console.log(`📊 PWA Analytics: ${eventName}`, data);
    
    // Send to your analytics service
    // Example: Google Analytics, custom endpoint, etc.
    if (window.gtag) {
      window.gtag('event', eventName, data);
    }
  }
  
  getMetrics() {
    return { ...this.metrics };
  }
  
  exportData() {
    return {
      metrics: this.getMetrics(),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      pwaCapabilities: {
        serviceWorker: 'serviceWorker' in navigator,
        manifest: 'manifest' in document.createElement('link'),
        pushNotifications: 'PushManager' in window,
        backgroundSync: 'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype
      }
    };
  }
}

export { PWAAnalytics };
