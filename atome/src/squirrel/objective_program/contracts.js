import { validateParams } from '../ai/agent_gateway_normalize.js';

// The `objective_program` commands (R-104 D7; Health cahier P007–P021, P034, P056): a health objective composed brick by
// brick (Garder · Après · Ôter), the programme of all objectives previewed together (load, conflicts, « Moins »), planned,
// launched into the calendar, adapted, paused and resumed; the brick library and sheets; the screens MC1–MC4 opened.
// The person's composition, programme and planning are health data: CLOSED to AI and MCP by default — the executor
// answers only the person acting in the app (source `ui`, health access open; eVe/domains/programs/objective_program_commands.js),
// whatever capability a caller declares. The library, a brick's sheet and the scenarios are editorial, open to all;
// opening and closing a screen holds no data. Launching, adapting and the reduction write the calendar: confirmed.
export const OBJECTIVE_PROGRAM_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'health_access_denied_for_actor',
    'objective_program_objective_required', 'objective_brick_refused', 'objective_brick_unavailable', 'objective_brick_unknown',
    'objective_sleep_preferences_required', 'free_objective_required', 'free_objective_invalid', 'free_objective_step_invalid', 'OBJECTIVE_PROGRAM_FAILED']);
const id = { type: 'string', minLength: 1, maxLength: 300 };
const brick = { type: 'string', pattern: '^BR-[A-Z0-9-]{2,12}$' };
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const output = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string' } } };
const command = (action, persistent, description, input, required = []) => Object.freeze({ name: `objective_program.${action}`, action, persistent,
    capability: `objective_program.${persistent ? 'write' : 'read'}`, description, input_schema: object(input, required), output_schema: output });
const objective = { objective_id: id };
const change = object({ brick, field: { type: 'string', enum: ['per_week', 'minutes'] }, from: { type: 'integer' }, to: { type: 'integer', minimum: 1, maximum: 120 } },
    ['brick', 'field', 'to']);
// follow: « Aujourd'hui · À venir · Bilan » (P012), today, upcoming and review their levels; steps: a free objective's (P068).
export const OBJECTIVE_PROGRAM_SCREENS = Object.freeze(['grid', 'brick', 'preview', 'planning', 'sheet', 'follow', 'today', 'upcoming', 'review', 'steps', 'steps_edit']);
const step = { type: 'string', pattern: '^[a-z0-9_]{1,48}$' };
const label = { type: 'string', minLength: 1, maxLength: 120 };

