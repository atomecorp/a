// Audio recorder example (Squirrel UI only)
// - Creates a single toggle button to start/stop recording
// - Records microphone input, encodes a mono 16-bit PCM WAV (16 kHz)
// - Uploads the WAV to Fastify `POST /api/uploads` so it is saved on disk
//   in the logged user's Downloads folder (server-side path resolution).

(function () {
    const TARGET_SR = 16000; // Speech-recognition friendly
    const CHUNK_SEC = 0.12;

    const RECORD_BACKENDS = {
        WEBAUDIO: 'webaudio',
        IPLUG2: 'iplug2'
    };

    const QUEUE_KEY = '__SQUIRREL_AUDIO_UPLOAD_QUEUE__';
    const IDB_NAME = 'squirrel_audio_recorder';
    const IDB_STORE = 'files';
    const SYNC_INTERVAL_MS = 15_000;
    const MEDIA_EXTS = {
        audio: new Set(['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'aif', 'aiff', 'weba']),
        video: new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi']),
        image: new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff'])
    };

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
            particles
        });

        const ok = !!(
            res?.tauri?.success || res?.fastify?.success ||
            res?.tauri?.ok || res?.fastify?.ok
        );

        if (!ok) {
            const tauriError = res?.tauri?.error;
            const fastifyError = res?.fastify?.error;
            const details = (tauriError || fastifyError)
                ? `Tauri: ${tauriError || 'n/a'} | Fastify: ${fastifyError || 'n/a'}`
                : (res ? JSON.stringify(res) : 'no response');
            throw new Error(`Atome create failed (${details})`);
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
            const isTauri = isTauriRuntime();
            return (
                localStorage.getItem('cloud_auth_token') ||
                localStorage.getItem('auth_token') ||
                (isTauri ? localStorage.getItem('local_auth_token') : '') ||
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
        const preferred = globalBase ? globalBase.replace(/\/$/, '') : '';
        if (preferred && !shouldUseFastifyBase(preferred)) return '';
        if (preferred) return preferred;
        try {
            const fallback = String(location.origin || '').replace(/\/$/, '');
            return shouldUseFastifyBase(fallback) ? fallback : '';
        } catch (_) {
            return '';
        }
    }

    function shouldUseFastifyBase(base) {
        if (!isTauriRuntime()) return true;
        if (window.__SQUIRREL_FORCE_FASTIFY__ === true) return true;
        const candidate = (typeof base === 'string') ? base.trim() : '';
        if (!candidate) return false;

        if (typeof window._checkFastifyAvailable === 'function') {
            const available = window._checkFastifyAvailable();
            if (available === false) return false;
            if (available === true) return true;
        }

        try {
            const parsed = new URL(candidate);
            const host = parsed.hostname;
            const port = parsed.port || '';
            const isLocalHost = host === '127.0.0.1' || host === 'localhost';
            const isDefaultPort = port === '' || port === '3001';
            if (!isLocalHost || !isDefaultPort) return true;
        } catch {
            return false;
        }

        try {
            const token = localStorage.getItem('cloud_auth_token') || localStorage.getItem('auth_token');
            if (token) return true;
        } catch { }

        try {
            const pending = JSON.parse(localStorage.getItem('auth_pending_sync') || '[]');
            if (Array.isArray(pending) && pending.length > 0) return true;
        } catch { }

        return false;
    }

    function getFileExtension(name) {
        if (typeof name !== 'string') return '';
        const base = name.split('/').pop().split('\\').pop();
        const parts = base.split('.');
        if (parts.length < 2) return '';
        return parts[parts.length - 1].toLowerCase();
    }

    function detectMediaKind({ name, mime }) {
        const mimeType = (typeof mime === 'string' && mime.trim()) ? mime.trim().toLowerCase() : '';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('image/')) return 'image';
        const ext = getFileExtension(name);
        if (MEDIA_EXTS.audio.has(ext)) return 'audio';
        if (MEDIA_EXTS.video.has(ext)) return 'video';
        if (MEDIA_EXTS.image.has(ext)) return 'image';
        return 'other';
    }

    function isAllowedMediaKind(kind, allowed) {
        if (!allowed || !allowed.size) return true;
        return allowed.has(kind);
    }

    function isSafeFileIdentifier(raw) {
        if (typeof raw !== 'string') return false;
        const trimmed = raw.trim();
        if (!trimmed) return false;
        if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) return false;
        return /^[a-zA-Z0-9._-]+$/.test(trimmed);
    }

    function buildAuthHeaders(extra = {}) {
        const token = getAuthToken();
        const headers = { ...extra };
        if (token) headers.Authorization = `Bearer ${token}`;
        return headers;
    }

    function buildLocalAuthHeaders(extra = {}) {
        const token = getLocalAuthToken();
        const headers = { ...extra };
        if (token) headers.Authorization = `Bearer ${token}`;
        return headers;
    }

    function extractList(result, key) {
        const direct = result?.[key];
        if (Array.isArray(direct)) return direct;
        const data = result?.data;
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.[key])) return data[key];
        return [];
    }

    function pickAuthoritativeList(result, key) {
        const fastifyError = result?.fastify?.error || null;
        const tauriError = result?.tauri?.error || null;
        const fastifyItems = extractList(result?.fastify, key);
        const tauriItems = extractList(result?.tauri, key);

        if (!fastifyError) return fastifyItems;
        if (!tauriError) return tauriItems;
        return fastifyItems.length ? fastifyItems : tauriItems;
    }

    function normalizeParticles(raw) {
        return raw?.particles || raw?.data || {};
    }

    function normalizeAtomeId(raw) {
        return raw?.atome_id || raw?.id || null;
    }

    function guessMimeFromExt(name) {
        const ext = getFileExtension(name);
        if (!ext) return '';
        const audio = {
            wav: 'audio/wav',
            mp3: 'audio/mpeg',
            m4a: 'audio/mp4',
            aac: 'audio/aac',
            ogg: 'audio/ogg',
            flac: 'audio/flac',
            opus: 'audio/opus',
            weba: 'audio/webm',
            aif: 'audio/aiff',
            aiff: 'audio/aiff'
        };
        const video = {
            mp4: 'video/mp4',
            mov: 'video/quicktime',
            m4v: 'video/x-m4v',
            webm: 'video/webm',
            mkv: 'video/x-matroska',
            avi: 'video/x-msvideo'
        };
        const image = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            bmp: 'image/bmp',
            tif: 'image/tiff',
            tiff: 'image/tiff'
        };
        if (audio[ext]) return audio[ext];
        if (video[ext]) return video[ext];
        if (image[ext]) return image[ext];
        return '';
    }

    async function listRecordingAtomes(types = ['audio_recording']) {
        const api = getAdoleAPI();
        if (!api?.atomes || typeof api.atomes.list !== 'function') {
            return { ok: false, files: [] };
        }
        const typeList = (Array.isArray(types) && types.length) ? types : ['audio_recording'];
        const files = [];
        for (const type of typeList) {
            try {
                const res = await api.atomes.list({ type });
                const raw = pickAuthoritativeList(res, 'atomes');
                raw.forEach((item) => {
                    const particles = normalizeParticles(item);
                    const fileName = particles.file_name || particles.fileName || particles.name || '';
                    const filePath = particles.file_path || particles.filePath || '';
                    const displayName = fileName || filePath || 'recording';
                    const mimeType = particles.mime_type || particles.mimeType || '';
                    const kind = detectMediaKind({ name: displayName, mime: mimeType });
                    files.push({
                        id: normalizeAtomeId(item),
                        name: displayName,
                        file_name: fileName || displayName,
                        file_path: filePath || null,
                        owner_id: item?.owner_id || item?.ownerId || particles.owner_id || particles.ownerId || null,
                        shared: false,
                        kind,
                        size: particles.size_bytes || particles.size || null,
                        modified: item?.updated_at || particles.updated_at || particles.created_iso || null,
                        created_at: item?.created_at || particles.created_iso || null,
                        mime_type: mimeType,
                        source: 'recording',
                        atome_type: item?.atome_type || item?.type || type
                    });
                });
            } catch (e) {
                return { ok: false, error: e?.message || String(e), files: [] };
            }
        }
        return { ok: true, files };
    }

    async function listAudioRecordingAtomes() {
        return listRecordingAtomes(['audio_recording']);
    }

    async function listFileAtomes() {
        const api = getAdoleAPI();
        if (!api?.atomes || typeof api.atomes.list !== 'function') {
            return { ok: false, files: [] };
        }
        try {
            const res = await api.atomes.list({ type: 'file' });
            const raw = pickAuthoritativeList(res, 'atomes');
            return { ok: true, files: raw };
        } catch (e) {
            return { ok: false, error: e?.message || String(e), files: [] };
        }
    }

    async function list_user_media_files(options = {}) {
        const base = getFastifyBaseUrl();
        const types = Array.isArray(options.types) ? new Set(options.types) : null;
        const combined = [];
        const seen = new Set();
        const noteSeen = (key) => {
            if (!key) return false;
            if (seen.has(key)) return true;
            seen.add(key);
            return false;
        };

        if (base) {
            try {
                const res = await fetch(`${base}/api/uploads`, {
                    method: 'GET',
                    headers: buildAuthHeaders({ 'Accept': 'application/json' }),
                    credentials: 'omit'
                });

                const json = await res.json().catch(() => null);
                if (res.ok && json && json.success === true) {
                    const rawFiles = Array.isArray(json.files) ? json.files : (Array.isArray(json.data) ? json.data : []);
                    for (const entry of rawFiles) {
                        if (!entry) continue;
                        const name = entry.name || entry.file_name || entry.original_name || '';
                        const fileName = entry.file_name || entry.name || entry.original_name || '';
                        const kind = detectMediaKind({ name: fileName, mime: entry.mime_type || entry.mime });
                        if (!isAllowedMediaKind(kind, types)) continue;
                        const id = entry.id || entry.atome_id || null;
                        const key = id || fileName;
                        if (noteSeen(key)) continue;
                        combined.push({
                            id,
                            name,
                            file_name: fileName,
                            owner_id: entry.owner_id || null,
                            shared: !!entry.shared,
                            kind,
                            size: entry.size || null,
                            modified: entry.modified || entry.updated_at || entry.created_at || null,
                            mime_type: entry.mime_type || entry.mime || null,
                            source: 'uploads'
                        });
                    }
                }
            } catch (_) {
                // Ignore Fastify list errors; recordings list may still be available.
            }
        }

        const recordings = await listRecordingAtomes(['audio_recording', 'video_recording']);
        if (recordings?.files?.length) {
            recordings.files.forEach((entry) => {
                const kind = entry.kind || detectMediaKind({ name: entry.file_name || entry.name, mime: entry.mime_type });
                if (!isAllowedMediaKind(kind, types)) return;
                const key = (!isTauriRuntime() && entry.file_name)
                    ? entry.file_name
                    : (entry.id || entry.file_path || entry.file_name);
                if (noteSeen(key)) return;
                combined.push({ ...entry, kind });
            });
        }

        if (options.debug) {
            console.groupCollapsed('[record_audio] list_user_media_files debug');
            try {
                console.log('Fastify base:', base || '(none)');
                console.log('Tauri runtime:', isTauriRuntime());
                console.log('Types filter:', types ? Array.from(types) : 'all');
                console.log('Uploads files:', combined.filter(f => f.source === 'uploads').length);
                console.log('Recordings files:', combined.filter(f => f.source === 'recording').length);
                console.log('Combined:', combined);
                const recordingsRaw = await listRecordingAtomes(['audio_recording', 'video_recording']);
                console.log('recording atomes:', recordingsRaw);
                const fileAtomes = await listFileAtomes();
                console.log('file atomes:', fileAtomes);
            } catch (e) {
                console.warn('[record_audio] debug listing failed:', e?.message || e);
            } finally {
                console.groupEnd();
            }
        }

        return { ok: true, files: combined };
    }

    async function play(fileInput, options = {}) {
        const entry = (fileInput && typeof fileInput === 'object') ? fileInput : { id: fileInput };
        const identifier = String(entry.id || entry.atome_id || entry.file_name || entry.name || '').trim();
        if (!isSafeFileIdentifier(identifier)) {
            return { ok: false, error: 'Invalid file identifier' };
        }

        if (entry.source === 'recording') {
            if (isTauriRuntime()) {
                const tauriBase = getTauriHttpBaseUrl();
                if (!tauriBase) return { ok: false, error: 'Tauri base URL is not configured' };
                let res;
                try {
                    res = await fetch(`${tauriBase}/api/recordings/${encodeURIComponent(identifier)}`, {
                        method: 'GET',
                        headers: buildLocalAuthHeaders(),
                        credentials: 'omit'
                    });
                } catch (e) {
                    return { ok: false, error: e && e.message ? e.message : String(e) };
                }

                if (!res.ok) {
                    const payload = await res.json().catch(() => null);
                    const msg = payload && payload.error ? payload.error : `Download failed (${res.status})`;
                    return { ok: false, error: msg };
                }

                const blob = await res.blob();
                const name = entry.name || entry.file_name || identifier;
                const mime = blob.type || entry.mime_type || guessMimeFromExt(name) || '';
                const kind = detectMediaKind({ name, mime });
                const url = URL.createObjectURL(blob);
                return {
                    ok: true,
                    url,
                    name,
                    mime,
                    kind,
                    revoke: () => {
                        try { URL.revokeObjectURL(url); } catch (_) { }
                    }
                };
            }

            const fileName = entry.file_name || entry.name || '';
            const base = getFastifyBaseUrl();
            const downloadId = identifier || fileName;
            if (!base || !downloadId) {
                return { ok: false, error: 'Recording playback requires a server endpoint' };
            }
            let res;
            try {
                res = await fetch(`${base}/api/uploads/${encodeURIComponent(downloadId)}`, {
                    method: 'GET',
                    headers: buildAuthHeaders(),
                    credentials: 'omit'
                });
            } catch (e) {
                return { ok: false, error: e && e.message ? e.message : String(e) };
            }

            if (!res.ok) {
                const payload = await res.json().catch(() => null);
                const msg = payload && payload.error ? payload.error : `Download failed (${res.status})`;
                return { ok: false, error: msg };
            }

            const blob = await res.blob();
            const name = entry.name || entry.file_name || identifier;
            const mime = blob.type || entry.mime_type || guessMimeFromExt(name) || '';
            const kind = detectMediaKind({ name, mime });
            const url = URL.createObjectURL(blob);
            return {
                ok: true,
                url,
                name,
                mime,
                kind,
                revoke: () => {
                    try { URL.revokeObjectURL(url); } catch (_) { }
                }
            };
        }

        const base = getFastifyBaseUrl();
        if (!base) return { ok: false, error: 'Fastify base URL is not configured' };
        let res;
        try {
            res = await fetch(`${base}/api/uploads/${encodeURIComponent(identifier)}`, {
                method: 'GET',
                headers: buildAuthHeaders(),
                credentials: 'omit'
            });
        } catch (e) {
            return { ok: false, error: e && e.message ? e.message : String(e) };
        }

        if (!res.ok) {
            const payload = await res.json().catch(() => null);
            const msg = payload && payload.error ? payload.error : `Download failed (${res.status})`;
            return { ok: false, error: msg };
        }

        const blob = await res.blob();
        const name = entry.name || entry.file_name || identifier;
        const mime = blob.type || entry.mime_type || guessMimeFromExt(name) || '';
        const kind = detectMediaKind({ name, mime });
        const url = URL.createObjectURL(blob);

        return {
            ok: true,
            url,
            name,
            mime,
            kind,
            revoke: () => {
                try { URL.revokeObjectURL(url); } catch (_) { }
            }
        };
    }

    function sanitizeFileName(name) {
        const raw = (typeof name === 'string' && name.trim()) ? name.trim() : `recording_${Date.now()}.wav`;
        const base = raw.split('/').pop().split('\\').pop();
        const cleaned = base.replace(/[^a-z0-9._-]/gi, '_');
        return cleaned.toLowerCase().endsWith('.wav') ? cleaned : `${cleaned}.wav`;
    }

    function pickSupportedMime(candidates) {
        if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
            return '';
        }
        for (const candidate of candidates) {
            if (MediaRecorder.isTypeSupported(candidate)) return candidate;
        }
        return '';
    }

    function computePeak(samples) {
        if (!samples || !samples.length) return 0;
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
            const v = Math.abs(samples[i]);
            if (v > peak) peak = v;
        }
        return peak;
    }

    async function decodeAudioBlobToMono(blob) {
        if (!blob) return null;
        if (!isBrowser()) return null;
        const buffer = await blob.arrayBuffer();
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        const ctx = new AudioCtx();
        try {
            const audioBuffer = await ctx.decodeAudioData(buffer);
            const channels = Math.max(1, audioBuffer.numberOfChannels || 1);
            if (channels === 1) {
                return {
                    samples: audioBuffer.getChannelData(0),
                    sampleRate: audioBuffer.sampleRate,
                    duration: audioBuffer.duration
                };
            }
            const length = audioBuffer.length;
            const mixed = new Float32Array(length);
            for (let ch = 0; ch < channels; ch++) {
                const data = audioBuffer.getChannelData(ch);
                for (let i = 0; i < length; i++) {
                    mixed[i] += data[i];
                }
            }
            const inv = 1 / channels;
            for (let i = 0; i < length; i++) {
                mixed[i] *= inv;
            }
            return {
                samples: mixed,
                sampleRate: audioBuffer.sampleRate,
                duration: audioBuffer.duration
            };
        } catch (_) {
            return null;
        } finally {
            try { await ctx.close(); } catch (_) { }
        }
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
        let filePath = `recordings/${fileName}`;
        try {
            const userInfo = await getCurrentUserInfo();
            if (userInfo.ok && userInfo.user && userInfo.user.user_id) {
                filePath = `data/users/${userInfo.user.user_id}/recordings/${fileName}`;
            }
        } catch (_) { }
        // IMPORTANT: Fastify server registers a Buffer parser only for
        // `application/octet-stream` (otherwise it returns 415).
        const headers = {
            'Content-Type': 'application/octet-stream',
            'X-Filename': encodeURIComponent(fileName),
            'X-File-Path': filePath
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

    function normalizeBackend(input) {
        const v = (typeof input === 'string' ? input : '').trim().toLowerCase();
        if (v === RECORD_BACKENDS.IPLUG2 || v === 'iplug') return RECORD_BACKENDS.IPLUG2;
        return RECORD_BACKENDS.WEBAUDIO;
    }

    function hasIPlugBridge() {
        if (!isBrowser()) return false;
        // IMPORTANT: do NOT treat generic postMessage as an iPlug2 bridge.
        // In Tauri (and most browsers), postMessage exists but nobody consumes our protocol,
        // which causes the iplug2 path to time out waiting for record_done.
        return !!(
            typeof window.__toDSP === 'function' ||
            (window.webkit && window.webkit.messageHandlers && (
                window.webkit.messageHandlers.swiftBridge ||
                window.webkit.messageHandlers.squirrel ||
                window.webkit.messageHandlers.callback
            ))
        );
    }

    function sendToIPlug(msg) {
        if (!isBrowser()) return false;
        try {
            if (typeof window.__toDSP === 'function') {
                window.__toDSP(msg);
                return true;
            }
        } catch (_) { }

        try {
            if (window.webkit && window.webkit.messageHandlers) {
                if (window.webkit.messageHandlers.swiftBridge) {
                    window.webkit.messageHandlers.swiftBridge.postMessage(msg);
                    return true;
                }
                if (window.webkit.messageHandlers.squirrel) {
                    window.webkit.messageHandlers.squirrel.postMessage(msg);
                    return true;
                }
                // iPlug2 default WebView handler name (see third_party/iPlug2 WebView glue)
                if (window.webkit.messageHandlers.callback) {
                    window.webkit.messageHandlers.callback.postMessage(msg);
                    return true;
                }
            }
        } catch (_) { }

        // Last-resort transport used by existing iPlug web integration.
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(msg, '*');
                return true;
            }
        } catch (_) { }

        try {
            window.postMessage(msg, '*');
            return true;
        } catch (_) { }

        return false;
    }

    function waitForIPlugRecordResult({ timeoutMs = 3_000 } = {}) {
        return new Promise((resolve, reject) => {
            let done = false;
            const timeoutId = setTimeout(() => {
                if (done) return;
                done = true;
                cleanup();
                reject(new Error(
                    'iPlug2 recording timed out (no record_done message received). ' +
                    'This typically means the native iPlug2 host does not implement the record_start/record_stop protocol ' +
                    'or does not emit record_done/record_error back to the WebView. ' +
                    'Use backend "webaudio" for now, or implement native record handling.'
                ));
            }, timeoutMs);

            const onCustomEvent = (ev) => {
                if (done) return;
                const detail = ev && ev.detail ? ev.detail : null;
                if (!detail || (detail.type !== 'record_done' && detail.type !== 'record_error')) return;
                done = true;
                cleanup();
                if (detail.type === 'record_error') {
                    reject(new Error(detail.error || 'iPlug2 record error'));
                    return;
                }
                resolve(detail);
            };

            const prevFromDSP = (typeof window.__fromDSP === 'function') ? window.__fromDSP : null;
            const wrappedFromDSP = (msg) => {
                try {
                    const type = msg && msg.type ? msg.type : null;
                    if (type === 'record_done' || type === 'record_error') {
                        const payload = msg && msg.payload ? msg.payload : {};
                        onCustomEvent({ detail: { type, ...payload } });
                    }
                } catch (_) { }
                if (typeof prevFromDSP === 'function') {
                    try { prevFromDSP(msg); } catch (_) { }
                }
            };

            const onWindowMessage = (ev) => {
                if (done) return;
                const data = ev && ev.data ? ev.data : null;
                if (!data || typeof data !== 'object') return;
                const type = data.type || null;
                if (type !== 'record_done' && type !== 'record_error') return;
                const payload = data.payload && typeof data.payload === 'object' ? data.payload : data;
                onCustomEvent({ detail: { type, ...payload } });
            };

            function cleanup() {
                try { clearTimeout(timeoutId); } catch (_) { }
                try { window.removeEventListener('iplug_recording', onCustomEvent); } catch (_) { }
                try { window.removeEventListener('message', onWindowMessage); } catch (_) { }
                try {
                    if (window.__fromDSP === wrappedFromDSP) {
                        window.__fromDSP = prevFromDSP || undefined;
                    }
                } catch (_) { }
            }

            try { window.addEventListener('iplug_recording', onCustomEvent); } catch (_) { }
            try { window.addEventListener('message', onWindowMessage); } catch (_) { }
            try { window.__fromDSP = wrappedFromDSP; } catch (_) { }
        });
    }

    async function record_audio_iplug2(filename, path, opts) {
        if (!hasIPlugBridge()) {
            throw new Error(
                'iPlug2 recording bridge is not available in this runtime. ' +
                'Expected window.__toDSP or window.webkit.messageHandlers.(swiftBridge|squirrel|callback).'
            );
        }
        if (__recording && __recording.state === 'recording') {
            throw new Error('A recording is already in progress');
        }

        const fileName = sanitizeFileName(filename);
        const startIso = nowIso();
        const sourceRaw = opts && typeof opts.source === 'string' ? opts.source : 'mic';
        const source = (String(sourceRaw).toLowerCase() === 'plugin' || String(sourceRaw).toLowerCase() === 'plugin_output')
            ? 'plugin'
            : 'mic';

        // Tauri native recording writes directly into data/users/<userId>/recordings.
        // Provide userId up-front so native can resolve the destination.
        let userId = null;
        if (isTauriRuntime()) {
            const userInfo = await getCurrentUserInfo();
            if (!userInfo.ok) throw new Error(userInfo.error || 'Unable to resolve current user');
            userId = userInfo.user.user_id;
        }

        const ok = sendToIPlug({
            type: 'iplug',
            action: 'record_start',
            fileName,
            userId: userId || undefined,
            source,
            sampleRate: TARGET_SR,
            channels: 1
        });
        if (!ok) {
            throw new Error('Failed to send iPlug2 record_start message');
        }

        __recording = {
            state: 'recording',
            fileName,
            path: path || null,
            backend: RECORD_BACKENDS.IPLUG2,
            started_iso: startIso,
            getStats: () => ({ backend: 'iplug2', fileName, started_iso: startIso })
        };

        const stop = async () => {
            if (!__recording || __recording.state !== 'recording') {
                return { success: false, error: 'No active recording' };
            }
            __recording.state = 'stopping';

            const sent = sendToIPlug({
                type: 'iplug',
                action: 'record_stop',
                fileName
            });
            if (!sent) {
                __recording = null;
                throw new Error('Failed to send iPlug2 record_stop message');
            }

            const detail = await waitForIPlugRecordResult({ timeoutMs: Number(opts && opts.timeoutMs) || 3_000 });

            // NOTE: If this keeps timing out, it means the native iPlug2 side does not implement
            // the record_start/record_stop protocol nor emit record_done/record_error back to JS.
            // The current repo has a stub at src/native/iplug/bridge/WebBridge.cpp and AUv3 hosts
            // WKScriptMessageHandler channels in src-Auv3/iplug/AUViewController.swift.

            // Supported payload shapes:
            // - { path: 'data/users/.../recordings/foo.wav' } (native wrote the file)
            // - { wav_base64: '...' } (native returned WAV bytes)
            let relPath = null;
            let wavArrayBuffer = null;
            if (detail && typeof detail.path === 'string' && detail.path) {
                relPath = detail.path;
            } else if (detail && typeof detail.wav_base64 === 'string' && detail.wav_base64) {
                const bin = atob(detail.wav_base64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                wavArrayBuffer = bytes.buffer;
            } else {
                __recording = null;
                throw new Error('iPlug2 recording returned no path or WAV bytes');
            }

            // If we received bytes, persist through the existing offline-first pipeline.
            let localInfo = null;
            if (wavArrayBuffer) {
                localInfo = await persistRecordingLocally({
                    fileName,
                    wavArrayBuffer,
                    durationSec: 0,
                    sampleRate: TARGET_SR,
                    channels: 1
                });
                relPath = localInfo.tauriPath || null;
            }

            // If we only received a path, register atome here.
            if (relPath && !localInfo && isTauriRuntime()) {
                const userInfo = await getCurrentUserInfo();
                if (!userInfo.ok) throw new Error(userInfo.error || 'Unable to resolve current user');
                const userId = userInfo.user.user_id;
                const atome = await createAudioRecordingAtome({
                    ownerId: userId,
                    fileName,
                    relPath,
                    durationSec: 0,
                    sampleRate: TARGET_SR,
                    channels: 1,
                    sizeBytes: 0
                });
                localInfo = { id: atome.atomeId, createdAt: nowIso(), backend: 'iplug2', tauriPath: relPath, atomeId: atome.atomeId };
            }

            __recording = null;
            return {
                success: true,
                uploaded: false,
                file: null,
                owner: null,
                local: { id: localInfo ? localInfo.id : null, backend: localInfo ? localInfo.backend : 'iplug2', tauriPath: relPath, atomeId: localInfo ? localInfo.atomeId : null },
                duration_sec: 0,
                sample_rate: TARGET_SR,
                channels: 1
            };
        };

        return { fileName, stop, getStats: __recording.getStats };
    }

    /**
     * record_audio(filename, path?)
     * - filename: file name to store (server-side will sanitize)
     * - path: reserved for future (native backends). Not used by the Fastify upload endpoint.
     */
    async function record_audio(filename, path) {
        const opts = arguments.length >= 3 ? arguments[2] : null;
        const backend = (opts && Object.prototype.hasOwnProperty.call(opts, 'backend'))
            ? normalizeBackend(opts.backend)
            : (hasIPlugBridge() ? RECORD_BACKENDS.IPLUG2 : RECORD_BACKENDS.WEBAUDIO);
        if (backend === RECORD_BACKENDS.IPLUG2) {
            return await record_audio_iplug2(filename, path, opts);
        }

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
        const mediaFallback = (() => {
            if (typeof MediaRecorder === 'undefined') return null;
            const candidates = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/ogg',
                'audio/mp4'
            ];
            const mimeType = pickSupportedMime(candidates);
            try {
                const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
                const chunks = [];
                recorder.ondataavailable = (ev) => {
                    if (ev.data && ev.data.size) chunks.push(ev.data);
                };
                recorder.start();
                return { recorder, chunks, mimeType };
            } catch (_) {
                return null;
            }
        })();

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
            mediaFallback,
            getStats: () => ({ inputSampleRate, totalFrames, fileName })
        };

        const stop = async () => {
            if (!__recording || __recording.state !== 'recording') {
                return { success: false, error: 'No active recording' };
            }
            __recording.state = 'stopping';

            let fallbackBlob = null;
            let fallbackMime = '';
            if (__recording.mediaFallback && __recording.mediaFallback.recorder) {
                const { recorder, chunks: mediaChunks, mimeType } = __recording.mediaFallback;
                fallbackMime = mimeType || recorder.mimeType || '';
                fallbackBlob = await new Promise((resolve) => {
                    let done = false;
                    const finalize = () => {
                        if (done) return;
                        done = true;
                        if (mediaChunks && mediaChunks.length) {
                            resolve(new Blob(mediaChunks, { type: fallbackMime || '' }));
                        } else {
                            resolve(null);
                        }
                    };
                    recorder.onstop = finalize;
                    recorder.onerror = finalize;
                    try {
                        if (recorder.state !== 'inactive') {
                            recorder.stop();
                        } else {
                            finalize();
                        }
                    } catch (_) {
                        finalize();
                    }
                });
            }

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

            let pcm16 = null;
            let wav = null;
            let durationSec = 0;
            const peak = computePeak(merged);
            const shouldFallback = !merged.length || !Number.isFinite(peak) || peak < 1e-4;

            if (shouldFallback && fallbackBlob) {
                const decoded = await decodeAudioBlobToMono(fallbackBlob);
                if (decoded && decoded.samples && decoded.samples.length) {
                    pcm16 = downsampleFloat32ToInt16Mono(decoded.samples, decoded.sampleRate, TARGET_SR);
                    wav = encodeWav16Mono(pcm16, TARGET_SR);
                    durationSec = decoded.duration || (pcm16.length / TARGET_SR);
                }
            }

            if (!wav || !pcm16) {
                pcm16 = downsampleFloat32ToInt16Mono(merged, inputSampleRate, TARGET_SR);
                wav = encodeWav16Mono(pcm16, TARGET_SR);
                durationSec = pcm16.length / TARGET_SR;
            }

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
        window.record_audio_list_media = list_user_media_files;
        window.record_audio_play = play;
        window.record_audio_debug_list = async (opts = {}) => {
            return await list_user_media_files({ ...opts, debug: true });
        };
        if (typeof window.play !== 'function') {
            window.play = play;
        }
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

})();
