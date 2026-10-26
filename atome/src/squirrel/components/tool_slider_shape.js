// The gesture chooses a tool slider's shape (user decision of 25 Oct. 2026): a click or a
// sideways drag gives the bar (the default, it pushes its neighbours), an upward drag the
// column, a circling drag the dial. The shape is decided once, early in the gesture, and
// never changes under the finger. Each shape maps the finger's travel to the value its
// own way: along the bar, up the column, around the dial's centre.
import { quantizeSliderValue as quantize } from './slider_contract.js';
import { TOOL_SLIDER_DRAG_THRESHOLD_PX } from './tool_slider_drag.js';

export const TOOL_SLIDER_SHAPES = Object.freeze(['bar', 'column', 'dial']);
// The travel after which the shape is known. An arc turns evenly along the gesture: its three
// quarter-to-quarter turns share one sign and none holds most of the turn; a corner (a finger
// that went across the bar, then along it) turns in one place, a wobble changes sign.
const DECISION_TRAVEL_PX = 36;
const ARC_TURN_DEGREES = 22;
const ARC_TURN_PEAK_SHARE = 0.6;
// A dial's half turn covers the whole range.
const DIAL_RANGE_DEGREES = 180;

const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const angleOf = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
const turnBetween = (a, b) => {
    let turn = b - a;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    return turn;
};
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// The points at each quarter of the length the finger travelled.
const quartersOf = (path) => {
    const lengths = path.map((point, index) => (index ? distance(path[index - 1], point) : 0));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    let walked = 0;
    const marks = [path[0]];
    path.forEach((point, index) => {
        walked += lengths[index];
        while (marks.length < 5 && walked >= (total * marks.length) / 4 - 1e-6) marks.push(point);
    });
    while (marks.length < 5) marks.push(path.at(-1));
    return marks;
};
const isArc = (path) => {
    const marks = quartersOf(path);
    const angles = marks.slice(1).map((point, index) => angleOf(marks[index], point));
    const turns = angles.slice(1).map((angle, index) => turnBetween(angles[index], angle) * 180 / Math.PI);
    const total = turns.reduce((sum, turn) => sum + turn, 0);
    return Math.abs(total) >= ARC_TURN_DEGREES && turns.every(turn => Math.sign(turn) === Math.sign(total))
        && Math.max(...turns.map(Math.abs)) <= Math.abs(total) * ARC_TURN_PEAK_SHARE;
};
// The centre of the circle through three points (the dial the finger draws).
const circleCentre = (a, b, c) => {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    const sq = point => point.x * point.x + point.y * point.y;
    return { x: (sq(a) * (b.y - c.y) + sq(b) * (c.y - a.y) + sq(c) * (a.y - b.y)) / d, y: (sq(a) * (c.x - b.x) + sq(b) * (a.x - c.x) + sq(c) * (b.x - a.x)) / d };
};

// The shape the path drawn so far asks for, or '' while it is too short to tell.
// `path`: the finger's points since the press, the press first.
export const resolveToolSliderShape = (path = [], allowed = TOOL_SLIDER_SHAPES) => {
    if (path.length < 2) return '';
    const first = path[0], last = path.at(-1);
    if (distance(first, last) < DECISION_TRAVEL_PX) return '';
    const wanted = isArc(path) ? 'dial' : Math.abs(last.x - first.x) >= Math.abs(last.y - first.y) ? 'bar' : 'column';
    return allowed.includes(wanted) ? wanted : allowed[0];
};

// A shaped session: the press (`origin`), the finger's path, the shape once known, the dial's centre and turn.
export const beginShapedSlider = (session, origin) => ({ ...session, origin: { x: finite(origin?.x), y: finite(origin?.y) }, path: [], shape: session.shape || '',
    centre: null, turn: 0 });

// The finger moved by `delta` (`{ x, y }`): past the drag threshold the gesture is a drag (its
// release closes a slider it opened), the shape is decided once, then the value follows.
// `metrics.lengthPx`: the bar's and the column's travel for the whole range; `metrics.barSign` /
// `metrics.columnSign`: -1 where the bar grows leftwards or the column downwards (a host's inside);
// `metrics.provisional`: the shape shown before the gesture decided one.
export const dragShapedSlider = (session, delta, config = {}, metrics = {}, allowed = TOOL_SLIDER_SHAPES) => {
    const previous = session.path.at(-1) || session.origin;
    const point = { x: previous.x + finite(delta?.x), y: previous.y + finite(delta?.y) };
    const path = [...session.path.length ? session.path : [session.origin], point];
    const dragged = session.dragged === true || distance(session.origin, point) >= TOOL_SLIDER_DRAG_THRESHOLD_PX;
    const decided = session.shape || resolveToolSliderShape(path, allowed);
    // Until the gesture tells its shape, a host that already shows one (`metrics.provisional`:
    // the bar a menu shows beside its tool) follows it; the decision then takes over from the press.
    const shape = decided || (dragged ? metrics.provisional || '' : '');
    if (!dragged || !shape) return { ...session, path, dragged, state: dragged ? 'dragging' : 'pressed' };
    const min = finite(config.min, 0), max = Math.max(min, finite(config.max, 100)), range = max - min;
    const start = finite(session.startValue, min), length = Math.max(1, finite(metrics.lengthPx, 1));
    const settled = (fields) => ({ ...session, path, ...fields, shape: decided, state: 'dragging', dragged: true, expanded: true });
    if (shape === 'dial') {
        // Around the circle the finger draws (known with the shape), its turn since the press is the value's change.
        const marks = quartersOf(path);
        const centre = session.centre || circleCentre(marks[0], marks[2], marks[4]);
        const turn = session.centre ? finite(session.turn) + turnBetween(angleOf(centre, previous), angleOf(centre, point))
            : path.slice(1).reduce((sum, at, index) => sum + turnBetween(angleOf(centre, path[index]), angleOf(centre, at)), 0);
        return settled({ centre, turn, value: quantize(start + (turn * 180 / Math.PI / DIAL_RANGE_DEGREES) * range, config) });
    }
    const travel = shape === 'bar' ? (point.x - session.origin.x) * (metrics.barSign ?? 1) : (session.origin.y - point.y) * (metrics.columnSign ?? 1);
    return settled({ value: quantize(start + (travel / length) * range, config) });
};
