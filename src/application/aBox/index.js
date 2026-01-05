puts('aBox example loaded');
// uploads are stored in the current user's Downloads folder (server-side)
const dropZoneId = 'aBox_drop_zone';
const dropZoneDefaultBg = '#00f';
const dropZoneHoverBg = '#ff8800';
const uploadsListId = 'aBox_uploads_list';
const uploadsListBodyId = `${uploadsListId}_body`;
const uploadsListHeaderId = `${uploadsListId}_header`;
const uploadsListToggleId = `${uploadsListId}_toggle`;
const uploadsListToggleLabelId = `${uploadsListId}_toggle_label`;

let showAtomesList = false;
const shareSelectionByKey = new Map();
const shareAtomeCounts = new Map();
const shareAtomeMeta = new Map();
let cachedAtomes = null;
let cachedAtomesAt = 0;
const ATOME_CACHE_TTL_MS = 5000;

function normalizePathValue(value) {
    if (!value) return '';
    return String(value).trim().replace(/\\/g, '/');
}

function normalizeComparablePath(value) {
    const cleaned = normalizePathValue(value).replace(/^\/+/, '');
    if (!cleaned) return '';
    const match = cleaned.match(/^data\/users\/[^/]+\//);
    return match ? cleaned.slice(match[0].length) : cleaned;
}

function getPathDirectory(pathValue) {
    const normalized = normalizePathValue(pathValue).replace(/\/+$/, '');
    if (!normalized) return '';
    const idx = normalized.lastIndexOf('/');
    if (idx <= 0) return '';
    return normalized.slice(0, idx);
}

function updateShareSelectionState() {
    if (typeof window === 'undefined') return;
    const atomeIds = Array.from(shareAtomeCounts.keys());
    const items = atomeIds.map((id) => {
        const meta = shareAtomeMeta.get(id) || {};
        return {
            id,
            label: meta.label || meta.filePath || meta.fileName || null,
            filePath: meta.filePath || null,
            fileName: meta.fileName || null,
            type: meta.type || null,
            source: meta.source || null
        };
    });
    window.__aBoxShareSelection = {
        atomeIds,
        items,
        sources: Array.from(shareSelectionByKey.keys()),
        updatedAt: Date.now()
    };
    window.dispatchEvent(new CustomEvent('abox-share-selection', {
        detail: { atomeIds, items }
    }));
}

function applyShareButtonState(buttonEl, isSelected) {
    if (!buttonEl) return;
    buttonEl.textContent = isSelected ? 'Selected' : 'Select';
    buttonEl.style.backgroundColor = isSelected ? '#2f5eff' : '#333';
    buttonEl.style.borderColor = isSelected ? '#2f5eff' : '#444';
    buttonEl.style.color = isSelected ? '#fff' : '#ddd';
}

function applyShareRowState(rowEl, isSelected) {
    if (!rowEl) return;
    rowEl.style.backgroundColor = isSelected ? '#2c2f36' : '#252525';
    rowEl.style.boxShadow = isSelected ? '0 0 0 1px #2f5eff inset' : 'none';
}

function addShareSelection(key, atomeIds, metaById = null) {
    const uniqueIds = Array.from(new Set((atomeIds || []).map(String).filter(Boolean)));
    if (!uniqueIds.length) return false;
    shareSelectionByKey.set(key, uniqueIds);
    uniqueIds.forEach((id) => {
        const count = shareAtomeCounts.get(id) || 0;
        shareAtomeCounts.set(id, count + 1);
        const meta = metaById?.[id];
        if (meta && !shareAtomeMeta.has(id)) {
            shareAtomeMeta.set(id, meta);
        }
    });
    updateShareSelectionState();
    return true;
}

function removeShareSelection(key) {
    const ids = shareSelectionByKey.get(key);
    if (!ids) return;
    shareSelectionByKey.delete(key);
    ids.forEach((id) => {
        const count = shareAtomeCounts.get(id) || 0;
        if (count <= 1) {
            shareAtomeCounts.delete(id);
            shareAtomeMeta.delete(id);
        } else {
            shareAtomeCounts.set(id, count - 1);
        }
    });
    updateShareSelectionState();
}

function isShareSelectionActive(key) {
    return shareSelectionByKey.has(key);
}

function appendCachedAtomeEntry(entry) {
    if (!entry?.id) return;
    const normalized = {
        id: String(entry.id),
        type: entry.type || 'raw',
        filePath: entry.filePath || ''
    };
    if (!cachedAtomes) cachedAtomes = [];
    if (cachedAtomes.some((item) => String(item.id) === normalized.id)) return;
    cachedAtomes.push(normalized);
    cachedAtomesAt = Date.now();
}

function getLocalToken() {
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem('local_auth_token') || '';
        }
    } catch (_) { }
    return '';
}

