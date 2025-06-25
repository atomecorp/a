/**
 * 🚀 PWA MANAGER - Progressive Web App Management
 * Handles PWA installation, service worker registration, and offline capabilities
 */

// Import additional PWA modules
import { PWAAnalytics } from './pwa-analytics.js';
import { PWAShare } from './pwa-share.js';

class PWAManager {
  constructor(options = {}) {
    this.config = {
      serviceWorkerPath: '/src/pwa/service-worker.js',
      manifestPath: '/src/pwa/manifest.json',
      enableNotifications: options.enableNotifications !== false,
      enableBackgroundSync: options.enableBackgroundSync !== false,
      enableInstallPrompt: options.enableInstallPrompt !== false,
      enableAnalytics: options.enableAnalytics !== false,
      enableSharing: options.enableSharing !== false,
      updateCheckInterval: options.updateCheckInterval || 60000, // 1 minute
      ...options
    };
    
    this.serviceWorker = null;
    this.deferredPrompt = null;
    this.isOnline = navigator.onLine;
    this.updateAvailable = false;
    
    // Initialize new features
    this.analytics = this.config.enableAnalytics ? new PWAAnalytics() : null;
    this.share = this.config.enableSharing ? new PWAShare() : null;
    
    this.callbacks = {
      onInstallable: options.onInstallable || null,
      onInstalled: options.onInstalled || null,
      onUpdateAvailable: options.onUpdateAvailable || null,
      onOffline: options.onOffline || null,
      onOnline: options.onOnline || null,
      onError: options.onError || null
    };
    
    this.init();
  }

  // ========================================
  // 🏗️ INITIALIZATION
  // ========================================

  async init() {
    try {
      console.log('🚀 PWA Manager: Initializing...');
      
      // Check PWA support
      if (!this.isPWASupported()) {
        console.warn('⚠️ PWA Manager: PWA not fully supported in this browser');
        return;
      }
      
      // Register service worker
      await this.registerServiceWorker();
      
      // Setup install prompt
      if (this.config.enableInstallPrompt) {
        this.setupInstallPrompt();
      }
      
      // Setup online/offline detection
      this.setupNetworkDetection();
      
      // Setup notifications
      if (this.config.enableNotifications) {
        await this.setupNotifications();
      }
      
      // Check for updates periodically
      this.startUpdateChecker();
      
      console.log('✅ PWA Manager: Initialized successfully');
      
    } catch (error) {
      console.error('❌ PWA Manager: Initialization failed', error);
      this.triggerCallback('onError', error);
    }
  }

