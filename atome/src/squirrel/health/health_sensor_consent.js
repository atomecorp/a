// The person's agreement to the recording of their raw motion during activity sessions (#health_sensors.js),
// asked once on the first session card and kept for the account: one record per principal, written through the
// one mutation pipeline, so the question never comes back on another device. Nothing is recorded before « Oui »;
// « Non » or a later stop keeps every session running without recording. Changing it also pauses or resumes
// this device's recorder (ending a recording in progress, kept). With the agreement, every closed recording
// gets its encrypted copy in the account vault (#sensor_backup.js); deleting a recording deletes its copy.
import { reportRuntimeError } from '../runtime_errors.js';

export const sensorConsentId = actor => `sensor_recording_consent:${encodeURIComponent(actor)}`;
const failed = code => Object.assign(new Error(code), { code });

// `sensors`: this device's recorder; `backup`: its copies (#sensor_backup.js);
// `store`: { read(id) → record | null, commit(event) → { ok } }; `actor()`: the principal.
export function createSensorConsent({ sensors, backup, store, actor, now = () => Date.now(), createId = () => globalThis.crypto.randomUUID() }) {
    const principal = () => { const id = actor(); if (!id) throw failed('health_account_required'); return id; };
    // 'granted', 'refused', or null while never answered.
    const read = async () => {
        const record = await store.read(sensorConsentId(principal()));
        const value = (record?.properties || record?.props)?.sensor_recording_consent;
        if (!value) return null;
        if (value.version !== 1 || typeof value.granted !== 'boolean' || typeof value.date !== 'string') throw failed('health_sensors_invalid');
        return value.granted ? 'granted' : 'refused';
    };
    const guarded = task => async (input = {}) => {
        try { return await task(input); }
        catch (error) { return { ok: false, error: error.code || error.message }; }
    };
    // Sent in the background: a session never waits for its copy, a failure is reported and retried at the next one.
    const sendCopies = () => backup.backup().catch(error => reportRuntimeError(error, 'health:sensor_backup', { action: 'backup' }));
    const consent = guarded(async () => ({ ok: true, consent: await read() }));
    const setConsent = guarded(async ({ granted }) => {
        if (typeof granted !== 'boolean') throw failed('health_sensors_invalid');
        const id = sensorConsentId(principal()), at = new Date(now()).toISOString(), changeId = `${id}:${createId()}`;
        const result = await store.commit({ kind: 'set', id: changeId, tx_id: changeId, actor: principal(), atome_id: id, type: 'record', scope: 'global',
            props: { source_domain: 'sensor_recording', sensor_recording_consent: { version: 1, granted, date: at }, updated_iso: at } });
        if (result?.ok === false) throw failed('health_sensors_storage_unavailable');
        const device = await sensors.setEnabled({ enabled: granted });
        // A host without a recorder keeps the answer: it only has nothing to pause.
        if (!device.ok && device.error !== 'health_host_unsupported') return device;
        if (granted && device.ok) void sendCopies();
        return { ok: true, consent: granted ? 'granted' : 'refused' };
    });
    // A session records only with the agreement given.
    const start = guarded(async input => ((await read()) === 'granted' ? sensors.start(input) : { ok: true, recording: false }));
    const stop = guarded(async input => {
        const result = await sensors.stop(input);
        if (result.ok && result.stopped && (await read()) === 'granted') void sendCopies();
        return result;
    });
    // A recording deleted here loses its copy too; `all` deletes every copy of the account.
    const remove = guarded(async input => {
        const result = await sensors.remove(input);
        if (!result.ok && result.error !== 'health_host_unsupported') return result;
        const copies = await backup.forget(input);
        return { ok: true, deleted: (result.deleted || 0), copies };
    });
    const restore = guarded(input => backup.restore(input));
    const status = guarded(async () => {
        const answer = await read(), device = await sensors.status(), copies = (await backup.copies()).length;
        return device.ok ? { ...device, consent: answer, copies }
            : device.error === 'health_host_unsupported' ? { ok: true, consent: answer, recordings: 0, bytes: 0, copies } : device;
    });
    return Object.freeze({ ...sensors, start, stop, remove, restore, status, consent, setConsent });
}
