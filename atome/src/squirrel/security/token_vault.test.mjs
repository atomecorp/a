import assert from 'node:assert/strict';

import { createEncryptedTokenVault } from './token_vault.js';

const createStorage = () => {
    const map = new Map();
    return {
        getItem(key) {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            map.set(String(key), String(value));
        },
        removeItem(key) {
            map.delete(String(key));
        },
        key(index) {
            return Array.from(map.keys())[Number(index)] || null;
        },
        get length() {
            return map.size;
        }
    };
};

const storage = createStorage();
const vault = createEncryptedTokenVault({
    storage
});

assert.equal(vault.hasSecret(), false, 'token vault should start without a configured secret');
assert.equal(vault.setSecret('vault-secret').configured, true, 'token vault should accept an in-memory secret');

const stored = await vault.store('icloud_mail_primary', {
    username: 'user@icloud.test',
    app_password: 'app-password'
}, {
    provider: 'icloud_imap_smtp'
});
assert.equal(stored.ok, true, 'token vault should store encrypted credentials');
assert.match(storage.getItem('squirrel.token_vault.icloud_mail_primary') || '', /cipher_text/, 'token vault should persist ciphertext, not plain JSON credentials');
assert.equal((storage.getItem('squirrel.token_vault.icloud_mail_primary') || '').includes('app-password'), false, 'token vault should not persist the secret in clear text');

const listed = vault.list();
assert.equal(listed.items[0]?.entry_id, 'icloud_mail_primary', 'token vault should list stored entries');

const read = await vault.read('icloud_mail_primary');
assert.equal(read.ok, true, 'token vault should decrypt a stored entry');
assert.equal(read.value?.app_password, 'app-password', 'token vault should round-trip the stored payload');

vault.remove('icloud_mail_primary');
assert.equal(vault.list().items.length, 0, 'token vault should remove entries');

console.log('token_vault: ok');
