// A version is activated only after its entire public application manifest has
// been verified and stored. Project events and files live in IndexedDB, outside
// these disposable resource caches. Authentication responses are never cached.
self.importScripts('/offline-manifest.js', '/offline_media.js');
const { version, assets } = self.__ATOME_OFFLINE_ASSETS__;
const CACHE_NAME = `atome-shell-${version}`;
const manifest = new Map(assets.map(asset => [asset.url, asset.digest]));
const canonicalPath = pathname => {
    if (pathname === '/') return '/index.html';
    if (pathname.startsWith('/atome/src/')) return pathname.slice('/atome/src'.length);
    if (pathname.startsWith('/src/')) return pathname.slice('/src'.length);
    return pathname;
};
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(value => value.toString(16).padStart(2, '0')).join('');
const notify = async (type, code) => {
    for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage({ type, code });
};

self.addEventListener('install', event => event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    let index = 0;
    try {
        const results = await Promise.allSettled(Array.from({ length: 6 }, async () => {
            while (index < assets.length) {
                const asset = assets[index++];
                const response = await fetch(asset.url, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
                if (!response.ok || await digest(await response.clone().arrayBuffer()) !== asset.digest) throw new Error('offline_asset_integrity_failed');
                await cache.put(asset.url, response);
            }
        }));
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
        await notify('atome:offline-app-ready', version);
    } catch (error) {
        await caches.delete(CACHE_NAME);
        await notify('atome:offline-app-error', error.name === 'QuotaExceededError' ? 'offline_storage_quota_exceeded' : 'offline_app_install_failed');
        throw error;
    }
})()));

self.addEventListener('activate', event => event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => (name.startsWith('atome-shell-') || name.startsWith('atome-wasm-')) && name !== CACHE_NAME)
        .map(name => caches.delete(name)));
    await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url), pathname = canonicalPath(url.pathname);
    if (event.request.method === 'GET' && url.origin === self.location.origin && /^\/api\/uploads\/[^/]+$/.test(url.pathname)) {
        event.respondWith(self.atomeLocalMediaResponse(event.request));
        return;
    }
    if (event.request.method !== 'GET' || url.origin !== self.location.origin || !manifest.has(pathname)) return;
    event.respondWith((async () => {
        const response = await (await caches.open(CACHE_NAME)).match(pathname);
        if (!response) {
            await notify('atome:offline-app-error', 'offline_app_resource_missing');
            throw new Error('offline_app_resource_missing');
        }
        return response;
    })());
});
