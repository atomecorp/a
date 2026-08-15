import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMcpConditionHandlers } from '../../../../../atome/src/squirrel/atome/mcp_handlers_conditions.js';
import { resolveAccessPolicy } from '../../../../../atome/src/squirrel/atome/mcp_security_policy.js';

test('MCP Conditions exposes the shared evaluator without a parallel engine', async () => {
    const handlers = createMcpConditionHandlers();
    const decision = await handlers['conditions.evaluate']({
        condition: { source: 'actor', field: 'id', operator: 'eq', value: 'member' },
        context: { actor: { id: 'member' } },
        domain: 'acl'
    });
    assert.equal(decision.matched, true);
    assert.equal(typeof handlers['conditions.sets.save'], 'function');
    assert.equal(typeof handlers['conditions.bindings.evaluate'], 'function');
    assert.equal(typeof handlers['conditions.properties.discover'], 'function');
    assert.equal(typeof handlers['conditions.query.once'], 'function');
    assert.equal(typeof handlers['conditions.computed.save'], 'function');
    assert.equal(typeof handlers['conditions.lists.resolve'], 'function');
});

test('MCP Conditions reads and writes retain capability and confirmation policy', () => {
    const read = resolveAccessPolicy('conditions.sets.get', {});
    assert.deepEqual(read.required_capabilities, ['conditions.read']);
    assert.equal(read.confirmation_required, false);

    const write = resolveAccessPolicy('conditions.bindings.attach', {});
    assert.deepEqual(write.required_capabilities, ['conditions.write']);
    assert.equal(write.confirmation_required, true);
    assert.equal(write.proposal_required, true);
    assert.equal(write.sensitive, true);
    assert.equal(write.idempotent, true);

    const query = resolveAccessPolicy('conditions.query.once', {});
    assert.deepEqual(query.required_capabilities, ['conditions.read']);
    assert.equal(query.confirmation_required, false);

    const computedWrite = resolveAccessPolicy('conditions.computed.save', {});
    assert.deepEqual(computedWrite.required_capabilities, ['conditions.write']);
    assert.equal(computedWrite.confirmation_required, true);
});
