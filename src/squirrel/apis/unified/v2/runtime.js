export const isTauriRuntime = () => {
    if (typeof window === 'undefined') return false;
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) return true;
    const protocol = window.location?.protocol || '';
    return protocol === 'tauri:' || protocol === 'asset:';
};

export const nowIso = () => new Date().toISOString();
