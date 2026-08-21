import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const toolGenesisSource = await readFile(new URL('../../eVe/intuition/runtime/tool_genesis.js', import.meta.url), 'utf8');
const createRuntimeSource = await readFile(new URL('../../eVe/intuition/runtime/tool_genesis_create_runtime.js', import.meta.url), 'utf8');
const projectionSupportSource = await readFile(new URL('../../eVe/intuition/runtime/tool_genesis_projection_support_runtime.js', import.meta.url), 'utf8');
const renderStateRuntimeSource = await readFile(new URL('../../eVe/intuition/runtime/tool_genesis_render_state_runtime.js', import.meta.url), 'utf8');

const sliceFunction = (source, name) => {
    const directMarker = `const ${name} =`;
    const factoryMarker = `    const ${name} =`;
    const start = source.indexOf(directMarker) >= 0
        ? source.indexOf(directMarker)
        : source.indexOf(factoryMarker);
    assert.notEqual(start, -1, `${name} must exist`);
    const directNext = source.indexOf('\nconst ', start + 1);
    const factoryNext = source.indexOf('\n    const ', start + 1);
    const factoryReturn = source.indexOf('\n\n    return {', start + 1);
    const nextDeclaration = directNext >= 0
        ? directNext
        : (factoryNext >= 0 ? factoryNext : factoryReturn);
    assert.notEqual(nextDeclaration, -1, `${name} boundary must be explicit`);
    return source.slice(start, nextDeclaration);
};

test('createAtome orchestrates canonical commit before render', () => {
    const body = sliceFunction(createRuntimeSource, 'createAtome');
    const commitIndex = body.indexOf('commitCreateAtome(unitCommand)');
    const refreshIndex = body.indexOf('refreshCreatedAtomeState(unitCommand.atomeId, commitResult)');
    const renderIndex = body.indexOf('await renderCreatedAtome(canonicalState');

    assert.ok(commitIndex > -1, 'createAtome must commit through commitCreateAtome');
    assert.ok(refreshIndex > commitIndex, 'createAtome must refresh canonical state after commit');
    assert.ok(renderIndex > refreshIndex, 'createAtome must await render only after state refresh');
    assert.equal(body.includes('createAtomeElement('), false, 'createAtome must not allocate DOM directly');
    assert.equal(body.includes('setRenderedAtomeHost('), false, 'createAtome must not write render caches directly');
    assert.equal(body.includes('document.createElement'), false, 'createAtome must not create DOM before commit');
});

test('createAtome supports no-render canonical creation', () => {
    const commandBody = sliceFunction(createRuntimeSource, 'buildCreateAtomeCommand');
    const resultBody = sliceFunction(createRuntimeSource, 'createAtomeResult');

    assert.ok(commandBody.includes('render: options?.render !== false'), 'render:false must be an explicit command option');
    assert.ok(resultBody.includes('canonicalState'), 'result must expose canonicalState');
    assert.ok(resultBody.includes('view: view || null'), 'result must expose nullable view');
    assert.ok(resultBody.includes('committed: true'), 'result must expose commit status');
});

test('renderCreatedAtome is the only createAtome render owner', () => {
    const renderBody = sliceFunction(createRuntimeSource, 'renderCreatedAtome');

    assert.ok(renderBody.includes('buildSpecFromRecord(canonicalState)'), 'render must start from canonical state');
    assert.ok(renderBody.includes('renderAtomeRecord(canonicalState, layer)'), 'render must delegate to the unified record renderer');
    assert.equal(renderBody.includes('commitCreateAtome'), false, 'render must not commit model state');
});

test('project visual rendering delegates to the scene runtime', () => {
    const body = sliceFunction(renderStateRuntimeSource, 'renderAtomeRecord');

    assert.ok(body.includes('isProjectSceneParent(parent)'), 'project parents must be detected before DOM host rendering');
    assert.ok(body.includes('renderProjectSceneRecord(record, parent, spec)'), 'project visual records must enter the scene runtime');
    assert.ok(body.indexOf('renderProjectSceneRecord(record, parent, spec)') < body.indexOf('createAtomeElement(spec, spec.id, parent)'), 'project scene routing must happen before legacy host creation');
});

test('project-root children resolve to the project scene layer', () => {
    const helperBody = sliceFunction(projectionSupportSource, 'isProjectRootParentId');
    const renderBody = sliceFunction(createRuntimeSource, 'renderCreatedAtome');
    const realtimeBody = sliceFunction(renderStateRuntimeSource, 'resolveRecordProjectStatus');

    assert.ok(toolGenesisSource.includes("from './tool_genesis_projection_support_runtime.js'"));
    assert.ok(helperBody.includes('parentKey === projectKey'), 'project root parent detection must compare normalized ids');
    assert.ok(renderBody.includes('!isProjectRootParentId(spec.parentId, projectId)'), 'created project-root children must not mount under legacy project hosts');
    assert.ok(realtimeBody.includes('!isProjectRootParentId(info.parentId, projectId)'), 'realtime project-root children must not mount under legacy project hosts');
});
