// The core data-model types: conversations, calendar events, records, MIDI bindings, interactions and the
// Conditions engine's sets, bindings, computed properties and lists. Assembled by core_atome_types.js.
import { defineType, ATOME_ORDER_SCHEMA } from './core_atome_type_shape.js';
import { CALENDAR_IMPORT_FIELDS } from './personal_import_types.js';
import { PROGRAM_PREFERENCE_SCHEMA, PROGRAM_DATA_PERMISSION_SCHEMA } from './program_collection_contract.js';
import { PROGRAM_SESSION_SCHEMA, PROGRAM_SESSION_TRANSITION_SCHEMA } from './program_session_contract.js';
import { NUTRITION_CONSUMPTION_SCHEMA } from './program_nutrition_contract.js';
import { HEALTH_DECLARATION_SCHEMA } from './health_declaration_contract.js';
import { HEALTH_FEELING_SCHEMA } from './health_feeling_contract.js';
import { ACTIVITY_IMPORT_SCHEMA } from './activity_import_contract.js';
import { PROGRAM_ACTIVITY_RECORD_SCHEMAS } from './program_activity_contract.js';
import { DASHBOARD_UNLOCK_SCHEMA } from './dashboard_progression_contract.js';

export const ATOME_MATRIX_NAVIGATION_SCHEMA = Object.freeze({
    type: 'object', required: ['version', 'project_id', 'path', 'views'], properties: {
        version: { type: 'number', enum: [1] }, project_id: { type: 'string' },
        path: { type: 'array', maxItems: 64, items: { type: 'string' } },
        views: { type: 'array', maxItems: 256, items: { type: 'object',
            required: ['level_id', 'selected_ids', 'scroll_y'], properties: {
                level_id: { type: 'string' }, selected_ids: { type: 'array', maxItems: 256, items: { type: 'string' } },
                scroll_y: { type: 'number', minimum: 0 }
            }
        } }
    }
});

