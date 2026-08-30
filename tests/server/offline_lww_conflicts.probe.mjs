import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('offline LWW converges per property while preserving every event', async () => {
    const databasePath = path.join(os.tmpdir(), `offline-lww-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = databasePath;
    const db = await import(`../../database/adole.js?offline_lww=${Date.now()}`);
    const actor = { type: 'user', id: 'offline_lww_owner' };
    const atomeId = 'offline_lww_shape';
    const offline = { conflictMode: 'offline-lww', source: 'offline-device' };
    const commit = (event) => db.appendEvent({ kind: 'set', atome_id: atomeId, actor, ...event }, offline);
    try {
        await db.initDatabase();
        await db.createAtome({
            id: actor.id, type: 'user', owner: actor.id, creator: actor.id,
            properties: { visibility: 'private' }
        });

        await commit({
            id: 'evt_newer', ts: '2026-01-02T00:00:00.000Z',
            payload: { props: { left: 20, color: 'red' } }
        });
        const older = await commit({
            id: 'evt_older', ts: '2026-01-01T00:00:00.000Z',
            payload: { props: { left: 10, top: 5 } }
        });
        assert.equal(older.lww_decisions.left.winner, false);
        assert.equal(older.lww_decisions.top.winner, true);
        assert.deepEqual((await db.getStateCurrent(atomeId)).properties, {
            left: 20, color: 'red', top: 5
        });

        await commit({
            id: 'evt_equal_z', ts: '2026-01-03T00:00:00.000Z',
            payload: { props: { color: 'blue' } }
        });
        const equalLower = await commit({
            id: 'evt_equal_a', ts: '2026-01-03T00:00:00.000Z',
            payload: { props: { color: 'green' } }
        });
        assert.equal(equalLower.lww_decisions.color.winner, false);
        assert.equal((await db.getStateCurrent(atomeId)).properties.color, 'blue');

        const invalid = await commit({
            id: 'evt_invalid_z', ts: 'not-a-date', payload: { props: { left: 999 } }
        });
        assert.equal(invalid.lww_decisions.left.winner, false);
        assert.equal(invalid.lww_decisions.left.reason, 'invalid_timestamp_below_valid');
        assert.equal((await db.getStateCurrent(atomeId)).properties.left, 20);

        const invalidAtome = 'offline_invalid_shape';
        const invalidCommit = (id, value) => db.appendEvent({
            id, ts: 'invalid', kind: 'set', atome_id: invalidAtome, actor,
            payload: { props: { opacity: value } }
        }, offline);
        await invalidCommit('invalid_z', 0.9);
        const invalidLower = await invalidCommit('invalid_a', 0.1);
        assert.equal(invalidLower.lww_decisions.opacity.winner, false);
        assert.equal((await db.getStateCurrent(invalidAtome)).properties.opacity, 0.9);

        const duplicate = await commit({
            id: 'evt_newer', ts: '2026-01-02T00:00:00.000Z',
            payload: { props: { left: 20, color: 'red' } }
        });
        assert.equal(duplicate.inserted, false);
        assert.equal(await db.default.query('get', 'SELECT COUNT(*) AS total FROM events WHERE id = ?', ['evt_newer']).then((row) => row.total), 1);

        const totalEvents = await db.default.query(
            'get',
            'SELECT COUNT(*) AS total FROM events WHERE atome_id = ?',
            [atomeId]
        );
        assert.equal(totalEvents.total, 5);
        const decisions = await db.default.query(
            'all',
            'SELECT id, lww_decisions FROM events WHERE atome_id = ? ORDER BY id',
            [atomeId]
        );
        assert.equal(decisions.every((row) => row.lww_decisions), true);

        const lifecycleId = 'offline_lifecycle_shape';
        await db.appendEvent({
            id: 'lifecycle_create', ts: '2026-01-01T00:00:00.000Z', kind: 'set',
            atome_id: lifecycleId, actor, payload: { props: { left: 1 } }
        });
        await db.appendEvent({
            id: 'lifecycle_delete', ts: '2026-01-04T00:00:00.000Z', kind: 'delete',
            atome_id: lifecycleId, actor
        }, offline);
        const losingRestore = await db.appendEvent({
            id: 'lifecycle_restore_old', ts: '2026-01-03T00:00:00.000Z', kind: 'restore',
            atome_id: lifecycleId, actor, payload: { props: { left: 1 } }
        }, offline);
        assert.equal(losingRestore.lww_decisions.__lifecycle__.winner, false);
        assert.ok((await db.default.query('get', 'SELECT deleted_at FROM atomes WHERE atome_id = ?', [lifecycleId])).deleted_at);
        const restored = await db.appendEvent({
            id: 'lifecycle_restore_correction', kind: 'restore', atome_id: lifecycleId,
            actor, payload: { props: { left: 1 } }
        });
        assert.equal(restored.lww_decisions.__lifecycle__.reason, 'interactive_commit');
        assert.equal((await db.default.query('get', 'SELECT deleted_at FROM atomes WHERE atome_id = ?', [lifecycleId])).deleted_at, null);

        const leftVersion = await db.default.query(
            'get',
            "SELECT version FROM particles WHERE atome_id = ? AND particle_key = 'left'",
            [atomeId]
        );
        await assert.rejects(
            db.appendEvent({
                id: 'interactive_stale', kind: 'set', atome_id: atomeId, actor,
                payload: { props: { left: 40 }, expected_versions: { left: leftVersion.version - 1 } }
            }),
            /property_version_conflict/
        );
        const correction = await db.appendEvent({
            id: 'interactive_correction', kind: 'set', atome_id: atomeId, actor,
            payload: { props: { left: 40 }, expected_versions: { left: leftVersion.version } }
        });
        assert.equal(correction.lww_decisions.left.reason, 'interactive_commit');
        assert.equal((await db.getStateCurrent(atomeId)).properties.left, 40);
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(databasePath); } catch (_) { }
        delete process.env.SQLITE_PATH;
    }
});
