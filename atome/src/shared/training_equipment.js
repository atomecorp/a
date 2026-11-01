/** A personal machine (Health cahier §51.20.3, P042; mockup temp/r104/mockups/MC5_machine_perso_phone.png, phase C Q9 B):
 * an equipment sheet, not a project nor a screen per device. Its name, its type (lever, cable, guided…), whether its
 * figure is a resistance or an assistance (an assisted pull-up's figure helps: more is lighter, never a growing load),
 * the unit its display reads (kg, lb, or a level of its own), the step and the lightest and heaviest figures it shows,
 * the movements it serves (catalogue exercise ids, independent of the machine's id), its own typed settings (seat,
 * handle… a value, never a script), an optional photo chosen through the one import panel (rule 18) and an optional
 * place, both private. Unknown values stay empty. Archived, it leaves the lists and keeps the sessions that used it.
 * A figure read on one machine is never compared with another's (pulleys and levers differ): no conversion, no watts.
 * The defaults are the world's step and natural numbers (AGENTS.md rule 19): 2.5 kg, 5 kg, 90 kg. */
import { TRAINING_EXERCISES } from './training_catalog.js';

export const TRAINING_MACHINE_VERSION = 2;
export const TRAINING_MACHINE_TYPES = Object.freeze(['lever', 'cable', 'guided', 'plate_loaded', 'other']);
export const TRAINING_MACHINE_LOAD_MODES = Object.freeze(['resistance', 'assistance']);
export const TRAINING_MACHINE_UNITS = Object.freeze(['kg', 'lb', 'level']);
export const TRAINING_MACHINE_POSITIONS = Object.freeze(['seated', 'standing', 'lying', 'kneeling']);
// The settings « Option » adds, in this order, each a number (holes, notches) or a letter (a handle's grip).
export const TRAINING_MACHINE_SETTINGS = Object.freeze({ seat: 'number', handle: 'letter', backrest: 'number', lever: 'number', stop: 'number', foot: 'letter' });
export const TRAINING_MACHINE_SETTING_KEYS = Object.freeze(Object.keys(TRAINING_MACHINE_SETTINGS));
export const TRAINING_MACHINE_SETTING_NUMBERS = Object.freeze([1, 21]);
export const TRAINING_MACHINE_SETTING_LETTERS = Object.freeze('ABCDEFGH'.split(''));
// The figures' bounds per unit: a display never reads below 0 nor above these.
export const TRAINING_MACHINE_LIMITS = Object.freeze({ kg: Object.freeze({ step: [0.25, 25], figure: [0, 500] }),
    lb: Object.freeze({ step: [0.5, 50], figure: [0, 1100] }), level: Object.freeze({ step: [1, 5], figure: [0, 55] }) });
// What a new machine starts with, per unit (world steps, natural figures).
export const TRAINING_MACHINE_DEFAULTS = Object.freeze({ kg: Object.freeze({ step: 2.5, lightest: 5, heaviest: 90 }),
    lb: Object.freeze({ step: 5, lightest: 5, heaviest: 195 }), level: Object.freeze({ step: 1, lightest: 1, heaviest: 21 }) });
export const TRAINING_MACHINE_NAME_MAX = 60;
// The movements a machine of a type serves: the catalogue exercises done on a machine or a cable.
export const trainingMachineMovements = type => TRAINING_EXERCISES.filter(exercise => exercise.kind === 'strength'
    && (type === 'cable' ? exercise.equipment === 'cable' : type === 'other' ? ['machine', 'cable'].includes(exercise.equipment) : exercise.equipment === 'machine'))
    .map(exercise => exercise.id);
const MOVEMENT_IDS = new Set(TRAINING_EXERCISES.filter(exercise => exercise.kind === 'strength').map(exercise => exercise.id));

const fail = code => Object.assign(new Error(code), { code });
const onStep = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-9;
const hundredth = value => Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
const optionalText = (value, max) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || value.length > max) throw fail('TRAINING_MACHINE_INVALID');
    return value.trim() || null;
};

export const trainingMachineDraft = (unit = 'kg') => ({ name: '', type: 'guided', load_mode: 'resistance', unit, ...TRAINING_MACHINE_DEFAULTS[unit],
    movements: [], position: null, settings: [], figures: {}, photo: null, location: null, archived: false });

// A setting kept: its key among TRAINING_MACHINE_SETTINGS and its value (null: not known yet).
const settingOf = (setting) => {
    const kind = TRAINING_MACHINE_SETTINGS[setting?.key];
    if (!kind) throw fail('TRAINING_MACHINE_SETTING_INVALID');
    const value = setting.value ?? null;
    if (value !== null && (kind === 'number' ? !(Number.isInteger(value) && value >= TRAINING_MACHINE_SETTING_NUMBERS[0] && value <= TRAINING_MACHINE_SETTING_NUMBERS[1])
        : !TRAINING_MACHINE_SETTING_LETTERS.includes(value))) throw fail('TRAINING_MACHINE_SETTING_INVALID');
    return { key: setting.key, value };
};
const photoOf = (photo) => {
    if (photo === null || photo === undefined) return null;
    if (typeof photo !== 'object' || typeof photo.media_url !== 'string' || !photo.media_url || photo.media_url.length > 2000) throw fail('TRAINING_MACHINE_INVALID');
    return { media_url: photo.media_url, file_name: optionalText(photo.file_name, 200), mime: optionalText(photo.mime, 120) };
};

