import { getFastifyHttpBaseUrl } from '../adole_backend.js';
import { synchronizeBrowserWorkspace } from './browser_workspace.js';
// Application authentication owner: remote proof exchange and local authorization
// are separate lifecycles. Neither a cached phone nor an expired bearer unlocks data.
import { TauriAdapter, FastifyAdapter } from '../adole.js';
import { createAuthDeviceStore } from '../../../security/auth_device.js';
import { createPhoneLinkClient } from '../../../security/auth_phone_link_client.js';
import { normalizePhone, normalizeUser } from './auth_core.js';
import { isTauriRuntime } from './runtime.js';
import { setSessionState, getSessionState } from './session.js';

let devices;
let client;
let renewal = null;
let localRenewal = null;
let localExpiresAt = 0;
let remoteExpiresAt = 0;

function deviceStore() {
    if (devices) return devices;
    const env = globalThis.window || globalThis;
    const nativeKey = isTauriRuntime() ? async (fields) => {
        if (typeof env.__ATOME_IOS_NATIVE_INVOKE === 'function') {
            const result = await env.__ATOME_IOS_NATIVE_INVOKE('auth_device_key', fields);
            return fields.action === 'public' ? result.publicKey : result.signature;
        }
        const invoke = env.__TAURI_INTERNALS__?.invoke || env.__TAURI__?.core?.invoke || env.__TAURI__?.invoke;
        if (typeof invoke !== 'function') throw new Error('auth_protected_device_key_unavailable');
        // Tauri validates every Rust command argument before entering the
        // handler. `message` and `signature` are Option<String> in Rust, but
        // they still need to be present in the JS payload: omitting them makes
        // the public-key request fail before phone-link-start reaches the
        // server. Explicit nulls deserialize to None.
        return invoke('auth_device_key', {
            action: fields.action,
            scope: fields.scope,
            message: fields.message ?? null,
            signature: fields.signature ?? null
        });
    } : null;
    devices = createAuthDeviceStore({ nativeKey });
    return devices;
}

export async function setBrowserWorkspaceIdentity(user) {
    if (!isTauriRuntime()) await deviceStore().put('workspace-identity', user ? { id: user.id, locked: false } : { locked: true });
}

async function localRequest(action, fields = {}) {
    const env = globalThis.window || globalThis;
    // iOS owns local grants in native SQLite and their signing key in the
    // Keychain. Restoring that authority through the loopback WebSocket made
    // application launch depend on a second server becoming ready first; when
    // that race lost, tryAutoLogin cleared the durable session and presented a
    // fresh SMS login. The native bridge is available before application code
    // and reaches the exact same AiSRuntime auth handler, so use it for every
    // local auth command on iOS. Desktop Tauri keeps its Axum WebSocket route.
    const result = typeof env.__ATOME_IOS_NATIVE_INVOKE === 'function'
        ? await env.__ATOME_IOS_NATIVE_INVOKE('auth_local_request', { action, ...fields })
        : await TauriAdapter.ws.send({ type: 'auth', action, ...fields });
    if (!result?.ok) throw new Error(result?.error || 'local_auth_unavailable');
    return result;
}

function installLocal(result, backend) {
    const user = normalizeUser(result.user);
    if (!user) throw new Error('auth_session_invalid');
    if (backend === 'tauri') {
        TauriAdapter.setToken(result.token);
        localExpiresAt = Date.now() + 840000;
    }
    setSessionState({ mode: 'authenticated', user, backend });
    return { ok: true, authenticated: true, user, backend };
}

async function installRemote(result, { attemptId } = {}) {
    const store = deviceStore();
    const phone = result.user.phone;
    const device = await store.forPhone(phone);
    let local;
    if (isTauriRuntime()) {
        const fields = { scope: device.scope, keyId: device.keyId,
            sessionId: result.session.id, generation: result.session.generation };
        const { challenge } = await localRequest('local-link-challenge', fields);
        if (challenge?.purpose !== 'local-bind' || challenge.reference !== `${fields.sessionId}:${fields.generation}`) {
            throw new Error('auth_challenge_invalid');
        }
        local = await localRequest('local-link-complete', { ...fields, ...await device.sign(challenge) });
        try {
            await store.put('local-grant', { phone, keyId: device.keyId, scope: device.scope, user: normalizeUser(local.user),
                localSession: local.localSession, locked: false });
        } catch (_) {
            // Native SQLite is authoritative; this WebKit cache is optional.
        }
    } else {
        local = result;
        await store.put('local-grant', { phone, keyId: device.keyId, user: normalizeUser(result.user), locked: false });
    }
    await setBrowserWorkspaceIdentity(local.user);
    FastifyAdapter.setToken(result.token);
    remoteExpiresAt = Date.now() + 840000;
    installLocal(local, isTauriRuntime() ? 'tauri' : 'fastify');
    globalThis.window?.dispatchEvent(new CustomEvent('squirrel:remote-session-ready', { detail: { userId: result.user.id } }));
    if (attemptId) globalThis.window?.dispatchEvent(new CustomEvent('squirrel:phone-login-complete'));
}

