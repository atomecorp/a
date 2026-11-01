// A version is activated only after its entire public application manifest has
// been verified and stored. Project events and files live in IndexedDB, outside
// these disposable resource caches. Authentication responses are never cached.
self.importScripts('/offline-manifest.js', '/offline_media.js');
// The local resources (media and models a local feature reads, server/offline_local_resources.js)
// have their own cache and version: stored after activation, file by file, they survive
// every code version and are never downloaded again while unchanged.
const { version, assets, local } = self.__ATOME_OFFLINE_ASSETS__;
const CACHE_NAME = `atome-shell-${version}`;
const LOCAL_CACHE_NAME = `atome-local-${local.version}`;
const manifest = new Map(assets.map(asset => [asset.url, asset.digest]));
const localManifest = new Set(local.assets.map(asset => asset.url));
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

// Each file is fetched, checked against its manifest digest, then stored; six at a time.
const storeVerified = async (cache, list) => {
    let index = 0;
    const results = await Promise.allSettled(Array.from({ length: 6 }, async () => {
        while (index < list.length) {
            const asset = list[index++];
            const response = await fetch(asset.url, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
            if (!response.ok || await digest(await response.clone().arrayBuffer()) !== asset.digest) throw new Error('offline_asset_integrity_failed');
            await cache.put(asset.url, response);
        }
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
};

// The version the active worker serves, written when it activates. A version installed while a page keeps the active
// one waits; a newer one supersedes it before it ever activates (the served files changed again), and its shell (120 MB)
// would stay until some activation: a few such changes filled the origin's quota and the project's own writes were
// refused (guest_storage_quota_exceeded). An install drops every shell but its own and the active one's; without the
// active one's mark (written by an older worker) it drops none, the active worker answering from its own shell.
const ACTIVE_MARK = 'atome-active-version';
const ACTIVE_KEY = '/__atome_active_version';
const dropSupersededShells = async () => {
    const active = await (await caches.open(ACTIVE_MARK)).match(ACTIVE_KEY);
    if (!active) return;
    const kept = new Set([CACHE_NAME, `atome-shell-${await active.text()}`]);
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('atome-shell-') && !kept.has(name)).map(name => caches.delete(name)));
};

self.addEventListener('install', event => event.waitUntil((async () => {
    try {
        await dropSupersededShells();
        await storeVerified(await caches.open(CACHE_NAME), assets);
        await notify('atome:offline-app-ready', version);
    } catch (error) {
        await caches.delete(CACHE_NAME);
        await notify('atome:offline-app-error', error.name === 'QuotaExceededError' ? 'offline_storage_quota_exceeded' : 'offline_app_install_failed');
        throw error;
    }
})()));

// Asked by every page this worker controls (early-init.js): the files still missing are
// stored; a stop halfway keeps what was verified and resumes at the next ask. Complete,
// the caches of other local versions go.
let filling = null;
const fillLocal = () => (filling ||= (async () => {
    const cache = await caches.open(LOCAL_CACHE_NAME);
    const stored = new Set((await cache.keys()).map(request => new URL(request.url).pathname));
    try {
        await storeVerified(cache, local.assets.filter(asset => !stored.has(asset.url)));
    } catch (error) {
        await notify('atome:offline-local-error', error.name === 'QuotaExceededError' ? 'offline_storage_quota_exceeded' : 'offline_local_install_failed');
        throw error;
    }
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('atome-local-') && name !== LOCAL_CACHE_NAME).map(name => caches.delete(name)));
    await notify('atome:offline-local-ready', local.version);
})().finally(() => { filling = null; }));

self.addEventListener('message', event => {
    if (event.data?.type === 'atome:offline-local-fill') event.waitUntil(fillLocal());
});

self.addEventListener('activate', event => event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => (name.startsWith('atome-shell-') || name.startsWith('atome-wasm-')) && name !== CACHE_NAME)
        .map(name => caches.delete(name)));
    await (await caches.open(ACTIVE_MARK)).put(ACTIVE_KEY, new Response(version));
    await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url), pathname = canonicalPath(url.pathname);
    if (event.request.method === 'GET' && url.origin === self.location.origin && /^\/api\/uploads\/[^/]+$/.test(url.pathname)) {
        event.respondWith(self.atomeLocalMediaResponse(event.request));
        return;
    }
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
    // Not stored yet (its fill still running): the file comes from its server, as before any cache.
    if (localManifest.has(pathname)) {
        event.respondWith((async () => (await (await caches.open(LOCAL_CACHE_NAME)).match(pathname)) || fetch(event.request))());
        return;
    }
    if (!manifest.has(pathname)) return;
    event.respondWith((async () => {
        const response = await (await caches.open(CACHE_NAME)).match(pathname);
        if (!response) {
            await notify('atome:offline-app-error', 'offline_app_resource_missing');
            throw new Error('offline_app_resource_missing');
        }
        return response;
    })());
});
