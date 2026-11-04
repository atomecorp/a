/** The Sport commands of R-104 D6, part of the `training` family (#contracts.js joins them to TRAINING_COMMANDS, so
 * MCP, the access policy, Runtime V2 and the assistant reach them as every Sport command): personal machines (P042,
 * mockup MC5), the disciplines as data (P040, P045–P053) and the practices recorded by hand or from an allowed source.
 * The interface calls the same commands. */
import { TRAINING_MACHINE_LOAD_MODES, TRAINING_MACHINE_NAME_MAX, TRAINING_MACHINE_POSITIONS, TRAINING_MACHINE_SETTING_KEYS, TRAINING_MACHINE_TYPES,
    TRAINING_MACHINE_UNITS } from '#shared/training_equipment.js';
import { TRAINING_ADAPTATIONS, TRAINING_STEP_KINDS } from '#shared/training_disciplines.js';
import { TRAINING_MOVEMENT_GROUPS } from '#shared/training_movements.js';
import { TRAINING_OWN_PARAM_UNITS, TRAINING_PARAM_KEYS, TRAINING_SOURCES } from '#shared/training_discipline_params.js';

export const TRAINING_EQUIPMENT_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'PRESENTATION_UNAVAILABLE', 'TRAINING_WRITE_FAILED', 'TRAINING_READ_INCOMPLETE',
    'TRAINING_MACHINE_INVALID', 'TRAINING_MACHINE_NAME_REQUIRED', 'TRAINING_MACHINE_NAME_TAKEN', 'TRAINING_MACHINE_NOT_FOUND', 'TRAINING_MACHINE_STEP_INVALID',
    'TRAINING_MACHINE_RANGE_INVALID', 'TRAINING_MACHINE_SETTING_INVALID', 'TRAINING_MACHINE_FIGURE_INVALID', 'TRAINING_MACHINE_VERSION_UNKNOWN', 'TRAINING_DISCIPLINE_UNKNOWN', 'TRAINING_DISCIPLINE_INVALID',
    'TRAINING_DISCIPLINE_READ_ONLY', 'TRAINING_UNIT_UNKNOWN', 'TRAINING_CONTEXT_INVALID', 'TRAINING_PARAM_NOT_APPLICABLE', 'TRAINING_SOURCE_NOT_ALLOWED',
    'TRAINING_SOURCE_UNKNOWN', 'TRAINING_VALUE_INVALID', 'TRAINING_VALUE_SOURCE_REQUIRED', 'TRAINING_SEGMENT_INVALID', 'TRAINING_LOG_INVALID', 'TRAINING_LOG_NOT_FOUND']);
const id = { type: 'string', minLength: 1, maxLength: 80 };
const date = { type: 'string', format: 'date-time', maxLength: 40 };
const figure = { type: 'number', minimum: 0, maximum: 1100 };
const setting = { type: 'object', additionalProperties: false, required: ['key', 'value'], properties: { key: { type: 'string', enum: TRAINING_MACHINE_SETTING_KEYS },
    value: { type: ['integer', 'string', 'null'], maxLength: 1 } } };
const photo = { type: ['object', 'null'], additionalProperties: false, required: ['media_url'], properties: { media_url: { type: 'string', minLength: 1, maxLength: 2000 },
    file_name: { type: ['string', 'null'], maxLength: 200 }, mime: { type: ['string', 'null'], maxLength: 120 } } };
const context = { type: 'object', maxProperties: 8, additionalProperties: { type: 'string', maxLength: 40 } };
const value = { type: 'object', additionalProperties: false, required: ['value'], properties: { value: { type: ['number', 'string'], maxLength: 2000 },
    source: { type: 'string', enum: TRAINING_SOURCES } } };
const segment = { type: 'object', additionalProperties: false, required: ['step', 'values'], properties: { step: { type: 'string', enum: TRAINING_STEP_KINDS },
    status: { type: 'string', enum: ['done', 'skipped'] }, discipline_id: id, context, started_at: date,
    values: { type: 'object', maxProperties: 34, additionalProperties: value } } };

