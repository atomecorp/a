// A page (D18 item 11, user 4 Nov. 2026): an HTML file with its JavaScript, placed in a project as an object of its own.
// Its description holds its source (`page_html`), its title, the picture it shows at rest (`poster_source`, the last
// look the page had, drawn by Bevy like any picture) and the network addresses the person let it reach
// (`network_allow`, one list per page, edited from the page itself or from Réglages › Avancé). It runs only in the
// isolated preview (eVe/domains/page_preview/): an opaque-origin sandbox on a serving origin of its own, its network
// limited to that list by the preview origin's CSP (atome/servers/atome-server/src/page_preview.rs).
import { ATOME_FRAME_SCHEMA, ATOME_MEDIA_SCHEMA, ATOME_ORDER_SCHEMA } from './core_atome_type_shape.js';
import { ATOME_WRITTEN_PROPERTIES } from './atome_type_written_properties.js';

export const HTML_PAGE_TYPE_ID = 'html_page';
// The in-place media source of a page's record (eVe/domains/media/inplace_media_source.js).
export const HTML_PAGE_MEDIA_SOURCE = 'html_page';
export const HTML_PAGE_MAX_SOURCE_BYTES = 512 * 1024;
export const HTML_PAGE_MAX_ALLOWED_HOSTS = 32;

// A host the person may let a page reach: a lowercase DNS name of two labels at least, reached over https only.
// The preview origin (Rust) applies the same rule before it writes the host into the CSP.
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
export const normalizePageHost = (value) => {
    const host = String(value ?? '').trim().toLowerCase();
    if (!host || host.length > 253) return '';
    const labels = host.split('.');
    return labels.length >= 2 && labels.every(label => LABEL.test(label)) ? host : '';
};
// The list as stored: valid hosts, each once, in the order they were allowed.
export const normalizePageHosts = (values = []) => [...new Set((Array.isArray(values) ? values : []).map(normalizePageHost).filter(Boolean))]
    .slice(0, HTML_PAGE_MAX_ALLOWED_HOSTS);

export const HTML_PAGE_TYPE = Object.freeze({
    type: HTML_PAGE_TYPE_ID,
    kind: 'media',
    traits: ['visual', 'media', 'raster', 'selectable', 'interactive_page'],
    schema: {
        // What the canonical creation writes on a picture (tool_genesis_properties_runtime.js#buildPropertiesFromSpec).
        ...ATOME_WRITTEN_PROPERTIES.image,
        ...ATOME_ORDER_SCHEMA,
        ...ATOME_FRAME_SCHEMA,
        ...ATOME_MEDIA_SCHEMA,
        poster_source: { type: 'string' },
        page_html: { type: 'string', maxLength: HTML_PAGE_MAX_SOURCE_BYTES },
        page_title: { type: 'string' },
        network_allow: { type: 'array', maxItems: HTML_PAGE_MAX_ALLOWED_HOSTS, items: { type: 'string' } }
    }
});
