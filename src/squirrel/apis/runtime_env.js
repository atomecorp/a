export const isTauriRuntime = () => {
    if (typeof window === 'undefined') return false;
    if (window.__SQUIRREL_FORCE_FASTIFY__ === true) return false;
    if (window.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true) return true;
    const protocol = String(window.location?.protocol || '').toLowerCase();
    const host = String(window.location?.hostname || '').toLowerCase();
    const hostEnv = String(window.__HOST_ENV || '').trim().toLowerCase();
    if (protocol === 'tauri:' || protocol === 'asset:' || protocol === 'ipc:' || protocol === 'atome:') return true;
    if (host === 'tauri.localhost') return true;
    if (window.__AUV3_MODE__ === true || hostEnv === 'app' || hostEnv === 'auv3') return true;
    const hasTauriInvoke = !!(window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function');
    if (hasTauriInvoke) return true;
    const hasTauriObjects = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    if (!hasTauriObjects) return false;
    if (typeof navigator !== 'undefined' && /tauri/i.test(navigator.userAgent || '')) return true;
    return false;
};

export const isBrowserRuntime = () => {
    if (typeof window === 'undefined') return false;
    return !isTauriRuntime();
};
