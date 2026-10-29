import { watch } from 'node:fs';
import { lstat, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Only public application assets enter this manifest. Account databases, media,
// authentication handoffs and private configuration never belong to this cache.
// The manifest follows the files: a watch on each root reads again what changed, so
// the service worker installs the files actually served. A manifest frozen at the
// server's start failed every later install and kept open tabs on the old code.
const SKIPPED = /^(private|temp|tests|node_modules|documentations|database_storage|user_data)$/i;
// pfb / bcmap: the PDF engine's standard fonts and character maps (vendor/pdfjs), read offline too.
const ASSET = /\.(js|mjs|json|html|css|svg|woff2?|ttf|otf|wasm|png|ico|jpe?g|webp|gif|pfb|bcmap)$/i;
const NEVER_CACHED = /^(auth-link\.(html|js)|sw\.js)$/;
// Changes arriving together (an editor's save, a build) are read in one batch.
const SETTLE_MS = 150;

const skipped = relative => relative.split('/').some(part => part.startsWith('.') || SKIPPED.test(part));

export async function registerOfflineAppAssets(server, { staticRoot, eveStaticRoot, projectRoot }) {
    const roots = [[staticRoot, '/'], [eveStaticRoot, '/eVe/'], [path.join(projectRoot, 'node_modules/rubberband-wasm/dist'), '/vendor/rubberband-wasm/']];
    const digests = new Map();
    // `relative` under `root` read again: a file hashed, a directory walked, a missing path forgotten.
    const refresh = async (root, prefix, relative) => {
        if (skipped(relative)) return;
        const url = prefix + relative;
        // A root is followed; a link inside it is not (never served as an asset).
        const info = await (relative ? lstat : stat)(path.join(root, relative)).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
        if (info?.isDirectory()) {
            for (const name of await readdir(path.join(root, relative))) await refresh(root, prefix, path.posix.join(relative, name));
        } else if (info?.isFile() && ASSET.test(relative) && !NEVER_CACHED.test(relative)) {
            digests.set(url, createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex'));
        } else {
            for (const key of [...digests.keys()]) if (key === url || key.startsWith(`${url}/`)) digests.delete(key);
        }
    };
    let source = '';
    const publish = () => {
        const assets = [...digests].map(([url, digest]) => ({ url, digest })).sort((a, b) => a.url.localeCompare(b.url));
        const version = createHash('sha256').update(JSON.stringify(assets)).digest('hex');
        source = `self.__ATOME_OFFLINE_ASSETS__=${JSON.stringify({ version, assets })};`;
    };
    for (const [root, prefix] of roots) await refresh(root, prefix, '');
    publish();

    const changed = new Map();
    let timer = null, reading = Promise.resolve();
    const failed = error => server.log.error({ err: error }, 'offline_manifest_refresh_failed');
    const settle = () => {
        const batch = [...changed.values()];
        changed.clear();
        reading = reading.then(async () => {
            for (const [root, prefix, relative] of batch) await refresh(root, prefix, relative);
            publish();
        }).catch(failed);
    };
    const watchers = roots.map(([root, prefix]) => watch(root, { recursive: true }, (_event, filename) => {
        // No name: the platform did not say what changed; the whole root is read again.
        const relative = filename ? String(filename).split(path.sep).join('/') : '';
        changed.set(prefix + relative, [root, prefix, relative]);
        clearTimeout(timer);
        timer = setTimeout(settle, SETTLE_MS);
    }).on('error', failed));
    server.addHook('onClose', async () => { clearTimeout(timer); watchers.forEach(watcher => watcher.close()); });

    server.get('/offline-manifest.js', async (_request, reply) => reply.type('application/javascript')
        .header('Cache-Control', 'no-cache').header('X-Content-Type-Options', 'nosniff').send(source));
}
