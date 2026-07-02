// Ensure global debug flag exists before any module scripts run.
window.__CHECK_DEBUG__ = false;
var __CHECK_DEBUG__ = window.__CHECK_DEBUG__;

// Register the renderer-WASM warm cache service worker. Progressive enhancement only:
// guarded by feature detection, so it stays inert on unsupported runtimes (e.g. the
// iOS atome:// scheme). Registered on load so it never competes with boot.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () { /* optimization only */ });
    });
}
