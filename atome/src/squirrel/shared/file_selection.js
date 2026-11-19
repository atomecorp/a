import { eveCssPx } from '../../../../eVe/elements/system_ui_tokens.js';
import { eveT } from '../../../../eVe/i18n/i18n.js';
import { DOCUMENT_ACCEPT } from '../../../../eVe/domains/document/import/document_import.js';
const NATIVE_ANY_SOURCE_TYPE = '*';

const isNativeImportBridgeAvailable = () => {
    if (typeof window === 'undefined') return false;
    const hostEnv = String(window.__HOST_ENV || '').trim().toLowerCase();
    if (hostEnv !== 'app' && hostEnv !== 'auv3') return false;
    if (typeof window.AtomeFileSystem?.loadFilesWithDocumentPicker === 'function') return true;
    return !!window.webkit?.messageHandlers?.fileSystem?.postMessage;
};

// The sources a caller may offer inline, on this host: the native app opens
// its camera, camera roll and files directly; an Audio Unit has no camera; a
// browser has its file window and, in a secure context, the camera and a still of the screen (Écran).
const availableMediaSources = ({ kinds = ['image'] } = {}) => {
    const win = typeof window !== 'undefined' ? window : null;
    const visual = (Array.isArray(kinds) ? kinds : [kinds]).some((kind) => kind === 'image' || kind === 'video');
    if (!visual) return ['files'];
    if (isNativeImportBridgeAvailable()) {
        const extension = String(win.__HOST_ENV || '').trim().toLowerCase() === 'auv3';
        return extension ? ['photos', 'files'] : ['camera', 'photos', 'files'];
    }
    const camera = win?.isSecureContext === true && typeof win.navigator?.mediaDevices?.getUserMedia === 'function';
    const screen = win?.isSecureContext === true && typeof win.navigator?.mediaDevices?.getDisplayMedia === 'function';
    return [...(camera ? ['camera'] : []), 'files', ...(screen ? ['screen'] : [])];
};

const inferMimeTypeFromName = (name = '') => {
    const normalized = String(name || '').trim().toLowerCase();
    if (normalized.endsWith('.json')) return 'application/json';
    if (normalized.endsWith('.txt')) return 'text/plain';
    if (normalized.endsWith('.svg')) return 'image/svg+xml';
    if (normalized.endsWith('.png')) return 'image/png';
    if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
    if (normalized.endsWith('.gif')) return 'image/gif';
    if (normalized.endsWith('.webp')) return 'image/webp';
    if (normalized.endsWith('.mp3')) return 'audio/mpeg';
    if (normalized.endsWith('.wav')) return 'audio/wav';
    if (normalized.endsWith('.m4a')) return 'audio/mp4';
    if (normalized.endsWith('.mp4')) return 'video/mp4';
    if (normalized.endsWith('.m4v')) return 'video/x-m4v';
    if (normalized.endsWith('.mov')) return 'video/quicktime';
    return 'application/octet-stream';
};

const decodeBase64ToUint8Array = (value = '') => {
    const normalized = String(value || '').trim();
    if (!normalized) return new Uint8Array(0);
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
};

