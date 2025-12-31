// Audio recorder example (Squirrel UI only)
// - Creates a single toggle button to start/stop recording
// - Records microphone input, encodes a mono 16-bit PCM WAV (16 kHz)
// - Uploads the WAV to Fastify `POST /api/uploads` so it is saved on disk
//   in the logged user's Downloads folder (server-side path resolution).

(function () {
    const TARGET_SR = 16000; // Speech-recognition friendly
    const CHUNK_SEC = 0.12;

    const QUEUE_KEY = '__SQUIRREL_AUDIO_UPLOAD_QUEUE__';
    const IDB_NAME = 'squirrel_audio_recorder';
    const IDB_STORE = 'files';
    const SYNC_INTERVAL_MS = 15_000;

    function isBrowser() {
        return typeof window !== 'undefined' && typeof document !== 'undefined';
    }

    function isTauriRuntime() {
        if (!isBrowser()) return false;
        return !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    }

    function getTauriHttpBaseUrl() {
        if (!isBrowser()) return '';
        const port = window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || 3000;
        return `http://127.0.0.1:${port}`;
    }

    function getLocalAuthToken() {
        try {
            return localStorage.getItem('local_auth_token') || '';
        } catch (_) {
            return '';
        }
    }

    function getAdoleAPI() {
        if (!isBrowser()) return null;
        return window.AdoleAPI || (typeof AdoleAPI !== 'undefined' ? AdoleAPI : null);
    }

    async function getCurrentUserInfo() {
        const api = getAdoleAPI();
        if (!api || !api.auth || typeof api.auth.current !== 'function') {
            return { ok: false, error: 'AdoleAPI.auth.current() is not available', user: null };
        }
        try {
            const res = await api.auth.current();
            const user = res && res.logged ? res.user : null;
            const userId = user ? (user.user_id || user.atome_id || user.id || null) : null;
            const username = user ? (user.username || null) : null;
            if (!userId) return { ok: false, error: 'No logged in user (required for Tauri local storage)', user: null };
            return { ok: true, user: { ...user, user_id: userId, username } };
        } catch (e) {
            return { ok: false, error: e && e.message ? e.message : String(e), user: null };
        }
    }

    async function saveWavToTauriUserData({ fileName, wavArrayBuffer }) {
        const base = getTauriHttpBaseUrl();
        if (!base) throw new Error('Tauri local HTTP base URL is not available');

        const token = getLocalAuthToken();
        if (!token) throw new Error('Missing local_auth_token (required for Tauri local save)');

        const res = await fetch(`${base}/api/user-recordings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'X-Filename': encodeURIComponent(fileName),
                'Authorization': `Bearer ${token}`
            },
            body: new Uint8Array(wavArrayBuffer)
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.success !== true) {
            const msg = json && json.error ? json.error : `Tauri local save failed (${res.status})`;
            throw new Error(msg);
        }
        return json;
    }

    function getQueue() {
        try {
            const raw = localStorage.getItem(QUEUE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function setQueue(queue) {
        try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue || [])); } catch (_) { }
    }

    function enqueueUpload(job) {
        const q = getQueue();
        q.push(job);
        setQueue(q);
    }

    function markJobDone(id) {
        const q = getQueue().filter(j => j && j.id !== id);
        setQueue(q);
    }

    function nowIso() {
        try { return new Date().toISOString(); } catch (_) { return String(Date.now()); }
    }

    function randomId() {
        return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function isOnline() {
        if (!isBrowser()) return false;
        // In Tauri, navigator.onLine may be unreliable; treat missing as online.
        if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
        return navigator.onLine;
    }

    function openIdb() {
        return new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open(IDB_NAME, 1);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(IDB_STORE)) {
                        db.createObjectStore(IDB_STORE);
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
            } catch (e) {
                reject(e);
            }
        });
    }

    async function idbPut(key, value) {
        const db = await openIdb();
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error || new Error('IndexedDB put failed'));
                tx.objectStore(IDB_STORE).put(value, key);
            } catch (e) {
                reject(e);
            }
        });
    }

    async function idbGet(key) {
        const db = await openIdb();
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readonly');
                tx.onerror = () => reject(tx.error || new Error('IndexedDB get failed'));
                const req = tx.objectStore(IDB_STORE).get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error || new Error('IndexedDB get failed'));
            } catch (e) {
                reject(e);
            }
        });
    }

    async function idbDel(key) {
        const db = await openIdb();
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
                tx.objectStore(IDB_STORE).delete(key);
            } catch (e) {
                reject(e);
            }
        });
    }

    async function tryTauriCreateDir(dirPath) {
        const tauri = (isBrowser() && window.__TAURI__) ? window.__TAURI__ : null;
        const fs = tauri && tauri.fs ? tauri.fs : null;
        if (!fs || typeof fs.createDir !== 'function') {
            return { ok: false, error: 'Tauri fs.createDir is not available' };
        }
        try {
            await fs.createDir(dirPath, { recursive: true });
            return { ok: true };
        } catch (e) {
            // Some builds use a different signature.
            try {
                await fs.createDir({ dir: dirPath, recursive: true });
                return { ok: true };
            } catch (e2) {
                return { ok: false, error: (e2 && e2.message) ? e2.message : ((e && e.message) ? e.message : 'createDir failed') };
            }
        }
    }

    async function tryTauriWriteBinaryFile(path, bytes) {
        const tauri = (isBrowser() && window.__TAURI__) ? window.__TAURI__ : null;
        const fs = tauri && tauri.fs ? tauri.fs : null;
        if (!fs || typeof fs.writeBinaryFile !== 'function') {
            return { ok: false, error: 'Tauri fs.writeBinaryFile is not available' };
        }
        // Ensure parent directory exists.
        try {
            const parent = String(path).replace(/\\/g, '/').split('/').slice(0, -1).join('/');
            if (parent) {
                const mk = await tryTauriCreateDir(parent);
                if (!mk.ok) return { ok: false, error: mk.error || 'Unable to create parent directory' };
            }
        } catch (_) { }
        // Support both signatures:
        // - writeBinaryFile({ path, contents })
        // - writeBinaryFile(path, contents)
        try {
            const contents = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
            let res;
            try {
                res = await fs.writeBinaryFile({ path, contents });
            } catch (_) {
                res = await fs.writeBinaryFile(path, contents);
            }
            return { ok: true, result: res, path };
        } catch (e) {
            return { ok: false, error: e && e.message ? e.message : String(e) };
        }
    }

    async function tryTauriReadBinaryFile(path) {
        const tauri = (isBrowser() && window.__TAURI__) ? window.__TAURI__ : null;
        const fs = tauri && tauri.fs ? tauri.fs : null;
        if (!fs || typeof fs.readBinaryFile !== 'function') return null;
        try {
            const out = await fs.readBinaryFile(path);
            if (!out) return null;
            return (out instanceof Uint8Array) ? out : new Uint8Array(out);
        } catch (_) {
            return null;
        }
    }

    async function createAudioRecordingAtome({ ownerId, fileName, relPath, durationSec, sampleRate, channels, sizeBytes }) {
        const api = getAdoleAPI();
        if (!api || !api.atomes || typeof api.atomes.create !== 'function') {
            throw new Error('AdoleAPI.atomes.create() is not available');
        }
        const atomeId = `audio_recording_${randomId()}`;
        const particles = {
            kind: 'audio_recording',
            file_name: fileName,
            file_path: relPath,
            mime_type: 'audio/wav',
            duration_sec: durationSec,
            sample_rate: sampleRate,
            channels,
            size_bytes: sizeBytes,
            created_iso: nowIso()
        };
        const res = await api.atomes.create({
            id: atomeId,
            type: 'audio_recording',
            ownerId,
            parentId: ownerId,
            particles
        });
        const ok = !!(res && (res.success || res.ok));
        if (!ok) {
            throw new Error(res && (res.error || res.message) ? (res.error || res.message) : 'Atome create failed');
        }
        return { atomeId, result: res };
    }

    async function persistRecordingLocally({ fileName, wavArrayBuffer, durationSec, sampleRate, channels }) {
        const id = randomId();
        const createdAt = nowIso();
        const bytes = new Uint8Array(wavArrayBuffer);

        // Tauri local mode requirement:
        // - Save under data/users/<current_user>/...
        // - Register as an atome so it is discoverable and syncable.
        if (isTauriRuntime()) {
            const userInfo = await getCurrentUserInfo();
            if (!userInfo.ok) throw new Error(userInfo.error || 'Unable to resolve current user');
            const userId = userInfo.user.user_id;
            const writeRes = await saveWavToTauriUserData({ fileName, wavArrayBuffer });
            const tauriRelPath = (writeRes && typeof writeRes.path === 'string' && writeRes.path)
                ? writeRes.path
                : `data/users/${userId}/recordings/${fileName}`;

            const atome = await createAudioRecordingAtome({
                ownerId: userId,
                fileName,
                relPath: tauriRelPath,
                durationSec,
                sampleRate,
                channels,
                sizeBytes: bytes.length
            });

            try {
                // Best effort: trigger sync if available; offline will queue.
                const api = getAdoleAPI();
                if (api && api.sync && typeof api.sync.sync === 'function') {
                    await api.sync.sync();
                }
            } catch (_) { }

            return { id: atome.atomeId, createdAt, backend: 'tauri-data-users', tauriPath: tauriRelPath, atomeId: atome.atomeId };
        }

        // Browser-only: store in IndexedDB.
        await idbPut(id, { bytes, fileName, createdAt, mime: 'audio/wav' });
        return { id, createdAt, backend: 'idb' };
    }

    function getAuthToken() {
        try {
            return (
                localStorage.getItem('cloud_auth_token') ||
                localStorage.getItem('auth_token') ||
                localStorage.getItem('local_auth_token') ||
                ''
            );
        } catch (_) {
            return '';
        }
    }

    function getFastifyBaseUrl() {
        const globalBase = (typeof window.__SQUIRREL_FASTIFY_URL__ === 'string')
            ? window.__SQUIRREL_FASTIFY_URL__.trim()
            : '';
        if (globalBase) return globalBase.replace(/\/$/, '');
        try {
            return String(location.origin || '').replace(/\/$/, '');
        } catch (_) {
            return '';
        }
    }

    function sanitizeFileName(name) {
        const raw = (typeof name === 'string' && name.trim()) ? name.trim() : `recording_${Date.now()}.wav`;
        const base = raw.split('/').pop().split('\\').pop();
        const cleaned = base.replace(/[^a-z0-9._-]/gi, '_');
        return cleaned.toLowerCase().endsWith('.wav') ? cleaned : `${cleaned}.wav`;
    }

    function downsampleFloat32ToInt16Mono(inputFloat32, inputSampleRate, targetSampleRate) {
        if (!inputFloat32 || inputFloat32.length === 0) return new Int16Array(0);

        const inRate = Number(inputSampleRate) || 48000;
        const outRate = Number(targetSampleRate) || 16000;

        if (inRate === outRate) {
            const out = new Int16Array(inputFloat32.length);
            for (let i = 0; i < inputFloat32.length; i++) {
                const s = Math.max(-1, Math.min(1, inputFloat32[i]));
                out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
            }
            return out;
        }

        const ratio = inRate / outRate;
        const outLength = Math.max(1, Math.floor(inputFloat32.length / ratio));
        const out = new Int16Array(outLength);

        // Simple box filter resampling (good enough for speech capture MVP)
        let inPos = 0;
        for (let outPos = 0; outPos < outLength; outPos++) {
            const nextInPos = (outPos + 1) * ratio;
            let sum = 0;
            let count = 0;
            while (inPos < nextInPos && inPos < inputFloat32.length) {
                sum += inputFloat32[Math.floor(inPos)];
                count++;
                inPos += 1;
            }
            const avg = count ? (sum / count) : 0;
            const s = Math.max(-1, Math.min(1, avg));
            out[outPos] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
        }

        return out;
    }

    function encodeWav16Mono(int16Samples, sampleRate) {
        const sr = Number(sampleRate) || TARGET_SR;
        const numChannels = 1;
        const bytesPerSample = 2;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sr * blockAlign;
        const dataSize = int16Samples.length * bytesPerSample;

        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        function writeAscii(offset, str) {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        }

        writeAscii(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeAscii(8, 'WAVE');
        writeAscii(12, 'fmt ');
        view.setUint32(16, 16, true); // PCM
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sr, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true); // bits per sample
        writeAscii(36, 'data');
        view.setUint32(40, dataSize, true);

        // PCM payload
        let o = 44;
        for (let i = 0; i < int16Samples.length; i++, o += 2) {
            view.setInt16(o, int16Samples[i], true);
        }

        return buffer;
    }

    async function uploadToFastify(fileName, arrayBuffer, contentType) {
        const base = getFastifyBaseUrl();
        if (!base) throw new Error('Fastify base URL is not configured');

        const token = getAuthToken();
        // IMPORTANT: Fastify server registers a Buffer parser only for
        // `application/octet-stream` (otherwise it returns 415).
        const headers = {
            'Content-Type': 'application/octet-stream',
            'X-Filename': encodeURIComponent(fileName)
        };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`${base}/api/uploads`, {
            method: 'POST',
            headers,
            body: new Uint8Array(arrayBuffer)
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.success !== true) {
            const msg = json && json.error ? json.error : `Upload failed (${res.status})`;
            throw new Error(msg);
        }
        return json;
    }

    let __syncInFlight = false;
    async function syncQueuedUploads() {
        if (!isBrowser()) return;
        // In Tauri, we rely on AdoleAPI.sync (no custom HTTP upload queue here).
        if (isTauriRuntime()) return;
        if (__syncInFlight) return;
        if (!isOnline()) return;
        const q = getQueue();
        if (!q.length) return;

        __syncInFlight = true;
        try {
            for (const job of q) {
                if (!job || !job.id || !job.fileName) continue;
                try {
                    let bytes = null;
                    if (job.backend === 'tauri' && job.tauriPath) {
                        bytes = await tryTauriReadBinaryFile(job.tauriPath);
                    }
                    if (!bytes) {
                        const stored = await idbGet(job.id).catch(() => null);
                        bytes = stored && stored.bytes ? stored.bytes : null;
                    }
                    if (!bytes || !bytes.length) {
                        console.warn('[record_audio] Missing local bytes for job:', job.id);
                        markJobDone(job.id);
                        await idbDel(job.id).catch(() => null);
                        continue;
                    }

                    await uploadToFastify(job.fileName, bytes.buffer, 'application/octet-stream');
                    markJobDone(job.id);
                    await idbDel(job.id).catch(() => null);
                } catch (e) {
                    // Keep it queued; try next time.
                    console.warn('[record_audio] Sync upload failed, will retry:', e && e.message ? e.message : e);
                    break;
                }
            }
        } finally {
            __syncInFlight = false;
        }
    }

    const REC_WORKLET_SOURCE = `
class SquirrelMicRecorder extends AudioWorkletProcessor {
	constructor(options) {
		super();
		const sec = options && options.processorOptions && options.processorOptions.chunkSec;
		const chunkSec = Math.min(0.5, Math.max(0.02, Number(sec) || 0.12));
		this.chunkSamples = Math.max(128, Math.round(chunkSec * sampleRate));
		this.buf = new Float32Array(this.chunkSamples);
		this.write = 0;
	}
	process(inputs) {
		const input = inputs && inputs[0] ? inputs[0] : null;
		if (!input || input.length === 0) return true;
		const ch0 = input[0] || null;
		if (!ch0) return true;
		const ch1 = input[1] || null;

		const n = ch0.length;
		for (let i = 0; i < n; i++) {
			const mono = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
			this.buf[this.write++] = mono;
			if (this.write >= this.buf.length) {
				// Transfer ownership to reduce copies
				this.port.postMessage({ type: 'chunk', sr: sampleRate, pcm: this.buf }, [this.buf.buffer]);
				this.buf = new Float32Array(this.chunkSamples);
				this.write = 0;
			}
		}
		return true;
	}
}
registerProcessor('squirrel-mic-recorder', SquirrelMicRecorder);
`;

    let __recording = null;

    /**
     * record_audio(filename, path?)
     * - filename: file name to store (server-side will sanitize)
     * - path: reserved for future (native backends). Not used by the Fastify upload endpoint.
     */
    async function record_audio(filename, path) {
        if (__recording && __recording.state === 'recording') {
            throw new Error('A recording is already in progress');
        }

        const fileName = sanitizeFileName(filename);
        const constraints = {
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') {
            try { await ctx.resume(); } catch (_) { }
        }

        const src = ctx.createMediaStreamSource(stream);

        const blob = new Blob([REC_WORKLET_SOURCE], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(workletUrl);

        const node = new AudioWorkletNode(ctx, 'squirrel-mic-recorder', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            processorOptions: { chunkSec: CHUNK_SEC }
        });

        // Keep graph alive in some WebViews by connecting to a silent sink
        const silent = ctx.createGain();
        silent.gain.value = 0;

        src.connect(node);
        node.connect(silent);
        silent.connect(ctx.destination);

        const chunks = [];
        let inputSampleRate = ctx.sampleRate;
        let totalFrames = 0;

        node.port.onmessage = (ev) => {
            const msg = ev && ev.data ? ev.data : null;
            if (!msg || msg.type !== 'chunk' || !msg.pcm) return;
            inputSampleRate = msg.sr || inputSampleRate;
            const f32 = msg.pcm;
            try {
                totalFrames += f32.length;
                chunks.push(f32);
            } catch (e) {
                console.warn('Recorder chunk handling failed:', e);
            }
        };

        __recording = {
            state: 'recording',
            fileName,
            path: path || null,
            stream,
            ctx,
            node,
            src,
            silent,
            chunks,
            getStats: () => ({ inputSampleRate, totalFrames, fileName })
        };

        const stop = async () => {
            if (!__recording || __recording.state !== 'recording') {
                return { success: false, error: 'No active recording' };
            }
            __recording.state = 'stopping';

            try { __recording.src.disconnect(); } catch (_) { }
            try { __recording.node.disconnect(); } catch (_) { }
            try { __recording.silent.disconnect(); } catch (_) { }

            try {
                if (__recording.stream) {
                    __recording.stream.getTracks().forEach((t) => t.stop());
                }
            } catch (_) { }

            try { await __recording.ctx.close(); } catch (_) { }

            // Merge chunks to one Float32Array
            let merged = new Float32Array(0);
            if (__recording.chunks.length) {
                const total = __recording.chunks.reduce((acc, a) => acc + (a ? a.length : 0), 0);
                merged = new Float32Array(total);
                let offset = 0;
                for (const part of __recording.chunks) {
                    if (!part || !part.length) continue;
                    merged.set(part, offset);
                    offset += part.length;
                }
            }

            const pcm16 = downsampleFloat32ToInt16Mono(merged, inputSampleRate, TARGET_SR);
            const wav = encodeWav16Mono(pcm16, TARGET_SR);

            const durationSec = pcm16.length / TARGET_SR;

            // Offline-first:
            // 1) Persist locally immediately.
            // 2) Try upload; if it fails, keep a queue entry and sync later.
            const localInfo = await persistRecordingLocally({
                fileName: __recording.fileName,
                wavArrayBuffer: wav,
                durationSec,
                sampleRate: TARGET_SR,
                channels: 1
            });
            const job = {
                id: localInfo.id,
                fileName: __recording.fileName,
                createdAt: localInfo.createdAt,
                backend: localInfo.backend,
                tauriPath: localInfo.tauriPath || null
            };

            let uploadResult = null;
            // In Tauri local mode, persistence+atome creation is the source of truth;
            // syncing to Fastify is handled by AdoleAPI.sync.
            if (!isTauriRuntime()) {
                try {
                    uploadResult = await uploadToFastify(__recording.fileName, wav, 'application/octet-stream');
                    // Uploaded now: cleanup local queue+idb.
                    markJobDone(job.id);
                    await idbDel(job.id).catch(() => null);
                } catch (e) {
                    enqueueUpload(job);
                    console.warn('[record_audio] Upload failed, kept locally and queued for sync:', e && e.message ? e.message : e);
                }
            }

            const result = {
                success: true,
                // Upload may be deferred; expose local info.
                uploaded: !!(uploadResult && uploadResult.success),
                file: uploadResult ? uploadResult.file : null,
                owner: uploadResult ? uploadResult.owner : null,
                local: { id: job.id, backend: job.backend, tauriPath: job.tauriPath, atomeId: localInfo.atomeId || null },
                duration_sec: durationSec,
                sample_rate: TARGET_SR,
                channels: 1
            };

            __recording = null;
            return result;
        };

        return {
            fileName,
            stop,
            getStats: __recording.getStats
        };
    }

    // Expose globally (used by future voice recognition pipeline)
    if (isBrowser()) {
        window.record_audio = record_audio;
    }

    // Background sync: retry on connectivity changes + small timer.
    if (isBrowser()) {
        try {
            window.addEventListener('online', () => { syncQueuedUploads().catch(() => null); });
        } catch (_) { }
        try {
            setInterval(() => { syncQueuedUploads().catch(() => null); }, SYNC_INTERVAL_MS);
        } catch (_) { }
        // Kick once on load
        try { syncQueuedUploads().catch(() => null); } catch (_) { }
    }

    // UI: single toggle button
    if (isBrowser()) {
        const root = $('div', {
            id: 'record-audio-example',
            parent: '#view',
            css: { position: 'relative', padding: '14px' }
        });

        const state = { ctrl: null };

        const recBtn = Button({
            template: 'flat_modern',
            onText: 'Stop recording',
            offText: 'Record audio',
            parent: root,
            css: { position: 'relative' },
            onAction: async () => {
                try {
                    const name = `mic_${Date.now()}.wav`;
                    state.ctrl = await record_audio(name);
                    console.log('Recording started:', state.ctrl.fileName);
                } catch (e) {
                    console.warn('Failed to start recording:', e && e.message ? e.message : e);
                    try { recBtn.setState(false); } catch (_) { }
                }
            },
            offAction: async () => {
                try {
                    if (!state.ctrl) return;
                    const res = await state.ctrl.stop();
                    console.log('Recording saved:', res);
                    state.ctrl = null;
                } catch (e) {
                    console.warn('Failed to stop/upload recording:', e && e.message ? e.message : e);
                    state.ctrl = null;
                }
            }
        });

        // Default state: not recording
        try { recBtn.setState(false); } catch (_) { }
    }
})();
