import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../../eVe/intuition/runtime/tool_genesis.js', import.meta.url), 'utf8');

const sliceFunction = (name) => {
    const start = source.indexOf(`const ${name} =`);
    assert.notEqual(start, -1, `${name} must exist`);
    const nextDeclaration = source.indexOf('\nconst ', start + 1);
    assert.notEqual(nextDeclaration, -1, `${name} boundary must be explicit`);
    return source.slice(start, nextDeclaration);
};

test('createAtome orchestrates canonical commit before render', () => {
    const body = sliceFunction('createAtome');
    const commitIndex = body.indexOf('commitCreateAtome(unitCommand)');
    const refreshIndex = body.indexOf('refreshCreatedAtomeState(unitCommand.atomeId, commitResult)');
    const renderIndex = body.indexOf('renderCreatedAtome(canonicalState');

    assert.ok(commitIndex > -1, 'createAtome must commit through commitCreateAtome');
    assert.ok(refreshIndex > commitIndex, 'createAtome must refresh canonical state after commit');
    assert.ok(renderIndex > refreshIndex, 'createAtome must render only after state refresh');
    assert.equal(body.includes('createAtomeElement('), false, 'createAtome must not allocate DOM directly');
    assert.equal(body.includes('setRenderedAtomeHost('), false, 'createAtome must not write render caches directly');
    assert.equal(body.includes('document.createElement'), false, 'createAtome must not create DOM before commit');
});

test('createAtome supports no-render canonical creation', () => {
    const commandBody = sliceFunction('buildCreateAtomeCommand');
    const resultBody = sliceFunction('createAtomeResult');

    assert.ok(commandBody.includes('render: options?.render !== false'), 'render:false must be an explicit command option');
    assert.ok(resultBody.includes('canonicalState'), 'result must expose canonicalState');
    assert.ok(resultBody.includes('view: view || null'), 'result must expose nullable view');
    assert.ok(resultBody.includes('committed: true'), 'result must expose commit status');
});

test('renderCreatedAtome is the only createAtome render owner', () => {
    const renderBody = sliceFunction('renderCreatedAtome');

    assert.ok(renderBody.includes('buildSpecFromRecord(canonicalState)'), 'render must start from canonical state');
    assert.ok(renderBody.includes('renderAtomeRecord(canonicalState, layer)'), 'render must delegate to the existing record renderer');
    assert.equal(renderBody.includes('commitCreateAtome'), false, 'render must not commit model state');
});