function getCloudToken() {
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem('cloud_auth_token')
                || localStorage.getItem('auth_token')
                || '';
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

function hasUserHints(headers) {
    return Boolean(headers['X-User-Id'] || headers['X-Username'] || headers['X-Phone']);
}

$('div', {
    id: uploadsListId,
    parent: '#view',
    css: {
        position: 'fixed',
        zIndex: '9000',
        backgroundColor: '#111',
        color: '#fff',
        left: '50px',
        top: '10px',
        padding: '10px',
        borderRadius: '6px',
        width: '260px',
        display: 'inline-block',
        verticalAlign: 'top',
        cursor: 'move',
        userSelect: 'none',
        pointerEvents: 'auto',
        touchAction: 'none'
    }
});

$('div', {
    id: uploadsListHeaderId,
    parent: `#${uploadsListId}`,
    css: {
        zIndex: '9000',
        fontWeight: 'bold',
        marginBottom: '8px',
        cursor: 'move',
        userSelect: 'none',
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px'
    },
    'data-role': 'aBox-drag-handle'
});

$('div', {
    parent: `#${uploadsListHeaderId}`,
    text: 'Uploaded files',
    css: {
        fontWeight: 'bold'
    }
});

const uploadsToggleWrap = $('label', {
    id: uploadsListToggleLabelId,
    parent: `#${uploadsListHeaderId}`,
    css: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '11px',
        fontWeight: 'normal',
        color: '#bbb',
        cursor: 'pointer',
        userSelect: 'none'
    }
});

const uploadsToggle = $('input', {
    parent: uploadsToggleWrap,
    attrs: { type: 'checkbox' },
    css: {
        width: '14px',
        height: '14px',
        cursor: 'pointer',
        pointerEvents: 'auto'
    }
});

