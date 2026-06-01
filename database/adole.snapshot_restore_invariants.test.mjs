import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('ADOLE state snapshot restore replays through events and sanitized projection', async () => {
    const dbPath = path.join(os.tmpdir(), `adole-snapshot-restore-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`./adole.js?snapshot_restore=${Date.now()}`);

    try {
        await db.initDatabase();
        await db.createAtome({
            id: 'project_snapshot',
            type: 'project',
            owner: 'user_snapshot',
            creator: 'user_snapshot',
            properties: {
                name: 'Snapshot Project'
            }
        });
        await db.appendEvent({
            id: 'evt_snapshot_initial',
            kind: 'set',
            atome_id: 'shape_snapshot',
            project_id: 'project_snapshot',
            actor: { id: 'user_snapshot' },
            payload: {
                props: {
                    left: '10px',
                    top: '20px',
                    owner_id: 'must_not_project'
                }
            }
        });
        const snapshotId = await db.createStateSnapshot({
            projectId: 'project_snapshot',
            label: 'restore point',
            actor: { id: 'user_snapshot' }
        });
        await db.appendEvent({
            id: 'evt_snapshot_mutation',
            kind: 'set',
            atome_id: 'shape_snapshot',
            project_id: 'project_snapshot',
            actor: { id: 'user_snapshot' },
            payload: {
                props: {
                    left: '99px',
                    top: '88px'
                }
            }
        });

        const restoredEvents = await db.restoreStateSnapshot(snapshotId, {
            actor: { id: 'user_snapshot' },
            txId: 'tx_restore_snapshot'
        });
        const state = await db.getStateCurrent('shape_snapshot');
        const events = await db.listEvents({ atomeId: 'shape_snapshot' });

        const restoredShapeEvent = restoredEvents.find((event) => event.atome_id === 'shape_snapshot');
        const restoredProjectEvent = restoredEvents.find((event) => event.atome_id === 'project_snapshot');

        assert.equal(restoredEvents.length, 2);
        assert.ok(restoredShapeEvent);
        assert.ok(restoredProjectEvent);
        assert.equal(restoredShapeEvent.tx_id, 'tx_restore_snapshot');
        assert.equal(events.length, 3);
        assert.equal(state.meta.version, 3);
        assert.deepEqual(state.properties, {
            left: '10px',
            top: '20px'
        });
        assert.equal(state.properties.owner_id, undefined);
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(dbPath); } catch (_) {}
    }
});
