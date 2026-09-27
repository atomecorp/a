// Strip the SMS fragment before any application module or diagnostics starts.
// A one-shot closure holds it in memory only, never in storage or Atome state.
if (location.hash.startsWith('#auth-link=')) {
    const match = /^#auth-link=([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(location.hash);
    let pendingLink = match ? `https://atome.one/auth/v/${match[1]}#t=${match[2]}` : null;
    history.replaceState(history.state, '', location.pathname + location.search);
    window.__ATOME_TAKE_AUTH_LINK__ = function () {
        const value = pendingLink;
        pendingLink = null;
        delete window.__ATOME_TAKE_AUTH_LINK__;
        return value;
    };
}

// Ensure global debug flag exists before any module scripts run.
window.__CHECK_DEBUG__ = false;
var __CHECK_DEBUG__ = window.__CHECK_DEBUG__;

// Native applications ship their shell. Browsers install a verified, versioned
// application cache independently of persistent project data.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && window.isSecureContext && !window.__TAURI_INTERNALS__ && !window.__ATOME_IOS_NATIVE_INVOKE) {
    navigator.serviceWorker.addEventListener('message', function (event) {
        if (event.data?.type === 'atome:offline-app-ready' || event.data?.type === 'atome:offline-app-error') {
            window.dispatchEvent(new CustomEvent(event.data.type.replace('atome:', 'squirrel:'), { detail: { code: event.data.code } }));
        }
    });
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(function () {
            window.dispatchEvent(new CustomEvent('squirrel:offline-app-error', { detail: { code: 'offline_app_registration_failed' } }));
        });
    });
}

// The native WebView context menu is never part of the product. It is suppressed
// here, before any module runs, so no surface can leak it: right click on desktop,
// long-press callout on iOS, and the derived contextmenu of a completed long press.
// Only the default action is cancelled — propagation must continue, because the
// Mystic context runtime listens for the same event in capture to open the radial
// menu (eVe/intuition/mystic/context.js).
document.addEventListener('contextmenu', function (event) {
    event.preventDefault();
}, true);
