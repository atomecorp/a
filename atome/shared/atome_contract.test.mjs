import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    assertCanonicalPropertyKey,
    formatCanonicalAtome,
    sanitizeAtomeProperties
} from './atome_contract.js';

test('sanitizeAtomeProperties removes reserved envelope fields', () => {
    assert.deepEqual(
        sanitizeAtomeProperties({
            id: 'shape_a',
            type: 'shape',
            owner_id: 'user_a',
            left: '10px',
            top: '20px',
            width: '50px'
        }),
        {
            left: '10px',
            top: '20px',
            width: '50px'
        }
    );
});

test('assertCanonicalPropertyKey rejects reserved envelope fields', () => {
    assert.throws(
        () => assertCanonicalPropertyKey('atome_id'),
        /Reserved Atome envelope field/
    );
});

test('formatCanonicalAtome returns the canonical Atome envelope only', () => {
    assert.deepEqual(
        formatCanonicalAtome({
            atome_id: 'shape_a',
            atome_type: 'shape',
            properties: {
                type: 'shadow_type',
                left: '10px'
            }
        }),
        {
            id: 'shape_a',
            type: 'shape',
            kind: null,
            renderer: null,
            meta: {},
            traits: [],
            properties: {
                left: '10px'
            }
        }
    );
});
