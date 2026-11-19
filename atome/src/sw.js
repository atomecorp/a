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
    for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage({ type, code, version });
};

// Each file is fetched, checked against its manifest digest, then stored; six at a time.
const storeVerified = async (cache, list) => {
    let index = 0;
    const results = await Promise.allSettled(Array.from({ length: 6 }, async () => {
        while (index < list.length) {
            const asset = list[index++];
            const response = await fetch(asset.url, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
            if (!response.ok) throw new Error('offline_asset_integrity_failed');
            // Served, but no longer the file this manifest names: the server holds a newer version (sw.js is registered
            // again by the page, early-init.js, and that version installs).
            if (await digest(await response.clone().arrayBuffer()) !== asset.digest) throw new Error('offline_app_superseded');
            await cache.put(asset.url, response);
        }
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
};

// The version the active worker serves, written when it activates. A version installed while a page keeps the active
// one waits; a newer one supersedes it before it ever activates (the served files changed again), and its shell (120 MB)
// would stay until some activation: a few such changes filled the origin's quota and the project's own writes were
// refused (guest_storage_quota_exceeded). An install drops every shell but its own and the active one's; with no
// worker active (a first install, perhaps superseded several times) only its own stays; with an active worker but
// without its mark (written by an older worker) it drops none, that worker answering from its own shell.
const ACTIVE_MARK = 'atome-active-version';
const ACTIVE_KEY = '/__atome_active_version';
const dropSupersededShells = async () => {
    const active = self.registration.active ? await (await caches.open(ACTIVE_MARK)).match(ACTIVE_KEY) : null;
    if (self.registration.active && !active) return;
    const kept = new Set([CACHE_NAME, ...(active ? [`atome-shell-${await active.text()}`] : [])]);
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('atome-shell-') && !kept.has(name)).map(name => caches.delete(name)));
};

// The files of this version an earlier install already verified and stored stay: an install cut short (the browser
// ends an event past five minutes, and a first install under load downloads the whole shell) resumes where it stopped
// at the next registration instead of starting again from nothing. The files an earlier shell holds unchanged (same
// digest) are taken from it, never downloaded again. What is left is fetched and verified as before.
const missingAssets = async cache => {
    const stored = new Set((await cache.keys()).map(request => new URL(request.url).pathname));
    return assets.filter(asset => !stored.has(asset.url));
};
// The shells an install may take unchanged files from: the active version's, and every version an earlier install
// left (cut short, or superseded before it activated).
const takeUnchangedFromEarlier = async (cache, list) => {
    const earlier = (await caches.keys()).filter(name => name.startsWith('atome-shell-') && name !== CACHE_NAME);
    let left = list;
    for (const name of earlier) {
        if (!left.length) break;
        const previous = await caches.open(name);
        const missing = [];
        for (const asset of left) {
            const response = await previous.match(asset.url);
            if (response && await digest(await response.clone().arrayBuffer()) === asset.digest) await cache.put(asset.url, response);
            else missing.push(asset);
        }
        left = missing;
    }
    return left;
};

self.addEventListener('install', event => event.waitUntil((async () => {
    try {
        const cache = await caches.open(CACHE_NAME);
        const left = await takeUnchangedFromEarlier(cache, await missingAssets(cache));
        await dropSupersededShells();
        await storeVerified(cache, left);
        await notify('atome:offline-app-ready', version);
    } catch (error) {
        // A full origin keeps nothing of this version; any other failure keeps what was verified, for the next install.
        if (error.name === 'QuotaExceededError') await caches.delete(CACHE_NAME);
        const code = error.name === 'QuotaExceededError' ? 'offline_storage_quota_exceeded'
            : error.message === 'offline_app_superseded' ? 'offline_app_superseded' : 'offline_app_install_failed';
        await notify('atome:offline-app-error', code);
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
