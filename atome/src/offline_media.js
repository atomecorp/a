// Service-worker access to the canonical browser file store. A URL never grants
// access to another identity, and logout closes this read boundary immediately.

// A medium of the account not on this device yet (made on another one) is read from the
// server and, read whole, kept in the same file store as already sent (`uploaded`): it then
// plays offline. A part (a video's range) is never kept; such a medium stays remote until
// read whole once. A failure to keep it is reported to the pages; the read itself succeeds.
const keepRead = async (request, owner, name) => {
    const response = await fetch(request);
    if (response.status !== 200 || request.headers.has('Range')) return response;
    const blob = await response.clone().blob();
    const keep = async () => {
        const bytes = await blob.arrayBuffer();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('');
        await new Promise((resolve, reject) => {
            const opening = indexedDB.open('squirrel_guest_workspace_v1');
            opening.onupgradeneeded = () => opening.transaction.abort();
            opening.onerror = () => reject(new Error('local_media_storage_unavailable'));
            opening.onsuccess = () => {
                const db = opening.result, transaction = db.transaction('files', 'readwrite');
                transaction.objectStore('files').put({ key: `${owner}:${name}`, owner_id: owner, file_id: name, file_name: name, content_digest: digest,
                    byte_length: bytes.byteLength, blob, atome_id: null, atome_type: null, uploaded: true, created_at: new Date().toISOString() });
                transaction.oncomplete = () => { db.close(); resolve(); };
                transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error || new Error('local_media_keep_failed')); };
            };
        });
    };
    await keep().catch(async error => {
        for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage({ type: 'atome:offline-local-error',
            code: error?.name === 'QuotaExceededError' ? 'offline_storage_quota_exceeded' : 'offline_media_keep_failed' });
    });
    return response;
};
self.atomeLocalMediaResponse = async function (request) {
    const read = (databaseName, storeName, key) => new Promise((resolve, reject) => {
        const opening = indexedDB.open(databaseName);
        opening.onupgradeneeded = () => opening.transaction.abort();
        opening.onerror = () => reject(new Error('local_media_storage_unavailable'));
        opening.onsuccess = () => {
            const db = opening.result;
            const transaction = db.transaction(storeName, 'readonly');
            const result = transaction.objectStore(storeName).get(key);
            transaction.oncomplete = () => { db.close(); resolve(result.result); };
            transaction.onerror = transaction.onabort = () => { db.close(); reject(new Error('local_media_storage_unavailable')); };
        };
    });
    const url = new URL(request.url);
    const owner = url.searchParams.get('media_user_id');
    let authorization;
    try { authorization = await read('atome_auth_device_v1', 'records', 'workspace-identity'); }
    catch { return new Response(null, { status: 403 }); }
    if (!owner || authorization?.id !== owner || authorization.locked) return new Response(null, { status: 403 });
    let name;
    try { name = decodeURIComponent(url.pathname.slice('/api/uploads/'.length)); }
    catch { return new Response(null, { status: 400 }); }
    const file = await read('squirrel_guest_workspace_v1', 'files', `${owner}:${name}`);
    if (!file) return keepRead(request, owner, name);
    const blob = file.blob;
    const headers = { 'Content-Type': blob.type || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    const range = request.headers.get('Range');
    if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const suffix = match && !match[1] && match[2] ? Number(match[2]) : null;
        const start = suffix !== null ? (suffix > 0 ? Math.max(0, blob.size - suffix) : NaN) : match?.[1] ? Number(match[1]) : NaN;
        const end = suffix === null && match?.[2] ? Math.min(Number(match[2]), blob.size - 1) : blob.size - 1;
        if (!Number.isSafeInteger(start) || start < 0 || start > end || start >= blob.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
        headers['Content-Range'] = `bytes ${start}-${end}/${blob.size}`;
        headers['Content-Length'] = String(end - start + 1);
        return new Response(blob.slice(start, end + 1), { status: 206, headers });
    }
    headers['Content-Length'] = String(blob.size);
    return new Response(blob, { status: 200, headers });
};
