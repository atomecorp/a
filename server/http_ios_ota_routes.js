// Developer-distribution media, not an application command or business-state API.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OTA_ROOT, readJson, current, storePath, cleanup, withStoreLock } from '../scripts/ios/ota-store.mjs';
import { DOWNLOAD_TTL_MS, tokenHash, manifest, issueCapability, verifyCapability } from '../scripts/ios/ota-contract.mjs';

export function registerIosOtaRoutes(server, { root = OTA_ROOT, origin = 'https://atome.one' } = {}) {
    if (!fs.existsSync(path.join(root, 'settings.json'))) return;
    const shell = fileURLToPath(new URL('../atome/src/ios-install.html', import.meta.url));
    const active = new Map();
    const settings = () => readJson(path.join(root, 'settings.json'));
    const readUser = (hash, config) => config.users[hash]?.enabled === true;
    const privateHeaders = reply => reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer')
        .header('X-Content-Type-Options', 'nosniff');

    server.get('/ios/status', { logLevel: 'silent' }, async (_request, reply) => {
        privateHeaders(reply);
        const report = current(root);
        if (!report) return reply.code(503).send({ published: false });
        return { published: true, id: report.id, version: report.version, build: report.build };
    });
    server.get('/ios/install', { logLevel: 'silent' }, async (_request, reply) => {
        privateHeaders(reply).type('text/html; charset=utf-8');
        reply.header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
        return reply.send(fs.createReadStream(shell));
    });
    server.post('/ios/session', { logLevel: 'silent', bodyLimit: 1024 }, async (request, reply) => {
        privateHeaders(reply);
        return withStoreLock(root, () => {
        const config = settings();
        const token = /^Bearer ([a-zA-Z0-9_-]{43})$/.exec(request.headers.authorization || '')?.[1];
        const user = token ? tokenHash(token) : '';
        if (!readUser(user, config)) return reply.code(403).send({ error: 'ota_access_denied' });
        const report = current(root);
        if (!report) return reply.code(503).send({ error: 'ota_not_published' });
        const cap = issueCapability(config.secret, { id: report.id, user, expires: Date.now() + DOWNLOAD_TTL_MS });
        const url = `${origin}/ios/builds/${report.id}/manifest.plist?cap=${encodeURIComponent(cap)}`;
        return { install: `itms-services://?action=download-manifest&url=${encodeURIComponent(url)}` };
        }).catch(error => {
            if (error.message === 'ota_publication_busy') return reply.code(503).send({ error: 'ota_publication_busy' });
            throw error;
        });
    });

    server.get('/ios/builds/:id/:asset', { logLevel: 'silent' }, async (request, reply) => {
        privateHeaders(reply);
        const config = settings();
        let capability;
        try { capability = verifyCapability(config.secret, request.query.cap); }
        catch { return reply.code(403).send({ error: 'ota_capability_denied' }); }
        const { id, asset } = request.params;
        if (capability.id !== id || !readUser(capability.user, config) || !['manifest.plist', 'atome.ipa'].includes(asset))
            return reply.code(403).send({ error: 'ota_access_denied' });
        const directory = storePath(root, 'releases', id);
        if (!fs.existsSync(directory)) return reply.code(410).send({ error: 'ota_release_retired' });
        const report = readJson(path.join(directory, 'release.json'));
        if (asset === 'manifest.plist') {
            const ipa = `${origin}/ios/builds/${id}/atome.ipa?cap=${encodeURIComponent(request.query.cap)}`;
            return reply.type('text/xml; charset=utf-8').send(manifest(report, ipa));
        }
        // Open the immutable inode before yielding. Cleanup does not remove a
        // release while a stream is active, including ranged/resumed downloads.
        const file = path.join(directory, 'atome.ipa');
        const total = fs.statSync(file).size;
        let start = 0;
        let end = total - 1;
        if (request.headers.range) {
            const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
            if (!range || (!range[1] && !range[2])) return reply.code(416).header('Content-Range', `bytes */${total}`).send();
            if (!range[1]) start = Math.max(0, total - Number(range[2]));
            else { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), total - 1); }
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= total)
                return reply.code(416).header('Content-Range', `bytes */${total}`).send();
            reply.code(206).header('Content-Range', `bytes ${start}-${end}/${total}`);
        }
        const fd = fs.openSync(file, 'r');
        active.set(id, (active.get(id) || 0) + 1);
        const stream = fs.createReadStream(file, { fd, start, end, autoClose: true });
        stream.once('close', () => { const count = active.get(id) - 1; if (count) active.set(id, count); else active.delete(id); });
        reply.header('Accept-Ranges', 'bytes').header('Content-Length', end - start + 1).type('application/octet-stream');
        return reply.send(stream);
    });

    const timer = setInterval(() => {
        withStoreLock(root, () => cleanup(root, new Set(active.keys()))).catch(error => {
            if (error.message !== 'ota_publication_busy') server.log.error({ err: error }, 'OTA retention failed');
        });
    }, 60000);
    timer.unref();
    server.addHook('onClose', async () => clearInterval(timer));
}
