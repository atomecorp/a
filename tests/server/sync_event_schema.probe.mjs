import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('event streams use stable sequences and property history links to canonical events', async () => {
    const databasePath = path.join(os.tmpdir(), `sync-event-schema-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = databasePath;
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?sync_event_schema=${nonce}`);
    const ownerId = 'sync_schema_owner';
    const projectId = 'sync_schema_project';
    const atomeId = 'sync_schema_shape';
    try {
        await db.initDatabase();
        await db.createAtome({
            id: ownerId, type: 'user', owner: ownerId, creator: ownerId,
            properties: { visibility: 'private' }
        });
        const events = await db.appendEvents([
            {
                id: 'sync_schema_event_b', ts: '2026-01-01T00:00:01.000Z', kind: 'set',
                atome_id: atomeId, project_id: projectId,
                actor: { type: 'user', id: ownerId }, source: 'device-a',
                payload: { props: { left: 20 } }
            },
            {
                id: 'sync_schema_event_a', ts: '2026-01-01T00:00:00.000Z', kind: 'set',
                atome_id: atomeId, project_id: projectId,
                actor: { type: 'user', id: ownerId }, source: 'device-a',
                payload: { props: { top: 10 } }
            }
        ]);
        assert.equal(events[0].stream_id, events[1].stream_id);
        assert.deepEqual(events.map((event) => event.sequence), [1, 2]);
        assert.equal(events[0].source, 'device-a');
        assert.equal(events.every((event) => event.projection?.atome_id === atomeId), true);

        const independent = await db.appendEvent({
            id: 'sync_schema_global', ts: 'invalid', kind: 'set', atome_id: ownerId,
            scope: 'global', actor: { type: 'user', id: ownerId }, payload: { props: { nickname: 'QA' } }
        });
        assert.notEqual(independent.stream_id, events[0].stream_id);
        assert.equal(independent.sequence, 1);

        const rows = await db.default.query(
            'all',
            'SELECT id, stream_id, sequence, source, projection FROM events ORDER BY stream_id, sequence'
        );
        assert.equal(rows.every((row) => row.stream_id && Number.isInteger(row.sequence)), true);
        assert.equal(rows.every((row) => row.projection), true);
        const versions = await db.default.query(
            'all',
            'SELECT particle_key, event_id FROM particles_versions WHERE atome_id = ? AND event_id IS NOT NULL',
            [atomeId]
        );
        assert.deepEqual(
            versions.map((row) => row.event_id).sort(),
            ['sync_schema_event_a', 'sync_schema_event_b']
        );
        const rebuilt = await db.rebuildStateCurrentFromEvents({ atomeId });
        assert.equal(rebuilt.ok, true);
        assert.deepEqual((await db.getStateCurrent(atomeId)).properties, { top: 10, left: 20 });

        for (const table of ['sync_streams', 'sync_stream_sequences', 'event_property_winners', 'manual_share_cursors']) {
            const found = await db.default.query(
                'get',
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
                [table]
            );
            assert.equal(found?.name, table);
        }
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(databasePath); } catch (_) { }
        delete process.env.SQLITE_PATH;
    }
});
