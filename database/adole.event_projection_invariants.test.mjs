import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('ADOLE events, particles, and state_current stay projection-coherent', async () => {
    const dbPath = path.join(os.tmpdir(), `adole-event-projection-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`./adole.js?event_projection=${Date.now()}`);

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
        await db.appendEvent({
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
        });

        const state = await db.getStateCurrent('shape_projection');
        const particles = await db.getParticles('shape_projection');
        const events = await db.listEvents({ atomeId: 'shape_projection' });

        assert.equal(events.length, 2);
        assert.equal(state.project_id, 'project_projection');
        assert.equal(state.owner_id, 'user_projection');
        assert.equal(state.version, 2);
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
        assert.equal(listed[0].atome_id, 'shape_projection');
        assert.deepEqual(listed[0].properties, state.properties);
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(dbPath); } catch (_) {}
    }
});