export const OBJECTIVE_PROGRAM_COMMANDS = Object.freeze([
    command('propose', false, 'The bricks proposed to an objective for its effort and time (kept ones lit); next_pass brings back the ones put off.',
        { ...objective, next_pass: { type: 'boolean' } }, ['objective_id']),
    command('need_set', true, 'Say what the objective is for (its need, e.g. Sleep: falling_asleep, waking, schedule, daytime_fatigue, persistent).',
        { ...objective, need: { type: ['string', 'null'], maxLength: 48 } }, ['objective_id', 'need']),
    command('decide', true, 'Keep (with its minutes and times a week), put off or remove one brick of the objective; a removed brick never comes back.',
        { ...objective, brick, decision: { type: 'string', enum: ['kept', 'postponed', 'refused'] }, minutes: { type: 'integer', minimum: 5, maximum: 120 },
            per_week: { type: 'integer', minimum: 1, maximum: 7 } }, ['objective_id', 'brick', 'decision']),
    command('preview', false, 'The programme of all objectives: the week day by day, each objective\'s time, shared bricks counted once, conflicts, the reduction proposed.', {}),
    command('reduce', true, '« Moins »: apply the reduction the preview proposes (fewer times a week, then put off).', {}),
    command('planning', false, 'The kept bricks placed in the week, each with its hour and what it follows (a meal, the bedtime).', {}),
    command('launch', true, '« Lancer »: write the kept bricks of every objective into the calendar (Sleep through its routine).', { calendar: { type: 'boolean' } }, ['calendar']),
    command('today', false, 'Today, the days to come and the week\'s account of the objectives.', { day: { type: 'integer', minimum: 0, maximum: 6 } }),
    command('adapt_preview', false, 'An adaptation proposal from what was lived, read by the app from the person\'s own readings (one variable at a time per brick); feelings: « trop » / « pas assez » said per brick.',
        { ...objective, feelings: { type: 'object', additionalProperties: { type: 'string', enum: ['too_much', 'right', 'too_little'] } } }, ['objective_id']),
    command('adapt', true, 'Apply accepted adaptation changes as a new pass of the objective.', { ...objective, changes: { type: 'array', maxItems: 45, items: change } },
        ['objective_id', 'changes']),
    command('free_read', false, 'A free objective\'s steps and sub-objectives, the ones done, the ones that can start now and its progress.', objective, ['objective_id']),
    command('free_set', true, 'Write a free objective\'s steps and sub-objectives (id, label, depends_on, minutes, per_week, bricks, steps); keep leaves existing ones.',
        { ...objective, free_objective: { type: 'object' }, keep: { type: 'boolean' } }, ['objective_id', 'free_objective']),
    command('free_step_add', true, 'Create a step at the end of a free objective (label: its name, the person\'s words).', { ...objective, label }, ['objective_id', 'label']),
    command('free_step_rename', true, 'Rename one step of a free objective.', { ...objective, step_id: step, label }, ['objective_id', 'step_id', 'label']),
    command('free_step_move', true, 'Move one step among its siblings (to: its new place, 0 first).', { ...objective, step_id: step, to: { type: 'integer', minimum: 0, maximum: 99 } },
        ['objective_id', 'step_id', 'to']),
    command('free_step_wait', true, 'Make a step wait for one of its siblings (after: its id), or for none (after: null).', { ...objective, step_id: step,
        after: { anyOf: [step, { type: 'null' }] } }, ['objective_id', 'step_id', 'after']),
    command('free_step_remove', true, 'Remove one step of a free objective (with its own steps); the steps waiting for it no longer wait.', { ...objective, step_id: step },
        ['objective_id', 'step_id']),
    command('free_done', true, 'Mark one step of a free objective done or not done.', { ...objective, step_id: step, done: { type: 'boolean' } }, ['objective_id', 'step_id', 'done']),
    command('pause', true, 'Pause an objective: its sessions and reminders suspended, nothing erased.', objective, ['objective_id']),
    command('resume', true, 'Resume a paused objective: its sessions and reminders run again.', objective, ['objective_id']),
    command('library', false, 'The brick library by family: each brick\'s status, kind (practice, orientation), sensitivity R0–R2 and how it is lived.', {}),
    command('sheet', false, 'A brick\'s sheet: its goal, practice, length, safety and sources (proposed, not active).', { brick }, ['brick']),
    command('sensors', false, 'Where a brick\'s measures come from on this device (its granted health store sources), and its manual entry.', { brick }, ['brick']),
    command('scenario', false, 'An objective scenario (OBJ-01..14): its needs, the bricks each brings, what is never proposed by default.', { goal: { type: 'string', maxLength: 48 } }, ['goal']),
    command('open', false, 'Open an objectives screen: grid (an objective\'s bricks), brick (one brick\'s settings), preview, planning (day: 0 Sunday … 6), sheet, follow (today, upcoming, review), today, upcoming, review, steps (a free objective\'s) or steps_edit (its step entry).',
        { screen: { type: 'string', enum: OBJECTIVE_PROGRAM_SCREENS }, ...objective, brick, day: { type: 'integer', minimum: 0, maximum: 6 } }, ['screen']),
    command('close', false, 'Close the objectives screen shown.', {})
]);
export const OBJECTIVE_PROGRAM_CONFIRMED_COMMANDS = Object.freeze(['objective_program.launch', 'objective_program.adapt', 'objective_program.reduce']);
// Editorial or screen commands, open to every actor: they read no person's data.
export const OBJECTIVE_PROGRAM_OPEN_ACTIONS = Object.freeze(['library', 'sheet', 'scenario', 'open', 'close']);

export const validateObjectiveProgramInput = (action, input) => {
    const contract = OBJECTIVE_PROGRAM_COMMANDS.find(entry => entry.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const OBJECTIVE_PROGRAM_ASSISTANT_INSTRUCTIONS = 'A person\'s objectives programme (bricks kept, planning, adaptations) is health data, closed to the assistant: never call objective_program.* except library, sheet, scenario, open and close; never propose a dose, a treatment or a diet; say the person can compose their objective in the app.';
