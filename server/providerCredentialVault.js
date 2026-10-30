import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { createEncryptedTokenVault } from '../atome/src/squirrel/security/token_vault.js';

// Providers whose key lives only on the server (never readable by the browser).
export const SERVER_VAULT_PROVIDERS = Object.freeze(['openai', 'musicgpt', 'runway', 'spotify', 'deezer']);
// Provider sessions (OAuth tokens + provider identity) of the principal.
export const PROVIDER_VAULT_RECORDS = Object.freeze(['social.tiktok', 'social.instagram', 'social.facebook', 'music.spotify', 'health.strava']);
const assertProvider = (provider) => {
    if (!SERVER_VAULT_PROVIDERS.includes(provider)) throw new Error('provider_not_supported');
};
const assertRecord = (name) => {
    if (!PROVIDER_VAULT_RECORDS.includes(name)) throw new Error('provider_not_supported');
};

// One encrypted record per file, named by the hash of its key, written atomically.
const fileStorage = (root) => {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const filename = (key) => path.join(root, `${createHash('sha256').update(key).digest('hex')}.json`);
    return {
        getItem(key) {
            try { return fs.readFileSync(filename(key), 'utf8'); }
            catch (error) { if (error.code === 'ENOENT') return null; throw error; }
        },
        setItem(key, value) {
            const target = filename(key);
            const temporary = `${target}.${randomBytes(8).toString('hex')}`;
            try {
                fs.writeFileSync(temporary, value, { mode: 0o600, flag: 'wx' });
                fs.renameSync(temporary, target);
            } finally {
                fs.rmSync(temporary, { force: true });
            }
        },
        removeItem(key) { fs.rmSync(filename(key), { force: true }); },
        files: () => fs.readdirSync(root).filter((name) => /^[0-9a-f]{64}\.json$/.test(name))
    };
};

// Server-only storage adapter for the existing encrypted token vault. Credentials
// never enter Atome events, user exports, sync or a browser-readable read route.
export const createProviderCredentialVault = ({ root, secret } = {}) => {
    if (!root || !secret) throw new Error('provider_vault_configuration_required');
    const storage = fileStorage(root);
    const vault = createEncryptedTokenVault({ storage, secret });
    return {
        async store(provider, value) {
            assertProvider(provider);
            const key = String(value || '').trim();
            if (!key || key.length > 1024 || /\s/.test(key)) throw new Error('provider_key_invalid');
            await vault.store(provider, { key });
            return { configured: true };
        },
        async read(provider) {
            assertProvider(provider);
            const result = await vault.read(provider);
            return result.ok ? result.value.key : null;
        },
        remove(provider) {
            assertProvider(provider);
            vault.remove(provider);
            return { configured: false };
        },
        async storeRecord(name, record) {
            assertRecord(name);
            if (!record || typeof record !== 'object' || JSON.stringify(record).length > 64 * 1024) throw new Error('provider_record_invalid');
            await vault.store(name, record);
        },
        async readRecord(name) {
            assertRecord(name);
            const result = await vault.read(name);
            return result.ok ? result.value : null;
        },
        removeRecord(name) {
            assertRecord(name);
            vault.remove(name);
        }
    };
};

// The principal's own secrets (mail password, saved logins, keys of providers the
// device calls itself…): stored with the account, so a recovered or new device gets
// them back. Only that principal reads them, over its authenticated socket.
const SECRET_ID = /^[A-Za-z0-9._%:-]{1,512}$/;
const SECRET_MAX_BYTES = 256 * 1024;
const SECRET_MAX_COUNT = 1000;
export const createAccountSecretVault = ({ root, secret } = {}) => {
    if (!root || !secret) throw new Error('provider_vault_configuration_required');
    const storage = fileStorage(root);
    const vault = createEncryptedTokenVault({ storage, secret, prefix: 'secret.' });
    const entryId = (value) => {
        const id = String(value ?? '').trim();
        if (!SECRET_ID.test(id)) throw new Error('provider_secret_id_invalid');
        return id;
    };
    return {
        async store(id, value, metadata = {}) {
            const normalized = entryId(id);
            const size = Buffer.byteLength(JSON.stringify({ value, metadata }) || '');
            if (value === undefined || size > SECRET_MAX_BYTES) throw new Error('provider_secret_invalid');
            if (!storage.getItem(`secret.${normalized}`) && storage.files().length >= SECRET_MAX_COUNT) throw new Error('provider_secret_limit');
            const stored = await vault.store(normalized, value, metadata && typeof metadata === 'object' ? metadata : {});
            return { entry_id: stored.entry_id, metadata: stored.metadata };
        },
        async read(id) {
            const result = await vault.read(entryId(id));
            return result.ok ? { entry_id: result.entry_id, metadata: result.metadata, value: result.value } : null;
        },
        remove(id) {
            return { entry_id: vault.remove(entryId(id)).entry_id };
        },
        // Entry ids and metadata only, never a value.
        list() {
            return storage.files().map((name) => {
                const record = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
                return { entry_id: record.entry_id, metadata: record.metadata || {},
                    created_at: record.created_at || null, updated_at: record.updated_at || null };
            });
        }
    };
};

export const resolveProviderCredentialVault = async (provider, principal) => {
    if (!provider?.ensure || !principal) throw new Error('provider_vault_principal_required');
    const record = await provider.ensure(principal);
    const keyPath = path.join(provider.root, '.provider-credentials.key');
    try { fs.writeFileSync(keyPath, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const secret = fs.readFileSync(keyPath, 'utf8').trim();
    if (secret.length !== 64) throw new Error('provider_vault_master_key_invalid');
    // `socialRoot`: the principal's own directory for sharing jobs and their
    // temporary variants — never shared between principals.
    return Object.assign(createProviderCredentialVault({ root: path.join(record.vaultRoot, 'credentials'), secret }),
        { socialRoot: path.join(record.vaultRoot, 'social'),
            secrets: createAccountSecretVault({ root: path.join(record.vaultRoot, 'secrets'), secret }) });
};
