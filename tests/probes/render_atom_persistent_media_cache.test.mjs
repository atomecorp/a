import assert from 'node:assert/strict';
import { test } from 'vitest';

import { normalizeRenderAtom } from '../../eVe/domains/rendering/render_atom.js';

test('RenderAtom exposes persisted media poster and waveform peaks for Bevy cache reuse', () => {
    const video = normalizeRenderAtom({
        id: 'video_cached',
        type: 'video_recording',
        properties: {
            kind: 'video_recording',
            media_url: '/api/recordings/video.mp4?media_user_id=user-42',
            media_poster_data_url: 'data:image/webp;base64,AAAA',
            width: 320,
            height: 180
        }
    });
    const audio = normalizeRenderAtom({
        id: 'audio_cached',
        type: 'audio_recording',
        properties: {
            kind: 'audio_recording',
            media_url: '/api/recordings/audio.wav?media_user_id=user-42',
            waveform_peaks: [0.1, 0.4, 0.9],
            width: 220,
            height: 48
        }
    });

    assert.equal(video.content.posterDataUrl, 'data:image/webp;base64,AAAA');
    assert.deepEqual(audio.content.peaks, [0.1, 0.4, 0.9]);
});