export function phoneLinkClient() {
    if (!client) client = createPhoneLinkClient({ devices: deviceStore(), send: (message) => FastifyAdapter.ws.send(message), installSession: installRemote });
    return client;
}

export async function restoreLocalAuthorization() {
    const store = deviceStore();
    let record = null;
    if (isTauriRuntime()) {
        // SQLite + platform keystore are the native authority. IndexedDB is a
        // cache and may be absent after a WebView origin/storage migration.
        try { record = await store.read('local-grant'); } catch (_) { /* optional native cache */ }
        const described = await localRequest('local-session-describe', {
            grantId: record?.localSession?.id || undefined
        });
        record = described.localGrant;
        if (record) try { await store.put('local-grant', record); } catch (_) { /* optional native cache */ }
    } else record = await store.read('local-grant');
    if (!record || record.locked) return { authenticated: false };
    const device = record.scope ? await store.forScope(record.scope) : await store.forPhone(record.phone);
    if (device.keyId !== record.keyId) throw new Error('auth_device_binding_mismatch');
    if (!isTauriRuntime()) {
        await setBrowserWorkspaceIdentity(record.user);
        return installLocal({ user: record.user }, 'fastify');
    }
    const { challenge } = await localRequest('local-session-challenge', { grantId: record.localSession.id, purpose: 'local-resume' });
    if (challenge?.purpose !== 'local-resume' || challenge.reference !== `${record.localSession.id}:${record.localSession.generation}`) {
        throw new Error('auth_challenge_invalid');
    }
    const result = await localRequest('local-session-resume', { grantId: record.localSession.id, ...await device.sign(challenge) });
    return installLocal(result, 'tauri');
}

export async function lockLocalAuthorization() {
    const store = deviceStore();
    let record = null;
    if (isTauriRuntime()) {
        try { record = await store.read('local-grant'); } catch (_) { /* optional native cache */ }
        record = (await localRequest('local-session-describe', {
            grantId: record?.localSession?.id || undefined
        })).localGrant;
    } else record = await store.read('local-grant');
    if (!record) return;
    if (isTauriRuntime() && !record.locked) {
        const device = await store.forPhone(record.phone);
        const { challenge } = await localRequest('local-session-challenge', { grantId: record.localSession.id, purpose: 'local-lock' });
        if (challenge?.purpose !== 'local-lock' || challenge.reference !== `${record.localSession.id}:${record.localSession.generation}`) {
            throw new Error('auth_challenge_invalid');
        }
        await localRequest('local-session-lock', { grantId: record.localSession.id, ...await device.sign(challenge) });
    }
    await store.put('local-grant', { ...record, locked: true });
    await setBrowserWorkspaceIdentity(null);
    localExpiresAt = 0;
}

export function ensureRemoteSession() {
    if (FastifyAdapter.getToken() && remoteExpiresAt > Date.now()) return Promise.resolve({ ok: true });
    if (!renewal) renewal = phoneLinkClient().renew().then(() => ({ ok: true })).finally(() => { renewal = null; });
    return renewal;
}

export async function recoverDesktopAuthorization() {
    const env = globalThis.window || globalThis;
    // This repairs only the desktop crash window where the server session was
    // issued and cached but native local binding did not finish. iOS owns a
    // separate same-device lifecycle and must never be redirected through it.
    if (!isTauriRuntime() || typeof env.__ATOME_IOS_NATIVE_INVOKE === 'function') {
        return { authenticated: false, attempted: false };
    }
    const record = await deviceStore().read('session');
    if (!record?.session?.id) return { authenticated: false, attempted: false };
    try {
        await phoneLinkClient().renew();
        const state = getSessionState();
        return { authenticated: state.mode === 'authenticated', attempted: true, user: state.user || null };
    } catch (error) {
        return { authenticated: false, attempted: true,
            error: error?.message || 'local_authorization_unavailable' };
    }
}

