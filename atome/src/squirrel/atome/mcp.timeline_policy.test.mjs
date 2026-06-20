import assert from 'node:assert/strict';

import {
    listAclRules,
    resolveAccessPolicy
} from './mcp_security_policy.js';

const aiRead = resolveAccessPolicy('ai.tools.call', {
    tool_name: 'eve.timeline.read'
});
assert.equal(aiRead.subject, 'eve.timeline.read');
assert.deepEqual(aiRead.required_capabilities, ['timeline.read']);
assert.equal(aiRead.idempotent, false);

const aiSplit = resolveAccessPolicy('ai.tools.call', {
    tool_name: 'eve.timeline.clip.split'
});
assert.equal(aiSplit.subject, 'eve.timeline.clip.split');
assert.deepEqual(aiSplit.required_capabilities, ['timeline.write']);
assert.equal(aiSplit.idempotent, true);

const runtimePaste = resolveAccessPolicy('runtime.tools.call', {
    tool_id: 'ui.timeline.clip.paste'
});
assert.equal(runtimePaste.subject, 'runtime.tools.call:ui.timeline.clip.paste');
assert.deepEqual(runtimePaste.required_capabilities, ['timeline.write']);
assert.equal(runtimePaste.idempotent, true);

const runtimeRead = resolveAccessPolicy('runtime.tools.call', {
    tool_id: 'ui.timeline.read'
});
assert.equal(runtimeRead.subject, 'runtime.tools.call:ui.timeline.read');
assert.deepEqual(runtimeRead.required_capabilities, ['timeline.read']);
assert.equal(runtimeRead.idempotent, false);

const genericAi = resolveAccessPolicy('ai.tools.call', {
    tool_name: 'mail.list'
});
assert.deepEqual(genericAi.required_capabilities, ['ai.execute']);

const rules = listAclRules().tools;
assert.equal(rules.some((entry) => entry.subject === 'eve.timeline.*'), true);
assert.equal(rules.some((entry) => entry.subject === 'ui.timeline.*'), true);

console.log('mcp.timeline_policy.test: PASS');
