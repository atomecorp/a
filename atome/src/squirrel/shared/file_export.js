import { getNativeImportInvoke } from '../contacts/macos_source.js';

const checkedFile = (name, bytes) => {
    if (name === '.' || name === '..') throw new Error('export_filename_invalid');
    if (!/^[^/\\\0\r\n]{1,180}$/.test(name)) throw new Error('export_filename_invalid');
    if (!(bytes instanceof Uint8Array) || bytes.length > 64 * 1024 * 1024) throw new Error('export_bytes_invalid');
};
const base64Of = (bytes) => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
};

/** Explicit portable file export; native hosts never fall back to browser FS. */
export async function saveExportFile(name, bytes, mime = 'application/octet-stream') {
    checkedFile(name, bytes);
    const invoke = getNativeImportInvoke();
    if (invoke) {
        const saved = await invoke('export_file_save', { name, dataBase64: base64Of(bytes) });
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

/**
 * A page (an image, `image/jpeg` or `image/png`, one sheet across the paper's width) handed to the host's print: the iOS
 * app's print sheet and Tauri's (`export_file_print`, the same bridge as `export_file_save`); in a browser, the browser's
 * print of a hidden blank frame holding the picture (the frame is the print's only vehicle, removed once printed).
 */
export async function printExportFile(name, bytes, mime) {
    checkedFile(name, bytes);
    if (!/^image\/(?:jpeg|png)$/u.test(String(mime))) throw new Error('export_print_type_invalid');
    const invoke = getNativeImportInvoke();
    if (invoke) {
        // A host that cannot print (the AUv3 extension, Android) refuses the command: its reason is the answer.
        const printed = await invoke('export_file_print', { name, dataBase64: base64Of(bytes), mime })
            .catch(error => ({ success: false, error: String(error?.message || error) }));
        if (!printed?.success) return { ok: false, cancelled: printed?.cancelled === true, error: printed?.error || 'export_not_printed' };
        return { ok: true, via: 'native' };
    }
    if (!globalThis.document || !globalThis.URL?.createObjectURL) throw new Error('export_print_unavailable');
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const frame = document.createElement('iframe');
    frame.hidden = true;
    document.body.append(frame);
    const sheet = frame.contentDocument.createElement('img');
    sheet.style.width = '100%';
    try {
        await new Promise((resolve, reject) => { sheet.onload = resolve; sheet.onerror = () => reject(new Error('export_print_unavailable')); sheet.src = url; frame.contentDocument.body.append(sheet); });
        frame.contentWindow.focus();
        frame.contentWindow.print();
    } finally {
        setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
    }
    return { ok: true, via: 'browser' };
}