export function ensureLocalSession() {
    if (!isTauriRuntime()) return Promise.resolve({ ok: true });
    const state = getSessionState();
    if (state.mode === 'anonymous') {
        if (TauriAdapter.getToken() && localExpiresAt > Date.now()) return Promise.resolve({ ok: true });
        return TauriAdapter.auth.startGuest({ guestId: state.user.id }).then((result) => {
            if (!result.ok) throw new Error(result.error || 'local_guest_unavailable');
            localExpiresAt = Date.now() + 840000;
            return result;
        });
    }
    if (state.mode !== 'authenticated') return Promise.resolve({ ok: true });
    if (TauriAdapter.getToken() && localExpiresAt > Date.now()) return Promise.resolve({ ok: true });
    if (!localRenewal) localRenewal = restoreLocalAuthorization().finally(() => { localRenewal = null; });
    return localRenewal;
}

let linksInitialized = false;
export async function initializePhoneLinks() {
    const env = globalThis.window;
    if (!env || linksInitialized) return;
    linksInitialized = true;
    const listeners = new AbortController();
    const report = (error) => env.dispatchEvent(new CustomEvent('squirrel:phone-login-error', {
        detail: { code: error?.message || 'auth_request_rejected' }
    }));
    const resume = async () => {
        if (!await deviceStore().read('attempt')) return;
        try { await phoneLinkClient().resume(); } catch (error) { report(error); }
    };
    const takeNativeLink = async () => {
        if (typeof env.__ATOME_IOS_NATIVE_INVOKE !== 'function') return;
        const result = await env.__ATOME_IOS_NATIVE_INVOKE('auth_link_take', {});
        if (result?.url) await phoneLinkClient().consumeLink(result.url);
    };
    const synchronize = async () => {
        if (isTauriRuntime()) {
            const { configureTauriRemoteSync } = await import('./auth_fastify_token.js');
            const result = await configureTauriRemoteSync();
            if (!result.ok) throw new Error(result.reason);
            return;
        }
        await synchronizeBrowserWorkspace({ ensureSession: ensureRemoteSession,
            send: message => FastifyAdapter.ws.send({ ...message, token: FastifyAdapter.getToken() }),
            uploadFile: async file => {
                const response = await fetch(`${getFastifyHttpBaseUrl().replace(/\/+$/, '')}/api/uploads`, {
                    method: 'POST', headers: { Authorization: `Bearer ${FastifyAdapter.getToken()}`, 'Content-Type': 'application/octet-stream',
                        'X-Filename': file.file_name, 'X-File-Path': `Downloads/${file.file_name}`,
                        'X-Atome-Id': file.atome_id || file.file_id, 'X-Atome-Type': file.atome_type || 'file', 'X-Mime-Type': file.blob.type || 'application/octet-stream' },
                    body: file.blob
                });
                if (!response.ok) throw new Error('workspace_media_sync_failed');
                return response.json();
            } });
    };
    const requestSync = () => { void synchronize().catch(error => env.dispatchEvent(new CustomEvent('squirrel:workspace-sync-paused', { detail: { code: error.message } }))); };
    env.addEventListener('squirrel:remote-session-ready', requestSync, { signal: listeners.signal });
    env.addEventListener('squirrel:workspace-outbox-ready', requestSync, { signal: listeners.signal });
    env.addEventListener('online', requestSync, { signal: listeners.signal });
    env.addEventListener('squirrel:phone-link-ready', resume, { signal: listeners.signal });
    env.addEventListener('squirrel:auth-transport-open', (event) => {
        if (event.detail?.backend === 'fastify') void resume();
    }, { signal: listeners.signal });
    env.addEventListener('atome:auth-link-available', () => { void takeNativeLink().catch(report); }, { signal: listeners.signal });
    env.addEventListener('online', () => { void phoneLinkClient().retryRevocations().catch(report); void resume(); }, { signal: listeners.signal });
    env.addEventListener('pagehide', (event) => { if (!event.persisted) listeners.abort(); }, { once: true });
    const link = env.__ATOME_TAKE_AUTH_LINK__?.();
    if (link) await phoneLinkClient().consumeLink(link);
    await takeNativeLink();
    void phoneLinkClient().retryRevocations().catch(report);
}

export const loginMethods = {
    async startPhoneLogin(phone) {
        const result = await phoneLinkClient().start(normalizePhone(phone));
        if (!result) throw new Error('auth_phone_link_empty_result');
        return result;
    },
    async resumePhoneLogin() { return phoneLinkClient().resume(); },
    async completePhoneLogin(link) { return phoneLinkClient().consumeLink(link); },
    async cancelPhoneLogin() { return phoneLinkClient().cancel(); },
    ensureLocalSession
};
