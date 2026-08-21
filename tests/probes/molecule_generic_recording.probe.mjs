import assert from 'node:assert/strict';
import test from 'node:test';

import { addRecordRegion, createTimeline } from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeSession } from '../../eVe/intuition/tools/molecule/session/index.js';
import { createGenericMoleculeRecordingSession } from '../../eVe/intuition/tools/molecule/recording/generic.js';

const timelineWithRegions = () => {
    let timeline = createTimeline({
        timeline_id: 'tl_generic', project_id: 'project_generic', owner_atome_id: 'molecule_generic',
        initial_section_id: 'section_a', initial_track_id: 'track_audio'
    });
    timeline = addRecordRegion(timeline, {
        record_region_id: 'region_audio', section_id: 'section_a', track_id: 'track_audio',
        source_kind: 'audio', start_frame: 48000, duration_frames: 192000,
        fill_mode: 'fixed', armed: true, next_empty_track_id: 'track_video', next_empty_track_name: 'Video'
    });
    timeline = addRecordRegion(timeline, {
        record_region_id: 'region_video', section_id: 'section_a', track_id: 'track_video',
        source_kind: 'video', start_frame: 96000, duration_frames: 192000,
        fill_mode: 'fixed', armed: true, next_empty_track_id: 'track_empty', next_empty_track_name: 'Piste 3'
    });
    return timeline;
};

test('generic Record captures compatible regions concurrently and replaces only actual takes', async () => {
    const events = [];
    const session = createMoleculeSession({
        timeline: timelineWithRegions(), eventSink: { append: async (event) => events.push(event) }
    });
    let currentTime = 0;
    const starts = [];
    const stops = [];
    const recording = createGenericMoleculeRecordingSession({
        session, now: () => currentTime,
        startAudio: async (input) => { starts.push(['audio', input]); return { ok: true }; },
        stopAudio: async (input) => {
            stops.push(['audio', input]);
            return { ok: true, result: { duration_seconds: 1 }, project: { atomeId: 'audio_take' } };
        },
        startVideo: async (input) => { starts.push(['video', input]); return { ok: true }; },
        stopVideo: async (input) => {
            stops.push(['video', input]);
            return { ok: true, result: { duration_seconds: 2 }, project: { atomeId: 'video_take' } };
        }
    });
    const audio = await recording.start({ record_region_id: 'region_audio', clip_id: 'clip_audio' });
    const video = await recording.start({ record_region_id: 'region_video', clip_id: 'clip_video' });
    assert.equal(audio.sample_accurate, false);
    assert.equal(recording.read().active.length, 2);
    currentTime = 2000;
    await recording.finish(audio.capture_id);
    await recording.finish(video.capture_id);
    const state = session.getState();
    assert.deepEqual(state.clips.map((clip) => [clip.clip_id, clip.timeline.start_frame, clip.timeline.duration_frames]), [
        ['clip_audio', 48000, 48000], ['clip_video', 96000, 96000]
    ]);
    assert.equal(state.record_regions.length, 0);
    assert.equal(state.tracks.at(-1).empty_slot, true);
    assert.deepEqual(starts.map(([kind]) => kind), ['audio', 'video']);
    assert.deepEqual(stops.map(([kind]) => kind), ['audio', 'video']);
    assert.equal(events.filter((event) => event.event_type === 'molecule.clip.record_replace').length, 2);
});

test('Photo captures once at the region boundary and becomes an image over the full region', async () => {
    const session = createMoleculeSession({
        timeline: addRecordRegion(createTimeline({
            timeline_id: 'tl_photo', project_id: 'project_photo', owner_atome_id: 'molecule_photo',
            initial_section_id: 'section', initial_track_id: 'photo_track'
        }), {
            record_region_id: 'photo_region', section_id: 'section', track_id: 'photo_track',
            source_kind: 'photo', start_frame: 24000, duration_frames: 96000,
            fill_mode: 'fixed', armed: true,
            next_empty_track_id: 'photo_empty', next_empty_track_name: 'Piste 2'
        }),
        eventSink: { append: async () => {} }
    });
    const recording = createGenericMoleculeRecordingSession({
        session,
        takePhoto: async () => ({ ok: true, project: { atomeId: 'photo_take' } })
    });
    const result = await recording.start({ record_region_id: 'photo_region', clip_id: 'photo_clip' });
    assert.equal(result.completed, true);
    assert.equal(result.clip.timeline.start_seconds, 0.5);
    assert.equal(result.clip.timeline.duration_seconds, 2);
    assert.equal(result.clip.timeline.start_frame, 24000);
    assert.equal(result.clip.timeline.duration_frames, 96000);
    assert.equal(result.clip.kind, 'image');
    assert.equal(session.getState().record_regions.length, 0);
});
