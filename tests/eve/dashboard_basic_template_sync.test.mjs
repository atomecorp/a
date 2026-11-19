// A template instance keeps one copy per slot: known-bug-solutions/local-server-tombstones-in-lists.
// Two devices syncing the same home at once each made a copy of a slot; the planner mapped one of
// them and left the other on the Dashboard for ever, stacked over its twin.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planTemplateInstanceSync } from '../../eVe/domains/templates/project_template_model.js';

const control = { kind: 'mystic_tile', value: 'capture' };
const source = [{ id: 'cell', type: 'group', project_id: 'src', parent_id: 'src', properties: { template_control: control } }];
const copy = (id, updated_at) => ({ id, type: 'group', project_id: 'home', parent_id: 'home', updated_at,
    properties: { template_control: control, template_slot_id: 'cell', template_instance_id: 'home' } });
const plan = (instanceStates) => planTemplateInstanceSync({ sourceProjectId: 'src', sourceStates: source,
    instanceStates, instanceRootId: 'home', instanceProjectId: 'home', createId: () => 'never' });

test('deletes the extra copies two racing syncs made of one slot, keeping the most recent', () => {
    const result = plan([copy('old', '2026-10-13T10:00:00Z'), copy('new', '2026-10-13T11:00:00Z')]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.deleted, ['old']);
    assert.equal(result.slot_map.cell, 'new');
    assert.deepEqual(result.created, []);
    const deletion = result.events.find((event) => event.atome_id === 'old');
    assert.equal(deletion?.kind, 'delete');
    assert.equal(result.events.some((event) => event.atome_id === 'new' && event.kind === 'delete'), false);
});

test('a slot held by one copy is left alone', () => {
    const result = plan([copy('only', '2026-10-13T10:00:00Z')]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.deleted, []);
    assert.deepEqual(result.created, []);
    assert.equal(result.slot_map.cell, 'only');
});
