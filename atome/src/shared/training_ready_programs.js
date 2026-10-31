/** Pure: the ready-made programmes (user, Q66, validated 2026-10-31, temp/reco_sport/mockups/q18e-q18f) and their calendar.
 * A programme alternates its sessions over its days of the week (0 Monday … 6 Sunday), the multi-joint exercises first (Q17);
 * its sessions a week are natural numbers (rule 19: 2, 3, 5). Taken, it becomes « Mon programme »: the session of the day it
 * is on (or of the next session day), counted in turn from the first session day on or after the day it was taken; the
 * agenda holds each session day as a weekly series repeating once the turn comes round (`period` weeks). */
const DAY_MS = 24 * 3600 * 1000;

export const TRAINING_READY_PROGRAMS = Object.freeze([
    { id: 'beginner_3', days: [0, 2, 4], sessions: [['squat', 'barbell_bench_press', 'lat_pulldown', 'plank'],
        ['romanian_deadlift', 'shoulder_press', 'seated_row', 'crunch']] },
    { id: 'strength_3', days: [0, 2, 4], sessions: [['barbell_squat', 'barbell_bench_press', 'barbell_row', 'plank'],
        ['deadlift', 'military_press', 'pull_up', 'hanging_knee_raise']] },
    { id: 'upper_lower_5', days: [0, 1, 3, 4, 5], sessions: [['barbell_bench_press', 'barbell_row', 'shoulder_press', 'biceps_curl', 'triceps_rope_pushdown'],
        ['barbell_squat', 'romanian_deadlift', 'leg_press', 'leg_curl', 'calf_raise']] },
    { id: 'fitness_2', days: [1, 4], sessions: [['squat', 'push_up', 'seated_row', 'plank'], ['lunge', 'incline_press', 'lat_pulldown', 'crunch']] }
].map(item => Object.freeze({ ...item, days: Object.freeze(item.days), sessions: Object.freeze(item.sessions.map(list => Object.freeze(list))) })));
export const TRAINING_READY_IDS = Object.freeze(TRAINING_READY_PROGRAMS.map(item => item.id));
export const trainingReadyProgram = id => {
    const found = TRAINING_READY_PROGRAMS.find(item => item.id === id);
    if (!found) throw new Error('INVALID_ARGUMENT');
    return found;
};

const dayOf = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const weekday = date => (date.getDay() + 6) % 7;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
// The weeks after which the turn of sessions falls on the same days again.
export const trainingReadyPeriod = program => program.sessions.length / gcd(program.days.length, program.sessions.length);
// The session days from `from` (a Date) on, as many as `count`.
const sessionDays = (program, from, count) => {
    const days = [];
    for (let at = dayOf(from); days.length < count; at = new Date(at.getTime() + DAY_MS + 3600000), at = dayOf(at))
        if (program.days.includes(weekday(at))) days.push(at);
    return days;
};
// The session « Mon programme » holds on `date` for a programme taken on `since` (YYYY-MM-DD): its index and day.
export const trainingReadySessionOn = (program, since, date) => {
    const [first] = sessionDays(program, new Date(`${since}T12:00:00`), 1);
    const [next] = sessionDays(program, date < first ? first : date, 1);
    let turns = 0;
    for (let at = first; at < next; at = dayOf(new Date(at.getTime() + DAY_MS + 3600000))) if (program.days.includes(weekday(at))) turns += 1;
    return { index: turns % program.sessions.length, day: next };
};
// The agenda's series: each session day of the first `period` weeks, its session, repeating every `period` weeks.
export const trainingReadyCalendar = (program, since) => {
    const period = trainingReadyPeriod(program);
    return sessionDays(program, new Date(`${since}T12:00:00`), program.days.length * period)
        .map((day, turn) => ({ day, index: turn % program.sessions.length, recurrence: { freq: 'weekly', interval: period } }));
};
