/**
 * 🚀 SQUIRREL FRAMEWORK - SERVICE WORKER
 * Provides offline capabilities and caching for PWA functionality
 */

// Cache configuration
const CACHE_CONFIG = {
  CACHE_NAME: 'squirrel-framework-v1.0.0',
  STATIC_CACHE: 'squirrel-static-v1',
  DYNAMIC_CACHE: 'squirrel-dynamic-v1',
  API_CACHE: 'squirrel-api-v1'
};

// Files to cache immediately (critical app shell)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/squirrel/squirrel.js',
  '/src/squirrel/components/button_builder.js',
  '/src/squirrel/components/slider_builder.js',
  '/src/squirrel/components/badge_builder.js',
  '/src/squirrel/components/table_builder.js',
  '/src/squirrel/components/matrix_builder.js',
  '/src/squirrel/components/List_builder.js',
  '/src/pwa/offline/offline.html',
  '/test-components-browser-clean.html'
];

// Dynamic caching patterns
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first',
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
};

// URL patterns for different caching strategies
const URL_PATTERNS = {
  STATIC: /\.(js|css|html|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/,
  API: /\/api\//,
  COMPONENTS: /\/src\/squirrel\/components\//,
  DOCS: /\/docs\//
};

// ========================================
// 🏗️ SERVICE WORKER INSTALLATION
// ========================================

self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_CONFIG.STATIC_CACHE)
      .then((cache) => {
        console.log('📦 Service Worker: Caching app shell');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('✅ Service Worker: App shell cached');
        return self.skipWaiting(); // Force activation
      })
      .catch((error) => {
        console.error('❌ Service Worker: Installation failed', error);
      })
  );
});

// ========================================
// 🚀 SERVICE WORKER ACTIVATION
// ========================================

self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old caches
            if (!Object.values(CACHE_CONFIG).includes(cacheName)) {
              console.log('🗑️ Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Activated');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// ========================================
// 🌐 FETCH EVENT HANDLING
// ========================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http(s) requests
  if (!request.url.startsWith('http')) {
    return;
  }
  
  event.respondWith(handleFetchRequest(request, url));
});

// ========================================
// 📋 FETCH STRATEGIES
// ========================================

async function handleFetchRequest(request, url) {
  try {
    // Component files - Cache First (they rarely change)
    if (URL_PATTERNS.COMPONENTS.test(url.pathname)) {
      return await cacheFirstStrategy(request, CACHE_CONFIG.STATIC_CACHE);
    }
    
    // Static assets - Cache First
    if (URL_PATTERNS.STATIC.test(url.pathname)) {
      return await cacheFirstStrategy(request, CACHE_CONFIG.STATIC_CACHE);
    }
    
    // API calls - Network First
    if (URL_PATTERNS.API.test(url.pathname)) {
      return await networkFirstStrategy(request, CACHE_CONFIG.API_CACHE);
    }
    
    // Documentation - Stale While Revalidate
    if (URL_PATTERNS.DOCS.test(url.pathname)) {
      return await staleWhileRevalidateStrategy(request, CACHE_CONFIG.DYNAMIC_CACHE);
    }
    
    // Default - Network First with fallback
    return await networkFirstStrategy(request, CACHE_CONFIG.DYNAMIC_CACHE);
    
  } catch (error) {
    console.error('❌ Service Worker: Fetch failed', error);
    return await getOfflineFallback(request);
  }
}

// Cache First Strategy - Best for static assets
async function cacheFirstStrategy(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  
  const response = await fetch(request);
  if (response.status === 200) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  
  return response;
}

// Network First Strategy - Best for dynamic content
async function networkFirstStrategy(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

// Stale While Revalidate - Best for frequently updated content
async function staleWhileRevalidateStrategy(request, cacheName) {
  const cached = await caches.match(request);
  
  // Always try to fetch and update cache in background
  const fetchPromise = fetch(request).then((response) => {
    if (response.status === 200) {
      const cache = caches.open(cacheName);
      cache.then(c => c.put(request, response.clone()));
    }
    return response;
  });
  
  // Return cached version immediately if available
  if (cached) {
    return cached;
  }
  
  // Otherwise wait for network
  return fetchPromise;
}

// Offline fallback
async function getOfflineFallback(request) {
  const url = new URL(request.url);
  
  // For HTML pages, return offline page
  if (request.headers.get('accept')?.includes('text/html')) {
    return caches.match('/src/pwa/offline/offline.html');
  }
  
  // For images, return placeholder
  if (request.headers.get('accept')?.includes('image/')) {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#f0f0f0"/><text x="100" y="100" text-anchor="middle" dy=".3em" fill="#999">Image Offline</text></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
  
  // Generic offline response
  return new Response('Offline', { 
    status: 503, 
    statusText: 'Service Unavailable' 
  });
}

// ========================================
// 📨 MESSAGE HANDLING
// ========================================

self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_CACHE_SIZE':
      getCacheSize().then(size => {
        event.ports[0].postMessage({ type: 'CACHE_SIZE', size });
      });
      break;
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ type: 'CACHE_CLEARED' });
      });
      break;
      
    case 'PRELOAD_ROUTES':
      preloadRoutes(data.routes);
      break;
  }
});

// ========================================
// 🛠️ UTILITY FUNCTIONS
// ========================================

async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    totalSize += requests.length;
  }
  
  return totalSize;
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  return Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
}

async function preloadRoutes(routes) {
  const cache = await caches.open(CACHE_CONFIG.DYNAMIC_CACHE);
  return Promise.all(
    routes.map(route => {
      return fetch(route).then(response => {
        if (response.status === 200) {
          return cache.put(route, response);
        }
      }).catch(err => console.warn('Preload failed for:', route));
    })
  );
}

// ========================================
// 🔄 BACKGROUND SYNC (Optional)
// ========================================

self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Handle any queued actions when back online
  console.log('🔄 Service Worker: Background sync triggered');
  // Add your background sync logic here
}

console.log('🎯 Service Worker: Loaded and ready!');
