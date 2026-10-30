// The platform workout that mirrors an eVe training session (with a meditation's
// mindful minutes, below, the only health writes): iOS records an HKWorkout (a live HKWorkoutSession from iOS 26),
// Android an ExerciseSessionRecord. The eVe session stays the truth; this only
// forwards its lifecycle. Replies carry no health value, so no actor gate
// applies; the host still requires the verified account and its association.
//
// `prepare()` may show the system write sheet: call it only for a session the
// user is starting, before `start`.

const WORKOUT_ACTIVITIES = Object.freeze(['strength', 'core', 'cardio']);

// One host write: refused when the host has no health store or the account is not linked.
const healthWrite = ({ call, context, loadLinkStatus, describe }, failure) => async (command, payload = {}) => {
    if (!describe().supported) return { ok: false, error: describe().reason };
    const ctx = context();
    const link = await loadLinkStatus();
    if (!link.linked) return { ok: false, error: link.reason || 'health_link_required' };
    const reply = await call(command, payload, ctx);
    if (reply.stale) return { ok: false, error: 'health_context_changed' };
    if (!reply.ok || reply.result?.ok === false) return { ok: false, error: reply.error || reply.result?.error || failure };
    return { ok: true, ...reply.result };
};
const sessionOf = value => {
    const id = String(value || '');
    if (!id || id.length > 300) throw new Error('health_workout_invalid');
    return id;
};
const instant = value => {
    const ms = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(ms)) throw new Error('health_workout_invalid');
    return ms;
};
const guarded = task => async (input = {}) => {
    try { return await task(input); }
    catch (error) { return { ok: false, error: error.message }; }
};

// `host.link()`: associates this device's health store (#health_owner.js `link`). A session being started asks for
// health (its workout, its heart rate): a device not associated yet is associated here, so that `prepare` reaches
// the host and its sheet (workout write, heart-rate read) is shown once, instead of failing on `health_link_required`.
export function createHealthWorkoutRecorder(host) {
    const send = healthWrite(host, 'health_workout_failed');
    return Object.freeze({
        prepare: guarded(async () => {
            const status = host.describe().supported ? await host.loadLinkStatus() : null;
            if (status && !status.linked && !status.reason) {
                const linked = await host.link();
                if (!linked.ok) return linked;
            }
            const reply = await send('health_workout_prepare');
            return reply.ok && reply.writable !== true ? { ok: false, error: 'health_workout_write_denied' } : reply;
        }),
        start: guarded(async ({ sessionId, activity, startedAt }) => {
            if (!WORKOUT_ACTIVITIES.includes(activity)) throw new Error('health_workout_invalid');
            return send('health_workout_start', { session: sessionOf(sessionId), activity, at: instant(startedAt) });
        }),
        pause: guarded(async ({ sessionId, pausedAt }) => send('health_workout_pause', { session: sessionOf(sessionId), at: instant(pausedAt) })),
        resume: guarded(async ({ sessionId, resumedAt }) => send('health_workout_resume', { session: sessionOf(sessionId), at: instant(resumedAt) })),
        // `save: false` discards it. Android writes its record here, from the session's own times.
        end: guarded(async ({ sessionId, activity, title = '', startedAt, endedAt, save }) => send('health_workout_end', {
            session: sessionOf(sessionId), activity, title: String(title).slice(0, 200), start: instant(startedAt), at: instant(endedAt), save: save === true
        }))
    });
}

// A meditation's mindful minutes (#eVe/domains/programs/brick_session_runtime.js): iOS saves one
// HKCategorySample (mindful session) once the session is saved; a host without that write answers
// its own error (health_command_unknown). `prepare()` may show the system write sheet: call it only
// for a meditation the user is starting.
export function createHealthMindfulRecorder(host) {
    const send = healthWrite(host, 'health_mindful_failed');
    return Object.freeze({
        prepare: guarded(async () => {
            const reply = await send('health_mindful_prepare');
            return reply.ok && reply.writable !== true ? { ok: false, error: 'health_mindful_write_denied' } : reply;
        }),
        save: guarded(async ({ sessionId, startedAt, endedAt }) => send('health_mindful_save', {
            session: sessionOf(sessionId), start: instant(startedAt), at: instant(endedAt) }))
    });
}
