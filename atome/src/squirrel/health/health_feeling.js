// The person's feeling of the day (Forme, Force, Humeur; #shared/health_feeling_contract.js), the Atome of the day
// read and written like the declared water (#health_declarations.js): one record per person and civil day, through the
// one mutation pipeline. Every reader (the end of a session, a rest, the morning, the Résultats monitor) gets it here.
import { healthAccessAllowedNow } from './health_actor_gate.js';
import { healthDeclarationDay } from '../../shared/health_declaration_contract.js';
import { HEALTH_FEELING_ASPECTS, healthFeelingId, healthFeelingState, validateHealthFeeling } from '../../shared/health_feeling_contract.js';

const failed = code => Object.assign(new Error(code), { code });
const NOT_SET = healthFeelingState(null);

// `store`: { read(id) → record | null, commit(event) → { ok } }; `actor()`: the device's principal, null without one.
export function createHealthFeeling({ store, actor, now = () => Date.now(), createId = () => globalThis.crypto.randomUUID() }) {
    const listeners = new Set();
    let queue = Promise.resolve();
    const principal = () => { const id = actor(); if (!id) throw failed('AUTH_REQUIRED'); return id; };

    const readRecord = async (id, day) => {
        const record = await store.read(id), props = record?.properties || record?.props;
        return props?.health_feeling ? validateHealthFeeling(props.health_feeling) : { version: 1, day, entries: [] };
    };
    /** The feeling of a civil day (today when none is given), aspect by aspect; every aspect null without a principal. */
    const read = async (day = healthDeclarationDay(now())) => {
        if (!healthAccessAllowedNow()) throw failed('health_access_denied_for_actor');
        const id = actor();
        return id ? healthFeelingState(await readRecord(healthFeelingId(id, day), day)) : NOT_SET;
    };

    // `answers`: { form?, strength?, mood? }, each { level? | moods?, note? }: one entry per aspect answered, one event.
    // An aspect left out keeps its value; nothing answered is not a write.
    const set = ({ moment, session_id: sessionId, ...answers } = {}) => {
        const at = now(), day = healthDeclarationDay(at), iso = new Date(at).toISOString();
        const entries = HEALTH_FEELING_ASPECTS.filter(aspect => answers[aspect]).map(aspect => ({ id: createId(), aspect,
            ...answers[aspect], moment, ...(sessionId ? { session_id: sessionId } : {}), at: iso }));
        // An answer says something (a level, moods or a note) in its aspect's terms; anything else is the caller's error.
        try { if (!entries.length) throw failed('INVALID_ARGUMENT'); validateHealthFeeling({ version: 1, day, entries }); }
        catch { return Promise.reject(failed('INVALID_ARGUMENT')); }
        // One write after the other: each reads the day as the last one left it.
        const run = queue.then(async () => {
            const id = healthFeelingId(principal(), day), current = await readRecord(id, day);
            const next = validateHealthFeeling({ ...current, entries: [...current.entries, ...entries] });
            const changeId = `${id}:${createId()}`;
            const result = await store.commit({ kind: 'set', id: changeId, tx_id: changeId, actor: principal(), atome_id: id, type: 'record',
                scope: 'global', props: { source_domain: 'health_feeling', health_feeling: next, ...(current.entries.length ? {} : { created_iso: iso }), updated_iso: iso } });
            if (result?.ok === false) throw failed('HEALTH_FEELING_WRITE_FAILED');
            const state = healthFeelingState(next);
            listeners.forEach(listener => listener(day, state));
            return { ok: true, day, feeling: state };
        });
        queue = run.catch(() => null);
        return run;
    };

    const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
    return Object.freeze({ read, set, subscribe });
}
