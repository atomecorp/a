import { createEncryptedTokenVault } from './token_vault.js';

const SECURITY_KEY = '__SQUIRREL_SECURITY_API__';
const VAULT_KEY = '__SQUIRREL_TOKEN_VAULT__';

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

const getOrCreateVault = (env) => {
    if (env[VAULT_KEY]) return env[VAULT_KEY];
    const vault = createEncryptedTokenVault({
        storage: env?.localStorage || null
    });
    env[VAULT_KEY] = vault;
    return vault;
};

export const createGlobalSecurityApi = ({
    env = globalThis
} = {}) => {
    if (!env || typeof env !== 'object') {
        throw new Error('Global security bootstrap requires an object-like environment');
    }
    if (env[SECURITY_KEY]) return env[SECURITY_KEY];

    const api = {
        get tokenVault() {
            return getOrCreateVault(env);
        },
        configureVaultSecret(secret) {
            return getOrCreateVault(env).setSecret(secret);
        },
        vaultStatus() {
            return {
                ok: true,
                configured: getOrCreateVault(env).hasSecret()
            };
        },
        async storeToken(entryId, value, metadata = {}) {
            return getOrCreateVault(env).store(entryId, value, metadata);
        },
        async readToken(entryId) {
            return getOrCreateVault(env).read(entryId);
        },
        removeToken(entryId) {
            return getOrCreateVault(env).remove(entryId);
        },
        listTokens() {
            return getOrCreateVault(env).list();
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
