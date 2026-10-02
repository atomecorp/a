import { extractTagValue, extractResponseBlocks } from '../contacts/carddav_protocol.js';
import { xmlDecode, escapeXml } from '../contacts/carddav_shared.js';

const limited = xml => /<(?:[\w.-]+:)?number-of-matches-within-limits\b/i.test(xml)
    || /<(?:[\w.-]+:)?status\b[^>]*>HTTP\/\d(?:\.\d)? 507\b/i.test(xml);
const syncToken = xml => xmlDecode(extractTagValue(xml, 'sync-token') || '') || null;
const mergePages = pages => {
    const items = new Map(), removed = new Set();
    for (const page of pages) {
        for (const href of page.removed_hrefs || []) {
            removed.add(href);
            for (const [key, item] of items) if (item.href === href) items.delete(key);
        }
        for (const item of page.items || []) {
            removed.delete(item.href);
            items.set(JSON.stringify([item.href || item.id, item.uid || item.id, item.recurrence_id || '']), item);
        }
    }
    return { items: [...items.values()], removed_hrefs: [...removed] };
};

/** DAV continuation stays in the protocol owner; no cursor is committed here. */
export async function readDavDelta({ cursor, request, body, parse, normalize, initial }) {
    if (!cursor) return initial();
    const pages = []; let next = cursor;
    for (let index = 0; index < 64; index += 1) {
        let xml;
        try { xml = await request({ method: 'REPORT', body: body({ cursor: next }), depth: '1' }); }
        catch (error) {
            if (error.status === 403 && /valid-sync-token/.test(error.body || '')) return initial();
            throw error;
        }
        const parsed = parse(xml), normalized = normalize(parsed.responses.filter(row => !/\b507\b/.test(row.status || '')));
        pages.push(normalized);
        const token = parsed.sync_token || next;
        if (!limited(xml)) return { ...mergePages(pages), cursor: token, complete: true };
        if (!parsed.sync_token || token === next) throw new Error('dav_continuation_missing');
        next = token;
    }
    throw new Error('dav_pages_limit');
}

export async function readDavInitial({ url, domain, request, queryBody, parse, normalize }) {
    // Capture the token before observing objects; concurrent changes replay next cycle.
    const tokenXml = await request({ method: 'PROPFIND', depth: '0',
        body: '<d:propfind xmlns:d="DAV:"><d:prop><d:sync-token /></d:prop></d:propfind>' });
    const cursor = syncToken(tokenXml);
    const xml = await request({ method: 'REPORT', depth: '1', body: queryBody });
    if (!limited(xml)) return { ...normalize(parse(xml).responses), cursor, complete: true };
    // A query has no continuation token: enumerate hrefs, then bounded multigets.
    const listing = await request({ method: 'PROPFIND', depth: '1',
        body: '<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>' });
    if (limited(listing)) throw new Error('dav_listing_incomplete');
    const hrefs = extractResponseBlocks(listing).flatMap(block => {
        const href = xmlDecode(extractTagValue(block, 'href') || '');
        if (!href || href.endsWith('/') || new URL(href, url).href === url) return [];
        if (/<(?:[\w.-]+:)?status\b[^>]*>HTTP\/\d(?:\.\d)? [45]\d\d/i.test(block)) throw new Error('dav_listing_incomplete');
        return [href];
    });
    if (hrefs.length > 100000) throw new Error('dav_items_limit');
    const pages = [], contact = domain === 'contact';
    const ns = contact ? 'urn:ietf:params:xml:ns:carddav' : 'urn:ietf:params:xml:ns:caldav';
    const root = contact ? 'addressbook-multiget' : 'calendar-multiget';
    const property = contact ? 'address-data' : 'calendar-data';
    for (let offset = 0; offset < hrefs.length; offset += 200) {
        const batch = hrefs.slice(offset, offset + 200);
        const body = `<c:${root} xmlns:d="DAV:" xmlns:c="${ns}"><d:prop><d:getetag/><c:${property}/></d:prop>${batch.map(href => `<d:href>${escapeXml(href)}</d:href>`).join('')}</c:${root}>`;
        const response = await request({ method: 'REPORT', depth: '1', body });
        if (limited(response)) throw new Error('dav_multiget_incomplete');
        const parsed = parse(response);
        if (batch.some(href => !parsed.responses.some(row => row.href && new URL(row.href, url).href === new URL(href, url).href)))
            throw new Error('dav_multiget_incomplete');
        pages.push(normalize(parsed.responses));
    }
    return { ...mergePages(pages), cursor, complete: true };
}
