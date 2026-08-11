import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const pickState = async (db, ids = []) => {
    const entries = [];
    for (const id of ids) {
        entries.push([id, await db.getStateCurrent(id)]);
    }
    return Object.fromEntries(entries);
};

test('ADOLE state_current can be rebuilt from append-only events', async () => {
    const dbPath = path.join(os.tmpdir(), `adole-event-replay-rebuild-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`../../database/adole.js?event_replay_rebuild=${Date.now()}`);
    const actor = { id: 'user_replay' };
    const projectId = 'project_replay';
    const shapeId = 'shape_replay';
    const deletedId = 'shape_deleted_replay';
    const ids = [projectId, shapeId, deletedId];

    try {
        await db.initDatabase();
        await db.appendEvents([
            {
                id: 'evt_replay_project_create',
                kind: 'set',
                atome_id: projectId,
                project_id: projectId,
                actor,
                payload: {
                    props: {
                        type: 'project',
                        name: 'Replay Project'
                    }
                }
            },
            {
                id: 'evt_replay_shape_create',
                kind: 'set',
                atome_id: shapeId,
                project_id: projectId,
                actor,
                payload: {
                    props: {
                        type: 'shape',
                        parent_id: projectId,
                        left: 10,
                        top: 20,
                        color: 'red'
                    }
                }
            },
            {
                id: 'evt_replay_shape_update',
                kind: 'set',
                atome_id: shapeId,
                project_id: projectId,
                actor,
                payload: {
                    props: {
                        left: 30,
                        color: 'blue'
                    }
                }
            }
        ], {
            txId: 'tx_replay_initial'
        });

        const snapshotId = await db.createStateSnapshot({
            projectId,
            label: 'Replay restore point',
            actor
        });

        await db.appendEvent({
            id: 'evt_replay_shape_after_snapshot',
            kind: 'set',
            atome_id: shapeId,
            project_id: projectId,
            actor,
            payload: {
                props: {
                    top: 99,
                    color: 'orange'
                }
            }
        });

        const restoredEvents = await db.restoreStateSnapshot(snapshotId, {
            actor,
            txId: 'tx_replay_restore'
        });
        assert.equal(restoredEvents.length, 2);

        await db.appendEvents([
            {
                id: 'evt_replay_deleted_create',
                kind: 'set',
                atome_id: deletedId,
                project_id: projectId,
                actor,
                payload: {
                    props: {
                        type: 'shape',
                        parent_id: projectId,
                        left: 1,
                        top: 2
                    }
                }
            },
            {
                id: 'evt_replay_deleted_delete',
                kind: 'delete',
                atome_id: deletedId,
                project_id: projectId,
                actor,
                payload: {
                    meta: {
                        source: 'event_replay_rebuild_test'
                    }
                }
            }
        ], {
            txId: 'tx_replay_delete'
        });

        const expected = await pickState(db, ids);
        const eventHistoryBefore = await db.listEvents({ projectId, order: 'asc', limit: 100 });
        const particleHistoryBefore = await db.getChangesSince('1970-01-01T00:00:00.000Z');
        assert.equal(eventHistoryBefore.length, 8);
        assert.equal(expected[shapeId].properties.color, 'blue');
        assert.equal(expected[shapeId].properties.top, 20);
        assert.equal(expected[deletedId].properties.__deleted, true);

        const adapter = db.getDataSourceAdapter();
        await adapter.query(
            'UPDATE state_current SET properties = ?, version = ? WHERE atome_id = ?',
            [JSON.stringify({ corrupted: true }), 999, shapeId]
        );
        await adapter.query('DELETE FROM state_current WHERE atome_id = ?', [deletedId]);
        const corruptedShape = await db.getStateCurrent(shapeId);
        const missingDeleted = await db.getStateCurrent(deletedId);
        assert.deepEqual(corruptedShape.properties, { corrupted: true });
        assert.equal(missingDeleted, null);

        const rebuild = await db.rebuildStateCurrentFromEvents({ all: true });
        assert.deepEqual(rebuild, {
            ok: true,
            scope: 'all',
            project_id: null,
            atome_id: null,
            event_count: 8,
            projection_count: 8
        });

        const actual = await pickState(db, ids);
        assert.deepEqual(actual, expected);

        const eventHistoryAfter = await db.listEvents({ projectId, order: 'asc', limit: 100 });
        const particleHistoryAfter = await db.getChangesSince('1970-01-01T00:00:00.000Z');
        assert.deepEqual(eventHistoryAfter, eventHistoryBefore);
        assert.equal(particleHistoryAfter.length, particleHistoryBefore.length);
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(dbPath); } catch (_) {}
    }
});

test('global event scope clears project ownership and survives projection rebuild', async () => {
    const dbPath = path.join(os.tmpdir(), `adole-global-scope-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`../../database/adole.js?global_scope=${Date.now()}`);
    try {
        await db.initDatabase();
        await db.appendEvent({
            id: 'global_scope_projected', kind: 'set', atome_id: 'tool.ui.sample', project_id: 'project_a',
            payload: { props: { type: 'tool', tool_scope: 'catalog' } }
        });
        await db.appendEvent({
            id: 'global_scope_cleared', kind: 'set', atome_id: 'tool.ui.sample', scope: 'global',
            payload: { props: { label: 'Sample' } }
        });
        assert.equal((await db.getStateCurrent('tool.ui.sample')).project_id ?? null, null);
        assert.equal((await db.getEvent('global_scope_cleared')).payload.scope, 'global');
        await db.rebuildStateCurrentFromEvents({ atomeId: 'tool.ui.sample' });
        assert.equal((await db.getStateCurrent('tool.ui.sample')).project_id ?? null, null);
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(dbPath); } catch (_) {}
    }
});

