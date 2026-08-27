import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectViewListContent } from '../../eVe/domains/rendering/project_view_list_content.js';
import { createLargeVirtualizedMoleculeFixture } from '../fixtures/molecule/canonical_v2_fixtures.mjs';

const moleculeOwner = {
    id: 'molecule_owner', atome_id: 'molecule_owner', project_id: 'project_list', type: 'group',
    properties: {
        name: 'Molécule 1',
        molecule_timeline: {
            schema: 'molecule_timeline', schema_version: 2, timeline_id: 'timeline_list', owner_atome_id: 'molecule_owner',
            sections: [{ section_id: 'section_1', name: 'Section 1', order: 0 }],
            tracks: [
                { track_id: 'track_audio', section_id: 'section_1', name: 'Piste 1', order: 0, output_group_track_id: 'group_bus' },
                { track_id: 'group_bus', section_id: 'section_1', name: 'Bus 1', order: 10, role: 'group' },
                { track_id: 'track_empty', section_id: 'section_1', name: 'Piste 2', order: 20, empty_slot: true }
            ],
            clips: [{ clip_id: 'clip_1', track_id: 'track_audio', kind: 'audio', source: { type: 'atome', atome_id: 'audio_source' } }]
        }
    }
};

const flatten = (node) => [node, ...(node?.children || []).flatMap(flatten)];

test('Molecule List expands a schema-v2 Molecule to its direct Atomes only', async () => {
    const content = createProjectViewListContent({ requestRefresh: () => {} });
    await content.load({
        projectId: 'project_list',
        readList: async () => ({ records: [
            moleculeOwner,
            {
                id: 'audio_source', atome_id: 'audio_source', project_id: 'project_list',
                parent_id: 'molecule_owner', type: 'audio', properties: { name: 'Take', peaks: [0, 1] }
            },
            { id: 'unrelated', atome_id: 'unrelated', project_id: 'project_list', type: 'text', properties: { name: 'Not a Molecule' } }
        ], totalCount: 3 })
    });
    assert.deepEqual(content.readState().entries.map((entry) => entry.label), ['Molécule 1', 'Not a Molecule']);
    await content.handleEvent({ type: 'project_view.list.toggle', id: 'molecule_owner' });
    assert.deepEqual(content.readState().entries.map((entry) => entry.label), ['Molécule 1', 'Take', 'Not a Molecule']);
    await content.handleEvent({ type: 'project_view.list.select', id: 'molecule_owner' });
    assert.deepEqual(content.readState().entries.map((entry) => entry.label), ['Molécule 1', 'Take', 'Not a Molecule']);
    assert.equal(content.readState().entries.some((entry) => (
        ['section', 'track'].includes(entry.visualRecord?.properties?.molecule_entity)
    )), false);
    assert.equal(content.readState().entries.some((entry) => entry.id === 'audio_source' && entry.depth === 0), false,
        'a Molecule member must not remain a loose project-root row');

    const tree = content.build({ width: 720, height: 480, emit: () => {} })[0];
    const nodes = flatten(tree);
    const moleculeRowIndex = content.readState().entries.findIndex((entry) => entry.id === 'molecule_owner');
    const rowId = `project_view_list_entry_${moleculeRowIndex}`;
    assert.equal(nodes.find((node) => node.id === `${rowId}_hierarchy`)?.kind, 'button');
    assert.equal(nodes.find((node) => node.id === `${rowId}_name`)?.kind, 'button');
    assert.equal(nodes.find((node) => node.id === `${rowId}_preview`)?.kind, 'pointer_capture');
    assert.equal(typeof nodes.find((node) => node.id === `${rowId}_preview`)?.on?.double_click, 'function');
});

test('Molecule List never projects a large internal track graph outside Timeline and Mixage', async () => {
    const timeline = createLargeVirtualizedMoleculeFixture({ trackCount: 4000 });
    const owner = {
        id: timeline.owner_atome_id, atome_id: timeline.owner_atome_id,
        project_id: timeline.project_id, type: 'group',
        properties: { name: 'Large Molecule', molecule_timeline: timeline }
    };
    const content = createProjectViewListContent({ requestRefresh: () => {} });
    await content.load({
        projectId: timeline.project_id,
        readList: async () => ({ records: [owner], totalCount: 1 })
    });
    await content.handleEvent({ type: 'project_view.list.toggle', id: owner.id });
    assert.deepEqual(content.readState().entries.map((entry) => entry.id), [owner.id]);

    const tree = content.build({ width: 1440, height: 980, emit: () => {} })[0];
    const rows = flatten(tree).filter((candidate) => /^project_view_list_entry_\d+$/.test(candidate.id || ''));
    assert.equal(rows.length, 1);
});

test('Molecule List footer selection contract selects the first visible Atome and preserves an empty level', async () => {
    const content = createProjectViewListContent({ requestRefresh: () => {} });
    await content.load({
        projectId: 'project_footer',
        readList: async () => ({ records: [
            { id: 'first', atome_id: 'first', project_id: 'project_footer', type: 'image', properties: { name: 'First' } },
            { id: 'second', atome_id: 'second', project_id: 'project_footer', type: 'text', properties: { name: 'Second' } }
        ], totalCount: 2 })
    });
    assert.deepEqual(await content.selectFirstEntry(), { ok: true, selectedId: 'first', revealed: false });
    assert.equal(content.readState().primaryId, 'first');

    const empty = createProjectViewListContent({ requestRefresh: () => {} });
    await empty.load({ projectId: 'project_empty', readList: async () => ({ records: [], totalCount: 0 }) });
    assert.deepEqual(await empty.selectFirstEntry(), { ok: true, empty: true, selectedId: null });
});
