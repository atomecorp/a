// Record video/audio UI (MediaRecorder)
// - Record button, mode selector, media list, and player

(function () {
    if (typeof window === 'undefined') return;

    const ICON_ID = 'record-video-icon';
    const ICON_SRC = 'assets/images/icons/record.svg';
    const MODE_SELECTOR_ID = 'record-video-mode-selector';
    const CAMERA_TOGGLE_ID = 'record-video-camera-toggle';
    const CAMERA_PREVIEW_ID = 'record-video-camera-preview';
    const MEDIA_SELECTOR_ID = 'record-video-media-selector';
    const MEDIA_PLAYER_ID = 'record-video-media-player';
    const BASE_LEFT = 900;
    const CAMERA_TOGGLE_LEFT = BASE_LEFT + 34;
    const MODE_LEFT = CAMERA_TOGGLE_LEFT + 74;
    const PREVIEW_STORAGE_KEY = 'record_video_camera_preview_rect';
    const PREVIEW_TOP = 32;
    const PREVIEW_HEIGHT = 140;
    const PREVIEW_WIDTH = 260;
    const PREVIEW_MIN_WIDTH = 160;
    const PREVIEW_MIN_HEIGHT = 90;
    const MEDIA_TOP = PREVIEW_TOP + PREVIEW_HEIGHT + 12;
    const PLAYER_TOP = MEDIA_TOP + 30;
    const DEFAULT_SLICE_MS = 200;
    const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;
    const CHUNKED_UPLOAD_THRESHOLD = 8 * 1024 * 1024;

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
        } catch (_) {
            return false;
        }

        try {
            const token = localStorage.getItem('cloud_auth_token') || localStorage.getItem('auth_token');
            if (token) return true;
        } catch (_) { }

        try {
            const pending = JSON.parse(localStorage.getItem('auth_pending_sync') || '[]');
            if (Array.isArray(pending) && pending.length > 0) return true;
        } catch (_) { }

        return false;
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

    function getCloudAuthToken() {
        try {
            return (
                localStorage.getItem('cloud_auth_token') ||
                localStorage.getItem('auth_token') ||
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

    function shouldAllowChunkedUpload(base) {
        if (!isBrowser()) return false;
        if (!base) return false;
        try {
            const parsed = new URL(base, location.href);
            return parsed.origin === location.origin;
        } catch (_) {
            return false;
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

    function resolveVideoConstraints(opts) {
        const widthVal = Number(opts.width);
        const heightVal = Number(opts.height);
        const frameRateVal = Number(opts.frameRate);
        const width = Number.isFinite(widthVal) ? widthVal : null;
        const height = Number.isFinite(heightVal) ? heightVal : null;
        const frameRate = Number.isFinite(frameRateVal) ? frameRateVal : null;
        const facingMode = (typeof opts.facingMode === 'string' && opts.facingMode.trim())
            ? opts.facingMode.trim()
            : 'user';

        const video = (opts.videoConstraints && typeof opts.videoConstraints === 'object')
            ? { ...opts.videoConstraints }
            : {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode
            };

        if (!video.facingMode && facingMode) video.facingMode = facingMode;
        if (width) video.width = { ideal: width };
        if (height) video.height = { ideal: height };
        if (frameRate && !video.frameRate) video.frameRate = { ideal: frameRate };

        return video;
    }

    function buildConstraints(options, mode) {
        const opts = options || {};
        if (opts.constraints) return opts.constraints;
        if (mode === 'audio') {
            return { audio: true, video: false };
        }
        const audio = (typeof opts.audio === 'boolean') ? opts.audio : true;
        const video = resolveVideoConstraints(opts);
        return { audio, video };
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

    async function camera(options = {}) {
        if (!isBrowser()) throw new Error('camera() is only available in the browser');
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            throw new Error('getUserMedia() is not available');
        }
        const opts = options || {};
        const wantsVideo = opts.video !== false;
        const wantsAudio = opts.audio === true;
        const constraints = opts.constraints || {
            audio: wantsAudio,
            video: wantsVideo ? resolveVideoConstraints(opts) : false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (wantsVideo && stream.getVideoTracks().length === 0) {
            stream.getTracks().forEach((track) => track.stop());
            throw new Error('No camera video track available');
        }

        const element = opts.element || (() => {
            if (typeof window.$ === 'function' || (window.Squirrel && window.Squirrel.$)) {
                const $ = window.Squirrel.$ || window.$;
                return $('video', {
                    parent: opts.parent,
                    id: opts.id,
                    attrs: { muted: true, playsinline: true },
                    css: Object.assign({
                        width: '100%',
                        height: '100%',
                        backgroundColor: '#000',
                        display: 'block',
                        objectFit: 'cover'
                    }, opts.css || {})
                });
            }
            if (!isBrowser()) return null;
            const el = document.createElement('video');
            if (opts.id) el.id = opts.id;
            if (opts.css && el.style) {
                Object.assign(el.style, opts.css);
            } else {
                el.style.width = '100%';
                el.style.height = '100%';
                el.style.backgroundColor = '#000';
                el.style.display = 'block';
                el.style.objectFit = 'cover';
            }
            if (opts.parent && opts.parent.appendChild) {
                opts.parent.appendChild(el);
            }
            return el;
        })();

        if (!element) {
            stream.getTracks().forEach((track) => track.stop());
            throw new Error('Unable to create camera preview element');
        }

        try {
            element.autoplay = opts.autoplay !== false;
            element.muted = opts.muted !== false;
            element.playsInline = opts.playsInline !== false;
        } catch (_) { }

        try {
            element.srcObject = stream;
        } catch (_) {
            try { element.src = URL.createObjectURL(stream); } catch (_) { }
        }

        try {
            const playPromise = element.play && element.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => null);
            }
        } catch (_) { }

        const stop = () => {
            try { stream.getTracks().forEach((track) => track.stop()); } catch (_) { }
            try { element.srcObject = null; } catch (_) { }
        };

        return { element, stream, stop };
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

    async function uploadToFastifyChunked({ fileName, bytes, mimeType, chunkSize, filePath }) {
        const base = getFastifyBaseUrl();
        if (!base) throw new Error('Fastify base URL is not configured');
        const size = Number.isFinite(chunkSize) ? chunkSize : UPLOAD_CHUNK_SIZE;
        const totalSize = bytes.length;
        const totalChunks = Math.max(1, Math.ceil(totalSize / size));
        const uploadId = `upload_${randomId()}`;

        for (let idx = 0; idx < totalChunks; idx++) {
            const start = idx * size;
            const end = Math.min(totalSize, start + size);
            const chunk = bytes.slice(start, end);
            const res = await fetch(`${base}/api/uploads/chunk`, {
                method: 'POST',
                headers: buildAuthHeaders({
                    'X-Filename': encodeURIComponent(fileName),
                    'X-Upload-Id': uploadId,
                    'X-Chunk-Index': String(idx),
                    'X-Chunk-Count': String(totalChunks),
                    'X-Chunk-Size': String(chunk.length),
                    'X-Mime-Type': mimeType || '',
                    'Content-Type': 'application/octet-stream'
                }),
                body: chunk
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => null);
                const msg = payload && payload.error ? payload.error : `Chunk upload failed (${res.status})`;
                throw new Error(msg);
            }
        }

        const completeRes = await fetch(`${base}/api/uploads/complete`, {
            method: 'POST',
            headers: buildAuthHeaders({
                'X-Filename': encodeURIComponent(fileName),
                'X-Upload-Id': uploadId,
                'X-Chunk-Count': String(totalChunks),
                'X-Total-Size': String(totalSize),
                'X-Mime-Type': mimeType || '',
                ...(filePath ? { 'X-File-Path': filePath } : {})
            })
        });
        const completeJson = await completeRes.json().catch(() => null);
        if (!completeRes.ok || !completeJson || completeJson.success !== true) {
            const msg = completeJson && completeJson.error ? completeJson.error : `Upload failed (${completeRes.status})`;
            throw new Error(msg);
        }
        return completeJson;
    }

    async function uploadToFastify({ fileName, bytes, mimeType, chunkSize, forceChunked = false, filePath = null }) {
        const base = getFastifyBaseUrl();
        if (!base) throw new Error('Fastify base URL is not configured');
        const allowChunked = shouldAllowChunkedUpload(base);
        if ((forceChunked || bytes.length >= CHUNKED_UPLOAD_THRESHOLD) && allowChunked) {
            return await uploadToFastifyChunked({ fileName, bytes, mimeType, chunkSize, filePath });
        }
        const res = await fetch(`${base}/api/uploads`, {
            method: 'POST',
            headers: buildAuthHeaders({
                'X-Filename': encodeURIComponent(fileName),
                'Content-Type': 'application/octet-stream',
                ...(filePath ? { 'X-File-Path': filePath } : {})
            }),
            body: bytes
        });
        if (!res.ok) {
            if (res.status === 413) {
                if (allowChunked) {
                    return await uploadToFastifyChunked({ fileName, bytes, mimeType, chunkSize, filePath });
                }
                throw new Error('Upload too large for this server (chunked disabled by CORS)');
            }
            const json = await res.json().catch(() => null);
            const msg = json && json.error ? json.error : `Upload failed (${res.status})`;
            throw new Error(msg);
        }
        const json = await res.json().catch(() => null);
        if (!json || json.success !== true) {
            const msg = json && json.error ? json.error : 'Upload failed';
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
        const targetPath = `data/users/${ownerId}/recordings/${fileName}`;
        let relPath = null;

        if (isTauriRuntime()) {
            const saved = await saveToTauriRecordings({ fileName, bytes });
            relPath = saved && typeof saved.path === 'string' ? saved.path : targetPath;
            const cloudToken = getCloudAuthToken();
            if (cloudToken && getFastifyBaseUrl()) {
                try {
                    await uploadToFastify({ fileName, bytes, mimeType, filePath: targetPath });
                } catch (_) {
                    // Keep local save even if cloud upload fails.
                }
            }
        } else {
            const uploaded = await uploadToFastify({ fileName, bytes, mimeType, filePath: targetPath });
            relPath = uploaded && typeof uploaded.path === 'string' ? uploaded.path : targetPath;
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
        if (typeof MediaRecorder === 'undefined') {
            throw new Error('MediaRecorder is not available');
        }

        const mode = normalizeMode(options.mode || options.kind);
        const externalStream = options.stream || null;
        const keepStream = options.keepStream === true;
        const stopExternalStream = options.stopExternalStream === true;
        const constraints = buildConstraints(options, mode);

        const audioCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
        const videoCandidates = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
            'video/mp4'
        ];
        const candidates = mode === 'audio' ? audioCandidates : videoCandidates;
        if (mode === 'video' && typeof MediaRecorder.isTypeSupported === 'function') {
            const supportsVideo = videoCandidates.some((candidate) => MediaRecorder.isTypeSupported(candidate));
            if (!supportsVideo) {
                throw new Error('Video recording is not supported in this environment');
            }
        }

        const stream = externalStream || await navigator.mediaDevices.getUserMedia(constraints);
        if (mode === 'video' && stream.getVideoTracks().length === 0) {
            if (!externalStream) {
                stream.getTracks().forEach((track) => track.stop());
            }
            throw new Error('No camera video track available');
        }

        let recordStream = stream;
        let extraAudioStream = null;
        const wantsAudio = mode === 'audio'
            || (mode === 'video' && (typeof options.audio === 'boolean' ? options.audio : true));
        if (mode === 'video' && wantsAudio && stream.getAudioTracks().length === 0) {
            try {
                extraAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                recordStream = new MediaStream([
                    ...stream.getVideoTracks(),
                    ...extraAudioStream.getAudioTracks()
                ]);
            } catch (_) {
                // If audio capture fails, keep recording video-only.
            }
        }

        const mimeType = pickSupportedMime(candidates);
        const ext = extForMime(mimeType, mode);
        const safeFileName = sanitizeFileName(filename || '', ext);
        const recorderOptions = {};
        if (mimeType) recorderOptions.mimeType = mimeType;
        if (Number.isFinite(options.bitsPerSecond)) {
            recorderOptions.bitsPerSecond = Number(options.bitsPerSecond);
        }
        if (Number.isFinite(options.videoBitsPerSecond)) {
            recorderOptions.videoBitsPerSecond = Number(options.videoBitsPerSecond);
        }
        if (Number.isFinite(options.audioBitsPerSecond)) {
            recorderOptions.audioBitsPerSecond = Number(options.audioBitsPerSecond);
        }
        const recorder = new MediaRecorder(
            recordStream,
            Object.keys(recorderOptions).length ? recorderOptions : undefined
        );
        if (mode === 'video' && recorder.mimeType && !recorder.mimeType.startsWith('video/')) {
            if (!externalStream || stopExternalStream) {
                stream.getTracks().forEach((track) => track.stop());
            }
            throw new Error(`Video recording not supported (got ${recorder.mimeType})`);
        }
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
                    if (!keepStream && (!externalStream || stopExternalStream)) {
                        try {
                            stream.getTracks().forEach((track) => track.stop());
                        } catch (_) { }
                    }
                    if (extraAudioStream) {
                        try {
                            extraAudioStream.getTracks().forEach((track) => track.stop());
                        } catch (_) { }
                    }
                    try {
                        const blob = new Blob(chunks, { type: mimeType || '' });
                        if (mode === 'video' && blob.type && blob.type.startsWith('audio/')) {
                            throw new Error(`Video recording failed (audio output: ${blob.type})`);
                        }
                        const buffer = await blob.arrayBuffer();
                        const bytes = new Uint8Array(buffer);
                        const durationSec = Math.max(0, (Date.now() - startedAt) / 1000);
                        const videoTrack = recordStream.getVideoTracks()[0];
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
            if (!externalStream || stopExternalStream) {
                stream.getTracks().forEach((track) => track.stop());
            }
            if (extraAudioStream) {
                try {
                    extraAudioStream.getTracks().forEach((track) => track.stop());
                } catch (_) { }
            }
            throw e;
        }

        return { stop, stream, recorder, mode, fileName: safeFileName };
    }

    async function list_user_media_files(options = {}) {
        const api = await ensureMediaApi();
        if (!api || typeof api.listMediaFiles !== 'function') {
            return { ok: false, error: 'record_audio_list_media not available', files: [] };
        }
        return api.listMediaFiles(options);
    }

    async function play(fileInput, options = {}) {
        const api = await ensureMediaApi();
        if (!api || typeof api.play !== 'function') {
            return { ok: false, error: 'record_audio_play not available' };
        }
        return api.play(fileInput, options);
    }

    if (typeof window.record_video !== 'function') {
        window.record_video = record_video;
    }
    if (typeof window.camera !== 'function') {
        window.camera = camera;
    }
    window.record_video_list_media = list_user_media_files;
    window.record_video_play = play;

    function onReady(cb) {
        const run = () => {
            if (typeof document === 'undefined') return;
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', cb, { once: true });
            } else {
                cb();
            }
        };
        if (typeof window.$ === 'function' || (window.Squirrel && window.Squirrel.$)) {
            run();
        } else {
            window.addEventListener('squirrel:ready', run, { once: true });
        }
    }

    function resolveHost() {
        if (typeof document === 'undefined') return null;
        const view = document.getElementById('view');
        if (view) return view;
        const intuition = document.getElementById('intuition');
        if (intuition) return intuition;
        if (typeof grab === 'function') {
            return grab('view') || grab('intuition') || grab('inutuition') || null;
        }
        return document.body || document.documentElement;
    }

    async function ensureVideoApi() {
        if (typeof window.record_video === 'function') return window.record_video;
        if (typeof record_video === 'function') return record_video;
        return null;
    }

    async function ensureMediaApi() {
        if (typeof window.record_audio_list_media === 'function' && typeof window.record_audio_play === 'function') {
            return { listMediaFiles: window.record_audio_list_media, play: window.record_audio_play };
        }
        try {
            await import('../eVe/APIS/audio_api.js');
        } catch (_) { }
        const listMediaFiles = (typeof window.record_audio_list_media === 'function')
            ? window.record_audio_list_media
            : null;
        const play = (typeof window.record_audio_play === 'function')
            ? window.record_audio_play
            : null;
        if (!listMediaFiles || !play) return null;
        return { listMediaFiles, play };
    }

    async function ensureCameraApi() {
        if (typeof window.camera === 'function') return window.camera;
        if (typeof camera === 'function') return camera;
        return null;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function loadPreviewRect() {
        try {
            const raw = localStorage.getItem(PREVIEW_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed) return null;
            return {
                left: Number(parsed.left),
                top: Number(parsed.top),
                width: Number(parsed.width),
                height: Number(parsed.height)
            };
        } catch (_) {
            return null;
        }
    }

    function savePreviewRect(rect) {
        try {
            localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(rect));
        } catch (_) { }
    }

    onReady(() => {
        if (typeof document === 'undefined') return;
        const $ = window.Squirrel.$ || window.$;
        if (!$) return;
        if (document.getElementById(ICON_ID)) return;

        const host = resolveHost();
        if (!host) {
            console.warn('[record_video_UI] Cannot attach record icon: host not found.');
            return;
        }

        const state = {
            mode: 'video',
            isRecording: false,
            ctrl: null,
            cameraEnabled: true
        };

        const mediaState = {
            holder: null,
            player: null,
            selector: null,
            map: new Map(),
            entries: [],
            revoke: null,
            debugLogged: false
        };
        const cameraState = {
            holder: null,
            videoSlot: null,
            ctrl: null,
            stream: null
        };

        function updateTitle(icon) {
            try { icon.title = `Record ${state.mode}`; } catch (_) { }
        }

        function clearMediaPlayer() {
            if (mediaState.revoke) {
                try { mediaState.revoke(); } catch (_) { }
            }
            mediaState.revoke = null;
            if (!mediaState.player) return;
            while (mediaState.player.firstChild) {
                mediaState.player.removeChild(mediaState.player.firstChild);
            }
        }

        function renderMediaStatus(message, tone) {
            if (!mediaState.player) return;
            clearMediaPlayer();
            $('div', {
                parent: mediaState.player,
                text: message || '',
                css: { color: tone || '#cfcfcf', fontSize: '11px', padding: '4px' }
            });
        }

        function renderMediaPlayer(entry, playback) {
            if (!mediaState.player) return;
            clearMediaPlayer();
            if (!playback || !playback.ok) {
                const msg = playback && playback.error ? playback.error : 'Unable to open media';
                $('div', {
                    parent: mediaState.player,
                    text: msg,
                    css: { color: '#ffb0b0', fontSize: '11px', padding: '4px' }
                });
                return;
            }

            $('div', {
                parent: mediaState.player,
                text: entry && entry.name ? entry.name : (playback.name || 'media'),
                css: { color: '#e6e6e6', fontSize: '11px', marginBottom: '4px' }
            });

            const kind = playback.kind || 'other';
            if (kind === 'image') {
                $('img', {
                    parent: mediaState.player,
                    attrs: { src: playback.url, alt: playback.name || 'image' },
                    css: { maxWidth: '100%', maxHeight: '140px', display: 'block' }
                });
            } else if (kind === 'video') {
                const video = $('video', {
                    parent: mediaState.player,
                    attrs: { src: playback.url, controls: true },
                    css: { width: '100%', maxHeight: '140px', display: 'block' }
                });
                try { video.load(); } catch (_) { }
            } else if (kind === 'audio') {
                const audio = $('audio', {
                    parent: mediaState.player,
                    attrs: { src: playback.url, controls: true },
                    css: { width: '100%', display: 'block' }
                });
                try { audio.load(); } catch (_) { }
            } else {
                $('a', {
                    parent: mediaState.player,
                    text: 'Open file',
                    attrs: { href: playback.url, target: '_blank', rel: 'noopener' },
                    css: { color: '#8fd3ff', fontSize: '12px' }
                });
            }

            mediaState.revoke = playback.revoke || null;
        }

        function clearCameraHolder() {
            if (!cameraState.videoSlot) return;
            while (cameraState.videoSlot.firstChild) {
                cameraState.videoSlot.removeChild(cameraState.videoSlot.firstChild);
            }
        }

        function renderCameraStatus(message, tone) {
            if (!cameraState.holder) return;
            clearCameraHolder();
            $('div', {
                parent: cameraState.videoSlot || cameraState.holder,
                text: message || '',
                css: {
                    color: tone || '#cfcfcf',
                    fontSize: '11px',
                    padding: '6px',
                    textAlign: 'center'
                }
            });
        }

        async function startCameraPreview() {
            if (!cameraState.holder || cameraState.ctrl) return;
            const cameraApi = await ensureCameraApi();
            if (!cameraApi) {
                renderCameraStatus('camera() unavailable', '#ffb0b0');
                return;
            }
            clearCameraHolder();
            try {
                const ctrl = await cameraApi({
                    parent: cameraState.videoSlot || cameraState.holder,
                    id: CAMERA_PREVIEW_ID,
                    video: true,
                    audio: false,
                    muted: true,
                    css: {
                        position: 'absolute',
                        inset: '0px',
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        zIndex: 1,
                        pointerEvents: 'none'
                    }
                });
                cameraState.ctrl = ctrl;
                cameraState.stream = ctrl && ctrl.stream ? ctrl.stream : null;
            } catch (e) {
                const msg = e && e.message ? e.message : String(e);
                renderCameraStatus(`Camera error: ${msg}`, '#ffb0b0');
            }
        }

        function stopCameraPreview() {
            if (cameraState.ctrl && typeof cameraState.ctrl.stop === 'function') {
                try { cameraState.ctrl.stop(); } catch (_) { }
            }
            cameraState.ctrl = null;
            cameraState.stream = null;
            renderCameraStatus('Camera stopped');
        }

        async function updateCameraPreview() {
            if (!cameraState.holder) return;
            cameraState.holder.style.display = state.cameraEnabled ? 'block' : 'none';
            if (!state.cameraEnabled) {
                if (!state.isRecording) {
                    stopCameraPreview();
                }
                return;
            }
            if (state.mode !== 'video') {
                if (cameraState.ctrl) stopCameraPreview();
                renderCameraStatus('Audio mode (no camera)');
                return;
            }
            if (!cameraState.ctrl) {
                await startCameraPreview();
            }
        }

        function getPreviewRect(panel, hostEl) {
            const panelRect = panel.getBoundingClientRect();
            const hostRect = hostEl.getBoundingClientRect();
            const left = panelRect.left - hostRect.left;
            const top = panelRect.top - hostRect.top;
            return {
                left: Math.max(0, Math.round(left)),
                top: Math.max(0, Math.round(top)),
                width: Math.round(panelRect.width),
                height: Math.round(panelRect.height)
            };
        }

        function makePanelDraggable(panel, handle, hostEl) {
            let dragging = false;
            let startX = 0;
            let startY = 0;
            let startLeft = 0;
            let startTop = 0;

            const onMove = (ev) => {
                if (!dragging) return;
                const hostRect = hostEl.getBoundingClientRect();
                const maxLeft = Math.max(0, hostRect.width - panel.offsetWidth);
                const maxTop = Math.max(0, hostRect.height - panel.offsetHeight);
                const nextLeft = clamp(startLeft + (ev.clientX - startX), 0, maxLeft);
                const nextTop = clamp(startTop + (ev.clientY - startY), 0, maxTop);
                panel.style.left = `${nextLeft}px`;
                panel.style.top = `${nextTop}px`;
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            };

            const stop = () => {
                if (!dragging) return;
                dragging = false;
                document.removeEventListener('pointermove', onMove, true);
                document.removeEventListener('pointerup', stop, true);
                document.removeEventListener('pointercancel', stop, true);
                handle.releasePointerCapture?.(handle._dragPointerId);
                savePreviewRect(getPreviewRect(panel, hostEl));
            };

            const startDrag = (ev) => {
                if (ev.button !== undefined && ev.button !== 0) return;
                const hostRect = hostEl.getBoundingClientRect();
                const panelRect = panel.getBoundingClientRect();
                dragging = true;
                startX = ev.clientX;
                startY = ev.clientY;
                startLeft = panelRect.left - hostRect.left;
                startTop = panelRect.top - hostRect.top;
                handle._dragPointerId = ev.pointerId;
                handle.setPointerCapture?.(ev.pointerId);
                document.addEventListener('pointermove', onMove, true);
                document.addEventListener('pointerup', stop, true);
                document.addEventListener('pointercancel', stop, true);
                ev.preventDefault();
                ev.stopPropagation();
            };

            if (window.PointerEvent) {
                handle.addEventListener('pointerdown', startDrag, { passive: false });
            } else {
                handle.addEventListener('mousedown', (ev) => {
                    startDrag(ev);
                    const move = (e) => onMove(e);
                    const up = () => {
                        stop();
                        document.removeEventListener('mousemove', move, true);
                        document.removeEventListener('mouseup', up, true);
                    };
                    document.addEventListener('mousemove', move, true);
                    document.addEventListener('mouseup', up, true);
                }, { passive: false });
            }
        }

        function makePanelResizable(panel, handle, hostEl) {
            let resizing = false;
            let startX = 0;
            let startY = 0;
            let startWidth = 0;
            let startHeight = 0;

            const onMove = (ev) => {
                if (!resizing) return;
                const hostRect = hostEl.getBoundingClientRect();
                const panelRect = panel.getBoundingClientRect();
                const maxWidth = Math.max(PREVIEW_MIN_WIDTH, hostRect.width - (panelRect.left - hostRect.left));
                const maxHeight = Math.max(PREVIEW_MIN_HEIGHT, hostRect.height - (panelRect.top - hostRect.top));
                const nextWidth = clamp(startWidth + (ev.clientX - startX), PREVIEW_MIN_WIDTH, maxWidth);
                const nextHeight = clamp(startHeight + (ev.clientY - startY), PREVIEW_MIN_HEIGHT, maxHeight);
                panel.style.width = `${nextWidth}px`;
                panel.style.height = `${nextHeight}px`;
            };

            const stop = () => {
                if (!resizing) return;
                resizing = false;
                document.removeEventListener('pointermove', onMove, true);
                document.removeEventListener('pointerup', stop, true);
                document.removeEventListener('pointercancel', stop, true);
                handle.releasePointerCapture?.(handle._resizePointerId);
                savePreviewRect(getPreviewRect(panel, hostEl));
            };

            handle.addEventListener('pointerdown', (ev) => {
                if (ev.button !== undefined && ev.button !== 0) return;
                resizing = true;
                startX = ev.clientX;
                startY = ev.clientY;
                startWidth = panel.offsetWidth;
                startHeight = panel.offsetHeight;
                handle._resizePointerId = ev.pointerId;
                handle.setPointerCapture?.(ev.pointerId);
                document.addEventListener('pointermove', onMove, true);
                document.addEventListener('pointerup', stop, true);
                document.addEventListener('pointercancel', stop, true);
                ev.preventDefault();
                ev.stopPropagation();
            }, { passive: false });
        }

        function mountMediaSelector(options) {
            if (!mediaState.holder) return;
            if (mediaState.selector && typeof mediaState.selector.destroyDropDown === 'function') {
                try { mediaState.selector.destroyDropDown(); } catch (_) { }
            }
            while (mediaState.holder.firstChild) {
                mediaState.holder.removeChild(mediaState.holder.firstChild);
            }
            if (typeof dropDown !== 'function') {
                $('div', {
                    parent: mediaState.holder,
                    text: 'media selector unavailable',
                    css: { color: '#fff', fontSize: '12px', padding: '4px' }
                });
                return;
            }
            mediaState.selector = dropDown({
                parent: mediaState.holder,
                id: MEDIA_SELECTOR_ID,
                theme: 'dark',
                options,
                value: '',
                css: {
                    display: 'inline-block',
                    width: '260px',
                    height: '26px',
                    lineHeight: '26px',
                    backgroundColor: '#00f',
                    color: 'white',
                    borderRadius: '0px',
                    margin: '0px',
                    padding: '0px'
                },
                listCss: {
                    width: '260px'
                },
                textCss: {
                    color: 'white'
                },
                onChange: async (value, label, idx) => {
                    const selected = String(value ?? '');
                    if (!selected) {
                        renderMediaStatus('No media selected');
                        return;
                    }
                    const entryByIndex = (typeof idx === 'number' && idx > 0)
                        ? (mediaState.entries[idx - 1] || null)
                        : null;
                    const entry = entryByIndex || mediaState.map.get(selected) || null;
                    const displayName = (entry && (entry.name || entry.file_name)) || label || selected;
                    renderMediaStatus(`Selected: ${displayName}`, '#8fd3ff');
                    const api = await ensureMediaApi();
                    if (!api || typeof api.play !== 'function') {
                        renderMediaPlayer(entry, { ok: false, error: 'play() not available' });
                        return;
                    }
                    try {
                        const playback = await api.play(entry || selected);
                        renderMediaPlayer(entry, playback);
                    } catch (e) {
                        renderMediaPlayer(entry, { ok: false, error: e && e.message ? e.message : String(e) });
                    }
                }
            });
        }

        async function refreshMediaList() {
            if (!mediaState.holder) return;
            const api = await ensureMediaApi();
            if (!api || typeof api.listMediaFiles !== 'function') {
                mountMediaSelector([{ label: 'Media list unavailable', value: '' }]);
                return;
            }
            const result = await api.listMediaFiles({ types: ['audio', 'video'] });
            if (!result || !result.ok) {
                if (result && result.error === 'auth_required') {
                    const msg = 'Connectez-vous pour voir les medias';
                    mountMediaSelector([{ label: msg, value: '' }]);
                    renderMediaStatus(msg, '#ffb0b0');
                    return;
                }
                mountMediaSelector([{ label: 'No media available', value: '' }]);
                if (!mediaState.debugLogged && typeof window.record_audio_debug_list === 'function') {
                    mediaState.debugLogged = true;
                    window.record_audio_debug_list({ types: ['audio', 'video'] }).catch(() => null);
                }
                return;
            }

            mediaState.map.clear();
            mediaState.entries = [];
            const options = [{ label: 'Select media...', value: '' }];
            result.files.forEach((file) => {
                const key = String(file.id || file.file_name || file.name || '');
                if (!key) return;
                mediaState.map.set(key, file);
                mediaState.entries.push(file);
                const shared = file.shared ? ' (shared)' : '';
                const kind = file.kind ? ` [${file.kind}]` : '';
                options.push({ label: `${file.name || file.file_name || key}${shared}${kind}`, value: key });
            });
            if (!result.files.length && !mediaState.debugLogged && typeof window.record_audio_debug_list === 'function') {
                mediaState.debugLogged = true;
                window.record_audio_debug_list({ types: ['audio', 'video'] }).catch(() => null);
            }
            mountMediaSelector(options);
        }

        const icon = $('img', {
            id: ICON_ID,
            parent: host,
            attrs: {
                src: ICON_SRC,
                alt: 'Record media',
                title: 'Record media'
            },
            css: {
                position: 'absolute',
                top: '3px',
                left: `${BASE_LEFT}px`,
                width: '26px',
                height: '26px',
                cursor: 'pointer',
                zIndex: 9999,
                userSelect: 'none',
                pointerEvents: 'auto'
            },
            onclick: async () => {
                try {
                    const recordVideo = await ensureVideoApi();
                    if (!recordVideo) {
                        console.warn('[record_video_UI] record_video() is not available.');
                        return;
                    }
                    if (!state.isRecording) {
                        const fileName = `${state.mode}_${Date.now()}`;
                        await updateCameraPreview();
                        const stream = (state.mode === 'video' && cameraState.stream) ? cameraState.stream : null;
                        state.ctrl = await recordVideo(fileName, null, {
                            mode: state.mode,
                            stream,
                            keepStream: true
                        });
                        state.isRecording = true;
                        icon.style.opacity = '0.6';
                        return;
                    }
                    if (state.ctrl && typeof state.ctrl.stop === 'function') {
                        await state.ctrl.stop();
                    }
                    state.ctrl = null;
                    state.isRecording = false;
                    icon.style.opacity = '1';
                    refreshMediaList().catch(() => null);
                } catch (e) {
                    const message = e && e.message ? e.message : String(e);
                    console.warn('[record_video_UI] Record action failed:', message);
                    renderMediaStatus(`Record failed: ${message}`, '#ffb0b0');
                    state.ctrl = null;
                    state.isRecording = false;
                    try { icon.style.opacity = '1'; } catch (_) { }
                }
            }
        });

        updateTitle(icon);

        // Camera toggle button (to the right of record icon)
        try {
            const toggle = $('div', {
                id: CAMERA_TOGGLE_ID,
                parent: host,
                text: 'Cam On',
                css: {
                    position: 'absolute',
                    top: '3px',
                    left: `${CAMERA_TOGGLE_LEFT}px`,
                    width: '70px',
                    height: '26px',
                    lineHeight: '26px',
                    textAlign: 'center',
                    backgroundColor: '#1e7d3b',
                    color: 'white',
                    fontSize: '11px',
                    fontFamily: 'Roboto, sans-serif',
                    borderRadius: '0px',
                    cursor: 'pointer',
                    zIndex: 9999,
                    userSelect: 'none',
                    pointerEvents: 'auto'
                },
                onclick: () => {
                    state.cameraEnabled = !state.cameraEnabled;
                    toggle.textContent = state.cameraEnabled ? 'Cam On' : 'Cam Off';
                    toggle.style.backgroundColor = state.cameraEnabled ? '#1e7d3b' : '#7a2d2d';
                    updateCameraPreview().catch(() => null);
                }
            });
            if (!state.cameraEnabled) {
                toggle.textContent = 'Cam Off';
                toggle.style.backgroundColor = '#7a2d2d';
            }
        } catch (e) {
            console.warn('[record_video_UI] Failed to mount camera toggle:', e && e.message ? e.message : e);
        }

        // Mode selector (audio/video)
        try {
            const modeHolder = $('div', {
                id: 'record-video-mode-selector-holder',
                parent: host,
                css: {
                    position: 'absolute',
                    top: '3px',
                    left: `${MODE_LEFT}px`,
                    width: '120px',
                    height: '26px',
                    zIndex: 9999,
                    pointerEvents: 'auto'
                }
            });

            if (typeof dropDown === 'function') {
                dropDown({
                    parent: modeHolder,
                    id: MODE_SELECTOR_ID,
                    theme: 'dark',
                    options: [
                        { label: 'Video', value: 'video' },
                        { label: 'Audio', value: 'audio' }
                    ],
                    value: state.mode,
                    onChange: (val) => {
                        state.mode = (String(val).toLowerCase() === 'audio') ? 'audio' : 'video';
                        updateTitle(icon);
                        updateCameraPreview().catch(() => null);
                    }
                });
            } else {
                console.warn('[record_video_UI] dropDown() is not available; mode selector not shown.');
            }
        } catch (e) {
            console.warn('[record_video_UI] Failed to mount mode selector:', e && e.message ? e.message : e);
        }

        // Camera preview
        try {
            const storedRect = loadPreviewRect();
            const initialLeft = Number.isFinite(storedRect?.left) ? storedRect.left : BASE_LEFT;
            const initialTop = Number.isFinite(storedRect?.top) ? storedRect.top : PREVIEW_TOP;
            const initialWidth = Number.isFinite(storedRect?.width) ? storedRect.width : PREVIEW_WIDTH;
            const initialHeight = Number.isFinite(storedRect?.height) ? storedRect.height : PREVIEW_HEIGHT;
            cameraState.holder = $('div', {
                id: 'record-video-camera-holder',
                parent: host,
                css: {
                    position: 'absolute',
                    top: `${initialTop}px`,
                    left: `${initialLeft}px`,
                    width: `${Math.max(PREVIEW_MIN_WIDTH, initialWidth)}px`,
                    height: `${Math.max(PREVIEW_MIN_HEIGHT, initialHeight)}px`,
                    backgroundColor: '#000',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    zIndex: 9999,
                    pointerEvents: 'auto',
                    touchAction: 'none'
                }
            });
            cameraState.videoSlot = $('div', {
                parent: cameraState.holder,
                css: {
                    position: 'absolute',
                    inset: '0px',
                    zIndex: 1
                }
            });
            const dragHandle = $('div', {
                parent: cameraState.holder,
                text: 'Preview',
                css: {
                    position: 'absolute',
                    top: '0px',
                    left: '0px',
                    right: '0px',
                    height: '18px',
                    lineHeight: '18px',
                    backgroundColor: 'rgba(20, 20, 20, 0.6)',
                    color: '#dcdcdc',
                    fontSize: '10px',
                    fontFamily: 'Roboto, sans-serif',
                    textAlign: 'center',
                    cursor: 'move',
                    userSelect: 'none',
                    zIndex: 3
                }
            });
            const resizeHandle = $('div', {
                parent: cameraState.holder,
                css: {
                    position: 'absolute',
                    right: '2px',
                    bottom: '2px',
                    width: '12px',
                    height: '12px',
                    borderRight: '2px solid rgba(255,255,255,0.7)',
                    borderBottom: '2px solid rgba(255,255,255,0.7)',
                    cursor: 'nwse-resize',
                    zIndex: 3
                }
            });

            makePanelDraggable(cameraState.holder, dragHandle, host);
            makePanelResizable(cameraState.holder, resizeHandle, host);
            renderCameraStatus('Camera preview');
            updateCameraPreview().catch(() => null);
        } catch (e) {
            console.warn('[record_video_UI] Failed to mount camera preview:', e && e.message ? e.message : e);
        }

        // Media selector + player (under the preview)
        try {
            mediaState.holder = $('div', {
                id: 'record-video-media-selector-holder',
                parent: host,
                css: {
                    position: 'absolute',
                    top: `${MEDIA_TOP}px`,
                    left: `${BASE_LEFT}px`,
                    width: '260px',
                    height: '26px',
                    zIndex: 9999,
                    pointerEvents: 'auto'
                }
            });

            mediaState.player = $('div', {
                id: MEDIA_PLAYER_ID,
                parent: host,
                css: {
                    position: 'absolute',
                    top: `${PLAYER_TOP}px`,
                    left: `${BASE_LEFT}px`,
                    width: '260px',
                    minHeight: '60px',
                    maxHeight: '180px',
                    padding: '6px',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    color: 'white',
                    borderRadius: '4px',
                    zIndex: 9998,
                    pointerEvents: 'auto'
                }
            });

            renderMediaStatus('No media selected');
            refreshMediaList().catch(() => null);
        } catch (e) {
            console.warn('[record_video_UI] Failed to mount media selector:', e && e.message ? e.message : e);
        }
    });
})();
