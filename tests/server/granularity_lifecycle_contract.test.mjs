import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('canonical events delete properties and reject stale expected versions atomically', async () => {
    const dbPath = path.join(os.tmpdir(), `granularity-lifecycle-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    process.env.SQUIRREL_SYNC_REMOTE = '0';
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?granularity_lifecycle=${nonce}`);
    const commits = await import(`../../server/atomeRoutes.orm.js?granularity_lifecycle=${nonce}`);
    const operations = await import(`../../server/wsAtomeOperations.js?granularity_lifecycle=${nonce}`);
    const ownerId = 'gv_lifecycle_owner';
    const atomeId = 'gv_lifecycle_shape';

    try {
        await db.initDatabase();
        await db.createAtome({ id: ownerId, type: 'user', owner: ownerId, creator: ownerId, properties: { name: ownerId } });
        await db.createAtome({
            id: atomeId,
            type: 'shape',
            owner: ownerId,
            creator: ownerId,
            properties: { left: 10, color: 'blue' }
        });
        const colorRow = await db.default.query(
            'get',
            'SELECT version FROM particles WHERE atome_id = ? AND particle_key = ?',
            [atomeId, 'color']
        );
        const deleted = await commits.commitAtomeEvent({
            authenticatedUserId: ownerId,
            event: {
                id: 'gv_delete_color',
                kind: 'set',
                tx_id: 'gv_delete_color_tx',
                atome_id: atomeId,
                payload: {
                    props: {},
                    delete_keys: ['color'],
                    expected_versions: { color: colorRow.version }
                }
            }
        });
        assert.equal(deleted.ok, true);
        assert.equal(Object.hasOwn((await db.getStateCurrent(atomeId)).properties, 'color'), false);
        assert.equal(await db.getParticle(atomeId, 'color'), null);
        const deleteHistory = await db.getParticleHistory(atomeId, 'color');
        assert.equal(deleteHistory[0].old_value, JSON.stringify('blue'));
        assert.equal(deleteHistory[0].new_value, null);

        const connection = { _wsApiUserId: ownerId };
        const restoreDeleted = await operations.handleWsAtomeOperation({
            type: 'history', action: 'undo', requestId: 'gv_restore_color',
            source_tx_id: 'gv_delete_color_tx'
        }, connection);
        assert.equal(restoreDeleted.success, true);
        assert.equal(await db.getParticle(atomeId, 'color'), 'blue');
        const deleteAgain = await operations.handleWsAtomeOperation({
            type: 'history', action: 'redo', requestId: 'gv_delete_color_again',
            source_tx_id: 'gv_delete_color_tx'
        }, connection);
        assert.equal(deleteAgain.success, true);
        assert.equal(await db.getParticle(atomeId, 'color'), null);

        const leftBefore = await db.getParticle(atomeId, 'left');
        const stale = await commits.commitAtomeEvent({
            authenticatedUserId: ownerId,
            event: {
                id: 'gv_stale_left',
                kind: 'set',
                atome_id: atomeId,
                payload: { props: { left: 99 }, expected_versions: { left: 0 } }
            }
        });
        assert.deepEqual(stale, { ok: false, error: 'property_version_conflict' });
        assert.equal(await db.getParticle(atomeId, 'left'), leftBefore);
        assert.equal(await db.getEvent('gv_stale_left'), null);

        const versionRows = await db.default.query(
            'all',
            'SELECT particle_key, version FROM particles WHERE atome_id = ?',
            [atomeId]
        );
        const versions = Object.fromEntries(versionRows.map((row) => [row.particle_key, row.version]));
        const source = await commits.commitAtomeEvent({
            authenticatedUserId: ownerId,
            event: {
                id: 'gv_grouped_edit',
                kind: 'set',
                tx_id: 'gv_grouped_edit_tx',
                atome_id: atomeId,
                payload: {
                    props: { left: 20, color: 'green' },
                    expected_versions: { left: versions.left, color: versions.color }
                }
            }
        });
        assert.equal(source.ok, true);
        await commits.commitAtomeEvent({
            authenticatedUserId: ownerId,
            event: {
                id: 'gv_independent_top', kind: 'set', atome_id: atomeId,
                payload: { props: { top: 33 }, expected_versions: { top: 0 } }
            }
        });
        const undo = await operations.handleWsAtomeOperation({
            type: 'history', action: 'undo', requestId: 'gv_grouped_undo',
            source_tx_id: 'gv_grouped_edit_tx'
        }, connection);
        assert.equal(undo.success, true);
        assert.deepEqual((await db.getStateCurrent(atomeId)).properties, { left: 10, top: 33 });

        const redoRequest = {
            type: 'history', action: 'redo', requestId: 'gv_grouped_redo',
            source_tx_id: 'gv_grouped_edit_tx'
        };
        const redo = await operations.handleWsAtomeOperation(redoRequest, connection);
        assert.equal(redo.success, true);
        assert.deepEqual((await db.getStateCurrent(atomeId)).properties, {
            left: 20, color: 'green', top: 33
        });
        const versionAfterRedo = (await db.default.query(
            'get',
            'SELECT version FROM particles WHERE atome_id = ? AND particle_key = ?',
            [atomeId, 'left']
        )).version;
        assert.deepEqual(await operations.handleWsAtomeOperation(redoRequest, connection), redo);
        assert.equal((await db.default.query(
            'get',
            'SELECT version FROM particles WHERE atome_id = ? AND particle_key = ?',
            [atomeId, 'left']
        )).version, versionAfterRedo);

        const leftVersion = (await db.default.query(
            'get',
            'SELECT version FROM particles WHERE atome_id = ? AND particle_key = ?',
            [atomeId, 'left']
        )).version;
        const sameKeyBatch = await commits.commitAtomeEvents({
            authenticatedUserId: ownerId,
            txId: 'gv_same_key_tx',
            events: [
                {
                    id: 'gv_same_key_noop', kind: 'set', atome_id: atomeId,
                    payload: { props: { left: 20 }, expected_versions: { left: leftVersion } }
                },
                {
                    id: 'gv_same_key_change', kind: 'set', atome_id: atomeId,
                    payload: { props: { left: 25 }, expected_versions: { left: leftVersion } }
                }
            ]
        });
        assert.equal(sameKeyBatch.ok, true);
        assert.equal(await db.getParticle(atomeId, 'left'), 25);
        const sameKeyUndo = await operations.handleWsAtomeOperation({
            type: 'history', action: 'undo', requestId: 'gv_same_key_undo',
            source_tx_id: 'gv_same_key_tx'
        }, connection);
        assert.equal(sameKeyUndo.success, true);
        assert.equal(await db.getParticle(atomeId, 'left'), 20);
        const sameKeyRedo = await operations.handleWsAtomeOperation({
            type: 'history', action: 'redo', requestId: 'gv_same_key_redo',
            source_tx_id: 'gv_same_key_tx'
        }, connection);
        assert.equal(sameKeyRedo.success, true);
        assert.equal(await db.getParticle(atomeId, 'left'), 25);

        const deletedAtome = await commits.commitAtomeEvent({
            authenticatedUserId: ownerId,
            event: {
                id: 'gv_delete_shape',
                kind: 'delete',
                tx_id: 'gv_delete_shape_tx',
                atome_id: atomeId,
                payload: null
            }
        });
        assert.equal(deletedAtome.ok, true);
        assert.equal(await db.getAtome(atomeId), null);
        const restoreAtome = await operations.handleWsAtomeOperation({
            type: 'history', action: 'undo', requestId: 'gv_restore_shape',
            source_tx_id: 'gv_delete_shape_tx'
        }, connection);
        assert.equal(restoreAtome.success, true);
        assert.equal((await db.getAtome(atomeId)).properties.left, 25);
        const deleteAtomeAgain = await operations.handleWsAtomeOperation({
            type: 'history', action: 'redo', requestId: 'gv_delete_shape_again',
            source_tx_id: 'gv_delete_shape_tx'
        }, connection);
        assert.equal(deleteAtomeAgain.success, true);
        assert.equal(await db.getAtome(atomeId), null);
        const restoreAtomeAgain = await operations.handleWsAtomeOperation({
            type: 'history', action: 'undo', requestId: 'gv_restore_shape_again',
            source_tx_id: 'gv_delete_shape_tx'
        }, connection);
        assert.equal(restoreAtomeAgain.success, true);
        assert.equal((await db.getAtome(atomeId)).properties.left, 25);

        const stateBeforeReplay = await db.getStateCurrent(atomeId);
        const replayed = await db.rebuildStateCurrentFromEvents({ atomeId });
        assert.equal(replayed.ok, true);
        assert.deepEqual((await db.getStateCurrent(atomeId)).properties, stateBeforeReplay.properties);
    } finally {
        await db.closeDatabase().catch(() => {});
        delete process.env.SQLITE_PATH;
        delete process.env.SQUIRREL_SYNC_REMOTE;
        try {
            fs.unlinkSync(dbPath);
        } catch {
            // The database adapter can already have removed the temporary file.
        }
    }
});
