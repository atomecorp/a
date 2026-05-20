import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

import { __moleculeTestUtils } from '../../eVe/core/media_engine/molecule.js';
import { createVampireProbeTimeline } from '../../eVe/core/media_engine/molecule.scenarios.js';

const root = process.cwd();
const basePath = './tests/fixtures/media';
const timeline = __moleculeTestUtils.normalizeTimeline(createVampireProbeTimeline(basePath));

for (const clip of timeline.tracks.flatMap((track) => track.clips)) {
    const mediaPath = path.resolve(root, clip.source.path);
    assert.equal(fs.existsSync(mediaPath), true, `Missing probe media: ${mediaPath}`);
}

const atOneSecond = __moleculeTestUtils.collectActiveClips(timeline, 1);
const atThreeSeconds = __moleculeTestUtils.collectActiveClips(timeline, 3);
const atSixSeconds = __moleculeTestUtils.collectActiveClips(timeline, 6);

assert.deepEqual(atOneSecond.map((clip) => clip.id), ['bed_main', 'vampire_main']);
assert.deepEqual(atThreeSeconds.map((clip) => clip.id), ['bed_main', 'vampire_main', 'fire_overlay']);
assert.deepEqual(atSixSeconds.map((clip) => clip.id), ['vampire_main']);

const overlay = atThreeSeconds.find((clip) => clip.id === 'fire_overlay');
assert.ok(overlay, 'Expected overlay clip at 3s');

const seek1 = __moleculeTestUtils.computeSourceSeconds(overlay, 2);
const seek2 = __moleculeTestUtils.computeSourceSeconds(overlay, 3);
const seek3 = __moleculeTestUtils.computeSourceSeconds(overlay, 4);
assert.equal(Number(seek1.toFixed(2)), 0.75);
assert.equal(Number(seek2.toFixed(2)), 1.75);
assert.equal(Number(seek3.toFixed(2)), 2.75);

const fadeStart = __moleculeTestUtils.computeEnvelope(overlay, 2.1);
const fadeMid = __moleculeTestUtils.computeEnvelope(overlay, 3);
const fadeEnd = __moleculeTestUtils.computeEnvelope(overlay, 4.9);
assert.ok(fadeStart < fadeMid, 'Fade-in must ramp upward');
assert.equal(Number(fadeMid.toFixed(2)), 1);
assert.ok(fadeEnd < 1, 'Fade-out must ramp downward');

console.log(JSON.stringify({
    ok: true,
    timeline_id: timeline.id,
    duration: timeline.duration,
    active_at_1s: atOneSecond.map((clip) => clip.id),
    active_at_3s: atThreeSeconds.map((clip) => clip.id),
    active_at_6s: atSixSeconds.map((clip) => clip.id),
    overlay_seek_points: [seek1, seek2, seek3].map((value) => Number(value.toFixed(3))),
    overlay_envelope: {
        fade_start: Number(fadeStart.toFixed(3)),
        fade_mid: Number(fadeMid.toFixed(3)),
        fade_end: Number(fadeEnd.toFixed(3))
    }
}, null, 2));