// Ce que la fenêtre externe peut proposer, selon les types demandés : les
// fichiers (disque, iCloud) toujours, la pellicule pour une image ou une vidéo,
// la bibliothèque Musique pour un son. L'hôte natif ne choisit plus à la place
// de la personne : il montre ces sources, libellées par l'i18n.
const IMPORT_KINDS = Object.freeze(['image', 'video', 'audio']);
// A caller that converts documents too (its `accept` names the document import's extensions) asks the native picker
// for them as the « document » kind, beside its media kinds.
const DOCUMENT_EXTENSIONS = new Set(DOCUMENT_ACCEPT.split(','));
const namesDocuments = accept => String(accept || '').toLowerCase().split(',').some(type => DOCUMENT_EXTENSIONS.has(type.trim()));
const withDocuments = (kinds, accept) => (namesDocuments(accept) ? [...kinds, 'document'] : kinds);
const resolveImportKinds = ({ kinds = null, accept = '' } = {}) => {
    const explicit = (Array.isArray(kinds) ? kinds : [])
        .map((kind) => String(kind || '').trim().toLowerCase())
        .map((kind) => (kind === 'sound' ? 'audio' : kind))
        .filter((kind) => IMPORT_KINDS.includes(kind));
    if ((Array.isArray(kinds) ? kinds : []).includes('file')) return [];
    if (explicit.length) return withDocuments([...new Set(explicit)], accept);
    const requested = String(accept || '').trim().toLowerCase();
    if (!requested || requested === NATIVE_ANY_SOURCE_TYPE) return [...IMPORT_KINDS];
    const fromAccept = requested.split(',').map((type) => type.trim().split('/')[0])
        .filter((kind) => IMPORT_KINDS.includes(kind));
    // Documents alone (a protocol, a received result): the picker offers what the document import reads, never the media.
    if (!fromAccept.length) return namesDocuments(accept) ? ['document'] : [...IMPORT_KINDS];
    return withDocuments([...new Set(fromAccept)], accept);
};
const resolveNativeImportSources = (kinds = []) => {
    const sources = ['files'];
    if (kinds.includes('image') || kinds.includes('video')) sources.push('photos');
    if (kinds.includes('image')) sources.push('contacts');
    if (kinds.includes('audio')) sources.push('music');
    return sources;
};
const resolveNativeImportLabels = () => ({
    title: eveT('eve.media.source.title', 'Ajouter depuis'),
    files: eveT('eve.media.source.files', 'Fichiers'),
    photos: eveT('eve.media.source.photos', 'Pellicule'),
    contacts: eveT('eve.media.source.contacts', 'Contacts'),
    music: eveT('eve.media.source.music', 'Musique'),
    cancel: eveT('eve.media.source.cancel', 'Annuler'),
    musicProtected: eveT('eve.media.source.music.protected', 'Ce titre Apple Music est protégé et ne peut pas être importé')
});

const normalizePickerError = (value = '') => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    const lower = normalized.toLowerCase();
    if (
        lower === 'cancelled'
        || lower === 'canceled'
        || lower.includes('user cancelled')
        || lower.includes('user canceled')
        || lower.includes('abort')
    ) {
        return 'cancelled';
    }
    return normalized;
};

const buildFileFromNativeEntry = (entry = {}, index = 0) => {
    const name = String(entry?.name || `import_${index + 1}`).trim() || `import_${index + 1}`;
    const bytes = decodeBase64ToUint8Array(entry?.base64 || '');
    const type = inferMimeTypeFromName(name);
    if (typeof File === 'function') return new File([bytes], name, { type });
    const blob = new Blob([bytes], { type });
    Object.defineProperty(blob, 'name', {
        configurable: true,
        enumerable: true,
        value: name
    });
    return blob;
};

// A file the iOS host staged on disk (ImportStagingPicker.swift: `{ name, relative_path, path }`, no base64): streamed
// from `/file/<path>` into the page's private storage, so a bundle of a gigabyte is a disk-backed File, never held in
// memory; `relativePath` keeps its path inside the folder chosen, as a dropped folder's files carry it.
const fileFromStagedEntry = async (folder, entry, index) => {
    const relative = String(entry.relative_path || entry.name);
    const response = await fetch(`/file/${String(entry.path).split('/').map(encodeURIComponent).join('/')}`);
    if (!response.ok || !response.body) throw new Error(`import_staged_file_unreadable:${relative}`);
    const handle = await folder.getFileHandle(`${index}_${String(entry.name)}`, { create: true });
    await response.body.pipeTo(await handle.createWritable());
    const stored = await handle.getFile();
    const file = new File([stored], String(entry.name), { type: inferMimeTypeFromName(entry.name) });
    Object.defineProperty(file, 'relativePath', { configurable: true, enumerable: true, value: relative });
    return file;
};

const filesFromStagedEntries = async (entries) => {
    const root = await globalThis.navigator?.storage?.getDirectory?.();
    if (!root) throw new Error('import_private_storage_unavailable');
    const imports = await root.getDirectoryHandle('imports', { create: true });
    // The previous picks are read long since: only this one stays.
    for await (const name of imports.keys()) await imports.removeEntry(name, { recursive: true });
    const folder = await imports.getDirectoryHandle(String(Date.now()), { create: true });
    const files = [];
    for (const [index, entry] of entries.entries()) files.push(await fileFromStagedEntry(folder, entry, index));
    return files;
};