  // ========================================
  // 🔧 SERVICE WORKER MANAGEMENT
  // ========================================

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported');
    }
    
    try {
      const registration = await navigator.serviceWorker.register(
        this.config.serviceWorkerPath,
        { scope: '/' }
      );
      
      this.serviceWorker = registration;
      
      // Handle different service worker states
      if (registration.installing) {
        console.log('🔧 Service Worker: Installing...');
        this.trackInstallProgress(registration.installing);
      } else if (registration.waiting) {
        console.log('⏳ Service Worker: Update available');
        this.updateAvailable = true;
        this.triggerCallback('onUpdateAvailable', registration);
      } else if (registration.active) {
        console.log('✅ Service Worker: Active');
      }
      
      // Listen for updates
      registration.addEventListener('updatefound', () => {
        console.log('🔄 Service Worker: Update found');
        this.trackInstallProgress(registration.installing);
      });
      
      return registration;
      
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
      throw error;
    }
  }

  trackInstallProgress(worker) {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        if (navigator.serviceWorker.controller) {
          console.log('🔄 Service Worker: New version available');
          this.updateAvailable = true;
          this.triggerCallback('onUpdateAvailable', this.serviceWorker);
        } else {
          console.log('✅ Service Worker: App is cached for offline use');
          this.triggerCallback('onInstalled', this.serviceWorker);
        }
      }
    });
  }

  // ========================================
  // 📱 INSTALL PROMPT MANAGEMENT
  // ========================================

  setupInstallPrompt() {
    // Listen for the install prompt event
    window.addEventListener('beforeinstallprompt', (event) => {
      console.log('📱 PWA: Install prompt available');
      event.preventDefault();
      this.deferredPrompt = event;
      this.triggerCallback('onInstallable', event);
    });
    
    // Listen for app installed event
    window.addEventListener('appinstalled', (event) => {
      console.log('🎉 PWA: App installed');
      this.deferredPrompt = null;
      this.triggerCallback('onInstalled', event);
    });
  }

  async showInstallPrompt() {
    if (!this.deferredPrompt) {
      throw new Error('Install prompt not available');
    }
    
    try {
      const result = await this.deferredPrompt.prompt();
      console.log('📱 PWA: Install prompt result:', result.outcome);
      
      this.deferredPrompt = null;
      return result.outcome === 'accepted';
      
    } catch (error) {
      console.error('❌ PWA: Install prompt failed:', error);
      throw error;
    }
  }

  // ========================================
  // 🌐 NETWORK DETECTION
  // ========================================

  setupNetworkDetection() {
    window.addEventListener('online', () => {
      console.log('🌐 Network: Back online');
      this.isOnline = true;
      this.triggerCallback('onOnline');
      this.syncWhenOnline();
    });
    
    window.addEventListener('offline', () => {
      console.log('📴 Network: Gone offline');
      this.isOnline = false;
      this.triggerCallback('onOffline');
    });
  }

  async syncWhenOnline() {
    if (this.config.enableBackgroundSync && this.serviceWorker) {
      try {
        await this.serviceWorker.sync.register('background-sync');
        console.log('🔄 Background sync registered');
      } catch (error) {
        console.warn('Background sync not supported:', error);
      }
    }
  }

  // ========================================
  // 🔔 NOTIFICATIONS
  // ========================================

  async setupNotifications() {
    if (!('Notification' in window)) {
      console.warn('⚠️ Notifications not supported');
      return false;
    }
    
    if (Notification.permission === 'granted') {
      console.log('✅ Notifications: Already granted');
      return true;
    }
    
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      console.log('🔔 Notifications permission:', permission);
      return permission === 'granted';
    }
    
    return false;
  }

  async showNotification(title, options = {}) {
    if (!this.serviceWorker || Notification.permission !== 'granted') {
      console.warn('⚠️ Cannot show notification');
      return;
    }
    
    const defaultOptions = {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      vibrate: [200, 100, 200],
      tag: 'squirrel-framework',
      renotify: true,
      ...options
    };
    
    return this.serviceWorker.showNotification(title, defaultOptions);
  }

  // ========================================
  // 🔄 UPDATE MANAGEMENT
  // ========================================

  startUpdateChecker() {
    setInterval(() => {
      this.checkForUpdates();
    }, this.config.updateCheckInterval);
  }

  async checkForUpdates() {
    if (!this.serviceWorker) return;
    
    try {
      await this.serviceWorker.update();
    } catch (error) {
      console.warn('Update check failed:', error);
    }
  }

  async applyUpdate() {
    if (!this.updateAvailable || !this.serviceWorker.waiting) {
      throw new Error('No update available');
    }
    
    // Tell the waiting service worker to skip waiting
    this.serviceWorker.waiting.postMessage({ type: 'SKIP_WAITING' });
    
    // Reload the page to activate the new service worker
    window.location.reload();
  }

  // ========================================
  // 📊 CACHE MANAGEMENT
  // ========================================

  async getCacheInfo() {
    if (!this.serviceWorker) return null;
    
    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data);
      };
      
      this.serviceWorker.active?.postMessage(
        { type: 'GET_CACHE_SIZE' },
        [messageChannel.port2]
      );
    });
  }

  async clearCache() {
    if (!this.serviceWorker) return;
    
    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = () => {
        resolve();
      };
      
      this.serviceWorker.active?.postMessage(
        { type: 'CLEAR_CACHE' },
        [messageChannel.port2]
      );
    });
  }

  async preloadRoutes(routes) {
    if (!this.serviceWorker || !routes.length) return;
    
    this.serviceWorker.active?.postMessage({
      type: 'PRELOAD_ROUTES',
      data: { routes }
    });
  }

  // ========================================
  // 🛠️ UTILITY METHODS
  // ========================================

  isPWASupported() {
    return 'serviceWorker' in navigator && 
           'caches' in window && 
           'fetch' in window;
  }

  isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone ||
           document.referrer.includes('android-app://');
  }

  isOnlineMode() {
    return this.isOnline;
  }

  isUpdateAvailable() {
    return this.updateAvailable;
  }

  triggerCallback(callbackName, ...args) {
    const callback = this.callbacks[callbackName];
    if (typeof callback === 'function') {
      try {
        callback(...args);
      } catch (error) {
        console.error(`PWA Manager callback error (${callbackName}):`, error);
      }
    }
  }

  // ========================================
  // 🎯 PUBLIC API
  // ========================================

  // Install the app
  install() {
    return this.showInstallPrompt();
  }
  
  // Update the app
  update() {
    return this.applyUpdate();
  }
  
  // Send notification
  notify(title, options) {
    return this.showNotification(title, options);
  }
  
  // Share content (NEW)
  share(shareData) {
    return this.share?.shareContent(shareData);
  }
  
  // Get analytics data (NEW)
  getAnalytics() {
    return this.analytics?.exportData();
  }
  
  // Get app status
  getStatus() {
    return {
      supported: this.isPWASupported(),
      installed: this.isInstalled(),
      online: this.isOnlineMode(),
      updateAvailable: this.isUpdateAvailable(),
      installable: !!this.deferredPrompt,
      serviceWorkerReady: !!this.serviceWorker?.active,
      // New status indicators
      sharingSupported: this.share?.isSupported || false,
      analyticsEnabled: !!this.analytics
    };
  }

  // Performance monitoring (NEW)
  async getPerformanceMetrics() {
    if (!this.analytics) return null;
    
    return {
      ...this.analytics.getMetrics(),
      cacheInfo: await this.getCacheInfo(),
      memoryUsage: performance.memory ? {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024)
      } : null
    };
  }
}

