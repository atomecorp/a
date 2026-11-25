// Controls (R-347, todo/controles_cahier_2026-11-24.md): the objects a person lays in a project to act on the rest —
// a Slider, a Rotatif, a Bouton… — each a `control` atome of the project's scene. What it does is not here: its
// reactions are `interaction` atomes whose trigger names it (eVe/intuition/runtime/interaction_model.js). Here: what
// it is (its kind), its value, its range and step, its name, its look and how it appears; pure, shared by the eVe
// runtime, the commands and the servers' type gate.
import { ATOME_FRAME_SCHEMA, ATOME_ORDER_SCHEMA } from './core_atome_type_shape.js';

export const CONTROL_ATOME_TYPE = 'control';
// The id prefix of a control's drawn parts in the project scene (its face, its cap), never written as atomes; a leaf
// here so the scene's projection and the control's own read it without importing each other (an import cycle).
export const CONTROL_PART_PREFIX = '__eve_control:';
// The 13 controls of Créer › Contrôles (cahier Q2, Q4, Q15), in the panel's order.
export const CONTROL_KINDS = Object.freeze(['slider', 'knob', 'button', 'toggle', 'xy_pad', 'field', 'menu', 'pads',
    'keyboard', 'display', 'selector', 'condition', 'zone']);
export const CONTROL_NAME_MAX = 60;
export const CONTROL_OPTIONS_MAX = 144;

const RANGE_SCHEMA = { type: 'object', properties: {
    min: { type: 'number' }, max: { type: 'number' },
    // Read as a percentage of the range or as its own value (cahier Q2 bis).
    display: { type: 'string', enum: ['percent', 'value'] }
}, required: ['min', 'max'] };

export const CONTROL_TYPE = Object.freeze({ type: CONTROL_ATOME_TYPE, kind: 'visual', traits: ['visual', 'spatial2d', 'selectable', 'interactive'], schema: {
    ...ATOME_ORDER_SCHEMA,
    ...ATOME_FRAME_SCHEMA,
    control_kind: { type: 'string', enum: CONTROL_KINDS },
    // A number (Slider, Rotatif), a boolean (Bouton, Interrupteur), { x, y } (Pad XY), a text (Champ), the chosen
    // option's index (Menu, Sélecteur); none for an Afficheur that only receives, a Condition or a Zone.
    value: {},
    range: RANGE_SCHEMA,
    // A Pad XY's second axis.
    range_y: RANGE_SCHEMA,
    // 0: continuous; else the value moves by whole steps (1 for 127 notches of 0–127, 10 for « every ten »).
    step: { type: 'number', minimum: 0 },
    orientation: { type: 'string', enum: ['vertical', 'horizontal'] },
    // A Menu's and a Sélecteur's choices, a Pads' pads (their names, in reading order).
    options: { type: 'array', maxItems: CONTROL_OPTIONS_MAX, items: { type: 'string', maxLength: CONTROL_NAME_MAX } },
    pads: { type: 'object', properties: { rows: { type: 'number', minimum: 1, maximum: 16 }, columns: { type: 'number', minimum: 1, maximum: 16 } }, required: ['rows', 'columns'] },
    keyboard: { type: 'object', properties: { first_note: { type: 'number', minimum: 0, maximum: 127 }, keys: { type: 'number', minimum: 1, maximum: 128 } }, required: ['first_note', 'keys'] },
    // Its look (cahier Q5, option 1): eVe's by default; a colour of its own, an image of its own (a media atome).
    appearance: { type: 'object', properties: { color: { type: 'color' }, image_id: { type: 'string' } } },
    // How it comes and goes with its clip (cahier Q13): faded or at once; `follow_end` its clip running from the start to
    // the project's end until shortened by hand; `laid` once its clip got its first span (control_presence.js).
    presence: { type: 'object', properties: { fade: { type: 'boolean' }, fade_ms: { type: 'number', minimum: 0, maximum: 10000 },
        follow_end: { type: 'boolean' }, laid: { type: 'boolean' } }, required: ['fade'] },
    // A Zone lies on an object (cahier Q4): the one it makes touchable.
    zone_of: { type: 'string' },
    // A Condition written as rows or as a script of the script engine (cahier Q15). A row: what it reads (an atome, a
    // state of it), how it compares (eq, neq, lt, gt, between) to a value, and how it joins the row before (and, or).
    condition: { type: 'object', properties: { mode: { type: 'string', enum: ['rows', 'script'] }, lang: { type: 'string', enum: ['ruby', 'js'] },
        source: { type: 'string', maxLength: 65536 }, enabled: { type: 'boolean' },
        rows: { type: 'array', maxItems: 34, items: { type: 'object', properties: { atome_id: { type: 'string' }, state: { type: 'string' },
            operator: { type: 'string', enum: ['eq', 'neq', 'lt', 'gt', 'between'] }, value: {}, join: { type: 'string', enum: ['and', 'or'] } } } } },
        required: ['mode'] }
} });

