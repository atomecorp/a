import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createUserVaultProvider } from '../../server/userVaultProvider.js';

test('one principal owns one isolated vault process, SQLite database, file root and Unix socket', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atome-vault-provider-'));
    const socketRoot = path.join('/tmp', `atome-vault-provider-${process.pid}-${Date.now()}`);
    const provider = createUserVaultProvider({
        root: path.join(root, 'vaults'),
        socketRoot
    });
    const alice = 'vault_alice';
    const bob = 'vault_bob';
    try {
        const [aliceHealth, bobHealth] = await Promise.all([
            provider.request(alice, 'health'),
            provider.request(bob, 'health')
        ]);
        assert.notEqual(aliceHealth.pid, bobHealth.pid);
        assert.notEqual(aliceHealth.databasePath, bobHealth.databasePath);
        assert.notEqual(aliceHealth.fileRoot, bobHealth.fileRoot);
        assert.notEqual(aliceHealth.socketPath, bobHealth.socketPath);
        assert.equal(fs.statSync(aliceHealth.socketPath).mode & 0o777, 0o600);
        assert.equal(fs.statSync(aliceHealth.fileRoot).mode & 0o777, 0o700);

        const committed = await provider.request(alice, 'event:commit', {
            source: 'alice-device',
            event: {
                id: 'vault_alice_event', kind: 'set', atome_id: 'vault_alice_shape',
                actor: { type: 'user', id: alice }, payload: { props: { left: 12 } }
            }
        });
        assert.equal(committed.id, 'vault_alice_event');
        assert.equal(committed.sequence, 1);
        assert.equal(committed.inserted, true);
        assert.equal((await provider.request(alice, 'state:get', { atome_id: 'vault_alice_shape' })).properties.left, 12);
        assert.equal(await provider.request(bob, 'state:get', { atome_id: 'vault_alice_shape' }), null);
        await assert.rejects(
            provider.request(alice, 'event:commit', {
                event: {
                    id: 'vault_actor_mismatch', kind: 'set', atome_id: 'vault_alice_shape',
                    actor: { type: 'user', id: bob }, payload: { props: { left: 99 } }
                }
            }),
            /vault_actor_mismatch/
        );
    } finally {
        await provider.stopAll();
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(socketRoot, { recursive: true, force: true });
    }
});
