// dragdrop.js
// Small utility to register drag-and-drop zones and normalize dropped files across browsers
// Returns File-like metadata: { name, type, size, file, path?, fullPath? }

async function _entryToFiles(entry, pathPrefix = '') {
    const results = [];

    return new Promise((resolve) => {
        if (!entry) return resolve(results);

        if (entry.isFile) {
            entry.file((file) => {
                // Some runtimes (Electron) expose a `path` property on File
                if (!file.path && entry.fullPath) file.fullPath = pathPrefix + entry.fullPath;
                results.push(file);
                resolve(results);
            }, () => resolve(results));
        } else if (entry.isDirectory && entry.createReader) {
            const reader = entry.createReader();
            const readEntries = () => {
                reader.readEntries(async (entries) => {
                    if (!entries.length) return resolve(results);
                    const nested = await Promise.all(entries.map((e) => _entryToFiles(e, pathPrefix)));
                    nested.flat().forEach((f) => results.push(f));
                    // Continue reading (webkit directory readers may return in chunks)
                    readEntries();
                }, () => resolve(results));
            };
            readEntries();
        } else {
            resolve(results);
        }
    });
}

async function _collectFilesFromDataTransfer(dt) {
    const files = [];

    if (dt.items && dt.items.length) {
        // Prefer items: may allow directory traversal
        for (let i = 0; i < dt.items.length; i++) {
            const item = dt.items[i];
            if (item.kind !== 'file') continue;

            // webkitGetAsEntry is available in Chromium-based browsers
            const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
            if (entry) {
                const fileList = await _entryToFiles(entry);
                if (fileList.length) fileList.forEach((f) => files.push(f));
                continue;
            }

            const file = item.getAsFile ? item.getAsFile() : null;
            if (file) files.push(file);
        }
    } else if (dt.files && dt.files.length) {
        // Fallback: use DataTransfer.files
        for (let i = 0; i < dt.files.length; i++) files.push(dt.files[i]);
    }

    return files;
}

function _normalizeFile(file) {
    return {
        name: file.name || (file.path ? (file.path.split('/').pop()) : 'unknown'),
        type: file.type || 'application/octet-stream',
        size: typeof file.size === 'number' ? file.size : null,
        file, // original File/Blob instance
        path: file.path || null, // available in some runtimes (Electron)
        fullPath: file.fullPath || null // from webkit entries when available
    };
}

// options: { accept, multiple, maxSize, allowedDropId }
// accept can be array of mime/glob strings or a function(file) => boolean
export function createDropZone(target, options = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target || document.body;
    if (!el) throw new Error('createDropZone: target element not found');

    const opts = Object.assign({ accept: null, multiple: true, maxSize: Infinity, allowedDropId: null }, options);

    const onDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        el.classList && el.classList.add('dd-over');
    };

    const onDragLeave = () => {
        el.classList && el.classList.remove('dd-over');
    };

    const matchesAllowedId = (evt) => {
        if (!opts.allowedDropId) return true;
        // allow drop only if the event target or an ancestor has the allowed id
        let node = evt.target;
        while (node && node !== document) {
            if (node.id === opts.allowedDropId) return true;
            node = node.parentNode;
        }
        return false;
    };

    const onDrop = async (e) => {
        e.preventDefault();
        el.classList && el.classList.remove('dd-over');

        if (!matchesAllowedId(e)) return;

        const rawFiles = await _collectFilesFromDataTransfer(e.dataTransfer);
        let normalized = rawFiles.map(_normalizeFile);

        // Apply accept filter
        if (opts.accept) {
            const acceptFn = typeof opts.accept === 'function'
                ? opts.accept
                : (f) => {
                    for (const rule of (Array.isArray(opts.accept) ? opts.accept : [opts.accept])) {
                        if (!rule) continue;
                        if (rule === '*') return true;
                        if (rule.endsWith('/*')) {
                            const prefix = rule.slice(0, -1);
                            if (f.type && f.type.startsWith(prefix)) return true;
                        } else if (rule.includes('/')) {
                            if (f.type === rule) return true;
                        } else if (rule.startsWith('.')) {
                            if (f.name && f.name.toLowerCase().endsWith(rule.toLowerCase())) return true;
                        } else {
                            // treat as extension
                            if (f.name && f.name.toLowerCase().endsWith('.' + rule.toLowerCase())) return true;
                        }
                    }
                    return false;
                };

            normalized = normalized.filter((f) => acceptFn(f.file ? f.file : f));
        }

        // Apply size limits & multiple
        normalized = normalized.filter((f) => (opts.maxSize == null || f.size == null || f.size <= opts.maxSize));
        if (!opts.multiple && normalized.length > 1) normalized = [normalized[0]];

        if (typeof opts.onDrop === 'function') {
            try { opts.onDrop(normalized, e); } catch (err) { console.error('onDrop callback error', err); }
        }
    };

    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragenter', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);

    return {
        destroy() {
            el.removeEventListener('dragover', onDragOver);
            el.removeEventListener('dragenter', onDragOver);
            el.removeEventListener('dragleave', onDragLeave);
            el.removeEventListener('drop', onDrop);
        }
    };
}

// Convenience: register a global drop zone (document.body) but allow restricting to an element id
export function registerGlobalDrop(options = {}) {
    return createDropZone(document.body, options);
}

// Example helper that returns a short summary for each dropped file
export function summarizeFiles(files) {
    return files.map(f => ({ name: f.name, type: f.type, size: f.size, path: f.path || f.fullPath || null }));
}

export default { createDropZone, registerGlobalDrop, summarizeFiles };
