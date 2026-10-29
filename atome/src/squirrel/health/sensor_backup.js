// The encrypted copy of this device's motion recordings (#health_sensors.js) in the account vault, so that
// nothing recorded is lost with the device. Each recording is read from the host piece by piece, encrypted
// here with the account's current backup key (#squirrel/security/backup_keyring.js, which the server never
// holds) and sent through the /ws/api file operations; the server keeps only ciphertext. One account-global
// record describes every copy (an Atome, through the one mutation pipeline): its file, size, pieces, key and
// nonce, never a sample. Deleting a recording deletes its copy; restoring brings a copy back as a recording.
const PIECE = 262144; // the host's piece limit, and one /ws/api file chunk
const TAG = 16;
const ENCRYPTED = PIECE + TAG;
const FILE = /^([0-9]{1,16})-(phone|watch)\.asr$/;

export const sensorBackupsId = actor => `sensor_backups:${encodeURIComponent(actor)}`;
const slotOf = file => `sensor_backup_${file.replace(FILE, '$1_$2')}`;
const failed = code => Object.assign(new Error(code), { code });
const toBase64 = bytes => { let text = ''; for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(text); };
const fromBase64 = text => Uint8Array.from(atob(String(text || '')), char => char.charCodeAt(0));
// Each piece is bound to its file, its place and the count, so none can be swapped, dropped or added.
const ivOf = (nonce, index) => { const iv = new Uint8Array(12); iv.set(nonce); new DataView(iv.buffer).setUint32(8, index); return iv; };
const aadOf = (file, index, count) => new TextEncoder().encode(`atome.sensor_backup.v1\0${file}\0${index}\0${count}`);

// `sensors`: this device's recorder (list, read, restore); `keys()`: the account's backup keys (null for a guest,
// whose recordings have no vault to go to and stay on this device only); `files()`: the
// /ws/api file operations (#apis/unified/adole_adapter.js file); `store`: read/commit of records; `actor()`: the principal.
export function createSensorBackup({ sensors, keys, files, store, actor, crypto = globalThis.crypto, now = () => Date.now(),
    createId = () => globalThis.crypto.randomUUID() }) {
    const principal = () => { const id = actor(); if (!id) throw failed('health_account_required'); return id; };
    const answer = async (pending) => {
        const reply = await pending;
        if (!reply || reply.ok === false || reply.success === false) throw failed('health_sensors_backup_unavailable');
        return reply.data || reply;
    };
    const host = async (pending) => {
        const reply = await pending;
        if (!reply.ok) throw failed(reply.error || 'health_sensors_failed');
        return reply;
    };
    const copies = async () => {
        const record = await store.read(sensorBackupsId(principal()));
        const props = record?.properties || record?.props || {};
        return Object.values(props).filter(value => value?.version === 1 && FILE.test(String(value.file)));
    };
    const describe = async (file, value) => {
        const id = sensorBackupsId(principal()), at = new Date(now()).toISOString(), changeId = `${id}:${createId()}`;
        const result = await store.commit({ kind: 'set', id: changeId, tx_id: changeId, actor: principal(), atome_id: id, type: 'record', scope: 'global',
            props: { source_domain: 'sensor_backup', [slotOf(file)]: value, updated_iso: at } });
        if (result?.ok === false) throw failed('health_sensors_storage_unavailable');
    };

    async function send(ring, { file, bytes }) {
        const keyId = ring.current, key = ring.keys[keyId];
        const api = await files(), nonce = crypto.getRandomValues(new Uint8Array(8));
        const count = Math.max(1, Math.ceil(bytes / PIECE)), upload = `sensor_backup_${createId().replace(/[^a-zA-Z0-9]/g, '')}`;
        for (let index = 0; index < count; index += 1) {
            const piece = await host(sensors.read({ file, offset: index * PIECE, length: PIECE }));
            if (piece.size !== bytes) throw failed('health_sensors_changed');
            const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivOf(nonce, index), additionalData: aadOf(file, index, count) },
                key, fromBase64(piece.data)));
            await answer(api.uploadChunk({ upload_id: upload, chunk_index: index, chunk_count: count, chunk_base64: toBase64(sealed) }));
        }
        const atomeId = `sensor_backup_${file.replace(FILE, '$1_$2')}`;
        await answer(api.uploadComplete({ upload_id: upload, chunk_count: count, file_name: `${file}.e2e`, file_path: `sensor_backups/${file}.e2e`,
            atome_id: atomeId, original_name: `${file}.e2e`, mime_type: 'application/octet-stream' }));
        await describe(file, { version: 1, file, bytes, pieces: count, key_id: keyId, nonce: toBase64(nonce), atome_id: atomeId, sent_iso: new Date(now()).toISOString() });
    }

    // Sends every closed recording of this device that has no copy yet; one run at a time.
    let running = null;
    const backup = () => {
        running ||= (async () => {
            const ring = await keys();
            if (!ring) return { ok: true, sent: 0, vault: false };
            const listed = await host(sensors.list()), status = await host(sensors.status());
            const sent = new Set((await copies()).map(copy => copy.file));
            const due = listed.recordings.filter(entry => !sent.has(entry.file) && entry.file !== status.recording && entry.bytes > 0);
            for (const entry of due) await send(ring, entry);
            return { ok: true, sent: due.length };
        })().finally(() => { running = null; });
        return running;
    };

    // Brings back the copies missing from this device (all, or one file).
    async function restore({ file } = {}) {
        const ring = await keys();
        if (!ring) throw failed('health_account_required');
        const api = await files();
        const here = new Set((await host(sensors.list())).recordings.map(entry => entry.file));
        const wanted = (await copies()).filter(copy => !here.has(copy.file) && (!file || copy.file === file));
        for (const copy of wanted) {
            const key = ring.keys[copy.key_id];
            if (!key) throw failed('health_sensors_key_missing');
            const nonce = fromBase64(copy.nonce);
            for (let index = 0; index < copy.pieces; index += 1) {
                const chunk = await answer(api.downloadChunk({ atome_id: copy.atome_id, chunk_index: index, chunk_size: ENCRYPTED }));
                let plain;
                try {
                    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivOf(nonce, index), additionalData: aadOf(copy.file, index, copy.pieces) },
                        key, fromBase64(chunk.chunk_base64)));
                } catch (_) { throw failed('health_sensors_backup_invalid'); }
                await host(sensors.restore({ file: copy.file, offset: index * PIECE, data: toBase64(plain), final: index === copy.pieces - 1 }));
            }
        }
        return { ok: true, restored: wanted.length };
    }

    // The copies of the deleted recordings go with them (every copy of the account with `all`).
    async function forget({ file, all }) {
        const api = await files();
        const gone = (await copies()).filter(copy => all === true || copy.file === file);
        for (const copy of gone) {
            const reply = await api.remove({ atome_id: copy.atome_id });
            if (reply?.success === false && reply.status !== 404) throw failed('health_sensors_backup_unavailable');
            await describe(copy.file, null);
        }
        return gone.length;
    }

    return { backup, restore, forget, copies };
}
