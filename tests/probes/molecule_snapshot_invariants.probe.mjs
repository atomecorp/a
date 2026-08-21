import assert from 'node:assert/strict';
import test from 'node:test';

import { validateTimeline } from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeStores } from '../../eVe/intuition/runtime/molecule_stores.js';
import {
    createInvalidMoleculeFixtures,
    createLargeVirtualizedMoleculeFixture,
    createMinimalMoleculeFixture,
    createRichMoleculeFixture
} from '../fixtures/molecule/canonical_v2_fixtures.mjs';

test('canonical fixtures cover minimal, rich, and 4,000-track v2 snapshots', () => {
    const minimal = createMinimalMoleculeFixture();
    const rich = createRichMoleculeFixture();
    const large = createLargeVirtualizedMoleculeFixture();

    assert.equal(validateTimeline(minimal), minimal);
    assert.equal(validateTimeline(rich), rich);
    assert.equal(large.tracks.length, 4000);
    assert.equal(large.tracks.filter((track) => track.empty_slot).length, 1);
    assert.equal(large.tracks.at(-1).empty_slot, true);
    assert.deepEqual(new Set(rich.clips.map((clip) => clip.source.atome_id)), new Set([
        'fixture_atome_audio',
        'fixture_atome_video',
        'fixture_atome_image',
        'fixture_atome_text',
        'fixture_atome_drawing',
        'fixture_atome_page',
        'fixture_atome_code'
    ]));
});

test('the v2 validator rejects duplicate content identity and occupied empty Tracks', () => {
    const { duplicateClip, occupiedEmptyTrack } = createInvalidMoleculeFixtures();
    assert.throws(() => validateTimeline(duplicateClip), /duplicate clip/);
    assert.throws(() => validateTimeline(occupiedEmptyTrack), /empty track.*content/);
});

test('the v2 validator rejects orphan automation targets', () => {
    const { orphanAutomation } = createInvalidMoleculeFixtures();
    assert.throws(() => validateTimeline(orphanAutomation), /automation target.*not found/);
});

test('canonical stores reject invalid snapshots before any single or batch commit', async () => {
    const commits = [];
    const batches = [];
    const stores = createMoleculeStores({
        atome: {
            async commit(event) {
                commits.push(event);
            },
            async commitBatch(events) {
                batches.push(events);
            }
        },
        bus: null
    });
    const { duplicateClip } = createInvalidMoleculeFixtures();
    const valid = createMinimalMoleculeFixture({ timelineId: 'valid_for_batch' });

    await assert.rejects(
        () => stores.projectStore.saveTimeline(duplicateClip.project_id, duplicateClip),
        /duplicate clip/
    );
    await assert.rejects(
        () => stores.projectStore.saveTimelines(valid.project_id, [valid, duplicateClip]),
        /duplicate clip/
    );
    assert.equal(commits.length, 0);
    assert.equal(batches.length, 0);
});
