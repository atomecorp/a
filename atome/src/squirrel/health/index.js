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

const native = resolveNativeHealthInvoke(env);
const channel = createHealthChannel({
    invoke: native.invoke,
    host: native.host,
    getAuthToken: () => getToken(CONFIG.TAURI_TOKEN_KEY)
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
