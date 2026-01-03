puts('aBox example loaded');
// uploads are stored in the current user's Downloads folder (server-side)
const dropZoneId = 'aBox_drop_zone';
const dropZoneDefaultBg = '#00f';
const dropZoneHoverBg = '#ff8800';
const uploadsListId = 'aBox_uploads_list';
const uploadsListBodyId = `${uploadsListId}_body`;

function getAuthToken() {
    try {
        if (window.AdoleAPI?.auth?.getToken) {
            const token = window.AdoleAPI.auth.getToken();
            if (token) return token;
        }
    } catch (_) { }

    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem('cloud_auth_token')
                || localStorage.getItem('auth_token')
                || localStorage.getItem('local_auth_token')
                || '';
        }
    } catch (_) { }

    try {
        if (typeof sessionStorage !== 'undefined') {
            return sessionStorage.getItem('auth_token') || '';
        }
    } catch (_) { }

    return '';
}

async function resolveCurrentUserInfo() {
    const info = { id: null, username: null, phone: null };

    try {
        if (window.AdoleAPI?.auth?.getCurrentInfo) {
            const current = window.AdoleAPI.auth.getCurrentInfo();
            if (current) {
                info.id = current.user_id || current.atome_id || current.id || info.id;
                info.username = current.username || current.name || info.username;
                info.phone = current.phone || info.phone;
            }
        }
    } catch (_) { }

    if ((!info.id || !info.username || !info.phone) && typeof window.AdoleAPI?.auth?.current === 'function') {
        try {
            const res = await window.AdoleAPI.auth.current();
            const user = res?.user || res;
            if (user) {
                info.id = info.id || user.user_id || user.atome_id || user.id || null;
                info.username = info.username || user.username || user.name || null;
                info.phone = info.phone || user.phone || null;
            }
        } catch (_) { }
    }

    if ((!info.id || !info.username || !info.phone) && window.__currentUser) {
        try {
            const user = window.__currentUser;
            info.id = info.id || user.user_id || user.atome_id || user.id || null;
            info.username = info.username || user.username || user.name || null;
            info.phone = info.phone || user.phone || null;
        } catch (_) { }
    }

    return info;
}

async function buildUserHeaders(extra = {}) {
    const headers = { ...extra };
    const info = await resolveCurrentUserInfo();
    if (info.id) headers['X-User-Id'] = info.id;
    if (info.username) headers['X-Username'] = info.username;
    if (info.phone) headers['X-Phone'] = info.phone;
    return headers;
}

$('div', {
    id: uploadsListId,
    parent: '#view',
    css: {
        position: 'relative',
        zIndex: '9000',
        backgroundColor: '#111',
        color: '#fff',
        marginLeft: '50px',
        marginTop: '10px',
        padding: '10px',
        borderRadius: '6px',
        width: '260px',
        display: 'inline-block',
        verticalAlign: 'top'
    }
});

$('div', {
    parent: `#${uploadsListId}`,
    text: 'Uploaded files',
    css: {
        zIndex: '9000',
        fontWeight: 'bold',
        marginBottom: '8px'
    }
});

$('div', {
    id: uploadsListBodyId,
    parent: `#${uploadsListId}`,
    css: {
        zIndex: '9000',
        maxHeight: '240px',
        overflowY: 'auto',
        backgroundColor: '#1b1b1b',
        borderRadius: '4px',
        padding: '6px'
    }
});

$('div', {
    id: dropZoneId,
    parent: '#view',
    css: {
        position: 'relative',
        zIndex: '9000',
        backgroundColor: dropZoneDefaultBg,
        marginLeft: '0',
        width: '90px',
        height: '60px',
        padding: '10px',
        color: 'white',
        margin: '10px',
        display: 'inline-block'
    },
    text: 'Drop files here'
});

function setDropZoneColor(color) {
    const zone = document.getElementById(dropZoneId);
    if (zone) {
        zone.style.backgroundColor = color;
    }
}