const requestImportFilesFromNativeBridge = async ({ accept = '', kinds = null, multiple = true, source = '', folders = false } = {}) => {
    if (typeof window === 'undefined') return { ok: false, error: 'no_window', files: [] };
    if (!isNativeImportBridgeAvailable()) return { ok: false, error: 'native_bridge_unavailable', files: [] };
    const importKinds = resolveImportKinds({ kinds, accept });
    // `sources` est la demande ; `fileTypes` reste la forme qu'un hôte plus
    // ancien sait lire (« * » = feuille Photos/Fichiers).
    // A caller that names its source (the inline sources under a photo) opens
    // it directly: one source, no intermediate sheet.
    const options = {
        sources: source ? [source] : resolveNativeImportSources(importKinds),
        kinds: importKinds,
        labels: resolveNativeImportLabels(),
        folders: folders === true
    };
    const fileTypes = importKinds.length ? [NATIVE_ANY_SOURCE_TYPE]
        : String(accept).replaceAll('.', '').split(',').map(value => value.trim()).filter(Boolean);
    const allowsMultiple = multiple === true;
    const previousCallback = window.fileSystemCallback;
    return new Promise((resolve) => {
        let settled = false;
        const finalize = (payload) => {
            if (settled) return;
            settled = true;
            if (previousCallback == null) {
                delete window.fileSystemCallback;
            } else {
                window.fileSystemCallback = previousCallback;
            }
            resolve(payload);
        };
        window.fileSystemCallback = (resp) => {
            const normalizedError = normalizePickerError(resp?.error || '');
            const rawFiles = Array.isArray(resp?.data?.files) ? resp.data.files : [];
            if (resp?.success !== true) {
                finalize({ ok: false, error: normalizedError || 'native_picker_failed', files: [] });
                return;
            }
            // Contacts: the photos are already in the library, the Media panel lists them.
            if (resp.data?.source === 'contacts') return finalize({ ok: true, source: 'contacts', files: [] });
            if (rawFiles.some(entry => entry?.path)) {
                filesFromStagedEntries(rawFiles).then(files => finalize({ ok: true, files }),
                    error => finalize({ ok: false, error: String(error?.message || error), files: [] }));
                return;
            }
            finalize({ ok: true, files: rawFiles.map((entry, index) => buildFileFromNativeEntry(entry, index)) });
        };
        try {
            if (typeof window.AtomeFileSystem?.loadFilesWithDocumentPicker === 'function') {
                window.AtomeFileSystem.loadFilesWithDocumentPicker(fileTypes, window.fileSystemCallback, allowsMultiple, options);
                return;
            }
            window.webkit.messageHandlers.fileSystem.postMessage({
                action: 'loadFilesWithDocumentPicker',
                fileTypes,
                multiple: allowsMultiple,
                ...options
            });
        } catch (error) {
            finalize({
                ok: false,
                error: normalizePickerError(String(error?.message || error || 'native_picker_failed')) || 'native_picker_failed',
                files: []
            });
        }
    });
};

// The desktop app's window (Tauri on macOS: wry's NSOpenPanel takes files and folders together once a folder is allowed,
// wkwebview/class/wry_web_view_ui_delegate.rs) chooses a file or a folder, what is chosen deciding (R-205). A browser's
// window takes one or the other, never both: there, a folder comes by a drop.
const takesFilesAndFolders = () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
    && /Macintosh|Mac OS X/.test(String(window.navigator?.userAgent || ''));

