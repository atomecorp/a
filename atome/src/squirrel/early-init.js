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

// The invitation of a closed sign-up (server/auth_invites.js), stripped the same way:
// held in memory until the account creation of this page uses it.
if (location.hash.startsWith('#invite=')) {
    const match = /^#invite=([A-Za-z0-9_-]{43})$/.exec(location.hash);
    const invite = match ? match[1] : '';
    history.replaceState(history.state, '', location.pathname + location.search);
    window.__ATOME_INVITE__ = function () { return invite; };
}

// A domain link (R-192: https://atome.one/music, sent here as /?domain=music by the server, an invitation's
// fragment kept): kept for this tab, through a sign-in and its reload, until a home takes it
// (eVe/domains/dashboard/dashboard_domain.js#settleDashboardDomain). Only the domains eVe holds are kept.
(function keepDomainLink() {
    const params = new URLSearchParams(location.search);
    if (!params.has('domain')) return;
    const domain = params.get('domain');
    params.delete('domain');
    const search = params.toString();
    history.replaceState(history.state, '', location.pathname + (search ? '?' + search : '') + location.hash);
    if (domain === 'eve' || domain === 'music') sessionStorage.setItem('atome.domain.link', domain);
    else console.error('[domain_link] unknown domain', domain);
})();

// Ensure global debug flag exists before any module scripts run.
window.__CHECK_DEBUG__ = false;
var __CHECK_DEBUG__ = window.__CHECK_DEBUG__;

// Native applications ship their shell. Browsers install a verified, versioned
// application cache independently of persistent project data.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && window.isSecureContext && !window.__TAURI_INTERNALS__ && !window.__ATOME_IOS_NATIVE_INVOKE) {
    const OFFLINE_MESSAGES = ['atome:offline-app-ready', 'atome:offline-app-error', 'atome:offline-local-ready', 'atome:offline-local-error'];
    const register = function () {
        return navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(askLocalFill).catch(function () {
            window.dispatchEvent(new CustomEvent('squirrel:offline-app-error', { detail: { code: 'offline_app_registration_failed' } }));
        });
    };
    // A version superseded while it installed (a served file changed under it, sw.js) is registered again: the newer
    // version installs. The same version superseded twice is a file that never matches its manifest: it failed.
    let supersededVersion = '';
    navigator.serviceWorker.addEventListener('message', function (event) {
        if (OFFLINE_MESSAGES.indexOf(event.data?.type) < 0) return;
        let code = event.data.code;
        if (code === 'offline_app_superseded') {
            if (event.data.version !== supersededVersion) {
                supersededVersion = event.data.version;
                window.dispatchEvent(new CustomEvent('squirrel:offline-app-error', { detail: { code: code } }));
                register();
                return;
            }
            code = 'offline_app_install_failed';
        }
        window.dispatchEvent(new CustomEvent(event.data.type.replace('atome:', 'squirrel:'), { detail: { code: code } }));
    });
    // The worker in charge stores the local media and models still missing (sw.js fillLocal).
    const askLocalFill = function () {
        if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'atome:offline-local-fill' });
    };
    navigator.serviceWorker.addEventListener('controllerchange', askLocalFill);
    window.addEventListener('load', register);
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