// Each kind's birth: its size in tool cells (60 px, AGENTS.md rule 12) and its first value (cahier A1).
const CONTINUOUS = Object.freeze({ range: { min: 0, max: 100, display: 'percent' }, step: 0 });
export const CONTROL_DEFAULTS = Object.freeze({
    slider: { cells: [1, 3], value: 0, orientation: 'vertical', ...CONTINUOUS },
    knob: { cells: [1, 1], value: 0, ...CONTINUOUS },
    button: { cells: [1, 1], value: false },
    toggle: { cells: [1, 1], value: false },
    xy_pad: { cells: [3, 3], value: { x: 50, y: 50 }, ...CONTINUOUS, range_y: { min: 0, max: 100, display: 'percent' } },
    field: { cells: [3, 1], value: '' },
    menu: { cells: [2, 1], value: 0, options: [] },
    pads: { cells: [2, 2], value: null, pads: { rows: 4, columns: 4 } },
    keyboard: { cells: [4, 1.5], value: null, keyboard: { first_note: 48, keys: 18 } },
    display: { cells: [1, 2], value: 0, range: { min: 0, max: 100, display: 'value' }, step: 0 },
    selector: { cells: [4, 1], value: 0, options: ['A', 'B', 'C', 'D'] },
    condition: { cells: [1, 1], value: null, condition: { mode: 'rows', rows: [], lang: 'ruby', enabled: false } },
    zone: { cells: [3, 2], value: null }
});

const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const clamp = (value, min, max) => Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));

export const isControlKind = kind => CONTROL_KINDS.includes(String(kind || ''));

// A value brought into its range and onto its step (the step counts from the range's start).
export const snapControlValue = (value, range = {}, step = 0) => {
    const min = finite(range.min, 0), max = finite(range.max, 100);
    const bounded = clamp(finite(value, min), min, max);
    const size = finite(step, 0);
    if (!(size > 0)) return bounded;
    return clamp(min + Math.round((bounded - min) / size) * size, min, max);
};

// The value a control of this kind holds, made valid for it: a number in its range and on its step, a boolean,
// { x, y }, a text, an option's index; an explicit error for anything else (no silent replacement).
export const controlValueFor = (kind, value, props = {}) => {
    const defaults = CONTROL_DEFAULTS[kind];
    if (!defaults) return { ok: false, error: 'control_kind_unknown' };
    const range = props.range || defaults.range, step = props.step ?? defaults.step;
    if (['slider', 'knob', 'display'].includes(kind)) {
        if (!Number.isFinite(Number(value))) return { ok: false, error: 'control_value_number_required' };
        return { ok: true, value: snapControlValue(value, range, step) };
    }
    if (['button', 'toggle'].includes(kind)) {
        if (typeof value !== 'boolean') return { ok: false, error: 'control_value_boolean_required' };
        return { ok: true, value };
    }
    if (kind === 'xy_pad') {
        if (!plainObject(value) || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y))) return { ok: false, error: 'control_value_xy_required' };
        return { ok: true, value: { x: snapControlValue(value.x, range, step), y: snapControlValue(value.y, props.range_y || defaults.range_y, step) } };
    }
    if (kind === 'field') return { ok: true, value: String(value ?? '') };
    if (['menu', 'selector'].includes(kind)) {
        const count = (props.options || defaults.options || []).length;
        const index = Number(value);
        if (!Number.isInteger(index) || index < 0 || (count && index >= count)) return { ok: false, error: 'control_value_option_invalid' };
        return { ok: true, value: index };
    }
    if (value !== null && value !== undefined) return { ok: false, error: 'control_value_not_held' };
    return { ok: true, value: null };
};

// The properties a control is born with: its kind's defaults under what the caller gave; its size in pixels from
// its cells (the tool unit is the caller's, AGENTS.md rule 12).
export const controlBirthProps = (kind, given = {}, { unitPx = 60 } = {}) => {
    const defaults = CONTROL_DEFAULTS[kind];
    if (!defaults) return { ok: false, error: 'control_kind_unknown' };
    const { cells, ...rest } = defaults;
    const props = { control_kind: kind, ...structuredClone(rest), ...given };
    props.width = finite(given.width, cells[0] * unitPx);
    props.height = finite(given.height, cells[1] * unitPx);
    const value = controlValueFor(kind, props.value, props);
    if (!value.ok) return value;
    props.value = value.value;
    Object.keys(props).forEach(key => props[key] === undefined && delete props[key]);
    return { ok: true, props };
};

// The triggers a control offers (cahier Q8: each shows only those that make sense for it), in the panel's order. The
// time and outside triggers are every control's; a Condition, never touched, has only them.
const TIME_TRIGGERS = ['playhead_enter', 'playhead_leave', 'beat', 'midi', 'open', 'timer'];
const PRESS = ['activate', 'release', 'double', 'hold'];
export const CONTROL_TRIGGERS = Object.freeze({
    slider: [...PRESS, 'changed', 'threshold', ...TIME_TRIGGERS],
    knob: [...PRESS, 'changed', 'threshold', ...TIME_TRIGGERS],
    button: [...PRESS, ...TIME_TRIGGERS],
    toggle: ['changed', 'double', 'hold', ...TIME_TRIGGERS],
    xy_pad: [...PRESS, 'drag', 'changed', 'threshold', ...TIME_TRIGGERS],
    field: ['changed', 'activate', ...TIME_TRIGGERS],
    menu: ['changed', ...TIME_TRIGGERS],
    pads: [...PRESS, 'enter', 'leave', ...TIME_TRIGGERS],
    keyboard: ['activate', 'release', ...TIME_TRIGGERS],
    display: ['changed', 'threshold', ...TIME_TRIGGERS],
    selector: ['changed', 'activate', 'hold', ...TIME_TRIGGERS],
    condition: [...TIME_TRIGGERS],
    zone: [...PRESS, 'drag', 'enter', 'leave', ...TIME_TRIGGERS]
});
export const controlTriggers = kind => CONTROL_TRIGGERS[kind] || [];
