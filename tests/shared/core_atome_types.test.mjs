import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORE_ATOME_TYPE_IDS,
    listCoreAtomeTypeDefinitions,
    registerCoreAtomeTypes
} from '../../atome/shared/core_atome_types.js';
import {
    getAtomeType,
    listAtomeTypes,
    normalizeCanonicalAtome
} from '../../atome/shared/atome_contract.js';

test('core Atome type definitions cover required framework types', () => {
    [
        'text',
        'shape',
        'image',
        'video',
        'audio',
        'audio_waveform',
        'waveform',
        'group',
        'project',
        'tool_instance'
    ].forEach((type) => {
        assert.equal(CORE_ATOME_TYPE_IDS.includes(type), true, `${type} must be defined`);
    });
});

test('registerCoreAtomeTypes populates the shared type registry idempotently', () => {
    const first = registerCoreAtomeTypes();
    const second = registerCoreAtomeTypes();

    assert.equal(first.length, CORE_ATOME_TYPE_IDS.length);
    assert.equal(second.length, CORE_ATOME_TYPE_IDS.length);
    assert.equal(getAtomeType('text').type, 'text');
    assert.equal(getAtomeType('audio_waveform').traits.includes('waveform'), true);
    assert.equal(getAtomeType('record').kind, 'data_model');
    const registeredCoreIds = listAtomeTypes()
        .filter((definition) => CORE_ATOME_TYPE_IDS.includes(definition.type))
        .map((definition) => definition.type)
        .sort();
    assert.deepEqual(registeredCoreIds, CORE_ATOME_TYPE_IDS.slice().sort());
});

test('core type definitions keep strict schemas and universal metadata', () => {
    registerCoreAtomeTypes();
    const normalized = normalizeCanonicalAtome({
        id: 'text_a',
        type: 'text',
        renderer: 'webgpu',
        properties: {
            label: 'Scene title',
            text: 'Title',
            left: 12,
            top: 24,
            width: 240,
            height: 36,
            accessibility: { label: 'Title' }
        }
    }, {
        universal: true
    }).atome;

    assert.equal(normalized.kind, 'visual');
    assert.equal(normalized.renderer, 'webgpu');
    assert.equal(normalized.traits.includes('editable'), true);
    assert.equal(normalized.properties.label, 'Scene title');
    assert.equal(normalized.properties.text, 'Title');
    assert.equal(normalized.schema_version, 1);
    assert.equal(normalized.capabilities.some((capability) => capability.key === 'text.write'), true);
});

test('core type schemas reject renderer-local or unknown properties', () => {
    registerCoreAtomeTypes();

    assert.throws(
        () => normalizeCanonicalAtome({
            id: 'shape_a',
            type: 'shape',
            properties: {
                width: 100,
                height: 100,
                dom_width: 100
            }
        }),
        /Unknown Atome property/
    );
});

test('core definitions are listed without exposing mutable registry entries', () => {
    const definitions = listCoreAtomeTypeDefinitions();
    const text = definitions.find((definition) => definition.type === 'text');

    text.schema.text = { type: 'number' };
    assert.equal(
        listCoreAtomeTypeDefinitions().find((definition) => definition.type === 'text').schema.text.type,
        'string'
    );
});
