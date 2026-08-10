import assert from 'node:assert/strict';
import fs from 'node:fs';
import { afterEach, test } from 'vitest';

import { normalizeRuntimeToolEntry } from '../../atome/src/squirrel/atome/mcp_runtime.js';
import { createToolRuntimeLeafExecutors } from '../../eVe/intuition/tools/core/tool_runtime_executors.js';
import { buildBootstrapReconciliationPatch } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_reconciliation.js';

const createMoveExecutor = () => createToolRuntimeLeafExecutors({
    DEFAULT_PRESENTATION: {},
    V2_SOURCE_LAYER: 'test',
    normalizeAction: (action) => action,
    normalizeEventFromAction: (action) => action,
    resolveMoveSessionKey: () => 'voice_move_test',
    buildCreatorSpec: () => ({}),
    performSelectionMutation: () => ({ ok: true })
}).executeMove;

afterEach(() => {
    delete globalThis.window;
});

test('move.relative adds exactly 300 px to left, preserves top, and commits once', async () => {
    const commits = [];
    globalThis.window = {
        Atome: {
            getStateCurrent: async () => ({
                id: 'text_hello',
                project_id: 'project_voice',
                properties: { left: '120px', top: '80px', text: 'hello' }
            }),
            commit: async (...args) => { commits.push(args); return { ok: true }; }
        }
    };

    const result = await createMoveExecutor()({ id: 'ui.move' }, {
        action: 'move.relative',
        input: { atome_id: 'text_hello', delta_x: 300, delta_y: 0 }
    });

    assert.equal(result.ok, true);
    assert.equal(result.left, 420);
    assert.equal(result.top, 80);
    assert.equal(commits.length, 1);
    assert.deepEqual(commits[0][0], {
        kind: 'set',
        atome_id: 'text_hello',
        project_id: 'project_voice',
        props: { left: '420px', top: '80px' }
    });
    assert.deepEqual(commits[0][1], { refreshState: false });
});

test('move.relative never mutates an absent, locked, or numerically invalid target', async () => {
    const commits = [];
    let currentState = null;
    globalThis.window = {
        Atome: {
            getStateCurrent: async () => currentState,
            commit: async (...args) => { commits.push(args); return { ok: true }; }
        }
    };
    const executeMove = createMoveExecutor();
    const invoke = (input) => executeMove({ id: 'ui.move' }, { action: 'move.relative', input });

    assert.equal((await invoke({ atome_id: 'missing', delta_x: 300, delta_y: 0 })).error, 'target_not_found');
    currentState = { properties: { left: 12, top: 8, locked: true } };
    assert.equal((await invoke({ atome_id: 'locked', delta_x: 300, delta_y: 0 })).error, 'target_locked');
    currentState = { properties: { left: 12, top: 8 } };
    assert.equal((await invoke({ atome_id: 'invalid', delta_x: 'not-a-number', delta_y: 0 })).error, 'move_relative_delta_invalid');
    assert.equal(commits.length, 0);
});

test('ui.move exposes the relative action schema and reconciles an old persisted contract', () => {
    const definitions = fs.readFileSync('eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js', 'utf8');
    assert.match(definitions, /tool_id: 'ui\.move'/);
    assert.match(definitions, /actions: \['drag\.start', 'drag\.frame', 'drag\.end', 'move\.relative'\]/);
    assert.match(definitions, /delta_x: \{ type: 'number'/);
    assert.match(definitions, /required: \['atome_id', 'delta_x', 'delta_y'\]/);

    const exposed = normalizeRuntimeToolEntry({
        id: 'ui.move',
        meta: { description: 'Move one canonical Atome.' },
        behavior: { actions: ['drag.start', 'drag.frame', 'drag.end', 'move.relative'] },
        input_schema: {
            type: 'object',
            properties: { atome_id: { type: 'string' }, delta_x: { type: 'number' }, delta_y: { type: 'number' } },
            required: ['atome_id', 'delta_x', 'delta_y']
        }
    });
    assert.ok(exposed.actions.includes('move.relative'));
    assert.deepEqual(exposed.parameters.required, ['atome_id', 'delta_x', 'delta_y']);

    const resolveMode = (tool) => tool?.runtime?.execution_mode || tool?.execution_mode || '';
    const patch = buildBootstrapReconciliationPatch({
        runtime: { execution_mode: 'v2_move' },
        behavior: { actions: ['drag.start', 'drag.frame', 'drag.end'] },
        meta: { name: 'Move', description: 'Old contract.' }
    }, {
        execution_mode: 'v2_move',
        visibility: 'visible',
        behavior: { actions: ['drag.start', 'drag.frame', 'drag.end', 'move.relative'] },
        input_schema: {
            type: 'object',
            properties: { atome_id: { type: 'string' }, delta_x: { type: 'number' }, delta_y: { type: 'number' } },
            required: ['atome_id', 'delta_x', 'delta_y']
        },
        ui: { label_fallback: 'Move' },
        meta: { description: 'Move one canonical Atome.' }
    }, resolveMode);

    assert.ok(patch);
    assert.ok(patch.behavior.actions.includes('move.relative'));
    assert.deepEqual(patch.input_schema.required, ['atome_id', 'delta_x', 'delta_y']);
    assert.equal(patch.meta.description, 'Move one canonical Atome.');
});
