import { getFastifyHttpBaseUrl } from '../adole_backend.js';
import { requeueRefusedBrowserWorkspaceEvents, synchronizeBrowserWorkspace, subscribeBrowserWorkspaceChanges } from './browser_workspace.js';
// Application authentication owner: remote proof exchange and local authorization
// are separate lifecycles. Neither a cached phone nor an expired bearer unlocks data.
import { TauriAdapter, FastifyAdapter } from '../adole.js';
import { createAuthDeviceStore } from '../../../security/auth_device.js';
import { readOptionalAuthCache } from '../../../security/auth_optional_cache.js';
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
let remoteRenewalTimer = null;
// The server session lives 15 min and was renewed only when a request needed it: an idle
// device lost its presence and every call to it went straight to voicemail. It is renewed
// on schedule while signed in (the renewal re-announces presence, see FastifyAdapter.setToken).
const scheduleRemoteRenewal = () => {
    const env = globalThis.window;
    if (!env?.setTimeout) return;
    if (remoteRenewalTimer) env.clearTimeout(remoteRenewalTimer);
    remoteRenewalTimer = env.setTimeout(() => {
        remoteRenewalTimer = null;
        if (getSessionState().mode !== 'authenticated') return;
        ensureRemoteSession().catch(() => {
            // Transport down: retry soon; the reopened socket re-announces itself anyway.
            if (getSessionState().mode === 'authenticated') remoteRenewalTimer = env.setTimeout(scheduleRemoteRenewal, 30000);
        });
    }, Math.max(1000, remoteExpiresAt - Date.now() + 1000));
};

export function deviceStore() {
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
    const nativeSession = (typeof env.__ATOME_IOS_NATIVE_INVOKE === 'function' || isTauriRuntime()) ? {
        read: readNativeSessionGrant,
        clear: clearNativeRemoteSession
    } : null;
    devices = createAuthDeviceStore({ nativeKey, nativeSession });
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
    const message = { type: 'auth', action, ...fields };
    const tauriInvoke = env.__TAURI_INTERNALS__?.invoke || env.__TAURI__?.core?.invoke || env.__TAURI__?.invoke;
    const result = typeof env.__ATOME_IOS_NATIVE_INVOKE === 'function'
        ? await env.__ATOME_IOS_NATIVE_INVOKE('auth_local_request', { action, ...fields })
        : typeof tauriInvoke === 'function'
            ? await tauriInvoke('auth_local_request', { message })
            : await TauriAdapter.ws.send(message);
    if (!result?.ok) throw new Error(result?.error || 'local_auth_unavailable');
    return result;
}

async function readNativeSessionGrant() {
    const cached = await readOptionalAuthCache(() => deviceStore().read('local-grant'));
    return (await localRequest('local-session-describe', { grantId: cached?.localSession?.id, includeLocked: true })).localGrant;
}

