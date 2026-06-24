// === 🎉 INDEPENDENT KICKSTART ===
// Create the view and dispatch 'squirrel:ready' when everything is ready

function initKickstart() {
  // Verify that the global helper functions are available
  if (typeof window.$ !== 'function' || typeof window.define !== 'function') {
    return;
  }

  // 1. Basic template for the view
  window.define('view', {
    tag: 'div',
    class: 'atome',
    id: 'view',
    css: {
      background: 'transparent',
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

function normalizeRuntimeVersion(value, fallback = 'unknown') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function applyRuntimeVersions({ atomeVersion = 'unknown', eveVersion = 'unknown' } = {}) {
  if (typeof window === 'undefined') return;
  const normalizedAtomeVersion = normalizeRuntimeVersion(atomeVersion);
  const normalizedEveVersion = normalizeRuntimeVersion(eveVersion);
  window.__ATOME_VERSION__ = normalizedAtomeVersion;
  window.__EVE_VERSION__ = normalizedEveVersion;
  window.__SQUIRREL_VERSION__ = normalizedAtomeVersion;
  window.__SQUIRREL_VERSIONS__ = {
    atome: normalizedAtomeVersion,
    eve: normalizedEveVersion
  };
  window.__SQUIRREL_VERSIONS_UPDATED_AT__ = Date.now();
}

function getStartupConsole() {
  return console;
}

function emitRuntimeVersionConsoleReport(versions, options = {}) {
  const runtimeVersions = versions && typeof versions === 'object'
    ? versions
    : (typeof window !== 'undefined' ? window.__SQUIRREL_VERSIONS__ : null);
  const atomeVersion = normalizeRuntimeVersion(runtimeVersions?.atome || 'unknown');
  const eveVersion = normalizeRuntimeVersion(runtimeVersions?.eve || 'unknown');
  const signature = `${atomeVersion}::${eveVersion}`;
  if (
    options?.force !== true
    && typeof window !== 'undefined'
    && window.__SQUIRREL_VERSIONS_CONSOLE_SIGNATURE__ === signature
  ) {
    return;
  }
  const startupConsole = getStartupConsole();
  startupConsole.log(`eVe Version : ${eveVersion}`);
  startupConsole.log(`atome version : ${atomeVersion}`);
  if (typeof window !== 'undefined') {
    window.__SQUIRREL_VERSIONS_CONSOLE_SIGNATURE__ = signature;
  }
}

async function fetchTextVersion(endpoint) {
  if (!endpoint) return '';
  try {
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response || !response.ok) return '';
    const text = await response.text();
    return normalizeRuntimeVersion(text, '');
  } catch (_) {
    return '';
  }
}

function resolveVersionAssetBases() {
  const bases = [''];

  const platform = typeof current_platform === 'function' ? current_platform() : '';
  const hasTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
  const localAxumLikePage = kickstartIsLocalAxumLikePage();
  if (hasTauriRuntime || localAxumLikePage || (typeof platform === 'string' && platform.toLowerCase().includes('taur'))) {
    bases.push('http://127.0.0.1:3000');
  }

  return Array.from(new Set(bases.filter(Boolean)));
}

async function resolveEveVersion() {
  const bases = resolveVersionAssetBases();
  for (const base of bases) {
    const endpoint = `${base}/eVe/version.txt`;
    const version = await fetchTextVersion(endpoint);
    if (version) return version;
  }
  return 'unknown';
}

async function resolveServerVersions(apiBases) {
  for (const base of apiBases) {
    const endpoint = base ? `${base}/api/server-info` : '/api/server-info';

    const res = await fetch(endpoint, { cache: 'no-store' });
    if (!res || !res.ok) {
      continue;
    }
    const data = await res.json();
    if (data && data.success) {
      return {
        atome: normalizeRuntimeVersion(data.atomeVersion || data.version || 'unknown'),
        eve: normalizeRuntimeVersion(data.eveVersion || 'unknown')
      };
    }

  }
  return null;
}

async function loadRuntimeVersions(force = false) {
  if (typeof window === 'undefined') {
    return {
      atome: 'unknown',
      eve: 'unknown'
    };
  }

  const lastUpdatedAt = Number(window.__SQUIRREL_VERSIONS_UPDATED_AT__ || 0);
  const cachedVersions = window.__SQUIRREL_VERSIONS__ || null;
  if (!force && cachedVersions && Date.now() - lastUpdatedAt < 5000) {
    return cachedVersions;
  }

  const isStandaloneFile = (() => {
    if (!window.location) return false;
    const { protocol, origin } = window.location;
    if (protocol === 'file:') return true;
    return origin === 'null';
  })();

  if (isStandaloneFile) {
    applyRuntimeVersions({ atomeVersion: 'standalone', eveVersion: 'standalone' });
    return window.__SQUIRREL_VERSIONS__;
  }

  const resolveApiBases = () => {

    const platform = typeof current_platform === 'function' ? current_platform() : '';
    const hasTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    const localAxumLikePage = kickstartIsLocalAxumLikePage();
    if (hasTauriRuntime || localAxumLikePage || (typeof platform === 'string' && platform.toLowerCase().includes('taur'))) {
      return ['http://127.0.0.1:3000'];
    }

    return [''];
  };

  const bases = resolveApiBases();
  const isInTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
  const filteredBases = bases.filter((base) => {
    if (!base) return true;
    if (!base.includes('127.0.0.1:3000')) return true;
    return isInTauri || kickstartIsLocalAxumLikePage();
  });
  const serverVersions = await resolveServerVersions(filteredBases);
  const atomeVersion = normalizeRuntimeVersion(serverVersions?.atome || 'unknown');
  const eveVersion = serverVersions?.eve && serverVersions.eve !== 'unknown'
    ? serverVersions.eve
    : await resolveEveVersion();
  applyRuntimeVersions({ atomeVersion, eveVersion });
  return window.__SQUIRREL_VERSIONS__;
}

async function logServerInfo() {
  const versions = await loadRuntimeVersions(true);
  emitRuntimeVersionConsoleReport(versions);
}

const runtimeVersionPromise = logServerInfo().catch(() => {
  applyRuntimeVersions({ atomeVersion: 'unknown', eveVersion: 'unknown' });
});

if (typeof window !== 'undefined') {
  window.__SQUIRREL_VERSION_PROMISE__ = runtimeVersionPromise;
  window.__refreshSquirrelVersions__ = (force = false) => loadRuntimeVersions(force);
  window.__emitSquirrelVersionsToConsole__ = () => emitRuntimeVersionConsoleReport(window.__SQUIRREL_VERSIONS__);
}
