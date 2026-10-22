// The platform workout that mirrors an eVe training session (the only health
// write): iOS records an HKWorkout (a live HKWorkoutSession from iOS 26),
// Android an ExerciseSessionRecord. The eVe session stays the truth; this only
// forwards its lifecycle. Replies carry no health value, so no actor gate
// applies; the host still requires the verified account and its association.
//
// `prepare()` may show the system write sheet: call it only for a session the
// user is starting, before `start`.

const WORKOUT_ACTIVITIES = Object.freeze(['strength', 'core', 'cardio']);

export function createHealthWorkoutRecorder({ call, context, loadLinkStatus, describe }) {
    const send = async (command, payload = {}) => {
        if (!describe().supported) return { ok: false, error: describe().reason };
        const ctx = context();
        const link = await loadLinkStatus();
        if (!link.linked) return { ok: false, error: link.reason || 'health_link_required' };
        const reply = await call(command, payload, ctx);
        if (reply.stale) return { ok: false, error: 'health_context_changed' };
        if (!reply.ok || reply.result?.ok === false) return { ok: false, error: reply.error || reply.result?.error || 'health_workout_failed' };
        return { ok: true, ...reply.result };
    };
    const session = value => {
        const id = String(value || '');
        if (!id || id.length > 300) throw new Error('health_workout_invalid');
        return id;
    };
    const at = value => {
        const ms = typeof value === 'number' ? value : Date.parse(value);
        if (!Number.isFinite(ms)) throw new Error('health_workout_invalid');
        return ms;
    };
    const guarded = task => async (input = {}) => {
        try { return await task(input); }
        catch (error) { return { ok: false, error: error.message }; }
    };
    return Object.freeze({
        prepare: guarded(async () => {
            const reply = await send('health_workout_prepare');
            return reply.ok && reply.writable !== true ? { ok: false, error: 'health_workout_write_denied' } : reply;
        }),
        start: guarded(async ({ sessionId, activity, startedAt }) => {
            if (!WORKOUT_ACTIVITIES.includes(activity)) throw new Error('health_workout_invalid');
            return send('health_workout_start', { session: session(sessionId), activity, at: at(startedAt) });
        }),
        pause: guarded(async ({ sessionId, pausedAt }) => send('health_workout_pause', { session: session(sessionId), at: at(pausedAt) })),
        resume: guarded(async ({ sessionId, resumedAt }) => send('health_workout_resume', { session: session(sessionId), at: at(resumedAt) })),
        // `save: false` discards it. Android writes its record here, from the session's own times.
        end: guarded(async ({ sessionId, activity, title = '', startedAt, endedAt, save }) => send('health_workout_end', {
            session: session(sessionId), activity, title: String(title).slice(0, 200), start: at(startedAt), at: at(endedAt), save: save === true
        }))
    });
}