$('span', {
    parent: uploadsToggleWrap,
    text: 'Atomes'
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

function attachUploadsListDrag() {
    const panel = document.getElementById(uploadsListId);
    if (!panel) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onPointerMove = (event) => {
        if (!isDragging) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const nextLeft = Math.max(0, startLeft + dx);
        const nextTop = Math.max(0, startTop + dy);
        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
    };

    const stopDrag = (event) => {
        if (!isDragging) return;
        isDragging = false;
        try {
            panel.releasePointerCapture?.(event.pointerId);
        } catch (_) { }
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', stopDrag);
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', stopDrag);
    };

    const startDrag = (clientX, clientY) => {
        const rect = panel.getBoundingClientRect();
        startX = clientX;
        startY = clientY;
        startLeft = rect.left;
        startTop = rect.top;
        isDragging = true;
    };

    const onTouchMove = (event) => {
        if (!isDragging || !event.touches || !event.touches[0]) return;
        const touch = event.touches[0];
        onPointerMove({ clientX: touch.clientX, clientY: touch.clientY });
    };

    const shouldIgnoreDrag = (target) => {
        if (!target) return false;
        const tag = String(target.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'button' || tag === 'select';
    };

    panel.addEventListener('pointerdown', (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        if (shouldIgnoreDrag(event.target)) return;
        startDrag(event.clientX, event.clientY);
        try {
            panel.setPointerCapture?.(event.pointerId);
        } catch (_) { }
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', stopDrag);
        event.preventDefault();
    });

    panel.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        if (shouldIgnoreDrag(event.target)) return;
        startDrag(event.clientX, event.clientY);
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', stopDrag);
        event.preventDefault();
    });

    panel.addEventListener('touchstart', (event) => {
        if (!event.touches || !event.touches[0]) return;
        if (shouldIgnoreDrag(event.target)) return;
        const touch = event.touches[0];
        startDrag(touch.clientX, touch.clientY);
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', stopDrag);
        event.preventDefault();
    }, { passive: false });
}

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
attachUploadsListDrag();

function normalizeApiBase(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed ? trimmed.replace(/\/$/, '') : '';
}

function isTauriRuntime() {
    if (typeof window === 'undefined') return false;
    return !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

function resolveLocalApiBase() {
    if (!isTauriRuntime()) return '';
    const port = (typeof window !== 'undefined')
        ? (window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || 3000)
        : 3000;
    return `http://127.0.0.1:${port}`;
}

function resolveFastifyApiBase() {
    try {
        return normalizeApiBase(
            (typeof window !== 'undefined' && typeof window.__SQUIRREL_FASTIFY_URL__ === 'string')
                ? window.__SQUIRREL_FASTIFY_URL__
                : (typeof window !== 'undefined' ? window.__SQUIRREL_TAURI_FASTIFY_URL__ : '')
        );
    } catch (_) {
        return '';
    }
}

function isAxumBrowserServer() {
    if (isTauriRuntime()) return false;
    if (typeof window === 'undefined') return false;
    const type = String(window.__SQUIRREL_SERVER_TYPE__ || '').toLowerCase();
    if (type) return type.includes('tauri');

    const cfgPort = window.__SQUIRREL_SERVER_CONFIG__?.fastify?.port;
    const pagePort = window.location?.port;
    if (cfgPort && pagePort && String(cfgPort) !== String(pagePort)) {
        return true;
    }
    return false;
}

function isLocalBase(base) {
    const normalized = normalizeApiBase(base).toLowerCase();
    if (!normalized) {
        const host = typeof window !== 'undefined' ? (window.location?.hostname || '') : '';
        return host === '' || host === 'localhost' || host === '127.0.0.1';
    }
    return normalized.includes('127.0.0.1') || normalized.includes('localhost');
}

function shouldSendUserHeaders(base) {
    return isLocalBase(base);
}

function resolveApiBases() {
    try {
        if (isTauriRuntime()) {
            const localBase = resolveLocalApiBase();
            return localBase ? [localBase] : [''];
        }

        const configured = resolveFastifyApiBase();
        if (configured) return [configured];
    } catch (_) { }
    return [''];
}

const apiBases = resolveApiBases();
let lastSuccessfulApiBase = null;
let uploadsAuthMissing = false;
let atomesListError = null;

function uniqueBaseCandidates() {
    const seen = new Set();
    const ordered = [];
    const allowEmptyBase = apiBases.some((base) => !base);

    const pushBase = (base) => {
        const value = base || '';
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

async function createUploadAtome({ fileName, originalName, relPath, mimeType, sizeBytes, atomeId, requireFastify = false }) {
    const api = window.AdoleAPI;
    if (!api || !api.atomes || typeof api.atomes.create !== 'function') return { ok: false };

    const userInfo = await resolveCurrentUserInfo();
    const ownerId = userInfo.id;
    if (!ownerId) return { ok: false };

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
            deferFastify: isTauriRuntime() && !requireFastify
        });
        const okTauri = !!(res?.tauri?.success || res?.tauri?.ok);
        const okFastify = !!(res?.fastify?.success || res?.fastify?.ok);
        const ok = okTauri || okFastify;
        const fastifyError = res?.fastify?.error || null;
        if (!ok) {
            console.warn('[aBox] Atome create failed:', res?.tauri?.error || res?.fastify?.error || res);
        }
        return {
            ok,
            id: resolvedId,
            type: atomeType,
            filePath: relativePath,
            fastifyOk: okFastify,
            fastifyDeferred: fastifyError === 'deferred',
            res
        };
    } catch (error) {
        console.warn('[aBox] Atome create failed:', error?.message || error);
        return { ok: false, id: resolvedId, type: atomeType, filePath: relativePath, fastifyOk: false, fastifyDeferred: false };
    }
}

async function fetchUploadsMetadata() {
    const bases = uniqueBaseCandidates();
    const base = bases.length ? bases[0] : '';
    const userHeaders = await buildUserHeaders();
    const hasHints = hasUserHints(userHeaders);
    const requiresHints = isAxumBrowserServer() || isTauriRuntime();
    const token = isTauriRuntime() ? getLocalToken() : getCloudToken();
    const tokenUsable = Boolean(token) && (!requiresHints || hasHints);
    const canUseUserHints = hasHints && shouldSendUserHeaders(base);
    const hasAuth = tokenUsable || canUseUserHints;

    uploadsAuthMissing = !hasAuth;
    if (!hasAuth) {
        return [];
    }

    const headers = shouldSendUserHeaders(base) ? { ...userHeaders } : {};
    if (tokenUsable) headers.Authorization = `Bearer ${token}`;
    if (!tokenUsable && !hasUserHints(headers)) {
        return [];
    }

    const endpoint = base ? `${base}/api/uploads` : '/api/uploads';
    const response = await fetch(endpoint, {
        method: 'GET',
        headers,
        credentials: 'include'
    });

    if (response.status === 401) {
        uploadsAuthMissing = true;
        return [];
    }

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload || payload.success !== true || !Array.isArray(payload.files)) {
        throw new Error('Unexpected payload structure');
    }

    uploadsAuthMissing = false;
    lastSuccessfulApiBase = base;
    return payload.files;
}

