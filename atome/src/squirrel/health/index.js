// Boot-time construction of the health owner. Evaluated by
// `conditions/bootstrap.js`, in the boot wave that precedes any project code:
// the native invoke is captured and the channel claimed here, once.

import { getToken } from '../apis/unified/adole_connection.js';
import { CONFIG } from '../apis/unified/adole_backend.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';
import { createHealthChannel, resolveNativeHealthInvoke } from './health_channel.js';
import { createHealthOwner } from './health_owner.js';
import { createHealthDeclarations } from './health_declarations.js';
import { createHealthFeeling } from './health_feeling.js';
import { createSensorConsent } from './health_sensor_consent.js';
import { createSensorBackup } from './sensor_backup.js';
import { getCurrentUserId } from '../../../../eVe/core/project_security.js';

const env = typeof window !== 'undefined' ? window : globalThis;

// Health is associated with the local principal of this device: a signed-in
// account or the local guest. Values never leave the device either way.
const accountId = () => {
    const session = getSessionState();
    return session?.mode === 'authenticated' || session?.mode === 'anonymous' ? (session.user?.id || null) : null;
};

// The local access token expires after 15 minutes: renew it through the same
// owner as every other local API before handing it to the host, otherwise the
// host answers `health_account_required` to a signed-in user or guest. Imported lazily:
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

const measuredOwner = createHealthOwner({
    channel,
    getAccountId: accountId,
    eventTarget: env.addEventListener ? env : null,
    documentRef: typeof document !== 'undefined' ? document : null
});

// Read and written as Atomes through the mutation pipeline installed after this boot wave (eVe/core/atome_commit.js),
// owned like the Programme's records: the signed-in account or this device's guest.
const store = {
    read: async (id) => {
        try { return await env.Atome.getStateCurrent(id); }
        catch (error) { if (error?.message === 'atome_not_available_locally') return null; throw error; }
    },
    commit: (event) => env.Atome.commit(event, { refreshState: true, realtimeBroadcast: true })
};
// What the person declares (a glass of water) joins what the store measured; how they feel is theirs too (#health_feeling.js);
// the raw motion is recorded only with the person's agreement (#health_sensor_consent.js).
const declared = createHealthDeclarations({ owner: measuredOwner, actor: getCurrentUserId, store });
// The copies go to the account vault (/ws/api file operations), encrypted with the account's backup keys.
// Imported lazily: this module is evaluated in the boot wave, before the auth owner and the adapters.
const backup = createSensorBackup({ sensors: measuredOwner.sensors, store, actor: getCurrentUserId,
    keys: async () => (await import('../apis/unified/adole_api/auth_methods_account.js')).pairingClient().backupKeys(),
    files: async () => (await import('../apis/unified/adole.js')).FastifyAdapter.file });
const owner = Object.freeze({ ...declared, feeling: createHealthFeeling({ store, actor: getCurrentUserId }),
    sensors: createSensorConsent({ sensors: measuredOwner.sensors, backup, store, actor: getCurrentUserId }) });

export const getHealthOwner = () => owner;

// Called right before code typed or loaded by a user runs in this realm
// (code editor). Irreversible until reload.
export const sealHealthAccessForUntrustedCode = () => owner.seal();
