// A project's atomes → the static pages of its public site (decisions Q1, Q2, Q5, Q6, Q8, Q9, Q12, Q17 of
// todo/publication_web_2026-10-28.md). A projection, never a truth nor an editor: the version it makes is frozen and
// served as is. Text, shapes, images, video and sound become HTML; a link is the object's « Aller » interaction; a
// contact form posts to the server. What a web page cannot show is reported, never silently dropped.
import { SITE_FORM_PROPERTY, siteHomePage, sitePageName, sitePageSlugs, sitePages, slugify } from '../atome/src/shared/site_contract.js';
import { cssColor, cssNumber, inkOn, siteStylesheet } from './site_projection_css.js';

const ROW_TOLERANCE_PX = 24;
const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'sound', 'svg']);
const SHOWN_TYPES = new Set(['text', 'shape', 'form', 'group', ...MEDIA_TYPES]);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const parse = value => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return value; } };
const idOf = record => String(record?.atome_id || record?.id || '');
const propsOf = record => record?.properties || {};
const parentOf = record => String(record?.meta?.parent_id || record?.parent_id || propsOf(record).parent_id || '');
const isForm = record => [true, 'true'].includes(propsOf(record)[SITE_FORM_PROPERTY]);
const typeOf = record => String(isForm(record) ? 'form' : (record?.type || record?.kind || propsOf(record).type || '')).toLowerCase();
const frameOf = record => { const p = propsOf(record); return { left: cssNumber(p.left), top: cssNumber(p.top), width: cssNumber(p.width), height: cssNumber(p.height) }; };

// Every descendant of a page (a group or a nested page lays its own members at their canvas place). A contact form's
// members are its look in the editor: the form stands for them.
const descendants = (records, rootId) => {
    const children = new Map();
    for (const record of records) { const parent = parentOf(record); if (!children.has(parent)) children.set(parent, []); children.get(parent).push(record); }
    const out = [], walk = id => { for (const child of children.get(id) || []) { out.push(child); if (!isForm(child)) walk(idOf(child)); } };
    walk(rootId);
    return out;
};

