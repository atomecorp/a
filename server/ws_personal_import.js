import { lookup } from 'node:dns/promises';
import { createNodeCarddavClient } from '../atome/src/squirrel/contacts/node_protocol_clients.js';
import { createNodeCaldavClient } from '../atome/src/squirrel/calendar/node_protocol_clients.js';

const inflight = new Set();
const windows = new Map();
const reply = (message, fields) => ({ type: 'personal-import-response', requestId: message.requestId || message.request_id,
    success: fields.ok === true, ...fields });
export function publicDavAddress(address) {
    if (address.includes(':')) return /^[23][0-9a-f]{3}:/i.test(address) && !address.includes('::ffff:');
    const [a, b, c] = address.split('.').map(Number);
    return a > 0 && a < 224 && ![10, 127].includes(a) && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31)
        && !(a === 100 && b >= 64 && b <= 127) && !(a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c))))
        && !(a === 198 && ([18, 19].includes(b) || (b === 51 && c === 100))) && !(a === 203 && b === 0 && c === 113);
}
export async function checkedDavUrl(input, { resolve = lookup, allowed = [] } = {}) {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
        || url.hash || url.search || input.length > 2048) throw new Error('dav_url_invalid');
    if (!(url.hostname === 'icloud.com' || url.hostname.endsWith('.icloud.com') || allowed.includes(url.hostname)))
        throw new Error('dav_host_not_allowed');
    const addresses = await resolve(url.hostname, { all: true });
    if (!addresses.length || addresses.some(entry => !publicDavAddress(entry.address))) throw new Error('dav_address_invalid');
    return url.href;
}

/** Authenticated read-only protocol operation on the existing ws/api connection. */
export async function handleWsPersonalImport(message, connection, { fetchResource = fetch, resolve = lookup,
    allowed = String(process.env.ATOME_DAV_ALLOWED_HOSTS || '').split(',').filter(Boolean) } = {}) {
    if (message?.type !== 'personal-import') return null;
    const user = connection?._wsApiUserId;
    if (!user || !connection._wsApiAuthExpMs || Date.now() >= connection._wsApiAuthExpMs)
        return reply(message, { ok: false, error: 'auth_session_invalid' });
    if (!['contact', 'calendar_event'].includes(message.domain)) return reply(message, { ok: false, error: 'dav_domain_invalid' });
    const now = Date.now(), recent = (windows.get(user) || []).filter(at => now - at < 60000);
    if (inflight.has(user) || recent.length >= 12) return reply(message, { ok: false, error: 'dav_rate_limited' });
    if (windows.size > 10000) for (const [key, times] of windows) if (times.every(at => now - at >= 60000)) windows.delete(key);
    recent.push(now); windows.set(user, recent); inflight.add(user);
    try {
        const username = String(message.auth?.username || ''), password = String(message.auth?.password || '');
        if (!username || !password || username.length > 320 || password.length > 4096) throw new Error('dav_credentials_invalid');
        const url = await checkedDavUrl(String(message.url || ''), { resolve, allowed });
        const deadline = Date.now() + 80000; let requests = 0;
        const fetchImpl = async (target, options) => {
            if (connection._wsApiUserId !== user || Date.now() >= connection._wsApiAuthExpMs || connection.readyState === 3)
                throw new Error('dav_session_changed');
            if (Date.now() >= deadline || ++requests > 128) throw new Error('dav_batch_limit');
            if (!['PROPFIND', 'REPORT'].includes(options.method)) throw new Error('dav_write_forbidden');
            await checkedDavUrl(target, { resolve, allowed });
            const response = await fetchResource(target, { ...options, redirect: 'manual', signal: AbortSignal.timeout(Math.min(15000, deadline - Date.now())) });
            if (response.status >= 300 && response.status < 400) throw new Error('dav_redirect_requires_configuration');
            let bytes = 0, text = '';
            const decoder = new TextDecoder();
            for await (const chunk of response.body || []) {
                bytes += chunk.length;
                if (bytes > 32 * 1024 * 1024) throw new Error('dav_response_too_large');
                text += decoder.decode(chunk, { stream: true });
            }
            text += decoder.decode();
            if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('dav_xml_unsafe');
            return { ok: response.ok, status: response.status, text: async () => text };
        };
        const auth = { username, password };
        const client = message.domain === 'contact' ? createNodeCarddavClient({ auth, carddav: { addressbook_url: url }, fetchImpl })
            : createNodeCaldavClient({ auth, caldav: { calendar_url: url }, fetchImpl });
        const method = message.domain === 'contact' ? 'fetchInitialContacts' : 'fetchInitialCalendar';
        const collections = await client.discoverCollections();
        const selected = Array.isArray(message.collections) ? message.collections : [];
        if (selected.length > 100 || collections.length > 100) throw new Error('dav_collections_limit');
        const items = [], removed_hrefs = [], cursors = {}, calendars = [];
        for (const collection of collections) {
            if (selected.length && !selected.includes(collection.url)) continue;
            const options = { addressbook_url: collection.url, calendar_url: collection.url, cursor: message.cursor?.[collection.url] };
            const response = await client[options.cursor ? 'fetchDelta' : method](options);
            if (!response.ok || response.complete !== true) throw new Error('dav_collection_incomplete');
            // Order delayed observations by the common DAV ingress clock, never
            // by lexical ETag or a device's local collection timestamp.
            items.push(...response.items.map(item => ({ ...item, source_collection: collection.url,
                version: { observed_at: now, etag: item.etag || null } })));
            removed_hrefs.push(...(response.removed_hrefs || []).map(href => new URL(href, collection.url).href));
            if (response.cursor != null) cursors[collection.url] = response.cursor;
            calendars.push({ id: collection.url, name: collection.name });
            if (items.length > 100000) throw new Error('dav_items_limit');
        }
        return reply(message, { ok: true, complete: true, items, removed_hrefs, calendars, groups: calendars, cursor: cursors });
    } catch (error) {
        const safe = /^dav_[a-z_]+$/.test(error.message) ? error.message : 'dav_read_failed';
        return reply(message, { ok: false, error: safe });
    } finally { inflight.delete(user); }
}
