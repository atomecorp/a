export const isTauriRuntime = () => {
    if (typeof window === 'undefined') return false;
    return !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
};

export const nowIso = () => new Date().toISOString();
