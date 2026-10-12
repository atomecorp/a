import { eveCssPx } from '../../../../eVe/elements/system_ui_tokens.js';
import { eveT } from '../../../../eVe/i18n/i18n.js';
const NATIVE_ANY_SOURCE_TYPE = '*';

const isNativeImportBridgeAvailable = () => {
    if (typeof window === 'undefined') return false;
    const hostEnv = String(window.__HOST_ENV || '').trim().toLowerCase();
    if (hostEnv !== 'app' && hostEnv !== 'auv3') return false;
    if (typeof window.AtomeFileSystem?.loadFilesWithDocumentPicker === 'function') return true;
    return !!window.webkit?.messageHandlers?.fileSystem?.postMessage;
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
const resolveImportKinds = ({ kinds = null, accept = '' } = {}) => {
    const explicit = (Array.isArray(kinds) ? kinds : [])
        .map((kind) => String(kind || '').trim().toLowerCase())
        .map((kind) => (kind === 'sound' ? 'audio' : kind))
        .filter((kind) => IMPORT_KINDS.includes(kind));
    if ((Array.isArray(kinds) ? kinds : []).includes('file')) return [];
    if (explicit.length) return [...new Set(explicit)];
    const requested = String(accept || '').trim().toLowerCase();
    if (!requested || requested === NATIVE_ANY_SOURCE_TYPE) return [...IMPORT_KINDS];
    const fromAccept = requested.split(',').map((type) => type.trim().split('/')[0])
        .filter((kind) => IMPORT_KINDS.includes(kind));
    return fromAccept.length ? [...new Set(fromAccept)] : [...IMPORT_KINDS];
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

const requestImportFilesFromNativeBridge = async ({ accept = '', kinds = null, multiple = true } = {}) => {
    if (typeof window === 'undefined') return { ok: false, error: 'no_window', files: [] };
    if (!isNativeImportBridgeAvailable()) return { ok: false, error: 'native_bridge_unavailable', files: [] };
    const importKinds = resolveImportKinds({ kinds, accept });
    // `sources` est la demande ; `fileTypes` reste la forme qu'un hôte plus
    // ancien sait lire (« * » = feuille Photos/Fichiers).
    const options = {
        sources: resolveNativeImportSources(importKinds),
        kinds: importKinds,
        labels: resolveNativeImportLabels()
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

const requestImportFilesFromInput = async (hostEnv = '', { accept = '', multiple = true } = {}) => {
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
const requestProjectImportFiles = async ({ accept = '', kinds = null, multiple = true } = {}) => {
    if (typeof window === 'undefined') return { ok: false, error: 'no_window', files: [] };
    const hostEnv = String(window.__HOST_ENV || '').trim().toLowerCase();
    if (isNativeImportBridgeAvailable()) {
        const nativeSelection = await requestImportFilesFromNativeBridge({ accept, kinds, multiple });
        return nativeSelection?.ok === true && multiple !== true
            ? { ...nativeSelection, files: nativeSelection.files.slice(0, 1) } : nativeSelection;
    }
    return requestImportFilesFromInput(hostEnv, { accept, multiple });
};


export { requestProjectImportFiles, inferMimeTypeFromName };

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
