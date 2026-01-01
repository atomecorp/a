// MediaRecorder video/audio recorder (Tauri + browser)
// - Records using WebMedia APIs in both environments
// - Saves to user recordings (Tauri) and creates atomes for sync

(function () {
    if (typeof window === 'undefined') return;

    const DEFAULT_SLICE_MS = 200;

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

    function getLocalAuthToken() {
        try {
            return localStorage.getItem('local_auth_token') || '';
        } catch (_) {
            return '';
        }
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

    function nowIso() {
        try { return new Date().toISOString(); } catch (_) { return String(Date.now()); }
    }

    function randomId() {
        return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function sanitizeFileName(name, fallbackExt) {
        const raw = (typeof name === 'string' && name.trim()) ? name.trim() : `recording_${Date.now()}`;
        const base = raw.split('/').pop().split('\\').pop();
        const cleaned = base.replace(/[^a-z0-9._-]/gi, '_');
        const ext = cleaned.includes('.') ? '' : `.${fallbackExt || 'webm'}`;
        return `${cleaned}${ext}`;
    }

    function normalizeMode(mode) {
        const v = (typeof mode === 'string') ? mode.toLowerCase() : '';
        return v === 'audio' ? 'audio' : 'video';
    }

    function pickSupportedMime(candidates) {
        if (!Array.isArray(candidates) || !candidates.length) return '';
        if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
            return '';
        }
        for (const candidate of candidates) {
            if (MediaRecorder.isTypeSupported(candidate)) return candidate;
        }
        return '';
    }

    function extForMime(mimeType, mode) {
        const mime = (typeof mimeType === 'string') ? mimeType.toLowerCase() : '';
        if (mime.includes('audio/')) {
            if (mime.includes('ogg')) return 'ogg';
            if (mime.includes('webm')) return 'weba';
        }
        if (mime.includes('video/')) {
            if (mime.includes('mp4')) return 'mp4';
            if (mime.includes('webm')) return 'webm';
        }
        return mode === 'audio' ? 'weba' : 'webm';
    }

    function getAdoleAPI() {
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
            if (!userId) return { ok: false, error: 'No logged in user', user: null };
            return { ok: true, user: { ...user, user_id: userId, username } };
        } catch (e) {
            return { ok: false, error: e && e.message ? e.message : String(e), user: null };
        }
    }

    async function saveToTauriRecordings({ fileName, bytes }) {
        const base = getTauriHttpBaseUrl();
        if (!base) throw new Error('Tauri HTTP base URL is not configured');
        const token = getLocalAuthToken();
        if (!token) throw new Error('Missing local_auth_token');
        const res = await fetch(`${base}/api/user-recordings`, {
            method: 'POST',
            headers: {
                ...buildLocalAuthHeaders({ 'X-Filename': encodeURIComponent(fileName) })
            },
            body: bytes
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.success !== true) {
            const msg = json && json.error ? json.error : `Upload failed (${res.status})`;
            throw new Error(msg);
        }
        return json;
    }

    async function uploadToFastify({ fileName, bytes }) {
        const base = getFastifyBaseUrl();
        if (!base) throw new Error('Fastify base URL is not configured');
        const res = await fetch(`${base}/api/uploads`, {
            method: 'POST',
            headers: buildAuthHeaders({ 'X-Filename': encodeURIComponent(fileName) }),
            body: bytes
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.success !== true) {
            const msg = json && json.error ? json.error : `Upload failed (${res.status})`;
            throw new Error(msg);
        }
        return json;
    }

    async function createRecordingAtome({ ownerId, atomeType, fileName, relPath, durationSec, sizeBytes, mimeType, width, height }) {
        const api = getAdoleAPI();
        if (!api || !api.atomes || typeof api.atomes.create !== 'function') {
            throw new Error('AdoleAPI.atomes.create() is not available');
        }
        const atomeId = `${atomeType}_${randomId()}`;
        const particles = {
            kind: atomeType,
            file_name: fileName,
            file_path: relPath || null,
            mime_type: mimeType || '',
            duration_sec: durationSec || null,
            size_bytes: sizeBytes || null,
            width: width || null,
            height: height || null,
            created_iso: nowIso()
        };
        const res = await api.atomes.create({
            id: atomeId,
            type: atomeType,
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

    async function persistRecording({ fileName, bytes, mode, mimeType, durationSec, width, height }) {
        const userInfo = await getCurrentUserInfo();
        if (!userInfo.ok) throw new Error(userInfo.error || 'Unable to resolve current user');
        const ownerId = userInfo.user.user_id;
        const atomeType = mode === 'audio' ? 'audio_recording' : 'video_recording';
        let relPath = null;

        if (isTauriRuntime()) {
            const saved = await saveToTauriRecordings({ fileName, bytes });
            relPath = saved && typeof saved.path === 'string' ? saved.path : null;
        } else {
            const uploaded = await uploadToFastify({ fileName, bytes });
            relPath = uploaded && typeof uploaded.path === 'string' ? uploaded.path : null;
        }

        const atome = await createRecordingAtome({
            ownerId,
            atomeType,
            fileName,
            relPath,
            durationSec,
            sizeBytes: bytes.length,
            mimeType,
            width,
            height
        });

        try {
            const api = getAdoleAPI();
            if (api && api.sync && typeof api.sync.sync === 'function') {
                await api.sync.sync();
            }
        } catch (_) { }

        return { ok: true, atomeId: atome.atomeId, path: relPath };
    }

    async function record_video(filename, path, options = {}) {
        if (!isBrowser()) throw new Error('record_video is only available in the browser');
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            throw new Error('getUserMedia() is not available');
        }

        const mode = normalizeMode(options.mode || options.kind);
        const constraints = mode === 'audio'
            ? { audio: true, video: false }
            : { audio: true, video: true };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const candidates = mode === 'audio'
            ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
            : ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];
        const mimeType = pickSupportedMime(candidates);
        const ext = extForMime(mimeType, mode);
        const safeFileName = sanitizeFileName(filename || '', ext);
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        const chunks = [];
        const startedAt = Date.now();
        let stopped = false;

        recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size) chunks.push(ev.data);
        };

        const stop = async () => {
            if (stopped) return { ok: false, error: 'Already stopped' };
            stopped = true;
            return new Promise((resolve, reject) => {
                recorder.onerror = (ev) => {
                    reject(ev && ev.error ? ev.error : new Error('Recording failed'));
                };
                recorder.onstop = async () => {
                    try {
                        stream.getTracks().forEach((track) => track.stop());
                    } catch (_) { }
                    try {
                        const blob = new Blob(chunks, { type: mimeType || '' });
                        const buffer = await blob.arrayBuffer();
                        const bytes = new Uint8Array(buffer);
                        const durationSec = Math.max(0, (Date.now() - startedAt) / 1000);
                        const videoTrack = stream.getVideoTracks()[0];
                        const settings = videoTrack && typeof videoTrack.getSettings === 'function'
                            ? videoTrack.getSettings()
                            : null;
                        const width = settings && settings.width ? Number(settings.width) : null;
                        const height = settings && settings.height ? Number(settings.height) : null;
                        const finalMime = blob.type || mimeType || '';
                        const saved = await persistRecording({
                            fileName: safeFileName,
                            bytes,
                            mode,
                            mimeType: finalMime,
                            durationSec,
                            width,
                            height
                        });
                        resolve({ ok: true, ...saved, fileName: safeFileName });
                    } catch (e) {
                        reject(e);
                    }
                };
                try {
                    recorder.stop();
                } catch (e) {
                    reject(e);
                }
            });
        };

        try {
            recorder.start(DEFAULT_SLICE_MS);
        } catch (e) {
            stream.getTracks().forEach((track) => track.stop());
            throw e;
        }

        return { stop, stream, recorder, mode, fileName: safeFileName };
    }

    async function ensureAudioHelpers() {
        if (typeof window.record_audio_list_media === 'function' && typeof window.record_audio_play === 'function') {
            return { listMediaFiles: window.record_audio_list_media, play: window.record_audio_play };
        }
        try {
            await import('./record_audio.js');
        } catch (_) { }
        if (typeof window.record_audio_list_media === 'function' && typeof window.record_audio_play === 'function') {
            return { listMediaFiles: window.record_audio_list_media, play: window.record_audio_play };
        }
        return null;
    }

    async function list_user_media_files(options = {}) {
        const helpers = await ensureAudioHelpers();
        if (!helpers || typeof helpers.listMediaFiles !== 'function') {
            return { ok: false, error: 'record_audio_list_media not available', files: [] };
        }
        return helpers.listMediaFiles(options);
    }

    async function play(fileInput, options = {}) {
        const helpers = await ensureAudioHelpers();
        if (!helpers || typeof helpers.play !== 'function') {
            return { ok: false, error: 'record_audio_play not available' };
        }
        return helpers.play(fileInput, options);
    }

    if (typeof window.record_video !== 'function') {
        window.record_video = record_video;
    }
    window.record_video_list_media = list_user_media_files;
    window.record_video_play = play;
})();
