/**
 * 📦 CACHE CONFIGURATION
 * Defines caching strategies and patterns for the Squirrel Framework PWA
 */

export const CACHE_CONFIG = {
  // Cache names with versioning
  CACHE_NAMES: {
    STATIC: 'squirrel-static-v1.0.0',
    DYNAMIC: 'squirrel-dynamic-v1.0.0',
    API: 'squirrel-api-v1.0.0',
    IMAGES: 'squirrel-images-v1.0.0',
    FONTS: 'squirrel-fonts-v1.0.0'
  },
  
  // Cache duration (in milliseconds)
  CACHE_DURATION: {
    STATIC: 7 * 24 * 60 * 60 * 1000,      // 7 days
    DYNAMIC: 24 * 60 * 60 * 1000,          // 1 day
    API: 5 * 60 * 1000,                    // 5 minutes
    IMAGES: 30 * 24 * 60 * 60 * 1000,      // 30 days
    FONTS: 365 * 24 * 60 * 60 * 1000       // 1 year
  },
  
  // Maximum cache sizes (number of entries)
  MAX_CACHE_SIZE: {
    STATIC: 50,
    DYNAMIC: 100,
    API: 50,
    IMAGES: 100,
    FONTS: 20
  }
};

// URL patterns for different cache strategies
export const URL_PATTERNS = {
  // Static assets that rarely change
  STATIC_ASSETS: [
    /\.(js|css|html)$/,
    /\/src\/squirrel\/squirrel\.js/,
    /\/src\/squirrel\/components\/.*\.js/,
    /\/src\/pwa\/.*\.(js|html|json)$/
  ],
  
  // Images and media
  IMAGES: [
    /\.(png|jpg|jpeg|gif|svg|webp|ico)$/,
    /\/icons?\//,
    /\/images?\//,
    /\/assets?\/.*\.(png|jpg|jpeg|gif|svg|webp)/
  ],
  
  // Fonts
  FONTS: [
    /\.(woff|woff2|ttf|eot|otf)$/,
    /\/fonts?\//,
    /fonts\.googleapis\.com/,
    /fonts\.gstatic\.com/
  ],
  
  // API endpoints
  API: [
    /\/api\//,
    /\/graphql/,
    /\.json$/
  ],
  
  // Documentation and help pages
  DOCS: [
    /\/docs?\//,
    /\/documentation\//,
    /\/help\//,
    /\/guide\//,
    /README\.md$/
  ],
  
  // Component pages and demos
  COMPONENTS: [
    /\/test-.*\.html$/,
    /\/demo.*\.html$/,
    /\/components?\//,
    /\/examples?\//
  ]
};

// Caching strategies
export const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',        // Best for static assets
  NETWORK_FIRST: 'network-first',    // Best for dynamic content
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate', // Best for frequent updates
  NETWORK_ONLY: 'network-only',      // Never cache
  CACHE_ONLY: 'cache-only'           // Only from cache
};

// Route-specific cache strategies
export const ROUTE_STRATEGIES = {
  // Core framework files - Cache First (long-term caching)
  '/src/squirrel/': CACHE_STRATEGIES.CACHE_FIRST,
  '/src/pwa/': CACHE_STRATEGIES.CACHE_FIRST,
  
  // Component files - Cache First with revalidation
  '/src/squirrel/components/': CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
  
  // Test and demo pages - Stale While Revalidate
  '/test-': CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
  '/demo-': CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
  
  // Documentation - Stale While Revalidate
  '/docs/': CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
  '/documentation/': CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
  
  // API endpoints - Network First
  '/api/': CACHE_STRATEGIES.NETWORK_FIRST,
  
  // Static assets - Cache First
  '/assets/': CACHE_STRATEGIES.CACHE_FIRST,
  '/icons/': CACHE_STRATEGIES.CACHE_FIRST
};