async function getCachedAtomesList() {
    const now = Date.now();
    if (cachedAtomes && (now - cachedAtomesAt) < ATOME_CACHE_TTL_MS) {
        return cachedAtomes;
    }
    const items = await fetchUserAtomesList();
    cachedAtomes = items;
    cachedAtomesAt = now;
    return items;
}

function findAtomeByFileName(items, fileName) {
    if (!fileName) return null;
    const normalizedName = normalizePathValue(fileName).split('/').pop().toLowerCase();
    if (!normalizedName) return null;
    return items.find((item) => {
        const filePath = normalizeComparablePath(item?.filePath).toLowerCase();
        return filePath === normalizedName || filePath.endsWith(`/${normalizedName}`);
    }) || null;
}

function collectRelatedAtomeIdsByPath(items, filePath, fallbackId = null) {
    const ids = new Set();
    if (fallbackId) ids.add(String(fallbackId));
    const dir = getPathDirectory(normalizeComparablePath(filePath));
    if (!dir) {
        return Array.from(ids).filter(Boolean);
    }
    const dirNormalized = normalizePathValue(dir).toLowerCase();
    items.forEach((item) => {
        if (!item?.id || !item?.filePath) return;
        const candidate = normalizeComparablePath(item.filePath).toLowerCase();
        if (candidate === dirNormalized || candidate.startsWith(`${dirNormalized}/`)) {
            ids.add(String(item.id));
        }
    });
    return Array.from(ids).filter(Boolean);
}

