// === 🎉 INDEPENDENT KICKSTART ===
// Create the view and dispatch 'squirrel:ready' when everything is ready

function initKickstart() {
  // Verify that the global helper functions are available
  if (typeof window.$ !== 'function' || typeof window.define !== 'function') {
    console.error('❌ Kickstart: Fonctions $ ou define non disponibles');
    return;
  }

  // 1. Basic template for the view
  window.define('view', {
    tag: 'div',
    class: 'atome',
    id: 'view',
    css: {
      background: '#272727',
      color: 'lightgray',
      left: '0px',
      top: '0px',
      right: '0px',
      bottom: '0px',
      position: 'absolute',
      width: '100%',
      height: '100%',
      overflow: 'auto',
      '-webkit-overflow-scrolling': 'auto',
      position: 'fixed',
      inset: 0,

      // overscroll-behavior: none;
      /* bloque le scroll chaining */
      // -webkit-overflow-scrolling: auto
    }
  });

  // 2. Create the view element
  window.$('view', {
    parent: document.body,

  });

  window.dispatchEvent(new CustomEvent('squirrel:ready'));
}





// Run kickstart as soon as this file is loaded
// Global helpers are already exposed by spark.js
initKickstart();


function kickstartDiagLog(stage, details = {}) {
  if (typeof console === 'undefined') return;
  try {
    console.warn(`[eVe:kickstart] ${String(stage || 'stage')} ${JSON.stringify(details || {})}`);
  } catch (_) { }
}

function readKickstartStack(limit = 8) {
  try {
    const stack = String(new Error().stack || '').split('\n').slice(2, 2 + limit).map((line) => line.trim()).filter(Boolean);
    return stack;
  } catch (_) {
    return [];
  }
}

function kickstartIsLoopbackHost(hostname) {
  const value = String(hostname || '').trim().toLowerCase();
  return value === '127.0.0.1' || value === 'localhost' || value === '0.0.0.0' || value === 'tauri.localhost';
}

function kickstartPositivePort(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

function kickstartIsLocalAxumLikePage() {
  if (typeof window === 'undefined' || !window.location) return false;
  const protocol = String(window.location.protocol || '').trim().toLowerCase();
  const host = String(window.location.hostname || '').trim().toLowerCase();
  if (host === 'tauri.localhost' && (protocol === 'http:' || protocol === 'https:')) {
    return true;
  }
  if (!kickstartIsLoopbackHost(host)) return false;
  const effectivePort = kickstartPositivePort(window.location.port, protocol === 'https:' ? 443 : 80);
  return effectivePort > 0 && effectivePort !== 3001;
}

async function logServerInfo() {
  const isStandaloneFile = (() => {
    if (typeof window === 'undefined' || !window.location) return false;
    const { protocol, origin } = window.location;
    if (protocol === 'file:') return true;
    // Some desktop browsers report origin "null" for local HTML files
    return origin === 'null';
  })();

  if (isStandaloneFile) {
    if (typeof window !== 'undefined' && !window.__SQUIRREL_VERSION__) {
      window.__SQUIRREL_VERSION__ = 'standalone';
    }
    return;
  }

  const resolveApiBases = () => {
    try {
      const platform = typeof current_platform === 'function' ? current_platform() : '';
      const hasTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
      const localAxumLikePage = kickstartIsLocalAxumLikePage();
      if (hasTauriRuntime || localAxumLikePage || (typeof platform === 'string' && platform.toLowerCase().includes('taur'))) {
        // In Tauri, prefer local Axum server for version info.
        // Avoid probing the dev page origin here because it can be a transient loopback page
        // (for example 1430 during Tauri dev reloads) that does not own /api/server-info.
        return ['http://127.0.0.1:3000'];
      }
    } catch (_) { }
    return [''];
  };

  const bases = resolveApiBases();

  // Check if we're in Tauri environment
  const isInTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
  const currentPlatform = (() => {
    try {
      return typeof current_platform === 'function' ? current_platform() : null;
    } catch (_) {
      return 'current_platform_failed';
    }
  })();

  kickstartDiagLog('server_info:start', {
    location: typeof window !== 'undefined' ? window.location?.href || null : null,
    origin: typeof window !== 'undefined' ? window.location?.origin || null : null,
    bases,
    isLocalAxumLikePage: kickstartIsLocalAxumLikePage(),
    isInTauri,
    currentPlatform,
    hasTauri: typeof window !== 'undefined' ? !!window.__TAURI__ : false,
    hasTauriInternals: typeof window !== 'undefined' ? !!window.__TAURI_INTERNALS__ : false,
    stack: readKickstartStack(6)
  });

  for (const base of bases) {
    // Skip Tauri server if we're not in Tauri environment (prevents console errors)
    if (base.includes('127.0.0.1:3000') && !isInTauri) {
      continue;
    }
    // Skip Fastify if explicitly marked offline
    try {
      const fastifyBase = typeof window !== 'undefined' ? window.__SQUIRREL_FASTIFY_URL__ : '';
      if (fastifyBase && base && base === fastifyBase && window._checkFastifyAvailable && window._checkFastifyAvailable() === false) {
        continue;
      }
    } catch (_) { }

    const endpoint = base ? `${base}/api/server-info` : '/api/server-info';
    try {
      kickstartDiagLog('server_info:fetch_start', {
        endpoint,
        base,
        isInTauri,
        currentPlatform,
        location: typeof window !== 'undefined' ? window.location?.href || null : null
      });
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) {
        kickstartDiagLog('server_info:fetch_non_ok', {
          endpoint,
          status: res.status,
          statusText: res.statusText || null,
          isInTauri,
          currentPlatform
        });
        // Don't log warning - silent failure
        continue;
      }
      const data = await res.json();
      if (data && data.success) {
        const version = (typeof data.version === 'string' && data.version.trim() !== '')
          ? data.version.trim()
          : 'unknown';
        window.__SQUIRREL_VERSION__ = version;
        return;
      }
    } catch (error) {
      kickstartDiagLog('server_info:fetch_error', {
        endpoint,
        base,
        message: error?.message || String(error),
        isInTauri,
        currentPlatform,
        location: typeof window !== 'undefined' ? window.location?.href || null : null
      });
    }
  }

  if (typeof window !== 'undefined' && !window.__SQUIRREL_VERSION__) {
    window.__SQUIRREL_VERSION__ = 'unknown';
  }
}

logServerInfo();