/** A machine as written: every field checked, figures on the machine's own step within its unit's bounds. */
export const trainingMachine = (input) => {
    if (!input || typeof input !== 'object') throw fail('TRAINING_MACHINE_INVALID');
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > TRAINING_MACHINE_NAME_MAX) throw fail('TRAINING_MACHINE_NAME_REQUIRED');
    if (!TRAINING_MACHINE_TYPES.includes(input.type) || !TRAINING_MACHINE_LOAD_MODES.includes(input.load_mode) || !TRAINING_MACHINE_UNITS.includes(input.unit)) throw fail('TRAINING_MACHINE_INVALID');
    const limits = TRAINING_MACHINE_LIMITS[input.unit];
    const { step, lightest, heaviest } = input;
    if (!hundredth(step) || step < limits.step[0] || step > limits.step[1] || (input.unit === 'level' && !Number.isInteger(step))) throw fail('TRAINING_MACHINE_STEP_INVALID');
    for (const figure of [lightest, heaviest]) {
        if (!hundredth(figure) || figure < limits.figure[0] || figure > limits.figure[1]) throw fail('TRAINING_MACHINE_RANGE_INVALID');
    }
    if (lightest >= heaviest || !onStep(heaviest - lightest, step)) throw fail('TRAINING_MACHINE_RANGE_INVALID');
    const movements = input.movements ?? [];
    if (!Array.isArray(movements) || movements.length > 34 || movements.some(id => !MOVEMENT_IDS.has(id)) || new Set(movements).size !== movements.length) throw fail('TRAINING_MACHINE_INVALID');
    if (input.position != null && !TRAINING_MACHINE_POSITIONS.includes(input.position)) throw fail('TRAINING_MACHINE_INVALID');
    // The figure last set for each movement it serves (P057: the exercise card's « Charge » on this machine), on its own step.
    const figures = input.figures ?? {};
    if (!figures || typeof figures !== 'object' || Array.isArray(figures) || Object.entries(figures).some(([id, figure]) => !movements.includes(id)
        || !hundredth(figure) || figure < lightest || figure > heaviest || !onStep(figure - lightest, step))) throw fail('TRAINING_MACHINE_FIGURE_INVALID');
    const settings = (input.settings ?? []).map(settingOf);
    if (settings.length > TRAINING_MACHINE_SETTING_KEYS.length || new Set(settings.map(setting => setting.key)).size !== settings.length) throw fail('TRAINING_MACHINE_SETTING_INVALID');
    return { version: TRAINING_MACHINE_VERSION, name, type: input.type, load_mode: input.load_mode, unit: input.unit, step, lightest, heaviest,
        movements: [...movements], position: input.position ?? null, settings, figures: { ...figures }, photo: photoOf(input.photo), location: optionalText(input.location, 120),
        archived: input.archived === true, source: 'user', sharing: 'private' };
};

/** A machine kept by an earlier version, read in today's shape (P042 tests « migration de fiche »): version 1 had a
 * single `increment` and a `resistance: { kind, unit }` block. */
export const trainingMachineAsRead = (kept) => {
    if (kept?.version === TRAINING_MACHINE_VERSION) return kept;
    if (kept?.version !== 1) throw fail('TRAINING_MACHINE_VERSION_UNKNOWN');
    const unit = kept.resistance?.unit || 'kg', defaults = TRAINING_MACHINE_DEFAULTS[unit] || TRAINING_MACHINE_DEFAULTS.kg;
    return trainingMachine({ name: kept.name, type: kept.type || 'other', load_mode: kept.resistance?.kind === 'assistance' ? 'assistance' : 'resistance', unit,
        step: kept.increment ?? defaults.step, lightest: kept.lightest ?? defaults.lightest, heaviest: kept.heaviest ?? defaults.heaviest,
        movements: kept.movements || [], settings: kept.settings || [], photo: kept.photo || null, location: kept.location || null, archived: kept.archived === true });
};

/** What a figure set on a machine means (P042 3): a resistance is the load the person moves; an assistance helps them,
 * so a higher figure is an easier set. Neither is compared across machines nor converted. */
export const trainingMachineFigure = (machine, figure) => ({ figure, unit: machine.unit, mode: machine.load_mode,
    easier_when: machine.load_mode === 'assistance' ? 'higher' : 'lower', comparable_with: 'same_machine_only' });
/** The figures kept once a machine's movements, unit, step or range change: a figure it can no longer show is forgotten. */
export const trainingMachineKeptFigures = (machine, figures = {}) => Object.fromEntries(Object.entries(figures).filter(([id, figure]) => machine.movements.includes(id)
    && figure >= machine.lightest && figure <= machine.heaviest && onStep(figure - machine.lightest, machine.step)));
/** The machine a strength exercise is done on (P057): the first live machine by name that serves it, else null. Which one
 * serves it is chosen in « Matér. » (its « Mouvements »), never on the exercise card. */
export const trainingMachineServing = (machines, exerciseId) => machines.filter(machine => !machine.archived && machine.movements.includes(exerciseId))
    .sort((a, b) => a.name.localeCompare(b.name))[0] || null;
// Two machines with the same name (case and accents aside) are one: the second is refused while the first is not archived.
export const trainingMachineNameKey = name => String(name || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