async function ensureUploadAtomeFromEntry(file) {
    const fileName = file?.file_name || file?.name || file?.original_name || '';
    if (!fileName) return null;
    const relativePath = file?.file_path || file?.filePath || `Downloads/${fileName}`;
    const createResult = await createUploadAtome({
        fileName,
        originalName: file?.original_name || fileName,
        relPath: relativePath,
        mimeType: file?.mime_type || null,
        sizeBytes: typeof file?.size === 'number' ? file.size : 0,
        atomeId: `file_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        requireFastify: true
    });
    if (!createResult?.ok || !createResult?.id) return null;
    if (createResult.fastifyDeferred || !createResult.fastifyOk) {
        try {
            await window.AdoleAPI?.sync?.maybeSync?.('abox_share');
        } catch (_) { }
    }
    appendCachedAtomeEntry({
        id: createResult.id,
        type: createResult.type || inferUploadAtomeType(fileName, file?.mime_type || ''),
        filePath: createResult.filePath || relativePath
    });
    return createResult;
}

async function collectRelatedAtomeIdsForUpload(file) {
    const items = await getCachedAtomesList();
    const fileId = file && (file.id || file.atome_id || file.file_id) ? String(file.id || file.atome_id || file.file_id) : null;
    const name = file?.file_name || file?.name || file?.original_name || '';
    const match = fileId ? (items.find((item) => String(item?.id || '') === fileId) || null) : null;
    const fallbackMatch = match || findAtomeByFileName(items, name);
    if (fallbackMatch?.id) {
        return collectRelatedAtomeIdsByPath(items, fallbackMatch.filePath, fallbackMatch.id);
    }
    if (fileId) return [fileId];
    if (!items.length) {
        const created = await ensureUploadAtomeFromEntry(file);
        return created?.id ? [String(created.id)] : [];
    }
    const created = await ensureUploadAtomeFromEntry(file);
    if (created?.id) {
        const list = cachedAtomes || items;
        return collectRelatedAtomeIdsByPath(list, created.filePath, created.id);
    }
    return [];
}

function renderUploadsList(files) {
    const container = document.getElementById(uploadsListBodyId);
    if (!container) return;

    container.innerHTML = '';

    if (uploadsAuthMissing) {
        $('div', {
            parent: `#${uploadsListBodyId}`,
            text: 'Connectez-vous pour voir les uploads',
            css: {
                color: '#bbb',
                fontStyle: 'italic',
                padding: '4px 2px'
            }
        });
        return;
    }

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
        const keyToken = fileId || file?.file_name || displayName || '';
        const itemKey = `upload:${String(keyToken).trim()}`;
        const row = $('div', {
            parent: `#${uploadsListBodyId}`,
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                justifyContent: 'space-between',
                padding: '6px',
                marginBottom: '4px',
                backgroundColor: '#252525',
                borderRadius: '4px',
                cursor: 'pointer'
            },
            onClick: () => downloadUpload(fileId || displayName, displayName)
        });
        const rowEl = row?.element || row;

        $('div', {
            parent: row,
            text: `${displayName}${access}${legacy} (${formatBytes(size)})`,
            css: {
                flex: '1',
                minWidth: '0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            }
        });

        const selectButton = $('button', {
            parent: row,
            text: 'Select',
            attrs: { type: 'button' },
            css: {
                padding: '4px 6px',
                fontSize: '10px',
                borderRadius: '4px',
                border: '1px solid #444',
                backgroundColor: '#333',
                color: '#ddd',
                cursor: 'pointer',
                flex: '0 0 auto'
            },
            onClick: async (event) => {
                event.stopPropagation();
                const buttonEl = selectButton?.element || selectButton;
                if (isShareSelectionActive(itemKey)) {
                    removeShareSelection(itemKey);
                    applyShareButtonState(buttonEl, false);
                    applyShareRowState(rowEl, false);
                    return;
                }
                buttonEl.disabled = true;
                buttonEl.textContent = '...';
                try {
                    const relatedIds = await collectRelatedAtomeIdsForUpload(file);
                    const atomes = await getCachedAtomesList();
                    const atomeById = new Map(atomes.map(item => [String(item.id), item]));
                    const metaById = {};
                    relatedIds.forEach((id) => {
                        const info = atomeById.get(String(id));
                        metaById[id] = {
                            label: info?.filePath || displayName,
                            filePath: info?.filePath || null,
                            fileName: displayName,
                            type: info?.type || null,
                            source: 'upload'
                        };
                    });
                    const added = addShareSelection(itemKey, relatedIds, metaById);
                    if (!added) puts('[aBox] Aucun atome associe pour ce fichier.');
                } catch (error) {
                    console.warn('[aBox] Selection failed:', error);
                } finally {
                    buttonEl.disabled = false;
                    applyShareButtonState(buttonEl, isShareSelectionActive(itemKey));
                    applyShareRowState(rowEl, isShareSelectionActive(itemKey));
                }
            }
        });

        const selectButtonEl = selectButton?.element || selectButton;
        applyShareButtonState(selectButtonEl, isShareSelectionActive(itemKey));
        applyShareRowState(rowEl, isShareSelectionActive(itemKey));
    });
}

