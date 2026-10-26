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
// it is known. Native hosts open the system browser instead.
export function reserveExternalWindow() {
    if (iosOpenUrl() || tauriInvoke() || typeof env()?.open !== 'function') return null;
    const popup = env().open('about:blank', '_blank');
    if (popup) popup.opener = null;
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
