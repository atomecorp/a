import { TauriAdapter, FastifyAdapter } from '../adole.js';
import { getFastifyHttpBaseUrl } from '../adole_backend.js';
import { isTauriRuntime } from './runtime.js';
import { meBackend } from './auth_backends.js';
import { ensureRemoteSession, ensureLocalSession } from './auth_methods_login.js';

const markFastifyAuthValid = () => {
    if (typeof window !== 'undefined') window.__SQUIRREL_FASTIFY_AUTH_INVALID__ = false;
};

const configureTauriRemoteSync = async () => {
    if (!isTauriRuntime()) return { ok: true, reason: 'not_tauri_runtime' };
    const remoteToken = FastifyAdapter?.getToken?.();
    const localToken = TauriAdapter?.getToken?.();
    if (!remoteToken || !localToken) {
        return { ok: false, reason: 'sync_identity_token_missing' };
    }
    const [localSession, remoteSession] = await Promise.all([
        meBackend('tauri'),
        meBackend('fastify')
    ]);
    const localUserId = localSession?.user?.id ? String(localSession.user.id) : null;
    const remoteUserId = remoteSession?.user?.id ? String(remoteSession.user.id) : null;
    if (!localSession?.ok || !remoteSession?.ok || !localUserId || !remoteUserId) {
        return { ok: false, reason: 'sync_identity_principal_missing' };
    }
    const remoteUrl = String(getFastifyHttpBaseUrl() || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(remoteUrl)) {
        return { ok: false, reason: 'sync_remote_url_missing' };
    }
    const configuredFingerprint = typeof window !== 'undefined'
        ? String(window.__SQUIRREL_ENVIRONMENT_FINGERPRINT__ || '').trim()
        : '';
    const environmentFingerprint = configuredFingerprint || `${remoteUrl}|${remoteUserId}`;
    const configured = await TauriAdapter?.sync?.configureRemote?.({
        remote_user_id: remoteUserId,
        remote_token: remoteToken,
        remote_url: remoteUrl,
        environment_fingerprint: environmentFingerprint
    });
    if (!configured || configured.ok === false || configured.success === false) {
        return {
            ok: false,
            reason: configured?.error || 'sync_identity_configuration_failed'
        };
    }
    return {
        ok: true,
        reason: 'sync_identity_configured',
        local_user_id: localUserId,
        remote_user_id: remoteUserId
    };
};

// The native sync identity only changes with the sessions. Reconfiguring it before every
// server request (two `me` round trips and a scan of the whole local workspace) made each
// call, message or share wait on a busy local server, past the 10 s request timeout.
// Concurrent callers (a project opening fires several requests at once) share the one
// configuration in flight for the same sessions instead of each starting its own.
let configuredSessions = '';
let configuredResult = null;
let configuring = null;

export async function ensureFastifyToken() {
    try {
        await ensureLocalSession();
        await ensureRemoteSession();
        markFastifyAuthValid();
        const sessions = isTauriRuntime() ? `${FastifyAdapter?.getToken?.() || ''}|${TauriAdapter?.getToken?.() || ''}` : '';
        if (sessions && sessions === configuredSessions && configuredResult) return configuredResult;
        if (configuring?.sessions !== sessions) {
            const task = configureTauriRemoteSync().then((result) => {
                if (configuring?.task === task) {
                    configuring = null;
                    configuredSessions = result?.ok ? sessions : '';
                    configuredResult = result?.ok ? result : null;
                }
                return result;
            }, (error) => { if (configuring?.task === task) configuring = null; throw error; });
            configuring = { sessions, task };
        }
        return await configuring.task;
    } catch (error) {
        configuredSessions = ''; configuredResult = null;
        FastifyAdapter.clearToken();
        return { ok: false, reason: error?.message || 'remote_session_unavailable' };
    }
}

export { markFastifyAuthValid, configureTauriRemoteSync };