function normalizeAtomeEntry(atome) {
    if (!atome || typeof atome !== 'object') return null;
    const id = atome.atome_id || atome.id || null;
    const type = atome.atome_type || atome.type || atome.kind || 'unknown';
    const particles = atome.particles || atome.data || {};
    const filePath = particles.file_path || particles.filePath || particles.path || particles.rel_path || '';
    return { id, type, filePath };
}

function renderAtomesList(items) {
    const container = document.getElementById(uploadsListBodyId);
    if (!container) return;

    container.innerHTML = '';

    if (atomesListError) {
        $('div', {
            parent: `#${uploadsListBodyId}`,
            text: `Unable to load atomes (${atomesListError})`,
            css: {
                color: '#f66',
                padding: '4px 2px'
            }
        });
        return;
    }

    if (!Array.isArray(items) || items.length === 0) {
        $('div', {
            parent: `#${uploadsListBodyId}`,
            text: 'No atomes yet',
            css: {
                color: '#bbb',
                fontStyle: 'italic',
                padding: '4px 2px'
            }
        });
        return;
    }

    items.forEach((entry) => {
        if (!entry) return;
        const label = entry.filePath
            ? `${entry.type} - ${entry.filePath}`
            : `${entry.type} - (no path)`;
        const itemKey = `atome:${String(entry.id || label || '').trim()}`;
        const row = $('div', {
            parent: `#${uploadsListBodyId}`,
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                justifyContent: 'space-between',
                padding: '6px',
                marginBottom: '4px',
                backgroundColor: '#252525',
                borderRadius: '4px'
            }
        });
        const rowEl = row?.element || row;

        $('div', {
            parent: row,
            text: label,
            css: {
                flex: '1',
                minWidth: '0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            }
        });

        const selectButton = $('button', {
            parent: row,
            text: 'Select',
            attrs: { type: 'button' },
            css: {
                padding: '4px 6px',
                fontSize: '10px',
                borderRadius: '4px',
                border: '1px solid #444',
                backgroundColor: '#333',
                color: '#ddd',
                cursor: 'pointer',
                flex: '0 0 auto'
            },
            onClick: (event) => {
                event.stopPropagation();
                const buttonEl = selectButton?.element || selectButton;
                if (isShareSelectionActive(itemKey)) {
                    removeShareSelection(itemKey);
                    applyShareButtonState(buttonEl, false);
                    applyShareRowState(rowEl, false);
                    return;
                }
                const relatedIds = collectRelatedAtomeIdsByPath(items, entry.filePath, entry.id);
                const metaById = {};
                relatedIds.forEach((id) => {
                    const info = items.find(item => String(item.id) === String(id));
                    metaById[id] = {
                        label: info?.filePath || info?.type || 'atome',
                        filePath: info?.filePath || null,
                        fileName: info?.filePath ? info.filePath.split('/').pop() : null,
                        type: info?.type || null,
                        source: 'atome'
                    };
                });
                const added = addShareSelection(itemKey, relatedIds, metaById);
                if (!added) puts('[aBox] Aucun atome associe pour ce chemin.');
                applyShareButtonState(buttonEl, isShareSelectionActive(itemKey));
                applyShareRowState(rowEl, isShareSelectionActive(itemKey));
            }
        });

        const selectButtonEl = selectButton?.element || selectButton;
        applyShareButtonState(selectButtonEl, isShareSelectionActive(itemKey));
        applyShareRowState(rowEl, isShareSelectionActive(itemKey));
    });
}

