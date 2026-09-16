import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
    process.env.SQLITE_PATH = path.join(root, 'directory.db');
    const db = await import('../../database/adole.js');
    const { UserVaultRouter } = await import('../../server/userVaultRouter.js');
    const { handleWsAtomeOperation } = await import('../../server/wsAtomeOperations.js');
    const router = new UserVaultRouter({ provider });
    try {
        await db.initDatabase();
        for (const id of [alice, bob]) await db.createAtome({ id, type: 'user', owner: id, creator: id, properties: { name: id } });
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
        for (const [kind, left] of [['gesture_start', 12], ['gesture_frame', 24], ['gesture_end', 24]]) {
            await provider.request(alice, 'event:commit', { event: {
                id: `curve_${kind}`, kind, atome_id: 'vault_alice_shape', tx_id: 'curve', gesture_id: 'curve_drag',
                actor: { type: 'user', id: alice }, payload: { props: { left } }
            } });
        }
        const journal = await provider.request(alice, 'events:list', { atomeId: 'vault_alice_shape' });
        assert.equal(journal.filter(event => event.tx_id === 'curve').length, 3);
        await router.registerAtome('vault_alice_shape', alice);
        const connection = { _wsApiUserId: alice, _wsApiVaultRouter: router };
        const listed = await handleWsAtomeOperation({ type: 'events', action: 'list', atome_id: 'vault_alice_shape', requestId: 'list_curve' }, connection);
        assert.equal(listed.events.filter(event => event.tx_id === 'curve').length, 3);
        const undo = await handleWsAtomeOperation({ type: 'history', action: 'undo', source_tx_id: 'curve', requestId: 'undo_curve' }, connection);
        assert.equal(undo.ok, true, JSON.stringify(undo));
        assert.equal((await provider.request(alice, 'state:get', { atome_id: 'vault_alice_shape' })).properties.left, 12);
        const redo = await handleWsAtomeOperation({ type: 'history', action: 'redo', source_tx_id: 'curve', requestId: 'redo_curve' }, connection);
        assert.equal(redo.ok, true, JSON.stringify(redo));
        assert.equal((await provider.request(alice, 'state:get', { atome_id: 'vault_alice_shape' })).properties.left, 24);
        for (const id of ['partial_a', 'partial_b']) {
            await provider.request(alice, 'event:commit', { event: {
                id: `partial_init_${id}`, kind: 'set', atome_id: id,
                actor: { type: 'user', id: alice }, payload: { props: { left: 0 } }
            } });
        }
        await provider.request(alice, 'event:commit-batch', { tx_id: 'partial_move', events: ['partial_a', 'partial_b'].map((id) => ({
            id: `partial_move_${id}`, kind: 'set', atome_id: id, tx_id: 'partial_move',
            actor: { type: 'user', id: alice }, payload: { props: { left: 40 } }
        })) });
        const undoPartial = await handleWsAtomeOperation({ type: 'history', action: 'undo', source_tx_id: 'partial_move',
            atome_ids: ['partial_a'], requestId: 'undo_partial_a' }, connection);
        assert.equal(undoPartial.ok, true, JSON.stringify(undoPartial));
        assert.equal((await provider.request(alice, 'state:get', { atome_id: 'partial_a' })).properties.left, 0);
        assert.equal((await provider.request(alice, 'state:get', { atome_id: 'partial_b' })).properties.left, 40);
        const redoPartial = await handleWsAtomeOperation({ type: 'history', action: 'redo', source_tx_id: 'partial_move',
            atome_ids: ['partial_a'], requestId: 'redo_partial_a' }, connection);
        assert.equal(redoPartial.ok, true, JSON.stringify(redoPartial));
        assert.equal((await provider.request(alice, 'state:get', { atome_id: 'partial_a' })).properties.left, 40);
        assert.equal((await provider.request(alice, 'state:get', { atome_id: 'partial_b' })).properties.left, 40);
        const denied = await handleWsAtomeOperation({ type: 'history', action: 'undo', source_tx_id: 'curve', requestId: 'foreign_curve' },
            { _wsApiUserId: bob, _wsApiVaultRouter: router });
        assert.equal(denied.ok, false);
        assert.equal((await provider.request(alice, 'state:get', { atome_id: 'vault_alice_shape' })).properties.left, 24);
        for (const [id, parent] of [['history_project', null], ['history_child_a', 'history_project'], ['history_child_b', 'history_project']]) {
            await provider.request(alice, 'event:commit', { event: { kind: 'set', atome_id: id,
                actor: { type: 'user', id: alice }, payload: { props: { kind: 'group', ...(parent ? { parent_id: parent } : {}), left: 0 } } } });
        }
        for (const [id, props] of [['history_molecule', { kind: 'group', parent_id: 'history_project', molecule_entity: 'molecule' }],
            ['history_child_a', { parent_id: 'history_molecule', hierarchy_order: 0 }], ['history_child_b', { parent_id: 'history_molecule', hierarchy_order: 1 }]]) {
            await provider.request(alice, 'event:commit', { event: { kind: 'set', atome_id: id, tx_id: 'wrap',
                actor: { type: 'user', id: alice }, payload: { props } } });
        }
        const undoWrap = await handleWsAtomeOperation({ type: 'history', action: 'undo', source_tx_id: 'wrap', requestId: 'undo_wrap' }, connection);
        assert.equal(undoWrap.ok, true, JSON.stringify(undoWrap));
        for (const id of ['history_child_a', 'history_child_b']) {
            assert.equal((await provider.request(alice, 'state:get', { atome_id: id })).meta.parent_id, 'history_project');
        }
        assert.equal((await provider.request(alice, 'state:get', { atome_id: 'history_molecule' })).properties.__deleted, true);
        const redoWrap = await handleWsAtomeOperation({ type: 'history', action: 'redo', source_tx_id: 'wrap', requestId: 'redo_wrap' }, connection);
        assert.equal(redoWrap.ok, true, JSON.stringify(redoWrap));
        for (const id of ['history_child_a', 'history_child_b']) {
            assert.equal((await provider.request(alice, 'state:get', { atome_id: id })).meta.parent_id, 'history_molecule');
        }
        assert.equal((await provider.request(alice, 'state:get', { atome_id: 'history_molecule' })).properties.__deleted, false);
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
        await db.closeDatabase();
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(socketRoot, { recursive: true, force: true });
    }
});

