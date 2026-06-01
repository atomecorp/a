import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    assertCanonicalPropertyKey,
    formatCanonicalAtome,
    getAtomeType,
    listAtomeTypes,
    normalizeCanonicalAtome,
    registerAtomeType,
    sanitizeAtomeEnvelope,
    sanitizeAtomeProperties,
    toolToUniversalAtome
} from './atome_contract.js';

test('sanitizeAtomeProperties removes reserved envelope fields', () => {
    assert.deepEqual(
        sanitizeAtomeProperties({
            id: 'shape_a',
            type: 'shape',
            owner_id: 'user_a',
            media_type: 'video',
            visualType: 'poster',
            selected: true,
            selection: ['shape_a'],
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

test('sanitizeAtomeEnvelope moves ownership fields into meta for universal boundaries', () => {
    assert.deepEqual(
        sanitizeAtomeEnvelope({
            id: 'agent_a',
            type: 'agent.assistant',
            owner_id: 'user_a',
            parent_id: 'project_a',
            properties: {
                owner_id: 'wrong_place',
                prompt: 'hello'
            },
            stray_runtime_value: 42
        }, {
            universal: true
        }),
        {
            envelope: {
                id: 'agent_a',
                type: 'agent.assistant',
                properties: {
                    owner_id: 'wrong_place',
                    prompt: 'hello'
                }
            },
            meta: {
                owner_id: 'user_a',
                parent_id: 'project_a'
            },
            properties: {
                owner_id: 'wrong_place',
                prompt: 'hello'
            },
            quarantined: {
                stray_runtime_value: 42
            },
            dropped: []
        }
    );
});

test('normalizeCanonicalAtome produces a universal Atome envelope with safe defaults', () => {
    assert.deepEqual(
        normalizeCanonicalAtome({
            id: 'workflow_a',
            type: 'workflow.media_export',
            kind: 'workflow',
            renderer: 'headless',
            owner_id: 'user_a',
            project_id: 'project_a',
            properties: {
                owner_id: 'must_drop',
                preset: '1080p'
            },
            composition: {
                dependencies: [{ id: 'api_a', type: 'api.storage', required: true }],
                ports: [{ key: 'source', direction: 'input', schema: {}, required: true }]
            },
            policy: {
                visibility: 'group',
                permissions: ['execute']
            },
            capabilities: [{
                key: 'workflow.run',
                effects: ['read', 'execution'],
                risk_level: 'MEDIUM'
            }]
        }, {
            universal: true
        }).atome,
        {
            id: 'workflow_a',
            type: 'workflow.media_export',
            kind: 'workflow',
            renderer: 'headless',
            meta: {
                name: null,
                description: null,
                created_at: null,
                created_by: null,
                updated_at: null,
                updated_by: null,
                owner_id: 'user_a',
                parent_id: null,
                project_id: 'project_a',
                status: 'draft'
            },
            traits: [],
            properties: {
                preset: '1080p'
            },
            schema_version: 1,
            capabilities: [{
                key: 'workflow.run',
                description: null,
                inputs_schema: {},
                outputs_schema: {},
                effects: ['read', 'execution'],
                risk_level: 'MEDIUM',
                permissions: []
            }],
            interfaces: {
                inputs: {},
                outputs: {},
                events: {},
                commands: {}
            },
            composition: {
                dependencies: [{ id: 'api_a', type: 'api.storage', required: true }],
                children: [],
                ports: [{ key: 'source', direction: 'input', schema: {}, required: true }],
                compatible_with: []
            },
            policy: {
                permissions: ['execute'],
                visibility: 'group',
                license: null,
                pricing: null,
                entitlements: []
            },
            lifecycle: {
                version: '1.0.0',
                migrations: [],
                compatibility: {},
                deprecation: null,
                archived_at: null
            }
        }
    );
});

test('registerAtomeType applies schemas traits capabilities and policy to universal Atomes', () => {
    const definition = registerAtomeType({
        type: 'api.calendar',
        kind: 'api',
        schema: {
            endpoint: { type: 'string' }
        },
        allow_unknown_properties: false,
        default_traits: ['networked', 'inspectable'],
        default_capabilities: [{
            key: 'api.call',
            effects: ['network'],
            risk_level: 'HIGH'
        }],
        default_policy: {
            visibility: 'private',
            permissions: ['api.execute']
        }
    });
    assert.equal(getAtomeType('api.calendar'), definition);
    assert.ok(listAtomeTypes().some((entry) => entry.type === 'api.calendar'));
    const normalized = normalizeCanonicalAtome({
        id: 'calendar_a',
        type: 'api.calendar',
        properties: {
            endpoint: '/calendar'
        }
    }, {
        universal: true
    }).atome;
    assert.equal(normalized.kind, 'api');
    assert.deepEqual(normalized.traits, ['networked', 'inspectable']);
    assert.deepEqual(normalized.capabilities.map((entry) => entry.key), ['api.call']);
    assert.deepEqual(normalized.policy.permissions, ['api.execute']);
    assert.throws(
        () => normalizeCanonicalAtome({
            id: 'calendar_b',
            type: 'api.calendar',
            properties: {
                endpoint: '/calendar',
                leaked: true
            }
        }, {
            universal: true
        }),
        /Unknown Atome property/
    );
});

test('toolToUniversalAtome projects an existing tool contract without polluting properties', () => {
    const atome = toolToUniversalAtome({
        id: 'tool_code',
        tool_key: 'code_editor',
        name: 'Code',
        capabilities: ['ui.read', { key: 'code.edit', effects: ['write'], risk_level: 'MEDIUM' }],
        bindings: {
            run: { input: 'selection' }
        }
    });
    assert.equal(atome.kind, 'tool');
    assert.equal(atome.type, 'tool.code_editor');
    assert.deepEqual(atome.capabilities.map((entry) => entry.key), ['ui.read', 'code.edit']);
    assert.deepEqual(atome.interfaces.commands, { run: { input: 'selection' } });
    assert.equal(Object.hasOwn(atome.properties, 'id'), false);
    assert.equal(Object.hasOwn(atome.properties, 'tool_definition'), true);
});