// ========================================
// 🚀 FACTORY FUNCTION
// ========================================

export function createPWA(options = {}) {
  return new PWAManager(options);
}

// ========================================
  // 🎨 PWA UI HELPERS
// ========================================

export const PWAHelpers = {
  // Create install button
  createInstallButton(pwa, options = {}) {
    const button = document.createElement('button');
    button.textContent = options.text || '📱 Install App';
    button.className = options.className || 'pwa-install-btn';
    button.style.cssText = options.style || `
      padding: 12px 24px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      display: none;
    `;
    
    // Show button when installable
    pwa.callbacks.onInstallable = () => {
      button.style.display = 'inline-block';
    };
    
    // Handle click
    button.addEventListener('click', async () => {
      try {
        await pwa.install();
        button.style.display = 'none';
      } catch (error) {
        console.error('Install failed:', error);
      }
    });
    
    return button;
  },
  
  // Create update notification
  createUpdateNotification(pwa, options = {}) {
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="position: fixed; top: 20px; right: 20px; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; display: none;">
        <p style="margin: 0 0 12px 0; font-weight: 500;">🔄 App Update Available</p>
        <p style="margin: 0 0 16px 0; color: #666; font-size: 14px;">A new version is ready. Update now?</p>
        <button class="update-btn" style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 8px;">Update</button>
        <button class="dismiss-btn" style="background: transparent; color: #666; border: 1px solid #ddd; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Later</button>
      </div>
    `;
    
    const container = notification.firstElementChild;
    const updateBtn = container.querySelector('.update-btn');
    const dismissBtn = container.querySelector('.dismiss-btn');
    
    // Show notification when update available
    pwa.callbacks.onUpdateAvailable = () => {
      container.style.display = 'block';
    };
    
    // Handle update
    updateBtn.addEventListener('click', async () => {
      try {
        await pwa.update();
      } catch (error) {
        console.error('Update failed:', error);
      }
    });
    
    // Handle dismiss
    dismissBtn.addEventListener('click', () => {
      container.style.display = 'none';
    });
    
    return notification;
  },
  
  // Create offline indicator
  createOfflineIndicator(pwa, options = {}) {
    const indicator = document.createElement('div');
    indicator.innerHTML = `
      <div style="position: fixed; bottom: 20px; left: 20px; background: #ff6b6b; color: white; padding: 12px 16px; border-radius: 6px; font-size: 14px; z-index: 10000; display: none;">
        📴 You're offline - Some features may be limited
      </div>
    `;
    
    const container = indicator.firstElementChild;
    
    // Show/hide based on network status
    pwa.callbacks.onOffline = () => {
      container.style.display = 'block';
    };
    
    pwa.callbacks.onOnline = () => {
      container.style.display = 'none';
    };
    
    return indicator;
  }
};

// ========================================
// 📤 EXPORTS
// ========================================

export { PWAManager };
export default createPWA;
