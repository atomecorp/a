// The delivery receipt of a `set` that changed nothing (atome/engines/atome-store/src/receipts.rs
// on the Rust servers): no event is recorded for it, so its receipt alone lets a resend of the same
// event id — its acknowledgement lost — be recognised and ignored, never applied again over a later
// change. A receipt lies outside the history: never replayed, synced nor projected.

import { query } from './adole_db_core.js';
import { intentHash } from './adole_event_mutation.js';
import { resolveEventPayload } from '../atome/src/shared/adole_event_contract.js';
import { getStateCurrent } from './adole_event_state_reads.js';

// The answer to a delivery that changed nothing, first or resent: acknowledged, not inserted.
async function unchangedAnswer(event) {
    const payload = resolveEventPayload(event);
    return {
        ...event,
        payload: { ...(payload && typeof payload === 'object' ? payload : {}), idempotency_intent_hash: intentHash(event) },
        projection: await getStateCurrent(event.atome_id),
        inserted: false,
        unchanged: true
    };
}

// A resend of an event id already received as unchanged: the same answer, else null; another
// intent under that id is `event_id_conflict`.
export async function resentUnchanged(event) {
    const receipt = await query('get', 'SELECT intent_hash FROM event_receipts WHERE event_id = ?', [event.id]);
    if (!receipt) return null;
    if (receipt.intent_hash !== intentHash(event)) {
        const error = new Error('event_id_conflict');
        error.code = 'event_id_conflict';
        throw error;
    }
    return unchangedAnswer(event);
}

// Keeps the receipt of `event` (normalized, before `prepare` compacts it) and answers it.
export async function receiveUnchanged(event) {
    await query(
        'run',
        'INSERT INTO event_receipts (event_id, atome_id, intent_hash, received_at) VALUES (?, ?, ?, ?)',
        [event.id, event.atome_id, intentHash(event), new Date().toISOString()]
    );
    return unchangedAnswer(event);
}