const requestImportFilesFromInput = async (hostEnv = '', { accept = '', multiple = true, folders = false } = {}) => {
    if (typeof document === 'undefined') return { ok: false, error: 'no_document', files: [] };
    return new Promise((resolve) => {
        const input = document.createElement('input');
        let settled = false;
        let cancelCheckTimer = 0;
        const useDeferredPickerLifecycle = hostEnv === 'app';
        const collectFiles = () => Array.from(input.files || []).filter((file) => file && typeof file.arrayBuffer === 'function');
        const cleanup = () => {
            if (cancelCheckTimer) window.clearTimeout(cancelCheckTimer);
            input.remove();
            window.removeEventListener('focus', scheduleDeferredCancelCheck, true);
            document.removeEventListener('visibilitychange', handleVisibilityChange, true);
        };
        const finalize = (payload) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(payload);
        };
        const finalizeFromInput = () => {
            const files = collectFiles();
            if (!files.length) return false;
            finalize({ ok: true, files });
            return true;
        };
        const scheduleDeferredCancelCheck = () => {
            if (settled) return;
            if (cancelCheckTimer) window.clearTimeout(cancelCheckTimer);
            cancelCheckTimer = window.setTimeout(() => {
                if (finalizeFromInput()) return;
                finalize({ ok: false, error: 'cancelled', files: [] });
            }, 900);
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') scheduleDeferredCancelCheck();
        };
        input.type = 'file';
        input.accept = String(accept || '');
        input.multiple = multiple === true;
        if (folders && takesFilesAndFolders()) input.webkitdirectory = true;
        input.tabIndex = -1;
        input.setAttribute('aria-hidden', 'true');
        Object.assign(input.style, {
            position: 'fixed',
            left: `${eveCssPx(-10000)}`,
            top: '0',
            width: eveCssPx(1),
            height: eveCssPx(1),
            opacity: '0',
            pointerEvents: 'none'
        });
        input.addEventListener('change', () => {
            if (!useDeferredPickerLifecycle) {
                if (finalizeFromInput()) return;
                finalize({ ok: false, error: 'cancelled', files: [] });
                return;
            }
            window.setTimeout(() => {
                if (finalizeFromInput()) return;
                finalize({ ok: false, error: 'cancelled', files: [] });
            }, 0);
        }, { once: true });
        input.addEventListener('cancel', () => finalize({ ok: false, error: 'cancelled', files: [] }), { once: true });
        if (useDeferredPickerLifecycle) {
            window.addEventListener('focus', scheduleDeferredCancelCheck, true);
            document.addEventListener('visibilitychange', handleVisibilityChange, true);
        }
        document.body.appendChild(input);
        try {
            if (typeof input.showPicker === 'function') {
                input.showPicker();
            } else {
                input.click();
            }
        } catch (error) {
            finalize({
                ok: false,
                error: String(error?.name || error?.message || 'picker_open_failed').trim() || 'picker_open_failed',
                files: []
            });
        }
    });
};

// Shared system selection for the Media panel and explicit text-file intake.
// `source` (files, photos, camera) is honoured by the native host; a browser
// has only its file window, which covers files and the camera roll. `folders`: a
// folder may be chosen as well as a file (the import panel's Ouvrir, R-205): its
// files come with their path inside it (`relativePath`, `webkitRelativePath`).
const requestProjectImportFiles = async ({ accept = '', kinds = null, multiple = true, source = '', folders = false } = {}) => {
    if (typeof window === 'undefined') return { ok: false, error: 'no_window', files: [] };
    const hostEnv = String(window.__HOST_ENV || '').trim().toLowerCase();
    if (isNativeImportBridgeAvailable()) {
        const nativeSelection = await requestImportFilesFromNativeBridge({ accept, kinds, multiple, source, folders });
        return nativeSelection?.ok === true && multiple !== true
            ? { ...nativeSelection, files: nativeSelection.files.slice(0, 1) } : nativeSelection;
    }
    return requestImportFilesFromInput(hostEnv, { accept, multiple, folders });
};


export { availableMediaSources, isNativeImportBridgeAvailable, requestProjectImportFiles, inferMimeTypeFromName, filesFromStagedEntries };

/** Explicit text-file intake. Desktop file bytes belong exclusively to Axum. */
export async function requestTextFile({ extension, maxBytes = 32 * 1024 * 1024 } = {}) {
    if (!/^[a-z0-9]{1,12}$/.test(extension || '') || !Number.isInteger(maxBytes)
        || maxBytes < 1 || maxBytes > 32 * 1024 * 1024) throw new Error('file_selection_options_invalid');
    const env = globalThis.window;
    if (env?.__TAURI__ || env?.__TAURI_INTERNALS__) {
        const { ensureLocalTauriToken } = await import('../../../../eVe/core/atome_commit_transport.js');
        const { TauriAdapter } = await import('../apis/unified/adole.js');
        const token = await ensureLocalTauriToken();
        if (!token) throw new Error('file_selection_auth_required');
        return TauriAdapter.ws.send({ type: 'file-selection', action: 'read-text', extension,
            max_bytes: maxBytes, token }, { timeoutMs: 180000 });
    }
    const result = await requestProjectImportFiles({ accept: `.${extension}`, kinds: ['file'], multiple: false });
    if (!result?.ok) return { ok: false, cancelled: result?.error === 'cancelled', error: result?.error };
    const file = result.files?.[0];
    if (!file || !String(file.name).toLowerCase().endsWith(`.${extension}`)) return { ok: false, error: 'file_selection_extension_invalid' };
    if (file.size > maxBytes) return { ok: false, error: 'file_selection_too_large' };
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > maxBytes) return { ok: false, error: 'file_selection_too_large' };
    try { return { ok: true, name: file.name, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }; }
    catch { return { ok: false, error: 'file_selection_encoding_invalid' }; }
}