const definitions = {
    list_machines: [{ archived: { type: 'boolean' } }, [], 'List the person\'s own machines (« Matériel »): name, type, resistance or assistance, unit, step, lightest and heaviest figure, movements, own settings, photo. archived true lists the archived ones.', false],
    get_machine: [{ machine_id: id }, ['machine_id'], 'Read one personal machine.', false],
    save_machine: [{ machine_id: id, name: { type: 'string', minLength: 1, maxLength: TRAINING_MACHINE_NAME_MAX }, type: { type: 'string', enum: TRAINING_MACHINE_TYPES },
        load_mode: { type: 'string', enum: TRAINING_MACHINE_LOAD_MODES }, unit: { type: 'string', enum: TRAINING_MACHINE_UNITS }, step: figure, lightest: figure, heaviest: figure,
        movements: { type: 'array', maxItems: 34, uniqueItems: true, items: { type: 'string', maxLength: 60 } }, position: { type: ['string', 'null'], enum: [...TRAINING_MACHINE_POSITIONS, null] },
        settings: { type: 'array', maxItems: TRAINING_MACHINE_SETTING_KEYS.length, items: setting }, photo, location: { type: ['string', 'null'], maxLength: 120 },
        figures: { type: 'object', additionalProperties: figure } }, [],
        'Create a personal machine (no machine_id, a name required: « crée la machine triceps de ma salle, poulie, 2,5 kg de pas ») or change some of its fields. type lever|cable (poulie)|guided|plate_loaded|other; load_mode resistance, or assistance when its figure helps (an assisted pull-up: more is lighter); unit kg|lb|level (the machine\'s own levels); step, lightest and heaviest as its display reads them; movements: Sport exercise ids it serves (training.list_exercises); settings: its own (seat, handle, backrest, lever, stop, foot) with a number 1-21 or a letter A-H, null when unknown (« Option » adds one); figures: { exercise_id: figure } the figure last set for a movement it serves, on its step and range (merged, one movement at a time; the Sport card\'s « Charge » on this machine). Two live machines never share a name.', true],
    archive_machine: [{ machine_id: id, archived: { type: 'boolean' } }, ['machine_id'], 'Archive a personal machine (archived false brings it back): it leaves the lists, the sessions that used it keep it.', true],
    open_machine: [{ machine_id: id, photo: { type: 'boolean' } }, [], 'Show a personal machine\'s panel on the Dashboard surface (none: a new machine), photo true opening the import panel for its photo. Writes nothing by itself.', false],
    open_disciplines: [{}, [], 'Show the Sport disciplines\' level on the Dashboard surface (« Discipl. », Disciplines): every discipline and the person\'s own as tiles, touched its card. Writes nothing by itself.', false],
    open_discipline: [{ discipline_id: id, context }, ['discipline_id'], 'Show a discipline\'s Sport card (swim, run, rower, bike…; strength opens its movements): its options chosen by context (e.g. swim { environment: pool, session: lengths }), its values on rollers, its disc timing the practice and recording it through log_activity. Writes nothing by itself.', false],
    open_movements: [{ group: { type: 'string', enum: TRAINING_MOVEMENT_GROUPS }, movement: { type: 'string', minLength: 1, maxLength: 60 } }, [], 'Show Musculation by movement on the Dashboard surface: the muscle groups, a group\'s movements (group), or a movement\'s variants (movement), each variant opening its exercise card. Writes nothing by itself.', false],
    list_movements: [{ group: { type: 'string', enum: TRAINING_MOVEMENT_GROUPS } }, [], 'List the Musculation movements by muscle group (biceps_forearms, triceps, chest, back, shoulders, quadriceps, hamstrings, glutes_hips, adductors_calves, trunk, compound), each with its variants: the exercise id, its equipment (machine, barbell, dumbbells, cable, kettlebell, body_weight), positions, whether a side is chosen, what it is measured by (reps or hold_s) and its load (load_kg, or null: no presumed weight).', false],
    list_disciplines: [{}, [], 'List the Sport disciplines (walk, run, strength, swim, rower, bike, indoor_cardio, fitness, mobility, yoga_pilates, balance, outdoor, racket, team, dance, combat, other) and the person\'s own activities, each with its options (matrices), what a step is, its parameters with their unit, its allowed sources and its rules.', false],
    get_discipline: [{ discipline_id: id, context }, ['discipline_id'], 'Read one discipline\'s parameters for a choice of its options (context, e.g. swim { environment: pool }): only the parameters that apply there, their units and sources; chosen: the options the person last kept for it.', false],
    save_discipline_choice: [{ discipline_id: id, context }, ['discipline_id', 'context'], 'Keep the options chosen for a discipline as the person\'s own setting (e.g. swim { environment: pool, stroke: crawl, session: lengths }): its card opens on them again.', true],
    save_discipline: [{ discipline_id: id, name: { type: 'string', minLength: 1, maxLength: 60 }, step: { type: 'string', enum: TRAINING_STEP_KINDS },
        params: { type: 'array', maxItems: 21, uniqueItems: true, items: { type: 'string', enum: TRAINING_PARAM_KEYS } },
        own_params: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['key', 'name', 'unit'], properties: {
            key: { type: 'string', pattern: '^own_[a-z0-9_]{1,24}$' }, name: { type: 'string', minLength: 1, maxLength: 40 }, unit: { type: 'string', enum: TRAINING_OWN_PARAM_UNITS },
            kind: { type: 'string', enum: ['integer', 'number'] } } } },
        adaptations: { type: 'array', uniqueItems: true, items: { type: 'string', enum: TRAINING_ADAPTATIONS } } }, ['name', 'step'],
        'Create (or change, discipline_id own_…) the person\'s own activity that the catalogue lacks: its name, what a step is, the parameters it records (catalogue keys) and its own named values with an explicit unit. Data only.', true],
    log_activity: [{ log_id: id, discipline_id: id, context, started_at: date, segments: { type: 'array', minItems: 1, maxItems: 89, items: segment },
        adaptation: { type: ['string', 'null'], enum: [...TRAINING_ADAPTATIONS, null] }, constraints: { type: ['string', 'null'], maxLength: 2000 }, notes: { type: ['string', 'null'], maxLength: 2000 } },
        ['discipline_id', 'started_at', 'segments'],
        'Record a practice of a discipline by hand or from an allowed source (« j\'ai nagé 12 longueurs de 25 m »): one session, its segments in order (another discipline\'s segment names its discipline_id: rower then strength then walk is one session), each value {value, source manual|device|watch|gps|sensor} among the parameters that apply (get_discipline). log_id corrects an earlier one and keeps what it replaced. Distance from lengths, speed and pace are computed when read.', true],
    read_activity_log: [{ discipline_id: id, from: date, to: date }, [], 'Read the recorded practices, newest first, with their totals (total, active and paused seconds) and what their values allow to compute (pool distance, speed, pace per km, pace per 500 m).', false]
};
export const TRAINING_EQUIPMENT_ACTIONS = Object.freeze(Object.keys(definitions));
export const TRAINING_EQUIPMENT_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `training.${action}`, action, description, persistent, capability: persistent ? 'training.write' : 'training.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: TRAINING_EQUIPMENT_ERRORS },
        machines: { type: 'array' }, machine: { type: 'object' }, movements: { type: 'array' }, disciplines: { type: 'array' }, discipline: { type: 'object' }, chosen: { type: ['object', 'null'] }, log: { type: 'object' }, logs: { type: 'array' } } } })));
export const trainingEquipmentError = error => (TRAINING_EQUIPMENT_ERRORS.includes(error?.code || error?.message) ? (error.code || error.message) : 'TRAINING_WRITE_FAILED');