// « Aller » interactions: the object touched → its link.
const linksOf = (records, hrefOfPage) => {
    const links = new Map();
    for (const record of records) {
        if (typeOf(record) !== 'interaction') continue;
        const props = propsOf(record), trigger = parse(props.trigger) || {}, actions = parse(props.actions) || [];
        if (props.enabled === false || props.enabled === 'false' || trigger.kind !== 'activate' || !trigger.atome_id) continue;
        const go = (Array.isArray(actions) ? actions : []).find(action => action?.tool_id === 'site.goto');
        const parameters = parse(go?.parameters) || {};
        if (parameters.page_id) { const href = hrefOfPage(String(parameters.page_id)); if (href) links.set(trigger.atome_id, { href }); }
        else if (/^https?:\/\//i.test(String(parameters.url || ''))) links.set(trigger.atome_id, { href: String(parameters.url), external: true, newTab: parameters.new_tab === true });
    }
    return links;
};

const rowsOf = items => {
    const rows = [];
    for (const item of items.slice().sort((a, b) => a.top - b.top || a.left - b.left)) {
        const row = rows.find(entry => Math.abs(item.top - entry.top) < ROW_TOLERANCE_PX);
        if (row) row.items.push(item); else rows.push({ top: item.top, items: [item] });
    }
    return rows.map(row => row.items.sort((a, b) => a.left - b.left));
};
const overlaps = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
const clustersOf = items => {
    const clusters = [];
    for (const item of items) { const hit = clusters.find(cluster => cluster.some(other => overlaps(other, item))); if (hit) hit.push(item); else clusters.push([item]); }
    return clusters.map(members => {
        const left = Math.min(...members.map(i => i.left)), top = Math.min(...members.map(i => i.top));
        return { left, top, width: Math.max(...members.map(i => i.left + i.width)) - left, height: Math.max(...members.map(i => i.top + i.height)) - top, members };
    });
};

const formHtml = (item, attributes, { siteId, ink }) => `<form class="o f" ${attributes} style="${item.style};--accent:${cssColor(item.props.color, '#a9b2ff')};--ink:${ink}" method="post" action="/_site/contact">
<input type="hidden" name="site" value="${escapeHtml(siteId)}"><input type="hidden" name="form" value="${escapeHtml(item.id)}">
<label class="hp" aria-hidden="true">Ne pas remplir<input name="website" tabindex="-1" autocomplete="off"></label>
<label>Nom<input name="name" autocomplete="name" required maxlength="120"></label>
<label>E-mail<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
<label>Message<textarea name="message" rows="5" required maxlength="4000"></textarea></label>
<p class="consent">Vos coordonnées servent seulement à vous répondre.</p><button type="submit">Envoyer</button></form>`;

const objectHtml = (item, origin, context) => {
    const p = item.props, link = context.links.get(item.id);
    item.style = [`left:${item.left - origin.left}px`, `top:${item.top - origin.top}px`, `width:${item.width}px`, `height:${item.height}px`,
        `z-index:${Math.round(cssNumber(p.z_index))}`, ...(p.border_radius ? [`border-radius:${cssNumber(p.border_radius)}px`] : [])].join(';');
    const attributes = '';
    const wrap = inner => (link ? `<a class="o" ${attributes} style="${item.style}" href="${escapeHtml(link.href)}"${link.newTab ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inner}</a>` : inner);
    if (item.type === 'text') {
        const style = `${item.style};color:${cssColor(p.color, context.ink)};font-size:${cssNumber(p.font_size, 16)}px;font-weight:${cssNumber(p.font_weight, 400)};line-height:${cssNumber(p.line_height, 1.2)};--fs:${cssNumber(p.font_size, 16)};text-align:${['left', 'center', 'right', 'justify'].includes(p.text_align) ? p.text_align : 'left'}`;
        const inner = escapeHtml(p.text).replace(/\n/g, '<br>');
        return link ? `<a class="o t" ${attributes} style="${style}" href="${escapeHtml(link.href)}"${link.newTab ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inner}</a>` : `<div class="o t" ${attributes} style="${style}">${inner}</div>`;
    }
    if (item.type === 'shape' || item.type === 'group') return wrap(`<div class="o s"${link ? '' : ` ${attributes}`} style="${link ? 'position:absolute;inset:0;border-radius:inherit' : item.style};background:${cssColor(p.color || p.background || p.fill)}"></div>`);
    if (item.type === 'form') return formHtml(item, attributes, context);
    const media = context.media.get(item.id);
    const alt = escapeHtml(p.alt || p.name || '');
    if (item.type === 'video') return `<video class="o v" ${attributes} style="${item.style}" src="${media}" controls preload="metadata" playsinline></video>`;
    if (item.type === 'audio' || item.type === 'sound') return `<audio class="o" ${attributes} style="${item.style}" src="${media}" controls preload="none"></audio>`;
    return wrap(`<img class="o i"${link ? '' : ` ${attributes}`} style="${link ? 'position:absolute;inset:0;width:100%;height:100%;border-radius:inherit' : item.style}" src="${media}" alt="${alt}" loading="lazy">`);
};

const clusterHtml = (cluster, context) => `<div class="c" style="--w:${cluster.width};--h:${cluster.height};width:${cluster.width}px;height:${cluster.height}px;left:${cluster.left}px;top:${cluster.top}px">${cluster.members.map(item => objectHtml(item, cluster, context)).join('')}</div>`;

// `media`: atome id → public address of its file (resolved by the caller, server/site_publishing.js).
// `base`: where the pages are served (the site's address, or a preview's).
export const projectSite = ({ records, projectId, siteId, slug, title = '', description = '', pageIds = null, credit = true, media = new Map(), origin = 'https://atome.one', base = `/${slug}/` }) => {
    const all = sitePages(records, projectId), wanted = Array.isArray(pageIds) && pageIds.length ? new Set(pageIds.map(String)) : null;
    const pages = wanted ? all.filter(page => wanted.has(idOf(page))) : all;
    const issues = [];
    if (!pages.length) return { ok: false, error: 'NO_PAGE', pages: [], issues };
    const slugs = sitePageSlugs(pages), home = siteHomePage(pages);
    const hrefOfPage = id => (slugs.has(id) ? `${base}${slugs.get(id) ? `${slugs.get(id)}/` : ''}` : null);
    const links = linksOf(records, hrefOfPage);
    for (const record of records.filter(r => typeOf(r) === 'interaction')) {
        const go = (parse(propsOf(record).actions) || []).find?.(action => action?.tool_id === 'site.goto');
        const target = parse(go?.parameters)?.page_id;
        if (target && !slugs.has(String(target))) issues.push({ kind: 'link_unpublished', atome_id: parse(propsOf(record).trigger)?.atome_id || '', page_id: String(target) });
    }
    const siteTitle = String(title || sitePageName(home)).trim();
    const out = pages.map(page => {
        const props = propsOf(page), frame = frameOf(page), pageId = idOf(page), pageSlug = slugs.get(pageId);
        const items = descendants(records, pageId).map(record => ({ id: idOf(record), type: typeOf(record), props: propsOf(record), ...frameOf(record) }))
            .filter(item => item.type !== 'interaction');
        for (const item of items.filter(i => !SHOWN_TYPES.has(i.type))) issues.push({ kind: 'unsupported', atome_id: item.id, type: item.type, page_id: pageId });
        for (const item of items.filter(i => MEDIA_TYPES.has(i.type) && !media.has(i.id))) issues.push({ kind: 'media_missing', atome_id: item.id, page_id: pageId });
        const shown = items.filter(i => SHOWN_TYPES.has(i.type) && (!MEDIA_TYPES.has(i.type) || media.has(i.id)))
            .map(item => ({ ...item, left: item.left - frame.left, top: item.top - frame.top }));
        if (!shown.length) issues.push({ kind: 'page_empty', page_id: pageId });
        const context = { links, media, siteId, ink: inkOn(props.fill || props.background) };
        const body = rowsOf(shown).map(row => `<div class="r">${clustersOf(row).map(cluster => clusterHtml(cluster, context)).join('')}</div>`).join('');
        const name = sitePageName(page), path = `/${slug}/${pageSlug ? `${pageSlug}/` : ''}`;
        const pageTitle = page === home ? siteTitle : `${name} · ${siteTitle}`;
        const image = shown.find(item => item.type === 'image');
        const head = [`<title>${escapeHtml(pageTitle)}</title>`, description ? `<meta name="description" content="${escapeHtml(description)}">` : '',
            `<link rel="canonical" href="${escapeHtml(origin + path)}">`, `<meta property="og:title" content="${escapeHtml(pageTitle)}">`,
            description ? `<meta property="og:description" content="${escapeHtml(description)}">` : '', `<meta property="og:url" content="${escapeHtml(origin + path)}">`,
            image ? `<meta property="og:image" content="${escapeHtml(origin + media.get(image.id))}">` : ''].filter(Boolean).join('');
        const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}
<style>${siteStylesheet({ width: frame.width, height: frame.height, background: props.fill || props.background })}</style></head>
<body style="color:${context.ink}"><main class="page">${body}</main>${credit ? '<a class="credit" href="https://atome.one" aria-label="Créé avec atome"></a>' : ''}</body></html>`;
        return { page_id: pageId, slug: pageSlug, name, path, html };
    });
    return { ok: true, pages: out, issues, home: idOf(home), title: siteTitle, slug: slug || slugify(siteTitle) };
};
