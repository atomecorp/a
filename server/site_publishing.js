// Websites (todo/publication_web_2026-10-28.md): a project published at atome.one/<slug>[/<page>]. The settings are the
// author's `site` Atome (address, title, description, pages, credit line); this service claims the address, freezes a
// version from the project's atomes (server/site_projection.js) on disk, points the site at it now or at a planned time,
// keeps every version (a rollback is a new version, the history is never rewritten), and writes its word back on the
// Atome (`site_status`). Media are never copied: a version points to the original file by its content (SHA-256).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SITE_ATOME_TYPE, siteProjectId, siteSlugError, slugify } from '../atome/src/shared/site_contract.js';
import { projectSite } from './site_projection.js';

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'sound', 'svg']);
const parse = value => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return value; } };
const text = (value, max = 500) => String(value == null ? '' : value).trim().slice(0, max);
const fail = (error, detail = '') => ({ ok: false, error, ...(detail ? { detail } : {}) });
const sha256Of = filePath => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };

export function createSitePublishing({ store, vaultRouter, syncRuntime = null, resolveFile, sitesRoot, origin = 'https://atome.one', now = () => Date.now() }) {
    const settingsOf = (siteId, state) => {
        const p = state.properties || {};
        return { projectId: text(siteProjectId(siteId), 200), slug: text(p.slug, 60), title: text(p.title, 120), description: text(p.description, 300),
            pageIds: Array.isArray(parse(p.page_ids)) ? parse(p.page_ids).map(String) : null, credit: p.credit !== false && p.credit !== 'false' };
    };
    const readSite = async (ownerId, siteId) => {
        const state = await vaultRouter.getState(ownerId, siteId).catch(() => null);
        if (!state || String(state.type || '').toLowerCase() !== SITE_ATOME_TYPE || state.properties?.__deleted === true) return null;
        return { state, settings: settingsOf(siteId, state) };
    };
    const urlOf = row => `${origin}/${row.slug}/`;

    const statusOf = async (row) => {
        if (!row) return { state: 'draft' };
        const next = await store.pending(row.site_id);
        return { state: row.state, slug: row.slug, url: urlOf(row), live_version: row.live_version ?? null,
            next: next ? { kind: next.kind, at: next.due_at, version: next.version } : null,
            domain: row.domain ? { name: row.domain, state: row.domain_state, primary: row.primary_host } : null, updated_at: new Date(now()).toISOString() };
    };
    const writeStatus = async (ownerId, siteId, extra = {}) => {
        const status = { ...await statusOf(await store.site(siteId)), ...extra };
        const entry = await vaultRouter.commit(ownerId, { kind: 'set', atome_id: siteId, payload: { props: { site_status: JSON.stringify(status) } },
            actor: { type: 'user', id: ownerId } }, { source: 'site' });
        if (entry?.inserted) await syncRuntime?.publish?.(entry.event);
        return status;
    };

    // The address: free, or already this site's. A changed address keeps the old one redirecting (Q7).
    const claim = async (ownerId, siteId, settings) => {
        const slug = settings.slug || slugify(settings.title);
        const invalid = siteSlugError(slug);
        if (invalid) return fail(invalid === 'site_slug_reserved' ? 'SLUG_RESERVED' : 'SLUG_INVALID');
        const holder = await store.slugOwner(slug);
        if (holder && holder !== siteId) return fail('SLUG_TAKEN');
        const row = await store.site(siteId);
        if (row && row.owner_id !== ownerId) return fail('NOT_ALLOWED');
        if (!row) await store.create({ siteId, ownerId, projectId: settings.projectId, slug });
        else if (row.slug !== slug) await store.update(siteId, { slug });
        await store.claimSlug(slug, siteId);
        return { ok: true, row: await store.site(siteId) };
    };
    // The site's row, made at its first server action (a domain chosen before the first publication).
    const ensureRow = async (ownerId, siteId) => {
        const site = await readSite(ownerId, siteId);
        return site ? claim(ownerId, siteId, site.settings) : fail('NOT_FOUND');
    };
    const slugState = async (slug, siteId = '') => {
        const invalid = siteSlugError(slug);
        if (invalid) return { ok: true, free: false, reason: invalid === 'site_slug_reserved' ? 'SLUG_RESERVED' : 'SLUG_INVALID' };
        const holder = await store.slugOwner(slug);
        return { ok: true, free: !holder || holder === siteId, reason: holder && holder !== siteId ? 'SLUG_TAKEN' : '' };
    };

    // Every media placed on a published page, by its content: the address served and the original file read.
    const resolveMedia = async (ownerId, records) => {
        const media = new Map(), files = [];
        for (const record of records) {
            const type = String(record.type || record.kind || '').toLowerCase(), url = text(record.properties?.media_url, 2000);
            if (!MEDIA_TYPES.has(type) || !url) continue;
            const file = await resolveFile(ownerId, url).catch(() => null);
            if (!file?.filePath) continue;
            const sha256 = await sha256Of(file.filePath);
            media.set(String(record.atome_id || record.id), `/_site/m/${sha256}`);
            files.push({ sha256, filePath: file.filePath, mime: MIME[path.extname(file.filePath).toLowerCase()] || 'application/octet-stream' });
        }
        return { media, files };
    };
    const versionDir = (siteId, version) => path.join(sitesRoot, siteId.replace(/[^a-zA-Z0-9_-]/g, '_'), String(version));
    const pageFile = slug => `${slug || '_home'}.html`;

    const build = async (ownerId, siteId, settings, row, author) => {
        const listed = await vaultRouter.listStates(ownerId, { project_id: settings.projectId, limit: 10000 });
        const records = (Array.isArray(listed) ? listed : listed?.items || listed?.states || []).filter(record => record.properties?.__deleted !== true);
        const { media, files } = await resolveMedia(ownerId, records);
        const site = projectSite({ records, projectId: settings.projectId, siteId, slug: row.slug, title: settings.title, description: settings.description,
            pageIds: settings.pageIds, credit: settings.credit, media, origin });
        if (!site.ok) return site;
        const version = await store.nextVersion(siteId), dir = versionDir(siteId, version);
        fs.mkdirSync(dir, { recursive: true });
        for (const page of site.pages) fs.writeFileSync(path.join(dir, pageFile(page.slug)), page.html);
        const manifest = { title: site.title, home: site.home, issues: site.issues, pages: site.pages.map(({ page_id, slug, name, path: at }) => ({ page_id, slug, name, path: at })) };
        await store.addVersion({ siteId, version, author, manifest });
        for (const file of files) await store.addMedia({ ...file, siteId, version });
        return { ok: true, version, manifest };
    };

    const activate = async (ownerId, siteId, version) => {
        await store.update(siteId, { live_version: version, state: 'online' });
        return writeStatus(ownerId, siteId, { last_error: null });
    };

    const publish = async (ownerId, { site_id: siteId, at = null, author = 'user' }) => {
        const site = await readSite(ownerId, siteId);
        if (!site) return fail('NOT_FOUND');
        const claimed = await claim(ownerId, siteId, site.settings);
        if (!claimed.ok) return claimed;
        const built = await build(ownerId, siteId, site.settings, claimed.row, author === 'eve' ? 'eve' : 'user');
        if (!built.ok) return built;
        await store.cancelPending(siteId);
        const due = at ? Date.parse(at) : NaN;
        if (Number.isFinite(due) && due > now()) {
            await store.addOperation({ opId: crypto.randomUUID(), siteId, kind: 'publish', version: built.version, dueAt: new Date(due).toISOString() });
            arm();
            return { ok: true, scheduled: true, version: built.version, issues: built.manifest.issues, site: await writeStatus(ownerId, siteId) };
        }
        return { ok: true, version: built.version, issues: built.manifest.issues, url: urlOf(claimed.row), site: await activate(ownerId, siteId, built.version) };
    };

    const owned = async (ownerId, siteId) => { const row = await store.site(siteId); return row && row.owner_id === ownerId ? row : null; };

    const rollback = async (ownerId, { site_id: siteId, version }) => {
        const row = await owned(ownerId, siteId), old = row && await store.version(siteId, Number(version));
        if (!old) return fail('NOT_FOUND');
        const next = await store.nextVersion(siteId);
        fs.cpSync(versionDir(siteId, old.version), versionDir(siteId, next), { recursive: true });
        await store.addVersion({ siteId, version: next, author: 'user', manifest: { ...old.manifest, restored_from: old.version } });
        await store.copyMedia(siteId, old.version, next);
        await store.cancelPending(siteId);
        return { ok: true, version: next, site: await activate(ownerId, siteId, next) };
    };
    const retire = async (ownerId, { site_id: siteId }) => {
        const row = await owned(ownerId, siteId);
        if (!row) return fail('NOT_FOUND');
        await store.cancelPending(siteId);
        await store.update(siteId, { state: 'retired' });
        return { ok: true, site: await writeStatus(ownerId, siteId) };
    };
    const cancel = async (ownerId, { site_id: siteId }) => {
        if (!await owned(ownerId, siteId)) return fail('NOT_FOUND');
        await store.cancelPending(siteId);
        return { ok: true, site: await writeStatus(ownerId, siteId) };
    };
    // A planned operation moved (the Agenda): the same frozen version, at its new time.
    const reschedule = async (ownerId, { site_id: siteId, at }) => {
        if (!await owned(ownerId, siteId)) return fail('NOT_FOUND');
        const due = Date.parse(at);
        if (!Number.isFinite(due) || due <= now()) return fail('INVALID_ARGUMENT');
        if (!await store.pending(siteId)) return fail('NOT_FOUND');
        await store.movePending(siteId, new Date(due).toISOString());
        arm();
        return { ok: true, site: await writeStatus(ownerId, siteId) };
    };
    const history = async (ownerId, { site_id: siteId }) => {
        const row = await owned(ownerId, siteId);
        if (!row) return fail('NOT_FOUND');
        const next = await store.pending(siteId);
        return { ok: true, versions: (await store.versions(siteId)).map(v => ({ version: v.version, author: v.author, created_at: v.created_at,
            state: v.version === row.live_version && row.state === 'online' ? 'online' : (next?.version === v.version ? 'planned' : '') })),
            next: next ? { kind: next.kind, at: next.due_at, version: next.version } : null };
    };
    const state = async (ownerId, { site_id: siteId }) => {
        const row = await store.site(siteId);
        if (row && row.owner_id !== ownerId) return fail('NOT_ALLOWED');
        const live = row?.live_version ? await store.version(siteId, row.live_version) : null;
        return { ok: true, site: { ...await statusOf(row), pages: live?.manifest.pages || [], issues: live?.manifest.issues || [] } };
    };
    const list = async ownerId => ({ ok: true, sites: await Promise.all((await store.ofOwner(ownerId)).map(async row => ({ site_id: row.site_id,
        project_id: row.project_id, ...await statusOf(row) }))) });
    // A check before publishing: the version that would be made, without making it.
    const check = async (ownerId, { site_id: siteId }) => {
        const site = await readSite(ownerId, siteId);
        if (!site) return fail('NOT_FOUND');
        const slug = site.settings.slug || slugify(site.settings.title);
        const listed = await vaultRouter.listStates(ownerId, { project_id: site.settings.projectId, limit: 10000 });
        const records = Array.isArray(listed) ? listed : listed?.items || listed?.states || [];
        const { media } = await resolveMedia(ownerId, records);
        const projected = projectSite({ records, projectId: site.settings.projectId, siteId, slug, pageIds: site.settings.pageIds, media, origin });
        return { ok: true, report: { ok: projected.ok, error: projected.error || '', slug: await slugState(slug, siteId),
            pages: (projected.pages || []).map(({ page_id, slug: pageSlug, name, path: at }) => ({ page_id, slug: pageSlug, name, path: at })), issues: projected.issues } };
    };

    // A preview (« Aperçu »): the version that would be made, kept in memory for half an hour under a random token,
    // its pages and media readable by whoever holds the token (server/site_http.js). One per site.
    const previews = new Map();
    const preview = async (ownerId, { site_id: siteId }) => {
        const site = await readSite(ownerId, siteId);
        if (!site) return fail('NOT_FOUND');
        for (const [token, entry] of previews) if (entry.siteId === siteId || entry.expires < now()) previews.delete(token);
        const token = crypto.randomBytes(18).toString('base64url'), slug = site.settings.slug || slugify(site.settings.title);
        const listed = await vaultRouter.listStates(ownerId, { project_id: site.settings.projectId, limit: 10000 });
        const records = (Array.isArray(listed) ? listed : listed?.items || listed?.states || []).filter(record => record.properties?.__deleted !== true);
        const { media, files } = await resolveMedia(ownerId, records);
        const projected = projectSite({ records, projectId: site.settings.projectId, siteId, slug, title: site.settings.title, description: site.settings.description,
            pageIds: site.settings.pageIds, credit: site.settings.credit, media, origin, base: `/_site/preview/${token}/` });
        if (!projected.ok) return projected;
        previews.set(token, { siteId, expires: now() + 30 * 60_000, pages: new Map(projected.pages.map(page => [page.slug || '', page.html])),
            media: new Map(files.map(file => [file.sha256, file])) });
        return { ok: true, url: `${origin}/_site/preview/${token}/`, path: `/_site/preview/${token}/`, issues: projected.issues };
    };
    const previewOf = token => { const entry = previews.get(token); return entry && entry.expires >= now() ? entry : null; };

    // The clock: due planned operations run, then the timer waits for the next one.
    let timer = null;
    const tick = async () => {
        for (const op of await store.due(new Date(now()).toISOString())) {
            const row = await store.site(op.site_id);
            if (!row) { await store.finishOperation(op.op_id, 'failed', 'site_missing'); continue; }
            try {
                await store.finishOperation(op.op_id, 'done');
                await activate(row.owner_id, row.site_id, op.version);
            } catch (error) {
                await writeStatus(row.owner_id, row.site_id, { last_error: String(error?.message || error) }).catch(written => console.error('[site] status', written));
            }
        }
        arm();
    };
    const arm = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        store.nextDue().then(at => {
            if (!at) return;
            timer = setTimeout(() => { tick().catch(error => console.error('[site] clock', error)); }, Math.min(Math.max(0, Date.parse(at) - now()), 3600_000));
            timer.unref?.();
        }).catch(error => console.error('[site] clock', error));
    };
    arm();

    const handle = async (data, userId) => {
        const action = String(data?.action || '');
        if (action === 'slug') return slugState(text(data.slug, 60), text(data.site_id, 200));
        if (action === 'list') return list(userId);
        const input = { ...data, site_id: text(data.site_id, 200) };
        if (!input.site_id) return fail('INVALID_ARGUMENT');
        const run = { publish, rollback, retire, cancel, reschedule, history, state, check, preview }[action];
        return run ? run(userId, input) : null;
    };
    return { handle, ensureRow, publish, rollback, retire, cancel, reschedule, history, state, list, check, preview, previewOf, tick, statusOf, writeStatus, versionDir, store };
}
