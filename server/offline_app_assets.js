import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Only public application assets enter this manifest. Account databases, media,
// authentication handoffs and private configuration never belong to this cache.
export async function registerOfflineAppAssets(server, { staticRoot, eveStaticRoot, projectRoot }) {
    const assets = [];
    const walk = async (root, prefix, relative = '') => {
        for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
            if (entry.name.startsWith('.') || /^(private|temp|tests|node_modules|documentations|database_storage|user_data)$/i.test(entry.name)) continue;
            const child = path.posix.join(relative, entry.name);
            if (entry.isDirectory()) { await walk(root, prefix, child); continue; }
            if (!entry.isFile() || !/\.(js|mjs|json|html|css|svg|woff2?|ttf|otf|wasm|png|ico|jpe?g|webp|gif)$/i.test(entry.name)) continue;
            if (/^(auth-link\.(html|js)|sw\.js)$/.test(child)) continue;
            const bytes = await readFile(path.join(root, child));
            assets.push({ url: `${prefix}${child}`, digest: createHash('sha256').update(bytes).digest('hex') });
        }
    };
    await walk(staticRoot, '/');
    await walk(eveStaticRoot, '/eVe/');
    await walk(path.join(projectRoot, 'node_modules/rubberband-wasm/dist'), '/vendor/rubberband-wasm/');
    assets.sort((a, b) => a.url.localeCompare(b.url));
    const version = createHash('sha256').update(JSON.stringify(assets)).digest('hex');
    const source = `self.__ATOME_OFFLINE_ASSETS__=${JSON.stringify({ version, assets })};`;
    server.get('/offline-manifest.js', async (_request, reply) => reply.type('application/javascript')
        .header('Cache-Control', 'no-cache').header('X-Content-Type-Options', 'nosniff').send(source));
}
