// The public website of a project (atome.one/<slug>[/<page>]): one contract for the client, the server and MCP.
// A site page is a Page at the root of its project (`container_kind: 'page'`), in the project's order
// (`hierarchy_order`); the home is the cover page (`page_cover`), else the first. A page's name is its title
// and its address part. Decisions Q5–Q12 of todo/publication_web_2026-10-28.md.

export const SITE_SLUG_MAX = 48;
// A project's site: one `site` Atome in its author's vault, named after the project so every device finds the same one.
export const SITE_ATOME_TYPE = 'site';
// A contact form (Q17, M9): a group of the page marked so; its members are its look in the editor, the public page
// shows a real form in its place.
export const SITE_FORM_PROPERTY = 'site_form';
export const siteAtomeId = projectId => `site_${String(projectId == null ? '' : projectId).trim()}`;
// The project a site belongs to, read from its id (`project_id` is a reserved Atome key, never a property).
export const siteProjectId = siteId => (String(siteId || '').startsWith('site_') ? String(siteId).slice(5) : '');
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
// The top-level paths atome.one already serves, and the system words kept for later (Q7).
export const RESERVED_SITE_SLUGS = Object.freeze(new Set([
    'api', 'ws', 'atome', 'eve', 'src', 'vendor', 'assets', 'auth', 'ios', 'health', 'healthz', 'dev', 'client-log', 'application',
    'css', 'js', 'shared', 'squirrel', 'utils', 'wasm', 'well-known', 'admin', 'login', 'logout', 'signup', 'static', 'www', 'mail',
    'help', 'support', 'legal', 'terms', 'privacy', 'about', 'contact', 'sites', 'site', 'blog', 'docs', 'status', 'app', 'apps',
    'download', 'downloads', 'store', 'shop', 'billing', 'account', 'settings', 'public', 'media', 'uploads', 'cdn', 'test', 'robots',
    'sitemap', 'favicon', 'index', 'offline', 'sw', 'version', 'server-config', 'root', 'system', 'atome-one'
]));

const text = value => String(value == null ? '' : value).trim();

// Lower case, no accent, words joined by hyphens.
export const slugify = (value, max = SITE_SLUG_MAX) => text(value).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '');

export const siteSlugError = (slug) => {
    const value = text(slug);
    if (!value) return 'site_slug_required';
    if (!SLUG_PATTERN.test(value) || value.includes('--')) return 'site_slug_invalid';
    if (RESERVED_SITE_SLUGS.has(value)) return 'site_slug_reserved';
    return '';
};

const propsOf = record => record?.properties || record?.props || {};
const idOf = record => text(record?.atome_id || record?.id);
const isTrue = value => value === true || value === 'true' || value === 1;
const isPage = record => text(propsOf(record).container_kind).toLowerCase() === 'page';
const isDeleted = record => record?.deleted === true || isTrue(propsOf(record).deleted) || isTrue(record?.meta?.deleted);
const parentOf = record => text(record?.parent_id || propsOf(record).parent_id || record?.meta?.parent_id);
const orderOf = record => { const value = Number(propsOf(record).hierarchy_order); return Number.isFinite(value) ? value : Infinity; };

// The project's site pages, in the project's order (a Page inside a Page stays a block of its page).
export const sitePages = (records = [], projectId = '') => {
    const project = text(projectId);
    return records.filter(record => isPage(record) && !isDeleted(record) && (!parentOf(record) || parentOf(record) === project))
        .sort((a, b) => orderOf(a) - orderOf(b) || idOf(a).localeCompare(idOf(b)));
};

export const siteHomePage = (pages = []) => pages.find(page => isTrue(propsOf(page).page_cover)) || pages[0] || null;

export const sitePageName = page => text(propsOf(page).name) || 'Page';

// Each page's address part: '' for the home, its name's slug otherwise, made unique with -2, -3…
export const sitePageSlugs = (pages = []) => {
    const home = siteHomePage(pages), used = new Set(['']), slugs = new Map();
    for (const page of pages) {
        if (page === home) { slugs.set(idOf(page), ''); continue; }
        const base = slugify(sitePageName(page)) || 'page';
        let slug = base;
        for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
        used.add(slug); slugs.set(idOf(page), slug);
    }
    return slugs;
};

// « Aller » (Q6): to a page of the project (its id, stable through a rename) or to an outside http(s) address,
// in the same tab or a new one.
export const SITE_GOTO_TOOL_ID = 'site.goto';
export const normalizeGotoParameters = (input = {}) => {
    const page = text(input.page_id);
    if (page) return { page_id: page };
    const url = text(input.url);
    if (!url) throw new Error('goto_target_required');
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('goto_url_invalid'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('goto_url_invalid');
    return { url: parsed.href, new_tab: input.new_tab === true };
};

// Hosting is included in the subscription (Q15): a reasonable traffic per month by offer, beyond which a site is
// slowed down and its author warned, never cut nor charged.
export const SITE_TRAFFIC_GB_BY_TIER = Object.freeze({ standard: 89, plus: 233, max: 610 });
