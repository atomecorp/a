export const isTauriRuntime = () => {
    if (typeof window === 'undefined') return false;
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) return true;
    const protocol = window.location?.protocol || '';
    if (protocol === 'tauri:' || protocol === 'asset:') return true;
    if (typeof navigator !== 'undefined' && /tauri/i.test(navigator.userAgent || '')) return true;
    return false;
};

export const isBrowserRuntime = () => {
    if (typeof window === 'undefined') return false;
    return !isTauriRuntime();
};
