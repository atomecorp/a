import { requestProviderService } from '../ai/provider_broker.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';

const SECURITY_KEY = '__SQUIRREL_SECURITY_API__';

const installSecurityGlobals = (env, api) => {
    env.Squirrel = env.Squirrel || {};
    env.Squirrel.security = api;

    env.atome = env.atome || {};
    env.atome.security = api;
    env.atome.tools = env.atome.tools || {};
    env.atome.tools.security = api;

    env.AtomeSecurity = api;
    return api;
};

const entryIdOf = (value) => {
    const entryId = String(value ?? '').trim();
    if (!entryId) throw new Error('token_vault_entry_id_required');
    return entryId;
};

// The user's secrets (mail password, saved logins, provider keys the device uses
// itself…) live in the account's vault on the server, sealed there: any device
// signed in to the account — recovered, paired or new — reads the same ones.
// Nothing is kept on the device.
export const createGlobalSecurityApi = ({
    env = globalThis,
    request = requestProviderService,
    session = getSessionState
} = {}) => {
    if (!env || typeof env !== 'object') {
        throw new Error('Global security bootstrap requires an object-like environment');
    }
    if (env[SECURITY_KEY]) return env[SECURITY_KEY];

    const api = {
        vaultStatus() {
            return { ok: true, configured: session()?.mode === 'authenticated' };
        },
        async storeToken(entryId, value, metadata = {}) {
            const stored = await request('secret.store', { entry_id: entryIdOf(entryId), value, metadata });
            return { ok: true, entry_id: stored.entry_id, metadata: stored.metadata || {} };
        },
        async readToken(entryId) {
            const id = entryIdOf(entryId);
            const stored = await request('secret.read', { entry_id: id });
            return stored?.entry_id
                ? { ok: true, entry_id: stored.entry_id, metadata: stored.metadata || {}, value: stored.value }
                : { ok: false, error: 'token_vault_entry_not_found', entry_id: id };
        },
        async removeToken(entryId) {
            const removed = await request('secret.remove', { entry_id: entryIdOf(entryId) });
            return { ok: true, entry_id: removed.entry_id };
        },
        async listTokens() {
            return { ok: true, items: (await request('secret.list', {})).items || [] };
        }
    };

    env[SECURITY_KEY] = installSecurityGlobals(env, api);
    return env[SECURITY_KEY];
};

export const bootstrapGlobalSecurity = ({
    env = (typeof window !== 'undefined' ? window : globalThis)
} = {}) => createGlobalSecurityApi({ env });

if (typeof window !== 'undefined') {
    bootstrapGlobalSecurity({ env: window });
}
