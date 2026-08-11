import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
    createProjectViewWindowState,
    loadProjectViewPage
} from '../../eVe/domains/rendering/project_view_records.js';

test('List and Matrix keep the real meta.project_id sound and exclude system projections', async () => {
    const projectId = 'audio_prj2';
    const system = Array.from({ length: 107 }, (_, index) => ({
        atome_id: `tool.ui.system_${index}`,
        atome_type: index % 2 ? 'tool' : 'panel',
        meta: { project_id: projectId },
        properties: { type: index % 2 ? 'tool' : 'panel', tool_scope: 'catalog', atome_tool: true }
    }));
    const sound = {
        atome_id: 'sound_audio_prj2',
        atome_type: 'sound',
        meta: { project_id: projectId, owner_id: 'user_a' },
        properties: { kind: 'sound', media_url: '/api/recordings/audio.wav' }
    };
    const result = await loadProjectViewPage({
        projectId,
        windowState: createProjectViewWindowState(),
        readList: async (_id, options) => {
            assert.equal(options.excludeSystem, true);
            return [sound, ...system];
        }
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.records.map((record) => record.id), ['sound_audio_prj2']);
});
