import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createServerConditionAuthority } from '../../server/conditionsQueryAuthority.js';

test('server Conditions authority evaluates projected state and returns only requested fields', async () => {
    const projectedStates = [
        { atome_id: 'shape_1', atome_type: 'shape', properties: { width: 31, color: 'red' } },
        { atome_id: 'shape_2', atome_type: 'shape', properties: { width: 29, color: 'blue' } }
    ];
    const authority = createServerConditionAuthority({
        loadStates: async () => projectedStates,
        readState: async (id) => projectedStates.find((state) => state.atome_id === id) || null
    });
    const result = await authority.once({
        condition: { source: 'atome', field: 'width', operator: 'gt', value: 30 },
        scope: { candidateSource: 'atome', types: ['shape'] },
        projection: ['color']
    });
    assert.deepEqual(result.ids, ['shape_1']);
    assert.deepEqual(result.items, [{
        id: 'shape_1', atome_id: 'shape_1', type: 'shape', properties: { color: 'red' }
    }]);
    assert.equal(Object.hasOwn(result.items[0].properties, 'width'), false);
});

test('private properties absent from server projection stay undiscoverable and evaluate UNKNOWN', async () => {
    const authority = createServerConditionAuthority({
        loadStates: async () => [{ atome_id: 'contact_1', atome_type: 'contact', properties: { name: 'Ada' } }],
        readState: async () => null
    });
    const catalog = await authority.discover({ scope: { candidateSource: 'contact' } });
    assert.equal(catalog.some((entry) => entry.field === 'heart_secret'), false);
    const result = await authority.once({
        condition: { source: 'contact', field: 'heart_secret', valueType: 'number', operator: 'gt', value: 100 },
        scope: { candidateSource: 'contact' }
    });
    assert.deepEqual(result.ids, []);
});
