import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    assertCanonicalPropertyKey,
    formatCanonicalAtome,
    normalizeCanonicalAtome,
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

test('normalizeCanonicalAtome rejects boundary aliases outside adapter mode', () => {
    assert.throws(
        () => normalizeCanonicalAtome({
            atome_id: 'shape_a',
            atome_type: 'shape',
            properties: { left: '10px' }
        }),
        /Transitional Atome aliases are only accepted at adapter boundaries/
    );
});

test('normalizeCanonicalAtome accepts aliases only at adapter boundary and emits canonical envelope', () => {
    assert.deepEqual(
        normalizeCanonicalAtome({
            atome_id: 'shape_a',
            atome_type: 'shape',
            renderer: 'dom',
            particles: {
                left: '10px',
                type: 'wrong_type'
            }
        }, {
            boundaryAdapter: true
        }),
        {
            atome: {
                id: 'shape_a',
                type: 'shape',
                kind: null,
                renderer: 'dom',
                meta: {},
                traits: [],
                properties: {
                    left: '10px'
                }
            },
            quarantined: {},
            dropped: ['type']
        }
    );
});

test('normalizeCanonicalAtome enforces immutable id when expected id is supplied', () => {
    assert.throws(
        () => normalizeCanonicalAtome({
            id: 'shape_b',
            type: 'shape',
            properties: {}
        }, {
            expectedId: 'shape_a'
        }),
        /Atome id is immutable/
    );
});

test('normalizeCanonicalAtome rejects unknown properties when schema does not allow them', () => {
    assert.throws(
        () => normalizeCanonicalAtome({
            id: 'shape_a',
            type: 'shape.rect',
            renderer: 'webgpu',
            properties: {
                left: '10px',
                leaked_dom_width: 42
            }
        }, {
            typeDefinitions: {
                'shape.rect': {
                    schema: {
                        left: { type: 'string' }
                    },
                    allow_unknown_properties: false
                }
            }
        }),
        /Unknown Atome property/
    );
});

test('normalizeCanonicalAtome quarantines unknown properties when requested', () => {
    assert.deepEqual(
        normalizeCanonicalAtome({
            id: 'shape_a',
            type: 'shape.rect',
            renderer: 'webgpu',
            properties: {
                left: '10px',
                leaked_dom_width: 42
            }
        }, {
            unknownPropertyMode: 'quarantine',
            typeDefinitions: {
                'shape.rect': {
                    kind: 'visual',
                    traits: ['spatial2d'],
                    schema: {
                        left: { type: 'string' }
                    },
                    allow_unknown_properties: false
                }
            }
        }),
        {
            atome: {
                id: 'shape_a',
                type: 'shape.rect',
                kind: 'visual',
                renderer: 'webgpu',
                meta: {},
                traits: ['spatial2d'],
                properties: {
                    left: '10px'
                }
            },
            quarantined: {
                leaked_dom_width: 42
            },
            dropped: []
        }
    );
});
