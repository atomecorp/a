import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';
import { resolveUploadMediaSizeParticles } from '../../eVe/domains/media/asset_box_media.js';
import { createProjectDropExternalRuntime } from '../../eVe/intuition/tools/project_drop_external_runtime.js';

test('asset box uses the shared Atome property sanitizer', () => {
    const source = fs.readFileSync('eVe/domains/media/asset_box_atome_store.js', 'utf8');
    assert.match(source, /from '#shared\/atome_contract\.js'/);
    assert.doesNotMatch(source, /RESERVED_ATOME_PROPERTY_KEYS/);
    assert.doesNotMatch(source, /const sanitizeAtomeProperties = \(/);
});

test('asset box media runtime detection does not treat localhost:3000 alone as native', () => {
    const source = fs.readFileSync('eVe/domains/media/asset_box_auth.js', 'utf8');
    assert.match(source, /function isNativeMediaRuntime\(\)/);
    assert.doesNotMatch(source, /from '\.\.\/\.\.\/\.\.\/atome\/src\/squirrel\/apis\/unified\/adole_api\/runtime\.js'/);
    assert.doesNotMatch(source, /localhost['"]\s*\|\|\s*host === ['"]127\.0\.0\.1['"]\)\s*&&\s*port === ['"]3000['"]/);
    assert.match(source, /__TAURI_INTERNALS__\?\.\s*invoke/);
    assert.match(source, /__AUV3_MODE__/);
});

test('asset box reads an imported sound duration from its canonical file blob', async () => {
    const properties = await resolveUploadMediaSizeParticles(
        { arrayBuffer: async () => new ArrayBuffer(1) },
        'sound',
        { probeAudioDuration: async () => ({ duration: 24.636372 }) }
    );
    assert.equal(properties.duration_sec, 24.636372);
    assert.equal(properties.duration_seconds, 24.636372);
    assert.equal(properties.media_duration, 24.636372);
});

test('external import forwards the probed media duration to the canonical Creator gateway', async () => {
    const calls = [];
    const runtime = createProjectDropExternalRuntime({
        invokeGateway: async (input) => { calls.push(input); return { ok: true, result: { atome_id: 'sound_created' } }; },
        warmupGateway: async () => ({ ok: true }),
        ensureABoxApi: async () => ({ sendFileToServer: async () => ({
            ok: true, type: 'sound', duration_sec: 24.636372, mediaUrl: '/api/uploads/test.m4a'
        }) }),
        computeDropBase: () => ({ left: 0, top: 0 }),
        resolveDropType: () => 'sound',
        readDroppedTextContent: async () => null,
        buildDropOffset: () => ({ dx: 0, dy: 0 }),
        buildExtraProperties: () => ({}),
        resolveCreatorResultAtomeId: () => 'sound_created'
    });
    const result = await runtime.importFilesToProjectViaCreator({
        entries: [{ name: 'test.m4a', arrayBuffer: async () => new ArrayBuffer(1) }],
        projectId: 'project_duration'
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0].input.duration_sec, 24.636372);
});
