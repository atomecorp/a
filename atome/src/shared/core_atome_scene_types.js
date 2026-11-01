// The core types of a project's scene: the project itself, its groups, texts, shapes, media and tool instances.
// Assembled with the others by core_atome_types.js (their order there is the registry's and the servers' order).
import { defineType, ATOME_ORDER_SCHEMA, ATOME_FRAME_SCHEMA, ATOME_MEDIA_SCHEMA } from './core_atome_type_shape.js';
import { PROGRAM_PREFERENCE_KEYS } from './program_collection_contract.js';
import { DASHBOARD_OBJECTIVE_TARGET_SCHEMA } from './dashboard_progression_contract.js';

// OBJ-14 « Se faire plaisir » (decision Q21, 30 Oct. 2026): an objective of its own, outside the Dashboard's progression.
export const ATOME_OBJECTIVE_IDS = Object.freeze(Array.from({ length: 14 }, (_, index) => `OBJ-${String(index + 1).padStart(2, '0')}`));

export const CORE_SCENE_ATOME_TYPES = Object.freeze([
    defineType({
        type: 'project',
        kind: 'project',
        traits: ['container', 'root', 'navigable'],
        schema: {
            ...ATOME_ORDER_SCHEMA,
            project_view_split: { type: 'object' },
            project_program: { type: 'object', properties: {
                definition: { type: 'object' }, status: { type: 'string', enum: ['draft', 'active', 'paused'] },
                revision: { type: 'number', minimum: 0 }, accepted: { type: 'object' }, pausedAt: { type: 'string' },
                bricks: { type: 'array', items: { type: 'string' } }, sleep_preferences: { type: 'object' },
                involvement: { type: 'object', properties: { minutes: { type: 'number', minimum: 0, maximum: 10080 },
                    basis: { type: 'string', enum: ['day', 'week'] }, days: { type: 'array' }, rhythm: { type: 'number', minimum: 1, maximum: 5 }
                }, required: ['minutes', 'basis', 'days', 'rhythm'] }
            }, required: ['definition', 'status', 'revision', 'involvement'] },
            template_update_policy: { type: 'string', enum: ['pinned', 'live'] },
            template_link: { type: 'object' },
            project_intent: { type: 'object', properties: {
                family: { type: 'string', enum: ['health', 'creation', 'recording', 'publication'] },
                goal: { type: 'string' },
                objective_id: { type: 'string', enum: ATOME_OBJECTIVE_IDS },
                status: { type: 'string', enum: ['draft'] },
                audience: { type: 'string', enum: ['everyone', 'group'] }, target: DASHBOARD_OBJECTIVE_TARGET_SCHEMA,
                // Its sport aim, deadline and challenge, and when it was closed (#eVe/domains/programs/objective_followup_model.js).
                aim: { type: 'string' }, deadline: { type: 'object' }, challenge: { type: 'object' }, closed: { type: 'object' }
            }, required: ['family', 'goal'] },
            title: { type: 'string' },
            description: { type: 'string' },
            // A document template's (system_template_catalog.js#documentTemplateSpec): its id and its style.
            document_template_id: { type: 'string' },
            document_style: { type: 'object' }
        }
    }),
    defineType({
        type: 'group',
        kind: 'component',
        traits: ['container', 'navigable', 'composite'],
        schema: {
            ...ATOME_ORDER_SCHEMA,
            ...ATOME_FRAME_SCHEMA,
            label: { type: 'string' },
            children: { type: 'array' },
            module: { type: 'string' },
            layout_fill: { type: 'string', enum: ['surface'] },
            matrix_template: { type: 'string' },
            template_control: { type: 'object' },
            template_value: {},
            matrix_cell: { type: 'object', properties: {
                row: { type: 'number', minimum: -1 }, column: { type: 'number', minimum: 0 },
                row_span: { type: 'number', minimum: 1 }, column_span: { type: 'number', minimum: 1 },
                role: { type: 'string', enum: ['header', 'cell'] }
            }, required: ['row', 'column', 'role'] },
            matrix_grid: { type: 'object', properties: {
                rows: { type: 'number', minimum: 1 }, columns: { type: 'number', minimum: 1 },
                gap: { type: 'number', minimum: 0 }, headers: { type: 'boolean' }
            }, required: ['rows', 'columns', 'gap', 'headers'] },
            // A mask is a structural property of its dedicated Molecule owner.
            // Keeping it in the canonical schema is essential: core Atome types
            // reject unknown properties, so an undeclared mask could disappear
            // between the atomic combine event and the reloaded scene.
            mask: {
                type: 'object',
                properties: {
                    sourceId: { type: 'string' },
                    mode: { type: 'string', enum: ['alpha'] }
                },
                required: ['sourceId', 'mode']
            }
        }
    }),
    defineType({
        type: 'text',
        kind: 'visual',
        traits: ['visual', 'textual', 'editable', 'selectable'],
        schema: {
            program_observation: { type: 'object', properties: {
                kind: { type: 'string', enum: ['declaration', 'measurement', 'hypothesis', 'completion', 'benefit'] },
                date: { type: 'string' }, provenance: { type: 'string' }, useInFollowup: { type: 'boolean' }, missing: { type: 'boolean' },
                preference_key: { type: 'string', enum: PROGRAM_PREFERENCE_KEYS }, uncertain: { type: 'boolean' }, review_after: { type: 'string' }
            }, required: ['kind', 'date', 'provenance', 'useInFollowup'] },
            ...ATOME_ORDER_SCHEMA,
            ...ATOME_FRAME_SCHEMA,
            text: { type: 'string' },
            rich_text: { type: 'object' },
            text_style: { type: 'object' },
            // A text as a document (30 Oct. 2026): its paragraphs' attributes and roles (text_paragraphs.js), its page,
            // its spreadsheet cells anchored in its runs (eVe/domains/calc), its scripts, its view (the text, or its
            // cells' grid), its document template (`{ template_id, revision }`, eVe/domains/document/document_templates.js;
            // null: none) and its own role looks over the template's (`{ [role]: look }`).
            paragraphs: { type: 'array' },
            page: { type: 'object' },
            cells: { type: 'object' },
            scripts: { type: 'array' },
            view: { type: 'string', enum: ['text', 'grid'] },
            template_ref: { type: 'object', properties: { template_id: { type: 'string' }, revision: { type: 'number', minimum: 1 } },
                required: ['template_id', 'revision'] },
            role_overrides: { type: 'object' },
            // Time a still stays on screen in playback (Line Splitter lines, prompteur).
            playback_dwell_seconds: { type: 'number', minimum: 0 },
            // A prompteur is a text carrying this property (eVe/intuition/tools/prompter).
            prompter: { type: 'object', properties: {
                version: { type: 'number', enum: [1] }, clock: { type: 'string', enum: ['project', 'host'] },
                weight_by_length: { type: 'boolean' }, cues: { type: 'array' },
                // Several texts read as one prompteur: their ids, in reading order (the same list on every page).
                pages: { type: 'array', items: { type: 'string' } }
            }, required: ['version', 'cues'] }
        }
    }),
    defineType({
        type: 'shape',
        kind: 'visual',
        traits: ['visual', 'spatial2d', 'selectable'],
        schema: {
            ...ATOME_ORDER_SCHEMA,
            ...ATOME_FRAME_SCHEMA,
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
            ...ATOME_ORDER_SCHEMA,
            ...ATOME_FRAME_SCHEMA,
            ...ATOME_MEDIA_SCHEMA,
            alt_text: { type: 'string' },
            poster_source: { type: 'string' }
        }
    }),
    defineType({
        type: 'video',
        kind: 'media',
        traits: ['visual', 'media', 'time_based', 'selectable'],
        schema: {
            ...ATOME_ORDER_SCHEMA,
            ...ATOME_FRAME_SCHEMA,
            ...ATOME_MEDIA_SCHEMA,
            name: { type: 'string' },
            poster_source: { type: 'string' },
            captions: { type: 'array' }
        }
    }),
    defineType({
        type: 'audio',
        kind: 'media',
        traits: ['media', 'time_based', 'audible', 'selectable'],
        schema: {
            ...ATOME_ORDER_SCHEMA,
            ...ATOME_MEDIA_SCHEMA,
            waveform_peaks: { type: 'array' }
        }
    }),
    defineType({
        type: 'midi',
        kind: 'media',
        traits: ['visual', 'media', 'time_based', 'musical', 'selectable'],
        schema: {
            ...ATOME_ORDER_SCHEMA,
            ...ATOME_FRAME_SCHEMA,
            ...ATOME_MEDIA_SCHEMA,
            file_name: { type: 'string' },
            mime_type: { type: 'string' },
            source_atome_id: { type: 'string' },
            note_count: { type: 'number' },
            transcription_metadata: { type: 'object' },
            // Where it plays: an output port NAME ('' = back to the devices each
            // track was recorded from) and a channel 1-16 (0 = as recorded).
            midi_output: { type: 'string' },
            midi_channel: { type: 'number' }
        }
    }),
    defineType({
        type: 'audio_waveform',
        kind: 'media',
        traits: ['visual', 'media', 'waveform', 'time_based', 'selectable'],
        schema: {
            ...ATOME_ORDER_SCHEMA,
            ...ATOME_FRAME_SCHEMA,
            ...ATOME_MEDIA_SCHEMA,
            waveform_peaks: { type: 'array' },
            peaks: { type: 'array' }
        }
    }),
    defineType({
        type: 'waveform',
        kind: 'media',
        traits: ['visual', 'media', 'waveform', 'time_based', 'selectable'],
        schema: {
            ...ATOME_ORDER_SCHEMA,
            ...ATOME_FRAME_SCHEMA,
            ...ATOME_MEDIA_SCHEMA,
            waveform_peaks: { type: 'array' },
            peaks: { type: 'array' }
        }
    }),
    defineType({
        type: 'tool_instance',
        kind: 'tool',
        traits: ['tool', 'executable', 'configurable'],
        schema: {
            ...ATOME_ORDER_SCHEMA,
            ...ATOME_FRAME_SCHEMA,
            tool_id: { type: 'string' },
            tool_key: { type: 'string' },
            state: { type: 'object' },
            parameters: { type: 'object' }
        }
    })
]);
