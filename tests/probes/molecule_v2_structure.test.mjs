import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addClip,
    addRecordRegion,
    addSection,
    addTrack,
    createTimeline,
    deleteClip,
    moveSection,
    moveTrack,
    setClipBlockLoop,
    replaceRecordedRange,
    setMetronome,
    setQuantization,
    transferSectionBetweenTimelines,
    transferTracksBetweenTimelines,
    updateSection,
    updateTrack,
    validateTimeline
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import {
    projectTimelineToSceneRecords,
    timelineLayoutForContextualRail
} from '../../eVe/intuition/tools/molecule/render/timeline_scene.js';

const createV2 = () => createTimeline({
    timeline_id: 'tl_v2',
    project_id: 'project_v2',
    owner_atome_id: 'molecule_v2',
    initial_section_id: 'section_a',
    initial_track_id: 'track_empty_a',
    initial_section_name: 'Section 1',
    initial_track_name: 'Track 1'
});

test('v2 creates one Section with one canonical trailing empty Track', () => {
    const timeline = createV2();
    assert.equal(timeline.schema_version, 2);
    assert.equal(timeline.sections.length, 1);
    assert.equal(timeline.sections[0].duration_frames, null);
    assert.equal(timeline.tracks.length, 1);
    assert.equal(timeline.tracks[0].empty_slot, true);
    assert.equal(timeline.tracks[0].section_id, 'section_a');
    assert.deepEqual(timeline.record_regions, []);
    assert.equal(validateTimeline(timeline), timeline);
});

test('filling the trailing Track creates exactly one next empty Track', () => {
    let timeline = createV2();
    timeline = addClip(timeline, {
        clip_id: 'clip_a',
        track_id: 'track_empty_a',
        kind: 'audio',
        source: { type: 'atome', atome_id: 'audio_a' },
        timeline: {
            start_seconds: 0,
            duration_seconds: 2,
            source_in_seconds: 0,
            source_out_seconds: 2
        },
        next_empty_track_id: 'track_empty_b',
        next_empty_track_name: 'Track 2'
    });
    assert.equal(timeline.tracks.find((track) => track.track_id === 'track_empty_a').empty_slot, false);
    assert.equal(timeline.tracks.at(-1).track_id, 'track_empty_b');
    assert.equal(timeline.tracks.at(-1).empty_slot, true);
    assert.equal(timeline.tracks.filter((track) => track.empty_slot).length, 1);
    validateTimeline(timeline);
});

test('Sections own their Tracks and remain structurally ordered', () => {
    let timeline = createV2();
    timeline = addSection(timeline, {
        section_id: 'section_b',
        name: 'Section 2',
        order: 10,
        duration_frames: 96000,
        initial_track_id: 'track_empty_b',
        initial_track_name: 'Track 1'
    });
    timeline = updateSection(timeline, {
        section_id: 'section_a',
        duration_frames: 48000,
        tempo: 90,
        meter: { beats_per_bar: 3, beat_unit: 4 }
    });
    timeline = addTrack(timeline, {
        track_id: 'group_b',
        section_id: 'section_b',
        kind: 'mixed',
        name: 'Bus 1',
        role: 'group'
    });
    timeline = addTrack(timeline, {
        track_id: 'audio_b',
        section_id: 'section_b',
        kind: 'audio',
        name: 'Voice',
        output_group_track_id: 'group_b'
    });
    assert.deepEqual(timeline.sections.map((section) => section.section_id), ['section_a', 'section_b']);
    assert.equal(timeline.tracks.find((track) => track.track_id === 'audio_b').output_group_track_id, 'group_b');
    assert.equal(timeline.tracks.filter((track) => track.section_id === 'section_b').at(-1).empty_slot, true);
    validateTimeline(timeline);
});

