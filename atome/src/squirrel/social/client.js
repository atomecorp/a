import { requestProviderService } from '../ai/provider_broker.js';
import { saveExportFile } from '../shared/file_export.js';
import { openExternalPage } from '../shared/external_page.js';

// Client side of social sharing. Requests travel on the principal's
// authenticated provider socket to the Rust atome-server (`providers/social/`; Tauri/iOS: relayed by the host);
// this module adds only what needs the device: opening the provider's official
// page, handing a file to another app, and saving an export.

export const socialRequest = (action, payload = {}, options = {}) => requestProviderService(`social.${action}`, payload, options);

// The ops of the accounts and the conversations (R-190 §5 bis). Tokens never come back: an account is its public view.
// `{ networks: [{ network, configured, accounts: [{ account, label, identity, state, scopes, pages? }] }] }`.
export const socialAccounts = (options = {}) => socialRequest('accounts', {}, options);
// A robot's link typed once (Telegram: { bot_token, chat_id }; Discord: { webhook_url, bot_token?, channel_id? }) → the account view.
export const socialCredentialsSave = (network, fields, options = {}) => socialRequest('credentials.save', { network, fields }, options);
// Use or stop using an account (M1's box): nothing is erased.
export const socialAccountEnable = (network, account, enabled, options = {}) => socialRequest('account.enable', { network, account, enabled: enabled === true }, options);
// One account (or every account of the network when `account` is empty), its tokens revoked where the provider allows it.
export const socialDisconnect = (network, account = '', options = {}) => socialRequest('disconnect', account ? { network, account } : { network }, options);
// The answer to a received message, sent on its network only → `{ status, remote_id, item }`.
export const socialReply = ({ notification_id = '', origin = null, text, attachment_ids = [], private: inPrivate = false }, options = {}) =>
    socialRequest('reply', { ...(notification_id ? { notification_id } : { origin }), text, ...(attachment_ids.length ? { attachment_ids } : {}),
        ...(inPrivate ? { private: true } : {}) }, options);
// A conversation kept on atome → `{ items, nextCursor }`.
export const socialThreadRead = ({ network, account, thread, cursor = '' }, options = {}) =>
    socialRequest('thread.read', { network, account, thread, ...(cursor ? { cursor } : {}) }, options);

const OFFICIAL_HOSTS = /^(?:(www\.)?(tiktok\.com|instagram\.com|facebook\.com|threads\.net|threads\.com|linkedin\.com|deezer\.com)|accounts\.google\.com|bsky\.social|accounts\.spotify\.com|open\.spotify\.com|www\.strava\.com)$/;
// A network whose authorization page is the person's own server: Mastodon's instance as typed, a Bluesky host of the
// handle's own domain (a self-hosted PDS).
const ownHost = (hostname, { instance = '', handle = '' } = {}) => {
    const host = hostname.toLowerCase();
    if (instance && host === String(instance).toLowerCase()) return true;
    const domain = String(handle || '').toLowerCase().replace(/^@/, '').split('.').slice(-2).join('.');
    return Boolean(domain.includes('.') && (host === domain || host.endsWith(`.${domain}`)));
};
const isOfficialUrl = (value, own = {}) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.port
            && (OFFICIAL_HOSTS.test(url.hostname) || ownHost(url.hostname, own));
    } catch { return false; }
};

const env = () => globalThis.window || null;
const tauriInvoke = () => {
    const win = env();
    return win?.__TAURI_INTERNALS__?.invoke?.bind(win.__TAURI_INTERNALS__) || win?.__TAURI__?.invoke?.bind(win.__TAURI__) || null;
};

// A provider's own page, opened by the shared owner (external_page.js) once its host is known official.
export async function openOfficialPage(url, reserved = null, own = {}) {
    if (!isOfficialUrl(url, own)) {
        reserved?.close?.();
        return { ok: false, error: 'social_request_invalid' };
    }
    const opened = await openExternalPage(url, reserved);
    return opened.ok ? opened : { ...opened, error: 'social_handoff_unavailable' };
}

// Connect = official login page + wait for the provider's redirect. The server
// binds the attempt to this principal; nothing typed here reaches the provider. Mastodon names the person's
// instance, Bluesky their handle (typed once in Settings, M1).
export async function connectSocialAccount(network, { signal = null, reserved = null, instance = '', handle = '' } = {}) {
    let start;
    const own = { ...(instance ? { instance } : {}), ...(handle ? { handle } : {}) };
    try { start = await socialRequest('connect.start', { network, ...own }, { signal }); }
    catch (error) { reserved?.close?.(); throw error; }
    const opened = await openOfficialPage(start.authorization_url, reserved, own);
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
