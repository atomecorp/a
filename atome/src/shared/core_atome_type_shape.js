// The shape every core atome type carries (core_atome_types.js assembles them): its version, its default
// capabilities and policy, and its schema — mix keys for what is seen or heard, life profiles, name and bin trail,
// then what its real writers write (atome_type_written_properties.js), then its own keys. Shared schema fragments.
import { LIFE_PROFILES_PROPERTY_SCHEMA } from './life_profile_contract.js';
import { ATOME_COMMON_PROPERTY_SCHEMA, ATOME_WRITTEN_PROPERTIES } from './atome_type_written_properties.js';

export const CORE_ATOME_TYPE_VERSION = 1;

export const ATOME_ORDER_SCHEMA = Object.freeze({
    order: { type: 'number' },
    z_index: { type: 'number' },
    visual_order: { type: 'number' },
    semantic_order: { type: 'number' },
    focus_order: { type: 'number' },
    label: { type: 'string' },
    accessibility: { type: 'object' }
});


export const ATOME_MIX_PROPERTY_SCHEMA = Object.freeze({
    mute: { type: 'boolean' },
    solo: { type: 'boolean' },
    mute_strength: { type: 'number', minimum: 0, maximum: 1, default: 1 },
    solo_strength: { type: 'number', minimum: 0, maximum: 1, default: 1 }
});


export const ATOME_FRAME_SCHEMA = Object.freeze({
    left: { type: 'number' },
    top: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' }
});


export const ATOME_MEDIA_SCHEMA = Object.freeze({
    media_source: { type: 'string' },
    media_url: { type: 'string' },
    youtube_video_id: { type: 'string' },
    youtube_title: { type: 'string' },
    peertube_video_url: { type: 'string' },
    peertube_title: { type: 'string' },
    transcript: { type: 'string' },
    duration: { type: 'number' },
    duration_sec: { type: 'number' },
    duration_seconds: { type: 'number', minimum: 0 },
    media_duration_seconds: { type: 'number', minimum: 0 },
    source_in_seconds: { type: 'number', minimum: 0 },
    source_out_seconds: { type: 'number', minimum: 0 },
    media_width: { type: 'number', minimum: 1 },
    media_height: { type: 'number', minimum: 1 },
    source_rect: {
        type: 'object',
        properties: {
            x: { type: 'number', minimum: 0 },
            y: { type: 'number', minimum: 0 },
            width: { type: 'number', minimum: 1 },
            height: { type: 'number', minimum: 1 }
        },
        required: ['x', 'y', 'width', 'height']
    }
});

const capability = (key, effects = ['read']) => ({ key, effects,
    risk_level: effects.includes('write') || effects.includes('persistent') ? 'MEDIUM' : 'LOW' });

// Every core type carries the full shape: a type declared without `traits`
// (the personal import types) broke `listCoreAtomeTypeDefinitions`, hence the
// Conditions discovery, hence every Finder list (« Impossible de lire »).
export const defineType = (definition) => Object.freeze({
    version: CORE_ATOME_TYPE_VERSION,
    traits: [],
    allow_unknown_properties: false,
    default_policy: { visibility: 'private' },
    default_capabilities: [
        capability(`${definition.type}.read`),
        capability(`${definition.type}.write`, ['read', 'write', 'persistent'])
    ],
    ...definition,
    schema: Object.freeze({
        ...(definition.traits?.some((trait) => ['visual', 'audible', 'container'].includes(trait)) ? ATOME_MIX_PROPERTY_SCHEMA : {}),
        // Any item may belong to life profiles (life_profile_contract.js), has a name and a bin trail; then what its real writers write.
        ...LIFE_PROFILES_PROPERTY_SCHEMA, ...ATOME_COMMON_PROPERTY_SCHEMA, ...ATOME_WRITTEN_PROPERTIES[definition.type],
        ...definition.schema
    })
});
