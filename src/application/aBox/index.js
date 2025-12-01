puts('aBox example loaded');
// on mac files are stored here : ~/Library/Application Support/com.squirrel.app/uploads
const dropZoneId = 'aBox_drop_zone';
const dropZoneDefaultBg = '#00f';
const dropZoneHoverBg = '#ff8800';
const uploadsListId = 'aBox_uploads_list';
const uploadsListBodyId = `${uploadsListId}_body`;

$('div', {
    id: uploadsListId,
    css: {
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
        fontWeight: 'bold',
        marginBottom: '8px'
    }
});

$('div', {
    id: uploadsListBodyId,
    parent: `#${uploadsListId}`,
    css: {
        maxHeight: '240px',
        overflowY: 'auto',
        backgroundColor: '#1b1b1b',
        borderRadius: '4px',
        padding: '6px'
    }
});

$('div', {
    id: dropZoneId,
    css: {
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
            return ['http://127.0.0.1:3000', 'http://127.0.0.1:3001', ''];
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
            const response = await fetch(endpoint, { method: 'GET' });
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
        const fileName = typeof file.name === 'string' ? file.name : 'unknown';
        const size = typeof file.size === 'number' ? file.size : 0;
        $('div', {
            parent: `#${uploadsListBodyId}`,
            text: `${fileName} (${formatBytes(size)})`,
            css: {
                padding: '6px',
                marginBottom: '4px',
                backgroundColor: '#252525',
                borderRadius: '4px',
                cursor: 'pointer'
            },
            onClick: () => downloadUpload(fileName)
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

function downloadUpload(fileName) {
    const bases = uniqueBaseCandidates();
    const encoded = encodeURIComponent(fileName);
    const base = bases.length ? bases[0] : '';
    const url = base ? `${base}/api/uploads/${encoded}` : `/api/uploads/${encoded}`;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
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

    let lastError = null;
    for (const base of uniqueBaseCandidates()) {
        const endpoint = base ? `${base}/api/uploads` : '/api/uploads';
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: blob
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
