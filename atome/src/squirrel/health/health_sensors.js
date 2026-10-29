// The raw motion of this device during an activity session, recorded by the host in the sensor
// recording format (atome/documentations/sensor_recording_format.md): iOS HealthSensorRecorder.swift,
// Android HealthSensorRecorder.kt. The files never leave the device unencrypted; the page only says when a session
// starts and ends, and lists, sizes, deletes or pauses them, or reads them piece by piece for their encrypted
// copy in the account vault (#sensor_backup.js). No health store is read, so the host asks no
// association (health_link), only the verified account. Replies carry no sample.

const sessionOf = value => {
    const id = String(value || '');
    if (!id || id.length > 300) throw new Error('health_sensors_invalid');
    return id;
};
const fileOf = value => {
    const name = String(value || '');
    if (!/^[0-9]{1,16}-(phone|watch)\.asr$/.test(name)) throw new Error('health_sensors_invalid');
    return name;
};

export function createHealthSensorRecorder({ call, context, describe }) {
    const send = async (command, payload = {}) => {
        if (!describe().supported) return { ok: false, error: describe().reason };
        const reply = await call(command, payload, context());
        if (reply.stale) return { ok: false, error: 'health_context_changed' };
        if (!reply.ok || reply.result?.ok === false) return { ok: false, error: reply.error || reply.result?.error || 'health_sensors_failed' };
        return { ok: true, ...reply.result };
    };
    const guarded = task => async (input = {}) => {
        try { return await task(input); }
        catch (error) { return { ok: false, error: error.message }; }
    };
    return Object.freeze({
        start: guarded(({ sessionId, startedAt }) => send('health_sensors_start', { session: sessionOf(sessionId), at: Date.parse(startedAt) || Date.now() })),
        stop: guarded(({ sessionId }) => send('health_sensors_stop', { session: sessionOf(sessionId) })),
        status: guarded(() => send('health_sensors_status')),
        list: guarded(() => send('health_sensors_list')),
        // One recording by its file name, or every one of this device (`all`).
        remove: guarded(({ file, all }) => send('health_sensors_delete', all === true ? { all: true } : { file: fileOf(file) })),
        // A piece of a closed recording (≤ 256 KiB, base64), for its encrypted copy (#sensor_backup.js).
        read: guarded(({ file, offset, length }) => send('health_sensors_read', { file: fileOf(file), offset, length })),
        // A recording brought back from its copy, piece after piece, whole once `final`.
        restore: guarded(({ file, offset, data, final }) => send('health_sensors_restore', { file: fileOf(file), offset, data, final: final === true })),
        setEnabled: guarded(({ enabled }) => {
            if (typeof enabled !== 'boolean') throw new Error('health_sensors_invalid');
            return send('health_sensors_enable', { enabled });
        })
    });
}