async function fetchUserAtomesList() {
    const api = window.AdoleAPI || (typeof AdoleAPI !== 'undefined' ? AdoleAPI : null);
    if (!api?.atomes?.list) {
        atomesListError = 'AdoleAPI.atomes.list unavailable';
        return [];
    }

    atomesListError = null;
    const result = await api.atomes.list();
    const tauriAtomes = Array.isArray(result?.tauri?.atomes) ? result.tauri.atomes : [];
    const fastifyAtomes = Array.isArray(result?.fastify?.atomes) ? result.fastify.atomes : [];
    const merged = [];
    const seen = new Set();

    const add = (items) => {
        items.forEach((item) => {
            const id = item?.atome_id || item?.id || null;
            if (id && seen.has(id)) return;
            if (id) seen.add(id);
            const normalized = normalizeAtomeEntry(item);
            if (normalized) merged.push(normalized);
        });
    };

    add(fastifyAtomes);
    add(tauriAtomes);

    merged.sort((a, b) => {
        if (a.type !== b.type) return String(a.type).localeCompare(String(b.type));
        return String(a.filePath || '').localeCompare(String(b.filePath || ''));
    });

    cachedAtomes = merged;
    cachedAtomesAt = Date.now();

    return merged;
}

async function refreshUploadsList() {
    try {
        const files = await fetchUploadsMetadata();
        renderUploadsList(files);
    } catch (error) {
        const message = String(error?.message || '');
        const unauthorized = message.includes('Unauthorized') || message.includes('401');
        if (unauthorized) {
            uploadsAuthMissing = true;
            renderUploadsList([]);
            return;
        }
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

async function refreshAtomesList() {
    try {
        const atomes = await fetchUserAtomesList();
        renderAtomesList(atomes);
    } catch (error) {
        atomesListError = error?.message || String(error);
        renderAtomesList([]);
    }
}

async function refreshUploadsPanel() {
    if (showAtomesList) {
        await refreshAtomesList();
        return;
    }
    await refreshUploadsList();
}

if (uploadsToggle?.element || uploadsToggle) {
    const toggleEl = uploadsToggle?.element || uploadsToggle;
    toggleEl.onchange = async () => {
        showAtomesList = !!toggleEl.checked;
        await refreshUploadsPanel();
    };
}
async function downloadUpload(fileId, fileName) {
    const bases = uniqueBaseCandidates();
    const encoded = encodeURIComponent(fileId || fileName);
    const base = bases.length ? bases[0] : '';
    const url = base ? `${base}/api/uploads/${encoded}` : `/api/uploads/${encoded}`;

    const token = isTauriRuntime() ? getLocalToken() : getCloudToken();
    const userHeaders = await buildUserHeaders();
    const headers = shouldSendUserHeaders(base) ? { ...userHeaders } : {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const hasHints = hasUserHints(headers);
    if (token || hasHints) {
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
    const bases = uniqueBaseCandidates();
    const base = bases.length ? bases[0] : '';
    const userHeaders = await buildUserHeaders();
    const hasHints = hasUserHints(userHeaders);
    const requiresHints = isAxumBrowserServer() || isTauriRuntime();
    const token = isTauriRuntime() ? getLocalToken() : getCloudToken();
    const tokenUsable = Boolean(token) && (!requiresHints || hasHints);
    const canUseUserHints = hasHints && shouldSendUserHeaders(base);

    if (!tokenUsable && !canUseUserHints) {
        uploadsAuthMissing = true;
        renderUploadsList([]);
        puts('[upload] Connectez-vous pour envoyer des fichiers');
        return;
    }

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
    if (tokenUsable) {
        headers.Authorization = `Bearer ${token}`;
    }
    if (!tokenUsable && !hasUserHints(headers)) {
        uploadsAuthMissing = true;
        renderUploadsList([]);
        puts('[upload] Connectez-vous pour envoyer des fichiers');
        return;
    }

    const endpoint = base ? `${base}/api/uploads` : '/api/uploads';
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
    await refreshUploadsPanel();
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

refreshUploadsPanel();
