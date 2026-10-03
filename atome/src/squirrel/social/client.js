import { requestProviderService } from '../ai/provider_broker.js';
import { saveExportFile } from '../shared/file_export.js';

// Client side of social sharing. Requests travel on the principal's
// authenticated provider socket (web: Fastify; Tauri/iOS: relayed by the host);
// this module adds only what needs the device: opening the provider's official
// page, handing a file to another app, and saving an export.

export const socialRequest = (action, payload = {}, options = {}) => requestProviderService(`social.${action}`, payload, options);

const OFFICIAL_HOSTS = /^(www\.)?(tiktok\.com|instagram\.com|facebook\.com)$/;
const isOfficialUrl = (value) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && OFFICIAL_HOSTS.test(url.hostname);
    } catch { return false; }
};

const env = () => globalThis.window || null;
const iosOpenUrl = () => env()?.webkit?.messageHandlers?.['squirrel.openURL'] || null;
const tauriInvoke = () => {
    const win = env();
    return win?.__TAURI_INTERNALS__?.invoke?.bind(win.__TAURI_INTERNALS__) || win?.__TAURI__?.invoke?.bind(win.__TAURI__) || null;
};

// A web page must open its window during the user's gesture: `reserve()` is
// called first (synchronously from the activation), the address is set once
// the server has answered. Native hosts open the system browser instead.
export function reserveExternalWindow() {
    if (iosOpenUrl() || tauriInvoke() || typeof env()?.open !== 'function') return null;
    const popup = env().open('about:blank', '_blank');
    if (popup) popup.opener = null;
    return popup || null;
}

export async function openOfficialPage(url, reserved = null) {
    if (!isOfficialUrl(url)) {
        reserved?.close?.();
        return { ok: false, error: 'social_request_invalid' };
    }
    const ios = iosOpenUrl();
    if (ios) { ios.postMessage({ url }); return { ok: true, via: 'ios' }; }
    const invoke = tauriInvoke();
    if (invoke) {
        await invoke('plugin:opener|open_url', { url });
        return { ok: true, via: 'tauri' };
    }
    const target = reserved && !reserved.closed ? reserved : env()?.open?.(url, '_blank', 'noopener');
    if (!target) return { ok: false, error: 'social_handoff_unavailable', action_required: 'user_gesture_required' };
    if (target === reserved) target.location.href = url;
    return { ok: true, via: 'web' };
}

// Connect = official login page + wait for the provider's redirect. The server
// binds the attempt to this principal; nothing typed here reaches the provider.
export async function connectSocialAccount(network, { signal = null, reserved = null } = {}) {
    let start;
    try { start = await socialRequest('connect.start', { network }, { signal }); }
    catch (error) { reserved?.close?.(); throw error; }
    const opened = await openOfficialPage(start.authorization_url, reserved);
    if (!opened.ok) {
        await socialRequest('connect.cancel', { attempt_id: start.attempt_id });
        return opened;
    }
    const cancel = () => { void socialRequest('connect.cancel', { attempt_id: start.attempt_id }); };
    signal?.addEventListener('abort', cancel, { once: true });
    try { return await socialRequest('connect.await', { attempt_id: start.attempt_id }, { signal }); }
    finally { signal?.removeEventListener('abort', cancel); }
}

const toBase64 = (bytes) => {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
};

const iosNativeInvoke = () => (typeof env()?.__ATOME_IOS_NATIVE_INVOKE === 'function' ? env().__ATOME_IOS_NATIVE_INVOKE : null);
const webCanShareFiles = (files) => typeof globalThis.navigator?.canShare === 'function' && globalThis.navigator.canShare({ files });

// Whether this device can hand a file to another app (the system share sheet):
// the iOS app always can; a browser only with Web Share Level 2; the macOS
// app has no share target for these networks and exports instead.
export function systemShareAvailable() {
    if (iosNativeInvoke()) return true;
    if (tauriInvoke()) return false;
    const File = globalThis.File;
    return typeof File === 'function' && webCanShareFiles([new File([new Uint8Array(1)], 'probe.jpg', { type: 'image/jpeg' })]);
}

// Hands the original asset to the share sheet. The result says what is known:
// on iOS the receiving extension (`target`), in a browser only that the sheet
// completed. Neither means the post was published.
export async function shareFileToApp(file) {
    const invoke = iosNativeInvoke();
    if (invoke) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = await invoke('export_file_share', { name: file.name, dataBase64: toBase64(bytes) });
        if (result?.success) return { ok: true, target: result.activity_type || null };
        return { ok: false, cancelled: result?.cancelled === true, error: result?.error || 'social_handoff_unavailable' };
    }
    if (!webCanShareFiles([file])) return { ok: false, error: 'social_handoff_unavailable' };
    try {
        await globalThis.navigator.share({ files: [file] });
        return { ok: true, target: null };
    } catch (error) {
        return error?.name === 'AbortError' ? { ok: false, cancelled: true } : { ok: false, error: 'social_handoff_unavailable' };
    }
}

export async function exportSocialFile(file) {
    const result = await saveExportFile(file.name, new Uint8Array(await file.arrayBuffer()), file.type || 'application/octet-stream');
    return result.ok ? { ok: true } : { ok: false, cancelled: result.cancelled === true, error: result.error || 'social_handoff_unavailable' };
}
