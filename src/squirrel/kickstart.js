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
      if (typeof platform === 'string' && platform.toLowerCase().includes('taur')) {
        // In Tauri, prefer local Axum server for version info.
        // Avoid probing Fastify here to prevent noisy 'Failed to load resource' entries.
        return ['http://127.0.0.1:3000', ''];
      }
    } catch (_) { }
    return [''];
  };

  const bases = resolveApiBases();

  // Check if we're in Tauri environment
  const isInTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);

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
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) {
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
      // Silent failure - don't log to avoid console noise
    }
  }

  if (typeof window !== 'undefined' && !window.__SQUIRREL_VERSION__) {
    window.__SQUIRREL_VERSION__ = 'unknown';
  }
}

logServerInfo();