import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAdolePermissionApi } from '../../../../../database/adole_permissions.js';
import {
    evaluatePermissionConditions,
    normalizePermissionConditions
} from '../../../../../atome/src/squirrel/conditions/permission_adapter.js';

test('legacy permission conditions migrate to the versioned shared schema', () => {
    assert.deepEqual(normalizePermissionConditions({
        all: [
            { user: { role: 'editor' } },
            { field: 'atome.color', op: 'ne', value: 'blue' }
        ]
    }), {
        schemaVersion: 1,
        root: {
            combinator: 'and',
            children: [
                { source: 'user', field: 'role', operator: 'eq', value: 'editor' },
                { source: 'atome', field: 'color', operator: 'neq', value: 'blue' }
            ]
        }
    });
});

test('permission conditions fail closed for malformed and unsupported nodes', async () => {
    const malformed = await evaluatePermissionConditions('{broken', {});
    assert.equal(malformed.matched, false);
    assert.equal(malformed.decision, 'deny');
    const unsupported = await evaluatePermissionConditions({ unsupported_rule: true }, {});
    assert.equal(unsupported.matched, false);
    assert.equal(unsupported.decision, 'deny');
    const unknownSource = await evaluatePermissionConditions({
        schemaVersion: 1,
        root: { source: 'secret', field: 'value', operator: 'eq', value: true }
    }, { secret: { value: true } });
    assert.equal(unknownSource.matched, false);
});

test('ADOLE permission decisions use the shared evaluator and deny unavailable values', async () => {
    let permission = {
        flag: 1,
        expires_at: null,
        conditions: JSON.stringify({
            schemaVersion: 1,
            root: { source: 'user', field: 'role', operator: 'eq', value: 'editor' }
        })
    };
    const api = createAdolePermissionApi({
        query: async (method) => method === 'get' ? permission : null,
        getEffectiveOwnerId: async () => 'owner',
        getAtome: async (id) => id === 'reader'
            ? { properties: { role: 'viewer' } }
            : { properties: { color: 'red' } }
    });
    assert.equal(await api.canRead('shape', 'reader', 'color'), false);
    permission = { ...permission, conditions: JSON.stringify({ schemaVersion: 1, invalid: true }) };
    assert.equal(await api.canRead('shape', 'reader', 'color'), false);
    permission = { ...permission, conditions: null };
    assert.equal(await api.canRead('shape', 'reader', 'color'), true);
});