test('global scope repair appends corrections without detaching real project media', async () => {
    const dbPath = path.join(os.tmpdir(), `adole-global-repair-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`../../database/adole.js?global_repair=${Date.now()}`);
    try {
        await db.initDatabase();
        await db.appendEvents([
            {
                id: 'polluted_tool', kind: 'set', atome_id: 'tool.ui.catalog_sample', project_id: 'audio_prj2',
                payload: { props: { type: 'tool', tool_scope: 'catalog', atome_tool: true } }
            },
            {
                id: 'real_sound', kind: 'set', atome_id: 'sound_audio_prj2', project_id: 'audio_prj2',
                payload: { props: { type: 'sound', kind: 'sound', media_url: '/api/recordings/audio.wav' } }
            }
        ]);
        const result = await db.repairGlobalStateCurrentScopes();
        assert.deepEqual(result.repaired_ids, ['tool.ui.catalog_sample']);
        assert.equal((await db.getStateCurrent('tool.ui.catalog_sample')).project_id ?? null, null);
        assert.equal((await db.getStateCurrent('sound_audio_prj2')).meta.project_id, 'audio_prj2');
        assert.equal((await db.listEvents({ atomeId: 'tool.ui.catalog_sample' })).length, 2);
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(dbPath); } catch (_) {}
    }
});

test('project rename projection preserves its preview metadata', async () => {
    const dbPath = path.join(os.tmpdir(), `adole-project-preview-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`../../database/adole.js?project_preview=${Date.now()}`);
    try {
        await db.initDatabase();
        await db.appendEvent({
            id: 'project_preview_create', kind: 'set', atome_id: 'project_preview', project_id: 'project_preview',
            payload: { props: { type: 'project', name: 'Before', preview_url: 'data:image/webp;base64,AA==', preview_width: 640 } }
        });
        await db.appendEvent({
            id: 'project_preview_rename', kind: 'set', atome_id: 'project_preview', project_id: 'project_preview',
            payload: { props: { name: 'After' } }
        });
        const state = await db.getStateCurrent('project_preview');
        assert.equal(state.properties.name, 'After');
        assert.equal(state.properties.preview_url, 'data:image/webp;base64,AA==');
        assert.equal(state.properties.preview_width, 640);
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(dbPath); } catch (_) {}
    }
});