test('Record regions persist armed source and occupy the trailing Track', () => {
    let timeline = createV2();
    timeline = addRecordRegion(timeline, {
        record_region_id: 'record_a',
        section_id: 'section_a',
        track_id: 'track_empty_a',
        source_kind: 'audio',
        start_frame: 0,
        duration_frames: 384000,
        fill_mode: 'fixed',
        armed: true,
        next_empty_track_id: 'track_empty_b',
        next_empty_track_name: 'Track 2'
    });
    assert.deepEqual(timeline.record_regions[0], {
        record_region_id: 'record_a',
        section_id: 'section_a',
        track_id: 'track_empty_a',
        source_kind: 'audio',
        start_frame: 0,
        duration_frames: 384000,
        fill_mode: 'fixed',
        armed: true
    });
    assert.equal(timeline.tracks.at(-1).track_id, 'track_empty_b');
    validateTimeline(timeline);
});

test('Track Info settings, quantization, and metronome remain canonical', () => {
    let timeline = createV2();
    timeline = updateTrack(timeline, {
        track_id: 'track_empty_a',
        continue_beyond_section: true,
        quantization: '1/8beat',
        loop: { enabled: true, start_frame: 0, end_frame: 48000, repeat_count: 3 }
    });
    timeline = setQuantization(timeline, { quantization: 'beat' });
    timeline = setMetronome(timeline, { enabled: true, pre_roll_bars: 2 });
    const track = timeline.tracks[0];
    assert.equal(track.continue_beyond_section, true);
    assert.equal(track.quantization, '1/8beat');
    assert.equal(track.loop.repeat_count, 3);
    assert.equal(timeline.settings.quantization, 'beat');
    assert.equal(timeline.settings.metronome_enabled, true);
    assert.equal(timeline.settings.pre_roll_bars, 2);
    validateTimeline(timeline);
});

test('a short Record take replaces only its captured range and consumes its armed region', () => {
    let timeline = createV2();
    timeline = addClip(timeline, {
        clip_id: 'bed', track_id: 'track_empty_a', kind: 'audio',
        source: { type: 'atome', atome_id: 'bed_source' },
        timeline: { start_seconds: 0, duration_seconds: 10, source_in_seconds: 0, source_out_seconds: 10 },
        next_empty_track_id: 'track_empty_b', next_empty_track_name: 'Track 2'
    });
    timeline = addRecordRegion(timeline, {
        record_region_id: 'take_region', section_id: 'section_a', track_id: 'track_empty_a',
        source_kind: 'audio', start_frame: 96000, duration_frames: 192000,
        fill_mode: 'fixed', armed: true
    });
    timeline = replaceRecordedRange(timeline, {
        clip_id: 'take', track_id: 'track_empty_a', kind: 'audio',
        source: { type: 'atome', atome_id: 'take_source' },
        timeline: { start_seconds: 2, duration_seconds: 2, source_in_seconds: 0, source_out_seconds: 2 },
        record_region_id: 'take_region'
    });
    assert.deepEqual(timeline.clips.map((clip) => [
        clip.clip_id, clip.timeline.start_seconds, clip.timeline.duration_seconds
    ]), [
        ['bed:before:take', 0, 2],
        ['bed:after:take', 4, 6],
        ['take', 2, 2]
    ]);
    assert.equal(timeline.record_regions.length, 0);
    validateTimeline(timeline);
});

test('global and per-Track quantization apply to placement through frame projections', () => {
    let timeline = setQuantization(createV2(), { quantization: 'beat' });
    timeline = addClip(timeline, {
        clip_id: 'quantized', track_id: 'track_empty_a', kind: 'audio',
        source: { type: 'atome', atome_id: 'quantized_source' },
        timeline: { start_seconds: 0.26, duration_seconds: 0.74, source_in_seconds: 0, source_out_seconds: 1 },
        next_empty_track_id: 'track_empty_b', next_empty_track_name: 'Piste 2'
    });
    assert.equal(timeline.clips[0].timeline.start_seconds, 0.5);
    assert.equal(timeline.clips[0].timeline.duration_seconds, 0.5);
    assert.equal(timeline.clips[0].timeline.start_frame, 24000);
});

test('Fill empty space derives its boundary from the next content', () => {
    let timeline = createV2();
    timeline = addClip(timeline, {
        clip_id: 'future', track_id: 'track_empty_a', kind: 'audio',
        source: { type: 'atome', atome_id: 'future_source' },
        timeline: { start_seconds: 6, duration_seconds: 2, source_in_seconds: 0, source_out_seconds: 2 },
        next_empty_track_id: 'track_empty_b', next_empty_track_name: 'Piste 2'
    });
    timeline = addRecordRegion(timeline, {
        record_region_id: 'fill', section_id: 'section_a', track_id: 'track_empty_a',
        source_kind: 'video', start_frame: 96000, fill_mode: 'fill_empty_space', armed: true
    });
    assert.equal(timeline.record_regions[0].duration_frames, 192000);
});

