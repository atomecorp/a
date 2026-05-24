import assert from 'node:assert/strict';
import { createClipProjectDuplicationRuntime } from '../../eVe/domains/mtrax/clips/project_duplication_runtime.js';

const commits = [];
globalThis.window = {
    Atome: {
        commit: async (event) => {
            commits.push(event);
            return { ok: true };
        },
        getStateCurrent: async () => ({
            type: 'video',
            properties: {
                kind: 'video',
                owner_id: 'user_a',
                project_id: 'source_project',
                parent_id: 'source_parent',
                selected: true,
                updated_at: '2026-01-01T00:00:00.000Z',
                media_url: '/api/recordings/a.webm'
            }
        })
    },
    dispatchEvent() { }
};
globalThis.CustomEvent = class {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
    }
};

const runtime = createClipProjectDuplicationRuntime({
    toKey: (value) => String(value || '').trim(),
    hasObjectShape: (value) => value && typeof value === 'object' && !Array.isArray(value),
    resolveAtomePropertiesFromStateRecord: (record) => record?.properties || {},
    cloneData: (value, fallback) => {
        if (value == null) return fallback;
        return JSON.parse(JSON.stringify(value));
    },
    normalizeClipKind: (value, fallback) => String(value || fallback || '').trim(),
    resolveCurrentProjectId: () => 'target_project',
    resolveSelectedClips: () => [],
    getClipById: () => null
});

const result = await runtime.duplicateClipToProject({
    atomeId: 'video_source',
    kind: 'video',
    src: '/api/recordings/a.webm'
}, 'target_project');

assert.equal(result.ok, true);
assert.equal(commits.length, 1);
assert.equal(commits[0].project_id, 'target_project');
assert.equal(commits[0].parent_id, 'target_project');
[
    'owner_id',
    'project_id',
    'parent_id',
    'selected',
    'updated_at',
    'type'
].forEach((key) => assert.equal(Object.hasOwn(commits[0].props, key), false, key));
assert.equal(commits[0].props.kind, 'video');
assert.equal(commits[0].props.media_url, '/api/recordings/a.webm');
assert.equal(commits[0].props.mtrack_extracted_from, 'video_source');

console.log('mtrax_project_duplication_sanitization: ok');
