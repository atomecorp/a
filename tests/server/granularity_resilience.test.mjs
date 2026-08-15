import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('commit rollback, idempotence, ordering and revision conflicts remain atomic', async () => {
    const dbPath = path.join(os.tmpdir(), `granularity-resilience-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    process.env.SQUIRREL_SYNC_REMOTE = '1';
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?granularity_resilience=${nonce}`);
    const commits = await import(`../../server/atomeRoutes.orm.js?granularity_resilience=${nonce}`);
    const operations = await import(`../../server/wsAtomeOperations.js?granularity_resilience=${nonce}`);
    const ownerId = 'gv_resilience_owner';
    const atomeId = 'gv_resilience_shape';

    const particleVersion = async (key) => Number((await db.default.query(
        'get', 'SELECT version FROM particles WHERE atome_id = ? AND particle_key = ?', [atomeId, key]
    ))?.version || 0);
    const count = async (table, where = '', params = []) => Number((await db.default.query(
        'get', `SELECT COUNT(*) AS total FROM ${table} ${where}`, params
    )).total);

    try {
        await db.initDatabase();
        await db.createAtome({ id: ownerId, type: 'user', owner: ownerId, creator: ownerId, properties: { name: ownerId } });
        await db.createAtome({
            id: atomeId, type: 'shape', owner: ownerId, creator: ownerId,
            properties: { left: 10, top: 20 }
        });
        const baselineState = await db.getStateCurrent(atomeId);
        const baselineLeftVersion = await particleVersion('left');
        const baselineHistory = await count('particles_versions', 'WHERE atome_id = ?', [atomeId]);

        await db.default.query('run', `CREATE TRIGGER gv_fail_sync_queue
            BEFORE INSERT ON sync_queue BEGIN SELECT RAISE(ABORT, 'gv_injected_queue_failure'); END`);
        await assert.rejects(db.appendEvent(
            {
                id: 'gv_injected_failure', kind: 'set', atome_id: atomeId,
                payload: { props: { left: 11 }, expected_versions: { left: baselineLeftVersion } }
            },
            { syncTarget: 'fastify' }
        ), /gv_injected_queue_failure/);
        assert.equal(await db.getEvent('gv_injected_failure'), null);
        assert.equal(await db.getParticle(atomeId, 'left'), 10);
        assert.equal(await particleVersion('left'), baselineLeftVersion);
        assert.equal(await count('particles_versions', 'WHERE atome_id = ?', [atomeId]), baselineHistory);
        assert.deepEqual((await db.getStateCurrent(atomeId)).properties, baselineState.properties);
        assert.equal(await count('sync_queue'), 0);
        await db.default.query('run', 'DROP TRIGGER gv_fail_sync_queue');

        const message = {
            type: 'events', action: 'commit', requestId: 'gv_cross_connection_retry',
            event: {
                id: 'gv_idempotent_event', kind: 'set', atome_id: atomeId,
                payload: { props: { left: 11 }, expected_versions: { left: baselineLeftVersion } }
            }
        };
        const first = await operations.handleWsAtomeOperation(message, { _wsApiUserId: ownerId });
        assert.equal(first.success, true, JSON.stringify(first));
        const afterFirst = {
            version: await particleVersion('left'),
            history: await count('particles_versions', 'WHERE atome_id = ? AND particle_key = ?', [atomeId, 'left']),
            queue: await count('sync_queue'),
            events: await count('events', 'WHERE id = ?', ['gv_idempotent_event'])
        };
        const duplicate = await operations.handleWsAtomeOperation(message, { _wsApiUserId: ownerId });
        assert.equal(duplicate.success, true);
        assert.deepEqual({
            version: await particleVersion('left'),
            history: await count('particles_versions', 'WHERE atome_id = ? AND particle_key = ?', [atomeId, 'left']),
            queue: await count('sync_queue'),
            events: await count('events', 'WHERE id = ?', ['gv_idempotent_event'])
        }, afterFirst);
        const conflictingRetry = await commits.commitAtomeEvent({
            authenticatedUserId: ownerId,
            event: {
                id: 'gv_idempotent_event', kind: 'set', atome_id: atomeId,
                payload: { props: { left: 999 }, expected_versions: { left: afterFirst.version } }
            }
        });
        assert.deepEqual(conflictingRetry, { ok: false, error: 'event_id_conflict' });
        assert.equal(await db.getParticle(atomeId, 'left'), 11);

        const leftVersion = await particleVersion('left');
        const topVersion = await particleVersion('top');
        const independent = await commits.commitAtomeEvents({
            authenticatedUserId: ownerId,
            txId: 'gv_independent_properties',
            events: [
                { id: 'gv_left_12', kind: 'set', atome_id: atomeId, payload: { props: { left: 12 }, expected_versions: { left: leftVersion } } },
                { id: 'gv_top_21', kind: 'set', atome_id: atomeId, payload: { props: { top: 21 }, expected_versions: { top: topVersion } } }
            ]
        });
        assert.equal(independent.ok, true);
        assert.deepEqual((await db.getStateCurrent(atomeId)).properties, { left: 12, top: 21 });

        const delayed = await commits.commitAtomeEvent({
            authenticatedUserId: ownerId,
            event: {
                id: 'gv_delayed_left', kind: 'set', atome_id: atomeId,
                payload: { props: { left: 99 }, expected_versions: { left: leftVersion } }
            }
        });
        assert.deepEqual(delayed, { ok: false, error: 'property_version_conflict' });
        assert.equal(await db.getParticle(atomeId, 'left'), 12);

        const beforeBatchLeft = await particleVersion('left');
        const rollbackBatch = await commits.commitAtomeEvents({
            authenticatedUserId: ownerId,
            txId: 'gv_batch_rollback',
            events: [
                { id: 'gv_batch_first', kind: 'set', atome_id: atomeId, payload: { props: { left: 13 }, expected_versions: { left: beforeBatchLeft } } },
                { id: 'gv_batch_stale', kind: 'set', atome_id: atomeId, payload: { props: { left: 14 }, expected_versions: { left: beforeBatchLeft } } }
            ]
        });
        assert.deepEqual(rollbackBatch, { ok: false, error: 'property_version_conflict' });
        assert.equal(await db.getParticle(atomeId, 'left'), 12);
        assert.equal(await db.getEvent('gv_batch_first'), null);
        assert.equal(await db.getEvent('gv_batch_stale'), null);

        await db.enqueueSyncOperation({
            atome_id: atomeId,
            operation: 'events:commit',
            payload: { id: 'gv_offline_retry' },
            target_server: 'fastify'
        });
        const queue = await db.listSyncQueue({ target_server: 'fastify', limit: 100 });
        assert.deepEqual(queue.map((entry) => entry.queue_id), [...queue].map((entry) => entry.queue_id).sort((a, b) => a - b));
        const retryEntry = queue[0];
        await db.markSyncQueueError(retryEntry.queue_id, 1, 'offline', '2999-01-01T00:00:00.000Z');
        assert.equal((await db.listSyncQueue({ target_server: 'fastify', limit: 100 }))
            .some((entry) => entry.queue_id === retryEntry.queue_id), false);
        await db.markSyncQueueError(retryEntry.queue_id, 2, 'offline', '2000-01-01T00:00:00.000Z');
        assert.equal((await db.listSyncQueue({ target_server: 'fastify', limit: 100 }))[0].queue_id, retryEntry.queue_id);
        await db.markSyncQueueDone(retryEntry.queue_id);
        assert.equal(await count('sync_queue', 'WHERE queue_id = ?', [retryEntry.queue_id]), 0);
    } finally {
        await db.closeDatabase().catch(() => {});
        delete process.env.SQLITE_PATH;
        delete process.env.SQUIRREL_SYNC_REMOTE;
        try { fs.unlinkSync(dbPath); } catch { /* Database cleanup can already have removed it. */ }
    }
});