test('Bevy projection keeps exactly two time bands and left-to-right time in both handed modes', () => {
    const timeline = createV2();
    for (const handedness of ['left', 'right']) {
        const layout = timelineLayoutForContextualRail({ handedness, railVisible: true, railWidth: 52 });
        const records = projectTimelineToSceneRecords(timeline, { handedness, layout });
        assert.equal(records.filter((record) => record.id.startsWith('mol:time:')).length, 2);
        assert.equal(records.find((record) => record.id === 'mol:time:ruler').properties.time_direction, 'left_to_right');
        assert.equal(records.find((record) => record.id === 'mol:playhead').properties.left, handedness === 'left' ? 52 : 0);
    }
});

test('a Section transfers atomically between Molecules and removes an emptied source owner', () => {
    let source = createV2();
    source = addClip(source, {
        clip_id: 'source_clip', track_id: 'track_empty_a', kind: 'audio',
        source: { type: 'atome', atome_id: 'audio_source' },
        timeline: { start_seconds: 0, duration_seconds: 2, source_in_seconds: 0, source_out_seconds: 2 },
        next_empty_track_id: 'source_empty', next_empty_track_name: 'Piste 2'
    });
    const target = createTimeline({
        timeline_id: 'tl_target', project_id: 'project_v2', owner_atome_id: 'molecule_target',
        initial_section_id: 'target_section', initial_track_id: 'target_empty'
    });
    const result = transferSectionBetweenTimelines(source, target, {
        section_id: 'section_a', target_index: 0
    });
    assert.equal(result.source, null);
    assert.equal(result.source_deleted, true);
    assert.deepEqual(result.target.sections.map((section) => section.section_id), ['section_a', 'target_section']);
    assert.equal(result.target.clips[0].clip_id, 'source_clip');
    validateTimeline(result.target);
});

test('Track transfers preserve a moved group route and drop an orphaned route', () => {
    let source = createV2();
    source = addTrack(source, {
        track_id: 'bus', section_id: 'section_a', kind: 'audio', name: 'Bus', role: 'group'
    });
    source = addTrack(source, {
        track_id: 'voice', section_id: 'section_a', kind: 'audio', name: 'Voice',
        output_group_track_id: 'bus'
    });
    source = addClip(source, {
        clip_id: 'voice_clip', track_id: 'voice', kind: 'audio',
        source: { type: 'atome', atome_id: 'voice_source' },
        timeline: { start_seconds: 0, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 }
    });
    source = addClip(source, {
        clip_id: 'keeper', track_id: 'track_empty_a', kind: 'audio',
        source: { type: 'atome', atome_id: 'keeper_source' },
        timeline: { start_seconds: 2, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 },
        next_empty_track_id: 'source_empty', next_empty_track_name: 'Piste 4'
    });
    const target = createTimeline({
        timeline_id: 'tl_target_tracks', project_id: 'project_v2', owner_atome_id: 'molecule_target_tracks',
        initial_section_id: 'target_section', initial_track_id: 'target_empty'
    });
    const together = transferTracksBetweenTimelines(source, target, {
        track_ids: ['bus', 'voice'], target_section_id: 'target_section'
    });
    assert.equal(together.target.tracks.find((track) => track.track_id === 'voice').output_group_track_id, 'bus');
    assert.equal(together.target.tracks.at(-1).track_id, 'target_empty');
    assert.equal(together.source.clips[0].clip_id, 'keeper');
    validateTimeline(together.source);
    validateTimeline(together.target);

    const alone = transferTracksBetweenTimelines(source, target, {
        track_id: 'voice', target_section_id: 'target_section'
    });
    assert.equal(alone.target.tracks.find((track) => track.track_id === 'voice').output_group_track_id, null);
    validateTimeline(alone.source);
    validateTimeline(alone.target);
});

