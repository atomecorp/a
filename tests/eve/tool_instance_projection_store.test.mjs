import assert from 'node:assert/strict';

import { ToolProjectionStoreV2 } from '../../eVe/intuition/tools/core/tool_instances.js';

const store = new ToolProjectionStoreV2();

const instance = store.createInstance({
    tool_key: 'ui.code.editor',
    context: {
        type: 'project',
        id: 'project_alpha'
    },
    ui: {
        left: 10,
        top: 20
    },
    meta: {
        source: 'finder_drop'
    }
}, { actor: 'test' });

assert.equal(instance.type, 'tool_instance');
assert.equal(instance.tool_key, 'ui.code.editor');
assert.equal(instance.ui.left, 10);
assert.equal(instance.ui.top, 20);

const updated = store.updateInstanceUi(instance.id, {
    left: 42,
    top: 64
}, { actor: 'test_move' });

assert.equal(updated.type, 'tool_instance');
assert.equal(updated.ui.left, 42);
assert.equal(updated.ui.top, 64);

const listed = store.listInstances({
    contextType: 'project',
    contextId: 'project_alpha',
    toolKey: 'ui.code.editor'
});

assert.equal(listed.length, 1);
assert.equal(listed[0].id, instance.id);
assert.equal(listed[0].ui.left, 42);
assert.equal(listed[0].ui.top, 64);

assert.equal(store.removeInstance(instance.id), true);
assert.equal(store.listInstances({ toolKey: 'ui.code.editor' }).length, 0);

console.log('tool_instance_projection_store.test: PASS');