function attachDropZoneHighlight() {
    const zone = document.getElementById(dropZoneId);
    if (!zone) return;
    let isDragInside = false;

    const handleEnter = (event) => {
        event.preventDefault();
        if (isDragInside) return;
        isDragInside = true;
        setDropZoneColor(dropZoneHoverBg);
        puts(`Entering ${dropZoneId}`);
    };

    const handleLeave = (event) => {
        if (event.relatedTarget && zone.contains(event.relatedTarget)) return;
        setDropZoneColor(dropZoneDefaultBg);
        puts(`Leaving ${dropZoneId}`);
        isDragInside = false;
    };

    const handleDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDropZoneColor(dropZoneDefaultBg);
        isDragInside = false;
    };

    zone.addEventListener('dragenter', handleEnter);
    zone.addEventListener('dragover', handleEnter);
    zone.addEventListener('dragleave', handleLeave);
    zone.addEventListener('drop', handleDrop);
}

attachDropZoneHighlight();

function normalizeApiBase(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed ? trimmed.replace(/\/$/, '') : '';
}

function isTauriRuntime() {
    if (typeof window === 'undefined') return false;
    return !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

function isLocalBase(base) {
    if (isTauriRuntime()) return true;
    const normalized = normalizeApiBase(base).toLowerCase();
    if (!normalized) return true;
    return normalized.includes('127.0.0.1') || normalized.includes('localhost');
}

function shouldSendUserHeaders(base) {
    return isLocalBase(base);
}

function resolveApiBases() {
    try {
        if (isTauriRuntime()) {
            const port = (typeof window !== 'undefined')
                ? (window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || 3000)
                : 3000;
            return [`http://127.0.0.1:${port}`];
        }

        const configured = normalizeApiBase(
            (typeof window !== 'undefined' && typeof window.__SQUIRREL_FASTIFY_URL__ === 'string')
                ? window.__SQUIRREL_FASTIFY_URL__
                : (typeof window !== 'undefined' ? window.__SQUIRREL_TAURI_FASTIFY_URL__ : '')
        );
        if (configured) return [configured];
    } catch (_) { }
    return [''];
}

const apiBases = resolveApiBases();
let lastSuccessfulApiBase = null;

function uniqueBaseCandidates() {
    const seen = new Set();
    const ordered = [];
    const allowEmptyBase = apiBases.some((base) => !base);

    const pushBase = (base) => {
        const value = base || '';
        if (isTauriRuntime() && !isLocalBase(value)) {
            return;
        }
        if (!seen.has(value)) {
            seen.add(value);
            ordered.push(value);
        }
    };

    if (lastSuccessfulApiBase !== null) {
        pushBase(lastSuccessfulApiBase);
    }

    apiBases.forEach(pushBase);
    if (allowEmptyBase) {
        pushBase('');
    }

    return ordered;
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / (1024 ** exponent);
    return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

const FILE_TYPE_MAP = {
    image: new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.ico']),
    shape: new Set(['.svg']),
    video: new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.mpeg', '.mpg', '.m4v']),
    sound: new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.aiff', '.aif', '.opus']),
    text: new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.log'])
};

const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv', 'text/tab-separated-values']);

function getFileExtension(name) {
    if (typeof name !== 'string') return '';
    const base = name.split('/').pop().split('\\').pop();
    const parts = base.split('.');
    if (parts.length < 2) return '';
    return `.${parts[parts.length - 1].toLowerCase()}`;
}

function inferUploadAtomeType(name, mimeType) {
    const mime = (typeof mimeType === 'string' && mimeType.trim()) ? mimeType.trim().toLowerCase() : '';
    const ext = getFileExtension(name);
    if (FILE_TYPE_MAP.shape.has(ext) || mime === 'image/svg+xml') return 'shape';
    if (FILE_TYPE_MAP.image.has(ext) || (mime.startsWith('image/') && mime !== 'image/svg+xml')) return 'image';
    if (FILE_TYPE_MAP.video.has(ext) || mime.startsWith('video/')) return 'video';
    if (FILE_TYPE_MAP.sound.has(ext) || mime.startsWith('audio/')) return 'sound';
    if (FILE_TYPE_MAP.text.has(ext) || TEXT_MIME_TYPES.has(mime)) return 'text';
    return 'raw';
}

function normalizeUserRelativePath(value, userId) {
    if (!value) return '';
    const safeUser = String(userId || '').trim();
    let cleaned = String(value).trim().replace(/\\/g, '/');
    if (!cleaned) return '';
    const anchor = `/data/users/${safeUser}/`;
    const altAnchor = `data/users/${safeUser}/`;
    if (safeUser && cleaned.includes(anchor)) {
        cleaned = cleaned.slice(cleaned.indexOf(anchor) + anchor.length);
    } else if (safeUser && cleaned.startsWith(altAnchor)) {
        cleaned = cleaned.slice(altAnchor.length);
    } else if (safeUser && cleaned.startsWith(`${safeUser}/`)) {
        cleaned = cleaned.slice(`${safeUser}/`.length);
    }
    return cleaned.replace(/^\/+/, '');
}

async function createUploadAtome({ fileName, originalName, relPath, mimeType, sizeBytes, atomeId }) {
    const api = window.AdoleAPI;
    if (!api || !api.atomes || typeof api.atomes.create !== 'function') return;

    const userInfo = await resolveCurrentUserInfo();
    const ownerId = userInfo.id;
    if (!ownerId) return;

    const atomeType = inferUploadAtomeType(originalName || fileName, mimeType);
    const resolvedId = atomeId || `file_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const relativePath = normalizeUserRelativePath(relPath, ownerId) || relPath || null;
    const particles = {
        kind: atomeType,
        file_name: fileName,
        original_name: originalName || fileName,
        file_path: relativePath,
        mime_type: mimeType || null,
        size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
        created_iso: new Date().toISOString()
    };

    try {
        const res = await api.atomes.create({
            id: resolvedId,
            type: atomeType,
            ownerId,
            particles,
            deferFastify: isTauriRuntime()
        });
        const ok = !!(res?.tauri?.success || res?.fastify?.success || res?.tauri?.ok || res?.fastify?.ok);
        if (!ok) {
            console.warn('[aBox] Atome create failed:', res?.tauri?.error || res?.fastify?.error || res);
        }
    } catch (error) {
        console.warn('[aBox] Atome create failed:', error?.message || error);
    }
}

async function fetchUploadsMetadata() {
    const bases = uniqueBaseCandidates();
    let lastError = null;
    const token = getAuthToken();
    const userHeaders = await buildUserHeaders();

    for (const base of bases) {
        const endpoint = base ? `${base}/api/uploads` : '/api/uploads';
        try {
            const headers = shouldSendUserHeaders(base) ? { ...userHeaders } : {};
            if (token) headers.Authorization = `Bearer ${token}`;
            const response = await fetch(endpoint, {
                method: 'GET',
                headers,
                credentials: 'include'
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(text || `HTTP ${response.status}`);
            }

            const payload = await response.json();
            if (!payload || payload.success !== true || !Array.isArray(payload.files)) {
                throw new Error('Unexpected payload structure');
            }

            lastSuccessfulApiBase = base;
            return payload.files;
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('No upload endpoint available');
}

function renderUploadsList(files) {
    const container = document.getElementById(uploadsListBodyId);
    if (!container) return;

    container.innerHTML = '';

    if (!Array.isArray(files) || files.length === 0) {
        $('div', {
            parent: `#${uploadsListBodyId}`,
            text: 'No uploads yet',
            css: {
                color: '#bbb',
                fontStyle: 'italic',
                padding: '4px 2px'
            }
        });
        return;
    }

    files.forEach((file) => {
        const fileId = file && (file.id || file.atome_id || file.file_id);
        const displayName = typeof file?.name === 'string'
            ? file.name
            : (typeof file?.original_name === 'string' ? file.original_name : (file?.file_name || 'unknown'));
        const size = typeof file?.size === 'number' ? file.size : 0;
        const access = typeof file?.access === 'string' && file.access !== 'owner' ? ` [${file.access}]` : '';
        const legacy = file?.legacy ? ' [legacy]' : '';
        $('div', {
            parent: `#${uploadsListBodyId}`,
            text: `${displayName}${access}${legacy} (${formatBytes(size)})`,
            css: {
                padding: '6px',
                marginBottom: '4px',
                backgroundColor: '#252525',
                borderRadius: '4px',
                cursor: 'pointer'
            },
            onClick: () => downloadUpload(fileId || displayName, displayName)
        });
    });
}

