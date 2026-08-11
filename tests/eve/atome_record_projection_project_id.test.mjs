import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
    mapStateCurrentToAtome,
    resolveAtomeProjectId
} from '../../atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js';
import { normalizeAtomeRecord } from '../../eVe/intuition/tools/shared/atome_record_utils.js';


test('state_current projection preserves canonical meta project id for project reload', () => {
    const projected = mapStateCurrentToAtome({
        id: 'video_recording_project_reload',
        type: 'video_recording',
        meta: {
            owner_id: 'user_a',
            project_id: 'project_a'
        },
        properties: {
            kind: 'video_recording',
            media_url: '/api/recordings/video.mp4?media_user_id=user_a'
        }
    });

    assert.equal(projected.project_id, 'project_a');
    assert.equal(projected.meta.project_id, 'project_a');
    assert.equal(resolveAtomeProjectId(projected), 'project_a');
});

test('shared record normalization reads project ownership from real server meta', () => {
    const normalized = normalizeAtomeRecord({
        atome_id: 'sound_audio_prj2',
        atome_type: 'sound',
        meta: { project_id: 'audio_prj2', owner_id: 'user_a' },
        properties: { kind: 'sound', media_url: '/api/recordings/audio.wav' }
    });
    assert.equal(normalized.projectId, 'audio_prj2');
    assert.equal(normalized.parentId, 'audio_prj2');
    assert.equal(normalized.ownerId, 'user_a');
});

test('state_current projection preserves Axum atome_id for project scene hydration', () => {
    const projected = mapStateCurrentToAtome({
        atome_id: 'file_axum_import',
        atome_type: 'group',
        owner_id: 'user_a',
        project_id: 'project_a',
        properties: {
            kind: 'group',
            media_url: '/api/uploads/file.png?media_user_id=user_a'
        }
    });

    assert.equal(projected.id, 'file_axum_import');
    assert.equal(projected.atome_id, 'file_axum_import');
    assert.equal(projected.type, 'group');
});