test('Sections reorder atomically from a positional target index', () => {
    let timeline = addSection(createV2(), {
        section_id: 'section_b', name: 'Section 2',
        initial_track_id: 'track_empty_b', initial_track_name: 'Piste 1'
    });
    timeline = addSection(timeline, {
        section_id: 'section_c', name: 'Section 3',
        initial_track_id: 'track_empty_c', initial_track_name: 'Piste 1'
    });
    timeline = moveSection(timeline, { section_id: 'section_c', target_index: 0 });
    assert.deepEqual(timeline.sections.map((section) => [section.section_id, section.order]), [
        ['section_c', 0], ['section_a', 10], ['section_b', 20]
    ]);
    validateTimeline(timeline);
});

test('Tracks move between Sections while preserving both trailing empty Tracks', () => {
    let timeline = addSection(createV2(), {
        section_id: 'section_b', name: 'Section 2',
        initial_track_id: 'track_empty_b', initial_track_name: 'Piste 1'
    });
    timeline = addTrack(timeline, {
        track_id: 'bus_a', section_id: 'section_a', kind: 'audio', name: 'Bus', role: 'group'
    });
    timeline = addTrack(timeline, {
        track_id: 'voice_a', section_id: 'section_a', kind: 'audio', name: 'Voice',
        output_group_track_id: 'bus_a'
    });
    timeline = moveTrack(timeline, {
        track_id: 'voice_a', target_section_id: 'section_b', target_index: 0
    });
    const moved = timeline.tracks.find((track) => track.track_id === 'voice_a');
    assert.equal(moved.section_id, 'section_b');
    assert.equal(moved.output_group_track_id, null);
    for (const sectionId of ['section_a', 'section_b']) {
        const tracks = timeline.tracks
            .filter((track) => track.section_id === sectionId)
            .sort((left, right) => left.order - right.order);
        assert.equal(tracks.filter((track) => track.empty_slot).length, 1);
        assert.equal(tracks.at(-1).empty_slot, true);
    }
    validateTimeline(timeline);
});

test('block loops extend one source non-destructively with quantized frame truth', () => {
    let timeline = addClip(createV2(), {
        clip_id: 'loop_source', track_id: 'track_empty_a', kind: 'audio',
        source: { type: 'atome', atome_id: 'loop_audio' },
        timeline: { start_seconds: 0, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 },
        next_empty_track_id: 'loop_empty', next_empty_track_name: 'Piste 2'
    });
    timeline = setClipBlockLoop(timeline, {
        clip_id: 'loop_source', enabled: true, duration_frames: 144000
    });
    assert.equal(timeline.clips.length, 1);
    assert.deepEqual(timeline.clips[0].source, { type: 'atome', atome_id: 'loop_audio' });
    assert.deepEqual(timeline.clips[0].block_loop, { enabled: true, duration_frames: 144000 });
    const records = projectTimelineToSceneRecords(timeline);
    assert.equal(records.filter((record) => record.id.startsWith('mol:clip-loop:loop_source:')).length, 2);
    assert.ok(records.some((record) => record.id === 'mol:clip-loop-handle:loop_source'));
    validateTimeline(timeline);
});

test('removing the final temporal medium restores a Section with remaining non-temporal content to structural form', () => {
    let timeline = addClip(createV2(), {
        clip_id: 'audio_extent', track_id: 'track_empty_a', kind: 'audio',
        source: { type: 'atome', atome_id: 'audio_source' },
        timeline: { start_seconds: 0, duration_seconds: 2, source_in_seconds: 0, source_out_seconds: 2 },
        next_empty_track_id: 'track_text', next_empty_track_name: 'Piste 2'
    });
    timeline = addClip(timeline, {
        clip_id: 'text_content', track_id: 'track_text', kind: 'text',
        source: { type: 'atome', atome_id: 'text_source' },
        timeline: { start_seconds: 0, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 },
        next_empty_track_id: 'track_final_empty', next_empty_track_name: 'Piste 3'
    });
    assert.equal(timeline.sections[0].duration_frames, 96000);
    timeline = deleteClip(timeline, { clip_id: 'audio_extent' });
    assert.equal(timeline.sections[0].duration_frames, null);
    assert.equal(timeline.clips[0].clip_id, 'text_content');
});
