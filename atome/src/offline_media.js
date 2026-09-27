// Service-worker access to the canonical browser file store. A URL never grants
// access to another identity, and logout closes this read boundary immediately.
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
    if (!file) return fetch(request);
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
