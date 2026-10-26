// The gesture chooses a tool slider's shape (user decision of 25 Oct. 2026): a click or a
// sideways drag gives the bar (the default, it pushes its neighbours), an upward drag the
// column, a circling drag the dial. The shape is decided once, early in the gesture, and
// never changes under the finger. Each shape maps the finger's travel to the value its
// own way: along the bar, up the column, around the dial's centre.
import { quantizeSliderValue as quantize } from './slider_contract.js';

export const TOOL_SLIDER_SHAPES = Object.freeze(['bar', 'column', 'dial']);
// The travel after which the shape is known, and the turn (between the gesture's two halves)
// that tells an arc from a line: a thumb circling (a radius of about 45 px) turns some 25°
// over 36 px, a straight drag's wobble a few degrees.
const DECISION_TRAVEL_PX = 36;
const ARC_TURN_DEGREES = 15;
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

// The gesture's three marks: its start, the point halfway along it, where it is now.
const marksOf = (path) => {
    const first = path[0], last = path.at(-1), travel = Math.hypot(last.x - first.x, last.y - first.y);
    const middle = path.reduce((best, point) => (Math.abs(Math.hypot(point.x - first.x, point.y - first.y) - travel / 2)
        < Math.abs(Math.hypot(best.x - first.x, best.y - first.y) - travel / 2) ? point : best), first);
    return { first, middle, last, travel };
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
    const { first, middle, last, travel } = marksOf(path);
    if (travel < DECISION_TRAVEL_PX) return '';
    const turned = Math.abs(turnBetween(angleOf(first, middle), angleOf(middle, last))) * 180 / Math.PI;
    const wanted = turned >= ARC_TURN_DEGREES ? 'dial' : Math.abs(last.x - first.x) >= Math.abs(last.y - first.y) ? 'bar' : 'column';
    return allowed.includes(wanted) ? wanted : allowed[0];
};

// A shaped session: the press (`origin`), the finger's path, the shape once known, the dial's centre and turn.
export const beginShapedSlider = (session, origin) => ({ ...session, origin: { x: finite(origin?.x), y: finite(origin?.y) }, path: [], shape: session.shape || '',
    centre: null, turn: 0 });

// The finger moved by `delta` (`{ x, y }`): the shape is decided once, then the value follows.
// `metrics.lengthPx`: the bar's and the column's travel for the whole range.
export const dragShapedSlider = (session, delta, config = {}, metrics = {}, allowed = TOOL_SLIDER_SHAPES) => {
    const previous = session.path.at(-1) || session.origin;
    const point = { x: previous.x + finite(delta?.x), y: previous.y + finite(delta?.y) };
    const path = [...session.path.length ? session.path : [session.origin], point];
    const shape = session.shape || resolveToolSliderShape(path, allowed);
    if (!shape) return { ...session, path, state: 'pressed' };
    const min = finite(config.min, 0), max = Math.max(min, finite(config.max, 100)), range = max - min;
    const start = finite(session.startValue, min), length = Math.max(1, finite(metrics.lengthPx, 1));
    if (shape === 'dial') {
        // Around the circle the finger draws (known with the shape), its turn since the press is the value's change.
        const marks = marksOf(path);
        const centre = session.centre || circleCentre(marks.first, marks.middle, marks.last);
        const turn = session.centre ? finite(session.turn) + turnBetween(angleOf(centre, previous), angleOf(centre, point))
            : path.slice(1).reduce((sum, at, index) => sum + turnBetween(angleOf(centre, path[index]), angleOf(centre, at)), 0);
        return { ...session, path, shape, centre, turn, state: 'dragging', dragged: true, expanded: true,
            value: quantize(start + (turn * 180 / Math.PI / DIAL_RANGE_DEGREES) * range, config) };
    }
    const travel = shape === 'bar' ? point.x - session.origin.x : session.origin.y - point.y;
    return { ...session, path, shape, state: 'dragging', dragged: true, expanded: true, value: quantize(start + (travel / length) * range, config) };
};