export const CORE_DATA_ATOME_TYPES = Object.freeze([
    defineType({
        type: 'conversation',
        kind: 'data_model',
        traits: ['data', 'textual', 'editable', 'navigable', 'nonvisual'],
        schema: {
            ...ATOME_ORDER_SCHEMA,
            title: { type: 'string' },
            category_id: { type: 'string' },
            transcript: { type: 'string' },
            model: { type: 'string' },
            level: { type: 'number' },
            effort: { type: 'string' },
            turns: { type: 'array' },
            assets: { type: 'array' },
            updated_iso: { type: 'string' }
        }
    }),
    defineType({
        type: 'calendar_event', kind: 'data_model', traits: ['data', 'editable', 'navigable'],
        schema: {
            ...CALENDAR_IMPORT_FIELDS,
            title: { type: 'string' }, description: { type: 'string' }, location: { type: 'string' },
            start: { type: 'string' }, end: { type: 'string' }, all_day: { type: 'boolean' },
            calendar_id: { type: 'string' }, timezone: { type: 'string' }, color: { type: 'string' },
            alarms: { type: 'string' }, recurrence: { type: 'string' }, conditions: { type: 'string' },
            kind: { type: 'string', enum: ['event', 'todo'] }, status: { type: 'string', enum: ['open', 'done', 'cancelled'] },
            due_at: { type: 'string' }, completed_at: { type: 'string' }, visio_room_id: { type: 'string' },
            created_iso: { type: 'string' }, updated_iso: { type: 'string' },
            program_link: { type: 'object' }, suspended: { type: 'boolean' }, locked: { type: 'boolean' }
        }
    }),
    defineType({
        type: 'record',
        kind: 'data_model',
        traits: ['data', 'editable', 'navigable'],
        schema: {
            ...ATOME_ORDER_SCHEMA,
            title: { type: 'string' },
            title_key: { type: 'string' },
            label_key: { type: 'string' },
            preview: { type: 'string' },
            description: { type: 'string' },
            category_id: { type: 'string' },
            source_domain: { type: 'string' },
            matrix_navigation: ATOME_MATRIX_NAVIGATION_SCHEMA,
            program_preference: PROGRAM_PREFERENCE_SCHEMA,
            program_data_permission: PROGRAM_DATA_PERMISSION_SCHEMA, dashboard_unlock: DASHBOARD_UNLOCK_SCHEMA,
            program_session: PROGRAM_SESSION_SCHEMA,
            program_session_transition: PROGRAM_SESSION_TRANSITION_SCHEMA,
            program_nutrition_consumption: NUTRITION_CONSUMPTION_SCHEMA, health_declaration: HEALTH_DECLARATION_SCHEMA,
            health_feeling: HEALTH_FEELING_SCHEMA, activity_import: ACTIVITY_IMPORT_SCHEMA,
            // The agreement to eVe using the card's body weight and age (#eVe/domains/user/body_data_runtime.js).
            body_data_consent: { type: 'object', required: ['version', 'granted', 'date'], properties: {
                version: { type: 'number', enum: [1] }, granted: { type: 'boolean' }, date: { type: 'string' } } },
            ...PROGRAM_ACTIVITY_RECORD_SCHEMAS,
            metadata: { type: 'object' },
            payload: { type: 'object' },
            created_iso: { type: 'string' }, updated_iso: { type: 'string' }, span: { type: 'number' }
        }
    }),
    defineType({
        type: 'midi_binding',
        kind: 'data_model',
        traits: ['data', 'binding', 'nonvisual', 'executable'],
        schema: {
            kind: { type: 'string' },
            enabled: { type: 'boolean' },
            order: { type: 'number' },
            input: { type: 'object' },
            actions: { type: 'array' },
            continuous: { type: 'object' }
        }
    }),
    // Interaction (todo/Templates_and_Interactivity_tool_Dashboard.md §3) : un
    // déclencheur, une cible fixe ou dynamique (arbre de conditions du moteur
    // Conditions) et une cascade ordonnée d'actions d'outils réels.
    defineType({
        type: 'interaction',
        kind: 'data_model',
        traits: ['data', 'binding', 'nonvisual', 'executable'],
        schema: {
            name: { type: 'string' },
            enabled: { type: 'boolean' },
            order: { type: 'number' },
            modes: { type: 'array' },
            trigger: { type: 'object' },
            target: { type: 'object' },
            actions: { type: 'array' }
        }
    }),
    defineType({
        type: 'condition_set',
        kind: 'data_model',
        traits: ['data', 'conditional', 'reusable'],
        schema: {
            name: { type: 'string' },
            schema_version: { type: 'number' },
            revision: { type: 'number' },
            root: { type: 'object' },
            created_by: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
        }
    }),
    defineType({
        type: 'condition_binding',
        kind: 'data_model',
        traits: ['data', 'conditional', 'binding'],
        schema: {
            condition_set_id: { type: 'string' },
            condition_set_revision: { type: 'number' },
            domain: { type: 'string' },
            target: { type: 'object' },
            unknown_policy: { type: 'string' },
            enabled: { type: 'boolean' },
            authorized_revision: { type: 'number' }
        }
    }),
    defineType({
        type: 'condition_computed_property',
        kind: 'data_model',
        traits: ['data', 'conditional', 'computed'],
        schema: {
            name: { type: 'string' },
            schema_version: { type: 'number' },
            result_type: { type: 'string' },
            unit: { type: 'string' },
            expression: { type: 'object' },
            scope: { type: 'object' },
            revision: { type: 'number' },
            created_by: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
        }
    }),
    defineType({
        type: 'condition_list',
        kind: 'data_model',
        traits: ['data', 'conditional', 'collection'],
        schema: {
            name: { type: 'string' },
            schema_version: { type: 'number' },
            mode: { type: 'string' },
            scope: { type: 'object' },
            condition_set_id: { type: 'string' },
            member_ids: { type: 'array' },
            sort: { type: 'object' },
            projection: { type: 'array' },
            revision: { type: 'number' },
            created_by: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
        }
    })
]);
