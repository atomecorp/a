// An outside web page opened for the user: the system browser on the native
// hosts (iOS `squirrel.openURL`, Tauri's opener plugin), a new tab on the Web.
// Only an https address without credentials is ever opened.

const env = () => globalThis.window || null;
const iosOpenUrl = () => env()?.webkit?.messageHandlers?.['squirrel.openURL'] || null;
const tauriInvoke = () => {
    const win = env();
    return win?.__TAURI_INTERNALS__?.invoke?.bind(win.__TAURI_INTERNALS__) || win?.__TAURI__?.invoke?.bind(win.__TAURI__) || null;
};

export const isExternalPageUrl = (value) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
    } catch { return false; }
};

// A web page must open its window during the user's gesture: `reserve()` is
// called first (synchronously from the activation), the address is set once
// it is known. Native hosts open the system browser instead. `keepOpener`: the
// window stays this page's own so it can be led through several addresses
// (`openExternalSequence`); the browser lets a page navigate only a window it
// opened and still holds. Only a shop of the catalogue is opened so (R-119 Q5).
export function reserveExternalWindow({ keepOpener = false } = {}) {
    if (iosOpenUrl() || tauriInvoke() || typeof env()?.open !== 'function') return null;
    const popup = env().open('about:blank', '_blank');
    if (popup && !keepOpener) popup.opener = null;
    return popup || null;
}

export async function openExternalPage(url, reserved = null) {
    if (!isExternalPageUrl(url)) {
        reserved?.close?.();
        return { ok: false, error: 'external_page_invalid' };
    }
    const ios = iosOpenUrl();
    if (ios) { ios.postMessage({ url }); return { ok: true, via: 'ios' }; }
    const invoke = tauriInvoke();
    if (invoke) {
        await invoke('plugin:opener|open_url', { url });
        return { ok: true, via: 'tauri' };
    }
    const target = reserved && !reserved.closed ? reserved : env()?.open?.(url, '_blank', 'noopener');
    if (!target) return { ok: false, error: 'external_page_unavailable', action_required: 'user_gesture_required' };
    if (target === reserved) target.location.href = url;
    return { ok: true, via: 'web' };
}

// A shop's cart filled by its own links (register R-119 L4, decision Q5 A): the addresses are opened one after the other in
// one window, each given `stepMs` to load (its session and cart are the shop's cookies), the last one left showing (its cart).
// The Web keeps the window it reserved during the gesture; the native hosts open each in the system browser, whose cookies
// the shop's tabs share. Only the shops of the catalogue are opened so (#shared/web_shop_catalogue.js).
export async function openExternalSequence(urls, reserved = null, { stepMs = 3000, wait = ms => new Promise(done => setTimeout(done, ms)) } = {}) {
    if (!urls.length || !urls.every(isExternalPageUrl)) {
        reserved?.close?.();
        return { ok: false, error: 'external_page_invalid' };
    }
    if (iosOpenUrl() || tauriInvoke() || !reserved) {
        for (const [index, url] of urls.entries()) {
            const opened = await openExternalPage(url, index === 0 ? reserved : null);
            if (!opened.ok) return opened;
            if (index < urls.length - 1) await wait(stepMs);
        }
        return { ok: true, via: iosOpenUrl() ? 'ios' : tauriInvoke() ? 'tauri' : 'web', steps: urls.length };
    }
    for (const [index, url] of urls.entries()) {
        if (reserved.closed) return { ok: false, error: 'external_page_closed', steps: index };
        reserved.location.href = url;
        if (index < urls.length - 1) await wait(stepMs);
    }
    return { ok: true, via: 'web', steps: urls.length };
}
