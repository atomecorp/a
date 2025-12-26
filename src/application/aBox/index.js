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

$('div', {
    id: uploadsListId,
    parent: '#view',
    css: {
        position: 'relative',
        zIndex: '9000',
        backgroundColor: '#111',
        color: '#fff',
        margin: '10px',
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
        width: '120px',
        height: '120px',
        padding: '10px',
        color: 'white',
        margin: '10px',
        display: 'inline-block'
    }
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

function resolveApiBases() {
    try {
        const platform = typeof current_platform === 'function' ? current_platform() : '';
        if (typeof platform === 'string' && platform.toLowerCase().includes('taur')) {
            const fastifyBase = (typeof window !== 'undefined' && typeof window.__SQUIRREL_FASTIFY_URL__ === 'string')
                ? window.__SQUIRREL_FASTIFY_URL__.trim().replace(/\/$/, '')
                : '';
            return ['http://127.0.0.1:3000', fastifyBase, ''].filter(v => v !== null && v !== undefined);
        }
    } catch (_) { }
    return [''];
}

const apiBases = resolveApiBases();
let lastSuccessfulApiBase = null;

function uniqueBaseCandidates() {
    const seen = new Set();
    const ordered = [];

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
    pushBase('');

    return ordered;
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / (1024 ** exponent);
    return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

async function fetchUploadsMetadata() {
    const bases = uniqueBaseCandidates();
    let lastError = null;

    for (const base of bases) {
        const endpoint = base ? `${base}/api/uploads` : '/api/uploads';
        try {
            const token = getAuthToken();
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
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
    if (token) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
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
    const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Filename': encodeURIComponent(fileName)
    };
    const token = getAuthToken();
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let lastError = null;
    for (const base of uniqueBaseCandidates()) {
        const endpoint = base ? `${base}/api/uploads` : '/api/uploads';
        try {
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
