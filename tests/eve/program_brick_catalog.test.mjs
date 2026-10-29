import { describe, it, expect } from 'vitest';
import { HEALTH_BRICKS, HEALTH_OBJECTIVE_BRICKS, healthBrick, healthObjectiveBricks, objectiveActivityBricks }
    from '../../eVe/domains/programs/program_brick_catalog.js';
import { PROGRAM_BRICKS, PROGRAM_DEFINITIONS, initialProgram, validateProgramBricks } from '../../eVe/domains/programs/project_program_model.js';
import { DASHBOARD_OBJECTIVES } from '../../eVe/domains/dashboard/dashboard_creation_catalog.js';
import { createProjectProgramRuntime } from '../../eVe/domains/programs/project_program_runtime.js';
import { programDataPermissionId } from '../../atome/src/shared/program_collection_contract.js';

const objectiveProgram = () => ({ ...initialProgram('objective'), objective_session: { start_minutes: 600, minutes: 20 } });
const fixture = goal => {
    const store = new Map([['p', { atome_id: 'p', owner_id: 'alice', project_id: 'p', type: 'project',
        properties: { project_intent: { family: 'health', goal }, project_program: objectiveProgram() } }]]);
    const commit = async events => { for (const event of events) {
        const old = store.get(event.atome_id) || {};
        store.set(event.atome_id, { ...old, ...event, owner_id: old.owner_id || event.actor, properties: { ...old.properties, ...event.props } });
    } return { ok: true }; };
    const runtime = createProjectProgramRuntime({ read: async id => structuredClone(store.get(id)),
        list: async id => [...store.values()].filter(record => record.project_id === id), commit, commitCollection: commit,
        actor: () => 'alice', project: () => 'p', now: () => '2030-01-07T10:00:00Z' });
    return { store, invoke: input => runtime.invoke({ project_id: 'p', ...input }) };
};

describe('health brick library', () => {
    it('declares the 45 bricks once, each ATM-2017 alias on one brick only', () => {
        expect(HEALTH_BRICKS.map(brick => brick.id)).toEqual(Array.from({ length: 45 }, (_, index) => 'BR-' + String(index + 1).padStart(2, '0')));
        expect(healthBrick('BR-SOM-01').id).toBe('BR-16');
        expect(healthBrick('BR-ACT-03')).toBe(healthBrick('BR-25'));
        expect(healthBrick('BR-SYS-01')).toBeNull();
        expect(HEALTH_BRICKS.filter(brick => brick.activity).every(brick => PROGRAM_BRICKS[brick.activity])).toBe(true);
        expect(HEALTH_BRICKS.filter(brick => brick.risks.length === 1 && brick.risks[0] === 'S2').every(brick => brick.status === 'review_required')).toBe(true);
    });
    it('composes the thirteen official objectives without letting an unreviewed or absent brick become an activity', () => {
        expect(Object.keys(HEALTH_OBJECTIVE_BRICKS).sort()).toEqual(DASHBOARD_OBJECTIVES.map(entry => entry.goal).sort());
        expect(new Set(objectiveActivityBricks('sleep'))).toEqual(new Set(PROGRAM_DEFINITIONS.sleep.bricks));
        expect(objectiveActivityBricks('muscle')).toEqual(['sport', 'nutrition']);
        expect(objectiveActivityBricks('pain')).toEqual([]);
        expect(objectiveActivityBricks('free')).toEqual([]);
        const journal = healthObjectiveBricks('journal');
        expect(journal.map(brick => brick.id)).toEqual(['BR-34', 'BR-16', 'BR-28', 'BR-31', 'BR-35', 'BR-36']);
        expect(journal[0]).toMatchObject({ role: 'start', status: 'supported' });
        expect(journal[1]).toMatchObject({ role: 'optional', key: 'sleep_journal' });
    });
    it('validates an objective programme bricks against its own composition and leaves sleep on its protocol', () => {
        expect(validateProgramBricks(initialProgram('objective'), ['sport'], 'muscle')).toEqual(['sport']);
        expect(() => validateProgramBricks(initialProgram('objective'), ['nap'], 'muscle')).toThrow('program_bricks_invalid');
        expect(() => validateProgramBricks(initialProgram('objective'), ['sport'], 'pain')).toThrow('program_bricks_invalid');
        expect(validateProgramBricks(initialProgram('sleep'), ['nap', 'nutrition'])).toEqual(['nap', 'nutrition']);
        expect(() => validateProgramBricks(initialProgram('sleep'), ['sport'])).toThrow('program_bricks_invalid');
    });
});

describe('objective programme bricks through the canonical runtime', () => {
    it('reads the composition and keeps only the bricks the person chose, preserving the session', async () => {
        const f = fixture('muscle');
        const read = await f.invoke({ operation: 'read' });
        expect(read.ok).toBe(true);
        expect(read.program.bricks).toEqual([]);
        expect(read.composition.filter(brick => brick.role === 'start').map(brick => brick.id)).toEqual(['BR-25', 'BR-29', 'BR-08', 'BR-10', 'BR-15']);
        expect(await f.invoke({ operation: 'configure', bricks: ['sport'] })).toEqual({ ok: true, bricks: ['sport'] });
        expect(f.store.get('p').properties.project_program).toMatchObject({ bricks: ['sport'], objective_session: { start_minutes: 600, minutes: 20 } });
        expect(await f.invoke({ operation: 'configure', bricks: ['meditation'] })).toEqual({ ok: false, error: 'program_bricks_invalid' });
        expect(await f.invoke({ operation: 'configure', bricks: ['sport', 'sport'] })).toEqual({ ok: false, error: 'program_bricks_invalid' });
        expect(f.store.get('p').properties.project_program.bricks).toEqual(['sport']);
    });
    it('reports a withdrawn read as refused, distinct from a question never answered', async () => {
        const f = fixture('weight');
        expect(await f.invoke({ operation: 'collection_read' })).toMatchObject({ ok: true, question: { key: 'starting_state', status: 'missing' } });
        expect(await f.invoke({ operation: 'collection_permission', data_source: 'preferences', allow_read: false }))
            .toMatchObject({ ok: true, permissions: { preferences: false }, question: { status: 'refused', value: null } });
        expect(f.store.get(programDataPermissionId('alice', 'p:objective', 'preferences')).properties.program_data_permission)
            .toMatchObject({ allowed: false });
        expect(await f.invoke({ operation: 'collection_answer', preference_key: 'starting_state', answer_status: 'later' }))
            .toMatchObject({ question: { status: 'later' } });
    });
});
