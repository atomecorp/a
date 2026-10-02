import { getNativeImportInvoke } from '../contacts/macos_source.js';

/** Explicit portable file export; native hosts never fall back to browser FS. */
export async function saveExportFile(name, bytes, mime = 'application/octet-stream') {
    if (name === '.' || name === '..') throw new Error('export_filename_invalid');
    if (!/^[^/\\\0\r\n]{1,180}$/.test(name)) throw new Error('export_filename_invalid');
    if (!(bytes instanceof Uint8Array) || bytes.length > 64 * 1024 * 1024) throw new Error('export_bytes_invalid');
    const invoke = getNativeImportInvoke();
    if (invoke) {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const saved = await invoke('export_file_save', { name, dataBase64: btoa(binary) });
        if (!saved?.success) return { ok: false, cancelled: saved?.cancelled === true, error: saved?.error || 'export_not_saved' };
        return { ok: true, via: 'native', path: saved.path };
    }
    if (!globalThis.document || !globalThis.URL?.createObjectURL) throw new Error('export_download_unavailable');
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const anchor = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { ok: true, via: 'download' };
}