async function refreshUploadsList() {
    try {
        const files = await fetchUploadsMetadata();
        renderUploadsList(files);
    } catch (error) {
        console.error('Unable to refresh uploads list:', error);
        const container = document.getElementById(uploadsListBodyId);
        if (container) {
            container.innerHTML = '';
            $('div', {
                parent: `#${uploadsListBodyId}`,
                text: `Unable to load uploads (${error.message})`,
                css: {
                    color: '#f66',
                    padding: '4px 2px'
                }
            });
        }
    }
}

async function downloadUpload(fileId, fileName) {
    const bases = uniqueBaseCandidates();
    const encoded = encodeURIComponent(fileId || fileName);
    const base = bases.length ? bases[0] : '';
    const url = base ? `${base}/api/uploads/${encoded}` : `/api/uploads/${encoded}`;

    const token = getAuthToken();
    const userHeaders = await buildUserHeaders();
    const headers = shouldSendUserHeaders(base) ? { ...userHeaders } : {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const hasUserHints = Boolean(headers['X-User-Id'] || headers['X-Username'] || headers['X-Phone']);
    if (token || hasUserHints) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers,
                credentials: 'include'
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(text || `HTTP ${response.status}`);
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = fileName || fileId || '';
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            setTimeout(() => {
                URL.revokeObjectURL(objectUrl);
                document.body.removeChild(anchor);
            }, 0);
            return;
        } catch (error) {
            console.error('Download error:', error);
            puts(`[download] échec pour ${fileName || fileId || 'fichier'} : ${error.message}`);
        }
    }

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName || fileId || '';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
        document.body.removeChild(anchor);
    }, 0);
}

