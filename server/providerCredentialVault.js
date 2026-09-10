import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { createEncryptedTokenVault } from '../atome/src/squirrel/security/token_vault.js';

// Server-only storage adapter for the existing encrypted token vault. Credentials
// never enter Atome events, user exports, sync or a browser-readable read route.
export const createProviderCredentialVault = ({ root, secret } = {}) => {
    if (!root || !secret) throw new Error('provider_vault_configuration_required');
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const filename = (key) => path.join(root, `${createHash('sha256').update(key).digest('hex')}.json`);
    const storage = {
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
        removeItem(key) { fs.rmSync(filename(key), { force: true }); }
    };
    const vault = createEncryptedTokenVault({ storage, secret });
    return {
        async store(provider, value) {
            if (provider !== 'openai') throw new Error('provider_not_supported');
            const key = String(value || '').trim();
            if (!key || key.length > 1024 || /\s/.test(key)) throw new Error('provider_key_invalid');
            await vault.store(provider, { key });
            return { configured: true };
        },
        async read(provider) {
            if (provider !== 'openai') throw new Error('provider_not_supported');
            const result = await vault.read(provider);
            return result.ok ? result.value.key : null;
        },
        remove(provider) {
            if (provider !== 'openai') throw new Error('provider_not_supported');
            vault.remove(provider);
            return { configured: false };
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
    return createProviderCredentialVault({ root: path.join(record.vaultRoot, 'credentials'), secret });
};
