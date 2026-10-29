// The public side of the websites (server/site_publishing.js): atome.one/<slug>[/<page>/] read by anyone, a personal
// domain read by its host, the media of an online version by their content, the site font, and the contact form.
// Pages are answered from Fastify's not-found step, so no file of the app is ever shadowed by an address.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const FONT_FILES = new Set(['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Bold.ttf']);
const CONTACT_PER_IP_PER_HOUR = 5;
const CONTACT_PER_SITE_PER_DAY = 89;
const HOUR_MS = 3600_000;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const notice = (title, body, extra = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${extra}<title>${escapeHtml(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#15182c;color:#efeaff}main{max-width:34rem;padding:2rem;text-align:center}a{color:#a9b2ff}</style></head><body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
const month = at => new Date(at).toISOString().slice(0, 7);

export function registerSiteHttp(server, { publishing, store, notify, fontRoot, appHosts = [], origin = 'https://atome.one', now = () => Date.now() }) {
    const hosts = new Set(appHosts.map(host => host.toLowerCase()));
    const sendPage = async (reply, row, pageSlug, request) => {
        if (row.state === 'retired') return reply.code(410).header('x-robots-tag', 'noindex').type('text/html; charset=utf-8')
            .send(notice('Ce site n’existe plus', '<p>Son auteur l’a retiré.</p>', '<meta name="robots" content="noindex">'));
        const version = row.state === 'online' && row.live_version ? await store.version(row.site_id, row.live_version) : null;
        const page = version?.manifest.pages.find(entry => (entry.slug || '') === pageSlug);
        if (!page) return reply.code(404).type('text/html; charset=utf-8').send(notice('Page introuvable', `<p><a href="/${escapeHtml(row.slug)}/">Revenir à l’accueil</a></p>`));
        const file = path.join(publishing.versionDir(row.site_id, row.live_version), `${page.slug || '_home'}.html`);
        const html = await fs.promises.readFile(file);
        await store.addTraffic(row.owner_id, month(now()), html.length);
        const etag = `"${row.site_id.slice(0, 8)}-${row.live_version}-${page.slug || 'home'}"`;
        if (request.headers['if-none-match'] === etag) return reply.code(304).send();
        return reply.header('cache-control', 'public, max-age=0, must-revalidate').header('etag', etag).type('text/html; charset=utf-8').send(html);
    };

    // A personal domain (Q13): its host serves its site at its root; the address not chosen as main redirects.
    server.addHook('onRequest', async (request, reply) => {
        const host = String(request.hostname || '').toLowerCase().replace(/:\d+$/, '');
        if (!host || hosts.has(host) || !['GET', 'HEAD'].includes(request.method) || request.url.startsWith('/_site/')) return;
        const row = await store.byDomain(host);
        if (!row || row.domain_state !== 'active') return;
        const parts = request.url.split('?')[0].split('/').filter(Boolean).map(part => decodeURIComponent(part).toLowerCase());
        const pageSlug = (parts[0] === row.slug ? parts[1] : parts[0]) || '';
        if (row.primary_host !== 'domain') return reply.redirect(`${origin}/${row.slug}/${pageSlug ? `${pageSlug}/` : ''}`, 301);
        return sendPage(reply, row, pageSlug, request);
    });

    server.get('/_site/fonts/:file', async (request, reply) => {
        if (!FONT_FILES.has(request.params.file)) return reply.callNotFound();
        return reply.header('cache-control', 'public, max-age=31536000, immutable').type('font/ttf')
            .send(fs.createReadStream(path.join(fontRoot, request.params.file)));
    });

    // A media of an online version, read from its original file; video and sound by ranges.
    server.get('/_site/m/:sha', async (request, reply) => {
        const sha = String(request.params.sha || '');
        if (!/^[a-f0-9]{64}$/.test(sha)) return reply.callNotFound();
        const preview = request.query?.p ? publishing.previewOf(String(request.query.p)) : null;
        const held = preview?.media.get(sha);
        const media = held ? { file_path: held.filePath, mime: held.mime, owner_id: '' } : await store.liveMedia(sha);
        if (!media) return reply.callNotFound();
        const size = (await fs.promises.stat(media.file_path)).size;
        const range = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range || ''));
        reply.header('accept-ranges', 'bytes').header('cache-control', 'public, max-age=31536000, immutable').type(media.mime);
        if (range && (range[1] || range[2])) {
            const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
            const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
            if (start > end || start >= size) return reply.code(416).header('content-range', `bytes */${size}`).send();
            if (media.owner_id) await store.addTraffic(media.owner_id, month(now()), end - start + 1);
            return reply.code(206).header('content-range', `bytes ${start}-${end}/${size}`).header('content-length', end - start + 1)
                .send(fs.createReadStream(media.file_path, { start, end }));
        }
        if (media.owner_id) await store.addTraffic(media.owner_id, month(now()), size);
        return reply.header('content-length', size).send(fs.createReadStream(media.file_path));
    });

    server.get('/_site/preview/:token/*', async (request, reply) => {
        const entry = publishing.previewOf(String(request.params.token));
        const html = entry?.pages.get(String(request.params['*'] || '').split('/').filter(Boolean)[0] || '');
        if (!html) return reply.callNotFound();
        return reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex').type('text/html; charset=utf-8')
            .send(html.replace(/\/_site\/m\/([a-f0-9]{64})/g, `/_site/m/$1?p=${request.params.token}`));
    });

    // The contact form (Q17): checked, limited by address and by site, delivered to the author's Communiquer; the
    // author's own address is never exposed.
    server.register(async (scope) => {
        scope.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 16_384 },
            (_request, body, done) => done(null, Object.fromEntries(new URLSearchParams(body))));
        scope.post('/_site/contact', async (request, reply) => {
            const form = request.body || {};
            const row = await store.site(String(form.site || ''));
            const back = row ? `<p><a href="/${escapeHtml(row.slug)}/">Revenir au site</a></p>` : '';
            const answer = (code, title, body) => reply.code(code).type('text/html; charset=utf-8').send(notice(title, body + back, '<meta name="robots" content="noindex">'));
            if (!row || row.state !== 'online') return answer(404, 'Site introuvable', '');
            if (String(form.website || '')) return answer(200, 'Message envoyé', '<p>Merci, votre message est parti.</p>');
            const name = String(form.name || '').trim().slice(0, 120), email = String(form.email || '').trim().slice(0, 254), message = String(form.message || '').trim().slice(0, 4000);
            if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return answer(400, 'Message incomplet', '<p>Le nom, l’e-mail et le message sont demandés.</p>');
            const ipKey = crypto.createHash('sha256').update(`${request.ip}|${row.site_id}`).digest('hex').slice(0, 32), at = now();
            if (await store.contactCount(row.site_id, ipKey, at - HOUR_MS) >= CONTACT_PER_IP_PER_HOUR
                || await store.contactCount(row.site_id, '', at - 24 * HOUR_MS) >= CONTACT_PER_SITE_PER_DAY) {
                return answer(429, 'Trop de messages', '<p>Réessayez un peu plus tard.</p>');
            }
            await store.logContact(row.site_id, ipKey, at);
            const live = row.live_version ? await store.version(row.site_id, row.live_version) : null;
            await notify(row.owner_id, null, { kind: 'site-contact', subject: `${live?.manifest.title || row.slug} · ${name}`, message,
                id: `site_contact_${row.site_id}_${at}`, extra: { site_id: row.site_id, slug: row.slug, reply_to: email, name } });
            return answer(200, 'Message envoyé', '<p>Merci, votre message est parti.</p>');
        });
    });

    // atome.one/<slug>[/<page>/]: an address once used redirects to the site's current one (Q7).
    server.setNotFoundHandler(async (request, reply) => {
        const url = request.url.split('?')[0];
        if (!['GET', 'HEAD'].includes(request.method) || url.includes('.') && url !== '/robots.txt') return reply.code(404).send({ message: `Route ${request.method}:${url} not found`, error: 'Not Found', statusCode: 404 });
        if (url === '/robots.txt') return reply.type('text/plain').send('User-agent: *\nAllow: /\n');
        const [slug, pageSlug = '', ...rest] = url.split('/').filter(Boolean).map(part => decodeURIComponent(part).toLowerCase());
        const row = slug && !rest.length ? await store.bySlug(slug) : null;
        if (!row) return reply.code(404).send({ message: `Route ${request.method}:${url} not found`, error: 'Not Found', statusCode: 404 });
        if (row.domain && row.domain_state === 'active' && row.primary_host === 'domain') return reply.redirect(`https://${row.domain}/${pageSlug ? `${pageSlug}/` : ''}`, 301);
        if (row.slug !== slug || !url.endsWith('/')) return reply.redirect(`/${row.slug}/${pageSlug ? `${pageSlug}/` : ''}`, 301);
        return sendPage(reply, row, pageSlug, request);
    });
}