async function sendFileToServer(entry) {
    const blob = entry && (entry.file || entry.blob || entry);
    if (!blob || typeof blob.arrayBuffer !== 'function') {
        puts(`[upload] fichier invalide ignoré (${entry && entry.name ? entry.name : 'inconnu'})`);
        return;
    }

    const fileName = entry && entry.name ? entry.name : (blob.name || `upload_${Date.now()}`);
    const detectedMime = (typeof entry?.type === 'string' && entry.type.trim())
        ? entry.type.trim()
        : (typeof blob.type === 'string' && blob.type.trim() ? blob.type.trim() : '');
    const atomeId = `file_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const atomeType = inferUploadAtomeType(fileName, detectedMime);
    const token = getAuthToken();
    const userHeaders = await buildUserHeaders();

    let lastError = null;
    for (const base of uniqueBaseCandidates()) {
        const endpoint = base ? `${base}/api/uploads` : '/api/uploads';
        try {
            const headers = {
                'Content-Type': 'application/octet-stream',
                'X-Filename': encodeURIComponent(fileName)
            };
            if (atomeId) headers['X-Atome-Id'] = atomeId;
            if (atomeType) headers['X-Atome-Type'] = atomeType;
            if (detectedMime) headers['X-Mime-Type'] = detectedMime;
            headers['X-Original-Name'] = fileName;
            if (shouldSendUserHeaders(base)) {
                Object.assign(headers, userHeaders);
            }
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }
            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: blob,
                credentials: 'include'
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(text || `statut HTTP ${response.status}`);
            }

            const payload = await response.json().catch(() => ({ success: true, file: fileName }));
            if (!payload || payload.success !== true) {
                throw new Error(payload && payload.error ? payload.error : 'réponse serveur invalide');
            }

            puts(`[upload] ${payload.file} envoyé au serveur`);
            lastSuccessfulApiBase = base;
            await createUploadAtome({
                fileName: payload.file || fileName,
                originalName: fileName,
                relPath: payload.path || null,
                mimeType: detectedMime || blob.type || null,
                sizeBytes: blob.size || 0,
                atomeId
            });
            return;
        } catch (error) {
            lastError = error;
            continue;
        }
    }

    if (lastError) {
        throw lastError;
    }
}

async function uploadDroppedFiles(fileList) {
    if (!Array.isArray(fileList) || !fileList.length) return;
    for (const entry of fileList) {
        try {
            await sendFileToServer(entry);
        } catch (error) {
            console.error('Upload error:', error);
            puts(`[upload] échec pour ${entry && entry.name ? entry.name : 'inconnu'} : ${error.message}`);
        }
    }
    await refreshUploadsList();
}

DragDrop.createDropZone(`#${dropZoneId}`, {
    accept: '*',
    multiple: true,
    allowedDropId: dropZoneId,
    event: 'stop',
    onDrop: async (files) => {
        setDropZoneColor(dropZoneDefaultBg);
        puts(`file drop on ${dropZoneId}`);
        files.forEach((file) => puts(`- ${file.name}`));
        await uploadDroppedFiles(files);
    }
});

refreshUploadsList();