// Files to precache (critical app shell)
export const PRECACHE_ASSETS = [
  // Core app files
  '/',
  '/index.html',
  
  // Framework core
  '/src/squirrel/squirrel.js',
  
  // Essential components
  '/src/squirrel/components/button_builder.js',
  '/src/squirrel/components/slider_builder.js',
  '/src/squirrel/components/badge_builder.js',
  '/src/squirrel/components/table_builder.js',
  '/src/squirrel/components/matrix_builder.js',
  '/src/squirrel/components/List_builder.js',
  
  // PWA files
  '/src/pwa/manifest.json',
  '/src/pwa/offline/offline.html',
  
  // Test/demo pages
  '/test-components-browser-clean.html',
  
  // Essential icons (add when you have them)
  // '/icons/icon-192x192.png',
  // '/icons/icon-512x512.png'
];

// Background sync tags
export const SYNC_TAGS = {
  COMPONENT_USAGE: 'component-usage-sync',
  ERROR_REPORTING: 'error-reporting-sync',
  ANALYTICS: 'analytics-sync'
};

// Notification settings
export const NOTIFICATION_CONFIG = {
  UPDATE_AVAILABLE: {
    title: '🔄 Update Available',
    body: 'A new version of Squirrel Framework is ready!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'update-available',
    renotify: true,
    actions: [
      {
        action: 'update',
        title: 'Update Now',
        icon: '/icons/update-icon.png'
      },
      {
        action: 'dismiss',
        title: 'Later',
        icon: '/icons/dismiss-icon.png'
      }
    ]
  },
  
  OFFLINE_READY: {
    title: '📴 Offline Ready',
    body: 'App is cached and ready for offline use!',
    icon: '/icons/icon-192x192.png',
    tag: 'offline-ready'
  }
};

// IndexedDB configuration for advanced caching
export const IDB_CONFIG = {
  DB_NAME: 'SquirrelFrameworkDB',
  DB_VERSION: 1,
  STORES: {
    CACHE_META: 'cache-metadata',
    USER_PREFS: 'user-preferences',
    COMPONENT_DATA: 'component-data',
    ANALYTICS: 'analytics-data'
  }
};

// Helper functions for cache configuration
export const CacheHelpers = {
  // Check if URL matches any pattern
  matchesPattern(url, patterns) {
    return patterns.some(pattern => pattern.test(url));
  },
  
  // Get cache name for URL
  getCacheNameForURL(url) {
    if (this.matchesPattern(url, URL_PATTERNS.STATIC_ASSETS)) {
      return CACHE_CONFIG.CACHE_NAMES.STATIC;
    }
    if (this.matchesPattern(url, URL_PATTERNS.IMAGES)) {
      return CACHE_CONFIG.CACHE_NAMES.IMAGES;
    }
    if (this.matchesPattern(url, URL_PATTERNS.FONTS)) {
      return CACHE_CONFIG.CACHE_NAMES.FONTS;
    }
    if (this.matchesPattern(url, URL_PATTERNS.API)) {
      return CACHE_CONFIG.CACHE_NAMES.API;
    }
    return CACHE_CONFIG.CACHE_NAMES.DYNAMIC;
  },
  
  // Get strategy for route
  getStrategyForRoute(pathname) {
    for (const [route, strategy] of Object.entries(ROUTE_STRATEGIES)) {
      if (pathname.startsWith(route)) {
        return strategy;
      }
    }
    return CACHE_STRATEGIES.NETWORK_FIRST; // Default strategy
  },
  
  // Check if response is cacheable
  isCacheable(response) {
    return response.status === 200 && 
           response.type === 'basic' || 
           response.type === 'cors';
  },
  
  // Get cache expiry time
  getCacheExpiry(cacheName) {
    const durations = CACHE_CONFIG.CACHE_DURATION;
    switch (cacheName) {
      case CACHE_CONFIG.CACHE_NAMES.STATIC:
        return Date.now() + durations.STATIC;
      case CACHE_CONFIG.CACHE_NAMES.IMAGES:
        return Date.now() + durations.IMAGES;
      case CACHE_CONFIG.CACHE_NAMES.FONTS:
        return Date.now() + durations.FONTS;
      case CACHE_CONFIG.CACHE_NAMES.API:
        return Date.now() + durations.API;
      default:
        return Date.now() + durations.DYNAMIC;
    }
  }
};

export default CACHE_CONFIG;