async function clearNativeRemoteSession() {
    const record = await readNativeSessionGrant();
    if (!record || record.locked || !record.remoteSessionKnown || !record.remoteSession) return;
    const device = await deviceStore().forScope(record.scope);
    if (device.keyId !== record.keyId) throw new Error('auth_device_binding_mismatch');
    const { challenge } = await localRequest('local-session-challenge', { grantId: record.localSession.id, purpose: 'local-lock' });
    if (challenge?.purpose !== 'local-lock' || challenge.reference !== `${record.localSession.id}:${record.localSession.generation}`) {
        throw new Error('auth_challenge_invalid');
    }
    await localRequest('local-session-lock', { grantId: record.localSession.id, remoteOnly: true, ...await device.sign(challenge) });
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

// The session's key is named by its account scope (V1) or, for phone accounts, its phone.
export async function installRemote(result, { attemptId, scope, renewal = false } = {}) {
    const store = deviceStore();
    const phone = result.user.phone || null;
    const device = scope ? await store.forScope(scope) : await store.forPhone(phone);
    let local;
    if (isTauriRuntime()) {
        const fields = { scope: device.scope, keyId: device.keyId,
            sessionId: result.session.id, generation: result.session.generation };
        const { challenge } = await localRequest('local-link-challenge', fields);
        if (challenge?.purpose !== 'local-bind' || challenge.reference !== `${fields.sessionId}:${fields.generation}`) {
            throw new Error('auth_challenge_invalid');
        }
        local = await localRequest('local-link-complete', { ...fields, ...await device.sign(challenge) });
        local.user = { ...local.user, first_launch_version: result.user.first_launch_version || null };
        try {
            await store.put('local-grant', { phone, keyId: device.keyId, scope: device.scope, user: normalizeUser(local.user),
                localSession: local.localSession, locked: false });
        } catch (_) {
            // Native SQLite is authoritative; this WebKit cache is optional.
        }
    } else {
        local = result;
        await store.put('local-grant', { phone, ...(scope ? { scope } : {}), keyId: device.keyId, user: normalizeUser(result.user), locked: false });
    }
    await setBrowserWorkspaceIdentity(local.user);
    FastifyAdapter.setToken(result.token);
    remoteExpiresAt = Date.now() + 840000;
    scheduleRemoteRenewal();
    local.user = { ...local.user, first_launch_version: result.user.first_launch_version || null };
    installLocal(local, isTauriRuntime() ? 'tauri' : 'fastify');
    // Every account opened in this browser stays listed for switching (§6.5).
    if (!isTauriRuntime()) {
        const record = await store.read('session');
        if (record?.userId === result.user.id) await store.put(`account:${result.user.id}`, { ...record, user: normalizeUser(local.user), handle: result.user.handle || null });
    }
    globalThis.window?.dispatchEvent(new CustomEvent('squirrel:remote-session-ready', { detail: { userId: result.user.id, user: result.user } }));
    // A sign-in that opens the workspace (phone, password, or a V1 creation, pairing or recovery).
    if (attemptId || (scope && !renewal) || result.passwordAuthenticated) globalThis.window?.dispatchEvent(new CustomEvent('squirrel:phone-login-complete', {
        detail: { newAccount: result.newAccount === true, user: result.user }
    }));
}

export function phoneLinkClient() {
    if (!client) client = createPhoneLinkClient({ devices: deviceStore(), send: async (message) => {
        const env = globalThis.window || globalThis;
        // run.sh's local mode is deliberately self-contained: the native shell
        // forwards the short proof exchange to the loopback Fastify process.
        // This avoids WebKit cross-origin/network policy differences while the
        // server still validates the same device signatures as production.
        const localAuthority = String(env.__SQUIRREL_TAURI_FASTIFY_URL__ || '').trim();
        if (/^http:\/\/(127\.0\.0\.1|localhost)(?::\d+)?$/.test(localAuthority)
            && typeof env.__TAURI_INTERNALS__?.invoke === 'function') {
            return env.__TAURI_INTERNALS__.invoke('auth_development_request', { message });
        }
        return FastifyAdapter.ws.send(message);
    }, installSession: installRemote, connectionProof: !isTauriRuntime(), onPending: detail => globalThis.window?.dispatchEvent(
        new CustomEvent('squirrel:phone-login-pending', { detail })) });
    return client;
}

export async function restoreLocalAuthorization() {
    const store = deviceStore();
    let record = null;
    if (isTauriRuntime()) {
        // SQLite + platform keystore are the native authority. IndexedDB is a
        // cache and may be absent after a WebView origin/storage migration.
        record = await readOptionalAuthCache(() => store.read('local-grant'));
        const described = await localRequest('local-session-describe', {
            grantId: record?.localSession?.id || undefined
        });
        record = described.localGrant;
        if (record) void readOptionalAuthCache(() => store.put('local-grant', record));
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
        const device = record.scope ? await store.forScope(record.scope) : await store.forPhone(record.phone);
        if (device.keyId !== record.keyId) throw new Error('auth_device_binding_mismatch');
        const { challenge } = await localRequest('local-session-challenge', { grantId: record.localSession.id, purpose: 'local-lock' });
        if (challenge?.purpose !== 'local-lock' || challenge.reference !== `${record.localSession.id}:${record.localSession.generation}`) {
            throw new Error('auth_challenge_invalid');
        }
        await localRequest('local-session-lock', { grantId: record.localSession.id, ...await device.sign(challenge) });
    }
    if (isTauriRuntime()) {
        // SQLite already locked the grant; WebView storage remains an optional cache.
        try { await store.put('local-grant', { ...record, locked: true }); } catch (_) { /* optional native cache */ }
    } else await store.put('local-grant', { ...record, locked: true });
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
let workspaceSynchronize = null;
let communicationPushClient = null;
// Vider la file d'envoi du workspace navigateur AVANT une action serveur qui porte sur un
// objet cree localement (partager un projet tout juste cree echouait : `share_owner_required`).
// Une passe suffit : une demande recue pendant une passe en cours la fait relancer.
// On Tauri the objects to share are delivered from the native queue right away: the
// queue is ordered by creation and may hold a whole workspace republication.
export async function flushBrowserWorkspace({ atomeIds = [] } = {}) {
    if (typeof workspaceSynchronize !== 'function') return { ok: true, skipped: true };
    await workspaceSynchronize();
    const ids = [...new Set((Array.isArray(atomeIds) ? atomeIds : []).map(id => String(id || '').trim()).filter(Boolean))];
    if (isTauriRuntime() && ids.length) {
        const flushed = await TauriAdapter.sync.flush({ atome_ids: ids });
        if (!flushed?.success && !flushed?.ok) throw new Error(flushed?.error || 'workspace_flush_failed');
        return { ok: true, ...(flushed.data || {}) };
    }
    return { ok: true };
}
export async function initializePhoneLinks() {
    const env = globalThis.window;
    if (!env || linksInitialized) return;
    linksInitialized = true;
    if (typeof env.__ATOME_IOS_NATIVE_INVOKE === 'function' || env.__ATOME_ANDROID_NATIVE__ === true) {
        const [{ installCommunicationPushClient }, { executeNativeNotificationAction }] = await Promise.all([
            import('../../../security/communication_push_client.js'), import('../../../../../../eVe/domains/visio/native_notification_actions.js')
        ]);
        const invoke = env.__ATOME_ANDROID_NATIVE__ === true ? async (command, payload) => {
            const nativeInvoke = env.__TAURI_INTERNALS__?.invoke || env.__TAURI__?.core?.invoke || env.__TAURI__?.invoke;
            if (typeof nativeInvoke !== 'function') throw new Error('notifications_host_unavailable');
            const result = await nativeInvoke('notifications_invoke', { command, payload });
            if (!result?.ok) throw new Error(result?.error || 'notifications_host_unavailable');
            return result;
        } : env.__ATOME_IOS_NATIVE_INVOKE;
        communicationPushClient = installCommunicationPushClient({ env, invoke, ensureSession: ensureRemoteSession,
            readRemoteSession: () => deviceStore().read('session'), execute: executeNativeNotificationAction,
            send: message => FastifyAdapter.ws.send({ ...message, token: FastifyAdapter.getToken() }) });
    }
    const listeners = new AbortController();
    const report = (error) => env.dispatchEvent(new CustomEvent('squirrel:phone-login-error', {
        detail: { code: error?.message || 'auth_request_rejected' }
    }));
    const resume = async () => {
        if (!await deviceStore().read('attempt')) return;
        try { await phoneLinkClient().resume(); } catch (error) {
            // Another trigger (notice, focus, reconnection) completed it meanwhile.
            if (error?.message === 'auth_attempt_expired' && !await deviceStore().read('attempt')) return;
            report(error);
        }
    };
    const takeNativeLink = async () => {
        if (typeof env.__ATOME_IOS_NATIVE_INVOKE !== 'function') return;
        const result = await env.__ATOME_IOS_NATIVE_INVOKE('auth_link_take', {});
        if (result?.url) await phoneLinkClient().consumeLink(result.url);
    };
    const synchronize = async () => {
        if (isTauriRuntime()) {
            // Configured once per session pair, not before every share.
            const { ensureFastifyToken } = await import('./auth_fastify_token.js');
            const result = await ensureFastifyToken();
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
    workspaceSynchronize = synchronize;
    let syncRetryTimer = null, syncFailures = 0;
    const cancelSyncRetry = () => { clearTimeout(syncRetryTimer); syncRetryTimer = null; syncFailures = 0; };
    const requestSync = () => {
        if (getSessionState().mode !== 'authenticated') { cancelSyncRetry(); return; }
        const principal = getSessionState().user?.id, environment = getFastifyHttpBaseUrl();
        const current = () => getSessionState().user?.id === principal && getFastifyHttpBaseUrl() === environment;
        void synchronize().then(() => { if (current()) cancelSyncRetry(); }, error => {
            if (!current()) return;
            env.dispatchEvent(new CustomEvent('squirrel:workspace-sync-paused', { detail: { code: error.message } }));
            if (!syncRetryTimer && getSessionState().mode === 'authenticated') {
                syncRetryTimer = setTimeout(() => { syncRetryTimer = null; requestSync(); }, Math.min(30000, 1000 * 2 ** Math.min(syncFailures++, 5)));
            }
        });
    };
    listeners.signal.addEventListener('abort', cancelSyncRetry, { once: true });
    listeners.signal.addEventListener('abort', subscribeBrowserWorkspaceChanges(env, requestSync), { once: true });
    env.addEventListener('squirrel:user-logged-out', cancelSyncRetry, { signal: listeners.signal });
    env.addEventListener('squirrel:auth-transport-open', requestSync, { signal: listeners.signal });
    env.addEventListener('squirrel:remote-session-ready', () => {
        void requeueRefusedBrowserWorkspaceEvents().then(requestSync, (error) => {
            env.dispatchEvent(new CustomEvent('squirrel:workspace-sync-paused', { detail: { code: error.message } }));
            requestSync();
        });
    }, { signal: listeners.signal });
    env.addEventListener('squirrel:workspace-outbox-ready', requestSync, { signal: listeners.signal });
    env.addEventListener('online', requestSync, { signal: listeners.signal });
    env.addEventListener('squirrel:phone-link-ready', resume, { signal: listeners.signal });
    // The SMS link is often opened elsewhere (browser, phone). The ready notice
    // only reaches the socket that last asked; coming back to the app must not
    // depend on it having survived.
    const resumeOnReturn = async () => {
        const pending = await phoneLinkClient().pendingAttempt().catch(() => null);
        if (pending && !pending.paymentRequired) await resume();
    };
    env.addEventListener('focus', () => { void resumeOnReturn(); }, { signal: listeners.signal });
    env.document?.addEventListener('visibilitychange', () => {
        if (env.document.visibilityState === 'visible') void resumeOnReturn();
    }, { signal: listeners.signal });
    env.addEventListener('squirrel:auth-transport-open', (event) => {
        if (event.detail?.backend === 'fastify') void resume();
    }, { signal: listeners.signal });
    // The transport announces itself on every open; a session installed later (sign-in on
    // an open socket) makes this device reachable for calls right away.
    env.addEventListener('squirrel:remote-session-ready', () => {
        const token = FastifyAdapter.getToken?.();
        if (token) void FastifyAdapter.ws.send({ type: 'auth', action: 'me', token }).catch(() => null);
    }, { signal: listeners.signal });
    env.addEventListener('atome:auth-link-available', () => { void takeNativeLink().catch(report); }, { signal: listeners.signal });
    env.addEventListener('online', () => { void phoneLinkClient().retryRevocations().catch(report); void resume(); }, { signal: listeners.signal });
    env.addEventListener('pagehide', (event) => { if (!event.persisted) listeners.abort(); }, { once: true });
    const link = env.__ATOME_TAKE_AUTH_LINK__?.();
    if (link) await phoneLinkClient().consumeLink(link);
    await takeNativeLink();
    void communicationPushClient?.run();
    void phoneLinkClient().retryRevocations().catch(report);
}

export const loginMethods = {
    async enableNotifications() {
        if (!communicationPushClient) throw new Error('notifications_host_unavailable');
        return communicationPushClient.enable();
    },
    async loginWithPassword(phone, password) { return phoneLinkClient().passwordLogin(normalizePhone(phone), password); },
    async setPassword(password, currentPassword) { return phoneLinkClient().setPassword(password, currentPassword); },
    async hasKnownPassword(phone) { return phoneLinkClient().hasPassword(normalizePhone(phone)); },
    async startPhoneLogin(phone) {
        const result = await phoneLinkClient().start(normalizePhone(phone));
        if (!result) throw new Error('auth_phone_link_empty_result');
        return result;
    },
    async resumePhoneLogin() { return phoneLinkClient().resume(); },
    async resendPhoneLogin() { return phoneLinkClient().resend(); },
    async getPendingPhoneLogin() { return phoneLinkClient().pendingAttempt(); },
    async simulatePhonePayment(method) { return phoneLinkClient().simulatePayment(method); },
    async completePhoneLogin(link) { return phoneLinkClient().consumeLink(link); },
    async confirmPhoneLogin(code) { return phoneLinkClient().confirmLink(code); },
    async cancelPhoneLogin() { return phoneLinkClient().cancel(); },
    ensureLocalSession
};
