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
  // 1. Basic template for the intuition layer
  // window.define('intuition', {
  //   tag: 'div',
  //   class: 'atome',
  //   id: 'intuition',
  //   css: {
  //     zIndex: 9999999,
  //     background: 'transparent',
  //     color: 'lightgray',
  //     left: '0px',
  //     top: '0px',
  //     position: 'absolute',
  //     width: '0px',
  //     height: '0px',
  //     overflow: 'visible',
  //   }
  // });

  // 2. Intuition layer will now be created lazily when Intuition() is invoked
  // window.$('intuition', {
  //   parent: document.body,

  // });

  // console.log('✅ Kickstart demo initialized');

  // === READY EVENT NOW ===
  // Framework truly ready: Core + Kickstart finished!
  window.dispatchEvent(new CustomEvent('squirrel:ready'));
  // console.log('🎉 Squirrel framework is truly ready!');
}





// Run kickstart as soon as this file is loaded
// Global helpers are already exposed by spark.js
initKickstart();

console.log('Current platform: ' + current_platform());

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
    console.log('Squirrel standalone mode ©atome');
    return;
  }

  const resolveApiBases = () => {
    try {
      const platform = typeof current_platform === 'function' ? current_platform() : '';
      if (typeof platform === 'string' && platform.toLowerCase().includes('taur')) {
        return ['http://127.0.0.1:3000', 'http://127.0.0.1:3001', ''];
      }
    } catch (_) { }
    return [''];
  };

  const bases = resolveApiBases();
  for (const base of bases) {
    const endpoint = base ? `${base}/api/server-info` : '/api/server-info';
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) {
        console.warn('⚠️ Unable to reach /api/server-info:', res.status);
        continue;
      }
      const data = await res.json();
      if (data && data.success) {
        const version = (typeof data.version === 'string' && data.version.trim() !== '')
          ? data.version.trim()
          : 'unknown';
        window.__SQUIRREL_VERSION__ = version;
        console.log(`Squirrel ${version} ©atome`);
        console.log(`Server ${version} (${data.type || 'unknown'})`);
        return;
      }
    } catch (error) {
      console.warn('⚠️ Failed to fetch /api/server-info', error);
    }
  }

  if (typeof window !== 'undefined' && !window.__SQUIRREL_VERSION__) {
    window.__SQUIRREL_VERSION__ = 'unknown';
  }
  console.log('Squirrel version unknown ©atome');
}

logServerInfo();