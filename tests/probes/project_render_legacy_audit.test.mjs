import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createMediaSourceRuntime } from '../../eVe/intuition/runtime/media_source_runtime.js';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const deleteSource = await readSource('eVe/intuition/tools/delete.js');
const infosSource = await readSource('eVe/intuition/tools/infos.js');
const communicationSource = await readSource('eVe/intuition/tools/communication.js');
const timelineSource = await readSource('eVe/core/atome_timeline.js');
const toolGenesisSource = await readSource('eVe/intuition/runtime/tool_genesis.js');
const projectBridgeSource = await readSource('eVe/intuition/runtime/project_scene_render_bridge.js');
const mediaIntegritySource = await readSource('eVe/intuition/runtime/media_integrity_runtime.js');
const shapeSvgSource = await readSource('eVe/intuition/runtime/shape_svg_runtime.js');
const groupVisualSource = await readSource('eVe/intuition/runtime/group_visual_runtime.js');
const mediaSourceSource = await readSource('eVe/intuition/runtime/media_source_runtime.js');

const sliceFunction = (source, name) => {
    const start = source.indexOf(`const ${name} =`);
    assert.notEqual(start, -1, `${name} must exist`);
    const nextDeclaration = source.indexOf('\nconst ', start + 1);
    assert.notEqual(nextDeclaration, -1, `${name} boundary must be explicit`);
    return source.slice(start, nextDeclaration);
};

test('project restore path updates the scene runtime instead of rendering an HTMLElement host', () => {
    const body = sliceFunction(deleteSource, 'restoreAtomeToProject');

    assert.equal(body.includes('renderAtomeRecord('), false);
    assert.equal(body.includes('createAtomeElement('), false);
    assert.ok(body.includes('updateProjectSceneRecord({'));
    assert.ok(deleteSource.includes("from '../../domains/rendering/project_scene_runtime.js'"));
});

test('project info assignment updates the scene runtime instead of requiring an HTMLElement render return', () => {
    const body = sliceFunction(infosSource, 'ensureAtomeRendered');

    assert.equal(body.includes('renderAtomeRecord('), false);
    assert.equal(body.includes('createAtomeElement('), false);
    assert.ok(body.includes('updateProjectSceneRecord({'));
    assert.ok(infosSource.includes("from '../../domains/rendering/project_scene_runtime.js'"));
});

test('shared project atomes hydrate the project scene without dead legacy render branches', () => {
    const body = sliceFunction(communicationSource, 'fetchAndRenderSharedAtomes');

    assert.equal(body.includes('renderAtomeRecord('), false);
    assert.equal(body.includes('createAtomeElement('), false);
    assert.ok(body.includes('updateProjectSceneRecord({'));
});

test('timeline project replay exits through the scene runtime before legacy DOM helpers', () => {
    const stateBody = sliceFunction(timelineSource, 'applyStateToDom');
    const eventBody = sliceFunction(timelineSource, 'applyEvent');

    assert.ok(stateBody.indexOf('updateTimelineProjectSceneRecord(atomeId, props, projectId)') < stateBody.indexOf('ensureAtomeElement(atomeId, props, projectId)'));
    assert.ok(eventBody.indexOf('updateTimelineProjectSceneRecord(atomeId, cleaned, projectId)') < eventBody.indexOf('ensureAtomeElement(atomeId, cleaned, projectId)'));
});

test('tool genesis delegates project scene routing to a cohesive bridge owner', () => {
    const createBody = sliceFunction(toolGenesisSource, 'createAtomeElement');

    assert.ok(toolGenesisSource.includes("from './project_scene_render_bridge.js'"));
    assert.ok(toolGenesisSource.includes("from './atome_description_frame_runtime.js'"));
    assert.ok(projectBridgeSource.includes('updateProjectSceneRecord({'));
    assert.ok(projectBridgeSource.includes('projectIdFromProjectLayer'));
    assert.ok(projectBridgeSource.includes('isProjectSceneParent'));
    assert.equal(projectBridgeSource.includes('createAtomeElement('), false);
    assert.equal(projectBridgeSource.includes('bindAtomeHost('), false);
    assert.equal(createBody.includes('project_view_'), false);
    assert.equal(createBody.includes('eve-matrix-tile'), false);
});

