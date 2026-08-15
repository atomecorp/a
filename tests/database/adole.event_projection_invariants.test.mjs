import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('ADOLE events, particles, and state_current stay projection-coherent', async () => {
    const dbPath = path.join(os.tmpdir(), `adole-event-projection-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`../../database/adole.js?event_projection=${Date.now()}`);

    try {
        await db.initDatabase();
        await db.appendEvent({
            id: 'evt_projection_1',
            kind: 'set',
            atome_id: 'shape_projection',
            project_id: 'project_projection',
            actor: { id: 'user_projection' },
            payload: {
                props: {
                    type: 'shape',
                    parent_id: 'project_projection',
                    owner_id: 'wrong_property_owner',
                    left: '10px',
                    top: '20px'
                }
            }
        });
        await db.appendEvent({
            id: 'evt_projection_2',
            kind: 'set',
            atome_id: 'shape_projection',
            project_id: 'project_projection',
            actor: { id: 'user_projection' },
            payload: {
                props: {
                    top: '42px',
                    color: 'blue'
                }
            }
        });
        await assert.rejects(db.appendEvent({
            id: 'evt_projection_2',
            kind: 'set',
            atome_id: 'shape_projection',
            project_id: 'project_projection',
            actor: { id: 'user_projection' },
            payload: {
                props: {
                    top: '999px',
                    color: 'red'
                }
            }
        }), /event_id_conflict/);

        const state = await db.getStateCurrent('shape_projection');
        const particles = await db.getParticles('shape_projection');
        const events = await db.listEvents({ atomeId: 'shape_projection' });

        assert.equal(events.length, 2);
        assert.equal(state.id, 'shape_projection');
        assert.equal(state.type, 'shape');
        assert.equal(state.meta.project_id, 'project_projection');
        assert.equal(state.meta.owner_id, 'user_projection');
        assert.equal(state.meta.version, 2);
        assert.deepEqual(state.properties, {
            left: '10px',
            top: '42px',
            color: 'blue'
        });
        assert.equal(state.properties.type, undefined);
        assert.equal(state.properties.owner_id, undefined);
        assert.equal(particles.left, '10px');
        assert.equal(particles.top, '42px');
        assert.equal(particles.color, 'blue');
        assert.equal(particles.owner_id, undefined);

        const listed = await db.listStateCurrent('project_projection');
        assert.equal(listed.length, 1);
        assert.equal(listed[0].id, 'shape_projection');
        assert.equal(listed[0].type, 'shape');
        assert.deepEqual(listed[0].properties, state.properties);

        const systemVariants = [
            ['masked_kind_tool', 'shape', { kind: 'tool', name: 'Masked tool' }],
            ['masked_type_panel', 'panel', { kind: 'shape', name: 'Masked panel' }],
            ['tool.ui.masked_id', 'shape', { kind: 'shape', name: 'System id' }]
        ];
        for (const [id, type, props] of systemVariants) {
            await db.createAtome({
                id, type, parent: 'project_projection', owner: 'user_projection',
                creator: 'user_projection', properties: { project_id: 'project_projection', ...props }
            });
            await db.appendEvent({
                id: `evt_${id}`, kind: 'set', atome_id: id, project_id: 'project_projection',
                actor: { id: 'user_projection' }, payload: { props }
            });
        }
        const projectAtomes = await db.listStateCurrent('project_projection', {
            limit: 200, offset: 0, excludeSystem: true
        });
        const projectTotal = await db.countStateCurrent('project_projection', { excludeSystem: true });
        assert.deepEqual(projectAtomes.map((entry) => entry.id), ['shape_projection']);
        assert.equal(projectTotal, projectAtomes.length, 'the count and list must share the exact system predicate');
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(dbPath); } catch (_) {}
    }
});
