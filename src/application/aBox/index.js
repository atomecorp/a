const dropZoneId = 'aBox_drop_zone';
const dropZoneDefaultBg = '#00f';
const dropZoneHoverBg = '#ff8800';

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
    for (const base of apiBases) {
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
