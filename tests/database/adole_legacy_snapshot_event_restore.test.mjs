import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('legacy ADOLE snapshot restore appends an event instead of bypassing history', async () => {
    const dbPath = path.join(os.tmpdir(), `adole-legacy-snapshot-restore-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`../../database/adole.js?legacy_snapshot_restore=${Date.now()}`);
    const userId = 'user_legacy_snapshot';
    const projectId = 'project_legacy_snapshot';
    const shapeId = 'shape_legacy_snapshot';

    try {
        await db.initDatabase();
        await db.createAtome({
            id: userId,
            type: 'user',
            owner: userId,
            creator: userId,
            properties: {
                username: 'Snapshot Owner'
            }
        });
        await db.createAtome({
            id: projectId,
            type: 'project',
            owner: userId,
            creator: userId,
            properties: {
                name: 'Legacy Snapshot Project'
            }
        });
        await db.createAtome({
            id: shapeId,
            type: 'shape',
            parent: projectId,
            owner: userId,
            creator: userId,
            properties: {
                left: '12px',
                top: '24px',
                color: 'red'
            }
        });

        const snapshotId = await db.createSnapshot(shapeId, userId);
        await db.appendEvent({
            id: 'evt_legacy_snapshot_mutation',
            kind: 'set',
            atome_id: shapeId,
            project_id: projectId,
            actor: { id: userId },
            payload: {
                props: {
                    top: '88px',
                    color: 'blue'
                }
            }
        });

        const eventsBeforeRestore = await db.listEvents({ atomeId: shapeId });
        const historyBeforeRestore = await db.getParticleHistory(shapeId, 'color');
        assert.equal(eventsBeforeRestore.length, 1);

        const restoredData = await db.restoreSnapshot(snapshotId, userId, {
            txId: 'tx_legacy_snapshot_restore'
        });
        const state = await db.getStateCurrent(shapeId);
        const particles = await db.getParticles(shapeId);
        const eventsAfterRestore = await db.listEvents({ atomeId: shapeId });
        const historyAfterRestore = await db.getParticleHistory(shapeId, 'color');
        const restoreEvent = eventsAfterRestore.find((event) => event.tx_id === 'tx_legacy_snapshot_restore');

        assert.equal(restoredData.id, shapeId);
        assert.deepEqual(restoredData.properties, {
            left: '12px',
            top: '24px',
            color: 'red'
        });
        assert.equal(eventsAfterRestore.length, 2);
        assert.ok(restoreEvent);
        assert.equal(restoreEvent.kind, 'set');
        assert.equal(restoreEvent.actor.id, userId);
        assert.equal(restoreEvent.payload.props.type, 'shape');
        assert.equal(restoreEvent.payload.props.parent_id, projectId);
        assert.equal(restoreEvent.payload.props.color, 'red');
        assert.deepEqual(state.properties, {
            left: '12px',
            top: '24px',
            color: 'red'
        });
        assert.equal(state.meta.version, 3);
        assert.equal(particles.color, 'red');
        assert.equal(historyAfterRestore.length, historyBeforeRestore.length + 1);
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(dbPath); } catch (_) {}
    }
});