test('vault worker exits when its owning server IPC channel disappears', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atome-vault-disconnect-'));
    const socketRoot = path.join('/tmp', `atome-vault-disconnect-${process.pid}-${Date.now()}`);
    const providerUrl = new URL('../../server/userVaultProvider.js', import.meta.url).href;
    const parentSource = `
        const { createUserVaultProvider } = await import(${JSON.stringify(providerUrl)});
        const provider = createUserVaultProvider({
            root: ${JSON.stringify(path.join(root, 'vaults'))},
            socketRoot: ${JSON.stringify(socketRoot)}
        });
        const health = await provider.request('disconnect-fixture', 'health');
        process.stdout.write(JSON.stringify({ pid: health.pid }) + '\\n');
        setInterval(() => {}, 1000);
    `;
    const parent = spawn(process.execPath, ['--input-type=module', '--eval', parentSource], {
        cwd: path.resolve(new URL('../..', import.meta.url).pathname),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let workerPid = 0;
    try {
        const line = await new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            const timer = setTimeout(() => reject(new Error(`vault_parent_fixture_timeout:${stderr}`)), 10_000);
            parent.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
            parent.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
                const newline = stdout.indexOf('\n');
                if (newline < 0) return;
                clearTimeout(timer);
                resolve(stdout.slice(0, newline));
            });
            parent.once('error', (error) => { clearTimeout(timer); reject(error); });
            parent.once('exit', (code) => {
                if (!stdout.includes('\n')) {
                    clearTimeout(timer);
                    reject(new Error(`vault_parent_fixture_exit_${code}:${stderr}`));
                }
            });
        });
        workerPid = Number(JSON.parse(line).pid);
        assert.ok(workerPid > 0);
        parent.kill('SIGKILL');
        await new Promise((resolve) => parent.once('exit', resolve));
        const exited = await new Promise((resolve) => {
            const startedAt = Date.now();
            const poll = () => {
                try { process.kill(workerPid, 0); } catch (_) { resolve(true); return; }
                if (Date.now() - startedAt > 5000) { resolve(false); return; }
                setTimeout(poll, 50);
            };
            poll();
        });
        assert.equal(exited, true, 'the vault worker must not survive its owning server');
    } finally {
        if (parent.exitCode == null && parent.signalCode == null) parent.kill('SIGKILL');
        if (workerPid > 0) {
            try { process.kill(workerPid, 'SIGKILL'); } catch (_) { /* already stopped */ }
        }
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(socketRoot, { recursive: true, force: true });
    }
});