test('tool genesis delegates media integrity ownership outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './media_integrity_runtime.js'"));
    assert.ok(mediaIntegritySource.includes('createMediaHostIntegrityRuntime'));
    assert.ok(mediaIntegritySource.includes('logMediaIntegrityEvent'));
    assert.ok(mediaIntegritySource.includes('rememberMediaIntegrityKindHint'));
    assert.equal(toolGenesisSource.includes('const mediaIntegrityHistory ='), false);
    assert.equal(toolGenesisSource.includes('const mediaIntegrityKindHintsByAtomeId ='), false);
    assert.equal(toolGenesisSource.includes("Symbol.for('eve.bind.mediaIntegrityObserver')"), false);
});

test('tool genesis delegates shape svg ownership outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './shape_svg_runtime.js'"));
    assert.ok(shapeSvgSource.includes('createShapeSvgRuntime'));
    assert.ok(shapeSvgSource.includes('isSvgShapeSpec'));
    assert.ok(shapeSvgSource.includes('createInlineSvgElement'));
    assert.equal(toolGenesisSource.includes('const SVG_DATA_PREFIX ='), false);
    assert.equal(toolGenesisSource.includes('const decodeSvgDataUrl ='), false);
    assert.equal(toolGenesisSource.includes('const fetchSvgMarkup ='), false);
});

test('tool genesis delegates legacy group visual ownership outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './group_visual_runtime.js'"));
    assert.ok(groupVisualSource.includes('createGroupVisualRuntime'));
    assert.ok(groupVisualSource.includes('renderGroupHostPreview'));
    assert.ok(groupVisualSource.includes('applyGroupMembership'));
    assert.ok(groupVisualSource.includes('refreshGroupVisual'));
    assert.equal(toolGenesisSource.includes('const mediaGroupState ='), false);
    assert.equal(toolGenesisSource.includes('const renderGroupHostPreview ='), false);
    assert.equal(toolGenesisSource.includes('const createGroupPersistedPreviewNode ='), false);
    assert.equal(toolGenesisSource.includes('const createGroupMemberPreviewNode ='), false);
});

test('tool genesis delegates media source resolution outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './media_source_runtime.js'"));
    assert.ok(mediaSourceSource.includes('createMediaSourceRuntime'));
    assert.ok(mediaSourceSource.includes('resolveMediaUrlFromProperties'));
    assert.ok(mediaSourceSource.includes('normalizePersistedTimelineMediaSourcesForOwner'));
    assert.equal(toolGenesisSource.includes('const BUNDLED_MEDIA_ASSET_BY_NAME ='), false);
    assert.equal(toolGenesisSource.includes('const resolveBundledMediaAsset ='), false);
    assert.equal(toolGenesisSource.includes('const normalizePersistedMediaUrlForOwner ='), false);
    assert.equal(
        toolGenesisSource.includes('/api/recordings/') || toolGenesisSource.includes('audio|video)_'),
        false
    );
});

test('media source runtime normalizes bundled upload recording protected and local media cases', () => {
    const runtime = createMediaSourceRuntime({
        isTauriRuntime: () => false,
        getLocalHttpPort: () => 8794
    });

    assert.equal(runtime.resolveMediaUrlFromProperties({ media_url: 'superman.mp4' }), '/assets/videos/superman.mp4');
    assert.equal(runtime.resolveMediaUrlFromProperties({ file_name: 'audio_recording_demo.wav' }), '/api/recordings/audio_recording_demo.wav');
    assert.equal(runtime.resolveMediaUrlFromProperties({ file_name: 'photo.png', owner_id: 'owner_a' }), '/api/uploads/photo.png?media_user_id=owner_a');
    assert.equal(runtime.isProtectedMediaUrl('/api/uploads/photo.png'), true);
    assert.equal(runtime.shouldHydrateProtectedMedia({ recordingId: 'audio_recording_demo.wav' }), true);
    assert.equal(runtime.shouldAttemptIdentifierHydration({ src: 'clip.mp4' }), true);

    const tauriRuntime = createMediaSourceRuntime({
        isTauriRuntime: () => true,
        getLocalHttpPort: () => 8794
    });
    assert.equal(tauriRuntime.resolveMediaSrc('/file/local.wav'), 'http://127.0.0.1:8794/file/local.wav');
    assert.equal(tauriRuntime.resolveProtectedMediaFetchCredentials('http://127.0.0.1:8794/api/uploads/photo.png'), 'omit');
});
