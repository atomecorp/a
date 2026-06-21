import { registerAtomeType } from './atome_universal_contract.js';

export const CORE_ATOME_TYPE_VERSION = 1;

const orderSchema = Object.freeze({
    order: { type: 'number' },
    z_index: { type: 'number' },
    visual_order: { type: 'number' },
    semantic_order: { type: 'number' },
    focus_order: { type: 'number' },
    label: { type: 'string' },
    accessibility: { type: 'object' }
});

const frameSchema = Object.freeze({
    left: { type: 'number' },
    top: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' }
});

const mediaSchema = Object.freeze({
    media_source: { type: 'string' },
    media_url: { type: 'string' },
    transcript: { type: 'string' },
    duration: { type: 'number' }
});

const capability = (key, effects = ['read']) => ({
    key,
    effects,
    risk_level: effects.includes('write') || effects.includes('persistent') ? 'MEDIUM' : 'LOW'
});

const defineType = (definition) => Object.freeze({
    version: CORE_ATOME_TYPE_VERSION,
    allow_unknown_properties: false,
    default_policy: { visibility: 'private' },
    default_capabilities: [
        capability(`${definition.type}.read`),
        capability(`${definition.type}.write`, ['read', 'write', 'persistent'])
    ],
    ...definition,
    schema: Object.freeze({ ...definition.schema })
});

export const CORE_ATOME_TYPE_DEFINITIONS = Object.freeze([
    defineType({
        type: 'project',
        kind: 'project',
        traits: ['container', 'root', 'navigable'],
        schema: {
            ...orderSchema,
            title: { type: 'string' },
            description: { type: 'string' }
        }
    }),
    defineType({
        type: 'group',
        kind: 'component',
        traits: ['container', 'navigable', 'composite'],
        schema: {
            ...orderSchema,
            ...frameSchema,
            label: { type: 'string' },
            children: { type: 'array' }
        }
    }),
    defineType({
        type: 'text',
        kind: 'visual',
        traits: ['visual', 'textual', 'editable', 'selectable'],
        schema: {
            ...orderSchema,
            ...frameSchema,
            text: { type: 'string' },
            rich_text: { type: 'object' },
            text_style: { type: 'object' }
        }
    }),
    defineType({
        type: 'shape',
        kind: 'visual',
        traits: ['visual', 'spatial2d', 'selectable'],
        schema: {
            ...orderSchema,
            ...frameSchema,
            shape: { type: 'string' },
            fill: { type: 'color' },
            stroke: { type: 'color' },
            material: { type: 'object' }
        }
    }),
    defineType({
        type: 'image',
        kind: 'media',
        traits: ['visual', 'media', 'raster', 'selectable'],
        schema: {
            ...orderSchema,
            ...frameSchema,
            ...mediaSchema,
            alt_text: { type: 'string' },
            poster_source: { type: 'string' }
        }
    }),
    defineType({
        type: 'video',
        kind: 'media',
        traits: ['visual', 'media', 'time_based', 'selectable'],
        schema: {
            ...orderSchema,
            ...frameSchema,
            ...mediaSchema,
            poster_source: { type: 'string' },
            captions: { type: 'array' }
        }
    }),
    defineType({
        type: 'audio',
        kind: 'media',
        traits: ['media', 'time_based', 'audible', 'selectable'],
        schema: {
            ...orderSchema,
            ...mediaSchema,
            waveform_peaks: { type: 'array' }
        }
    }),
    defineType({
        type: 'audio_waveform',
        kind: 'media',
        traits: ['visual', 'media', 'waveform', 'time_based', 'selectable'],
        schema: {
            ...orderSchema,
            ...frameSchema,
            ...mediaSchema,
            waveform_peaks: { type: 'array' },
            peaks: { type: 'array' }
        }
    }),
    defineType({
        type: 'waveform',
        kind: 'media',
        traits: ['visual', 'media', 'waveform', 'time_based', 'selectable'],
        schema: {
            ...orderSchema,
            ...frameSchema,
            ...mediaSchema,
            waveform_peaks: { type: 'array' },
            peaks: { type: 'array' }
        }
    }),
    defineType({
        type: 'tool_instance',
        kind: 'tool',
        traits: ['tool', 'executable', 'configurable'],
        schema: {
            ...orderSchema,
            ...frameSchema,
            tool_id: { type: 'string' },
            tool_key: { type: 'string' },
            state: { type: 'object' },
            parameters: { type: 'object' }
        }
    }),
    defineType({
        type: 'record',
        kind: 'data',
        traits: ['data', 'editable', 'navigable'],
        schema: {
            ...orderSchema,
            title: { type: 'string' },
            title_key: { type: 'string' },
            label_key: { type: 'string' },
            preview: { type: 'string' },
            description: { type: 'string' },
            category_id: { type: 'string' },
            source_domain: { type: 'string' },
            metadata: { type: 'object' },
            payload: { type: 'object' },
            created_iso: { type: 'string' },
            updated_iso: { type: 'string' },
            span: { type: 'number' }
        }
    })
]);

export const CORE_ATOME_TYPE_IDS = Object.freeze(
    CORE_ATOME_TYPE_DEFINITIONS.map((definition) => definition.type)
);

export function listCoreAtomeTypeDefinitions() {
    return CORE_ATOME_TYPE_DEFINITIONS.map((definition) => ({
        ...definition,
        schema: { ...definition.schema },
        traits: definition.traits.slice(),
        default_capabilities: definition.default_capabilities.map((entry) => ({ ...entry })),
        default_policy: { ...definition.default_policy }
    }));
}

export function registerCoreAtomeTypes() {
    return CORE_ATOME_TYPE_DEFINITIONS.map((definition) => registerAtomeType(definition));
}
