// Boot-time construction of the health owner. Evaluated by
// `conditions/bootstrap.js`, in the boot wave that precedes any project code:
// the native invoke is captured and the channel claimed here, once.

import { getToken } from '../apis/unified/adole_connection.js';
import { CONFIG } from '../apis/unified/adole_backend.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';
import { createHealthChannel, resolveNativeHealthInvoke } from './health_channel.js';
import { createHealthOwner } from './health_owner.js';

const env = typeof window !== 'undefined' ? window : globalThis;

const accountId = () => {
    const session = getSessionState();
    return session?.mode === 'authenticated' ? (session.user?.id || null) : null;
};

// The local access token expires after 15 minutes: renew it through the same
// owner as every other local API before handing it to the host, otherwise the
// host answers `health_account_required` to a signed-in user. Imported lazily:
// this module is evaluated in the boot wave, before the auth owner.
const freshLocalToken = async () => {
    try {
        const { ensureLocalSession } = await import('../apis/unified/adole_api/auth_methods_login.js');
        await ensureLocalSession();
    } catch (_) { /* the host refuses a missing or expired token by itself */ }
    return getToken(CONFIG.TAURI_TOKEN_KEY);
};

const native = resolveNativeHealthInvoke(env);
const channel = createHealthChannel({
    invoke: native.invoke,
    host: native.host,
    getAuthToken: freshLocalToken
});
if (native.invoke) void channel.open();

const owner = createHealthOwner({
    channel,
    getAccountId: accountId,
    eventTarget: env.addEventListener ? env : null,
    documentRef: typeof document !== 'undefined' ? document : null
});

export const getHealthOwner = () => owner;

// Called right before code typed or loaded by a user runs in this realm
// (code editor). Irreversible until reload.
export const sealHealthAccessForUntrustedCode = () => owner.seal();
