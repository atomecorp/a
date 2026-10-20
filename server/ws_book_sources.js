// Free books and audiobooks from their official catalogs, fetched for the client
// that asked (Gutenberg sends no CORS header): `book-source` resolves a work's
// manifest from the provider's published catalog record (Gutenberg's RDF, the
// LibriVox API), `book-fetch` reads one byte range of one of its files. The client
// names a provider and a work id, never a URL: every address comes from the
// catalog record and every redirect is checked against the provider hosts, so
// this is not an open proxy. A download is the user's own gesture, one file at a
// time (Gutenberg's site is for human users; LibriVox limits its API).
import { lookup } from 'node:dns/promises';
import { createAddressRateLimit, createPublicSourceAccess } from './public_source_fetch.js';

const CHUNK_BYTES = 1536 * 1024;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 240;
// A manifest is read once per download, not once per chunk: LibriVox limits its API.
const MANIFEST_TTL_MS = 15 * 60_000;
const PROVIDERS = Object.freeze({
    gutenberg: { hosts: ['www.gutenberg.org', 'gutenberg.org'], id: /^[1-9][0-9]{0,6}$/ },
    librivox: { hosts: ['librivox.org', 'archive.org', 'www.archive.org'], suffixes: ['.archive.org'], id: /^[1-9][0-9]{0,6}$/ }
});
const manifests = new Map();

const reply = (message, type, fields) => ({ type, requestId: message.requestId || message.request_id || null,
    request_id: message.requestId || message.request_id || null, success: fields.ok === true, ...fields });
const allowedHost = (provider, host) => PROVIDERS[provider].hosts.includes(host)
    || (PROVIDERS[provider].suffixes || []).some(suffix => host.endsWith(suffix));
const { fail, request, readBounded, readChunk: readFileChunk } = createPublicSourceAccess({ allowedHost, sourceCode: 'book_source', fetchCode: 'book_fetch',
    chunkBytes: CHUNK_BYTES, maxFileBytes: MAX_FILE_BYTES });
const limited = createAddressRateLimit({ windowMs: WINDOW_MS, max: MAX_REQUESTS_PER_WINDOW });

const xmlText = value => String(value || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
const first = (text, pattern) => xmlText(pattern.exec(text)?.[1] || '');

// Gutenberg's per-book RDF record (its machine-readable catalog, public domain).
const gutenbergManifest = async (id, context) => {
    const response = await request('gutenberg', `https://www.gutenberg.org/cache/epub/${id}/pg${id}.rdf`, {}, context);
    if (!response.ok) throw fail(response.status === 404 ? 'book_source_not_found' : 'book_source_unavailable');
    const rdf = (await readBounded(response, MAX_CATALOG_BYTES)).toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(rdf)) throw fail('book_source_catalog_unsafe');
    const epub = new RegExp(`<pgterms:file rdf:about="(https://www\\.gutenberg\\.org/ebooks/${id}\\.epub3\\.images)"`).exec(rdf)?.[1];
    if (!epub) throw fail('book_source_format_missing');
    return { provider: 'gutenberg', id, kind: 'book', format: 'epub', title: first(rdf, /<dcterms:title>([\s\S]*?)<\/dcterms:title>/),
        author: first(rdf, /<dcterms:creator>[\s\S]*?<pgterms:name>([\s\S]*?)<\/pgterms:name>/),
        language: first(rdf, /<dcterms:language>[\s\S]*?<rdf:value[^>]*>([\s\S]*?)<\/rdf:value>/),
        rights: first(rdf, /<dcterms:rights>([\s\S]*?)<\/dcterms:rights>/), source_url: `https://www.gutenberg.org/ebooks/${id}`,
        files: [{ index: 0, title: '', url: epub, mime: 'application/epub+zip', name: `gutenberg_${id}.epub` }] };
};

// The LibriVox API record: the work and its sections, in reading order.
const librivoxManifest = async (id, context) => {
    const response = await request('librivox', `https://librivox.org/api/feed/audiobooks/?id=${id}&format=json&extended=1`, {}, context);
    if (!response.ok) throw fail(response.status === 404 ? 'book_source_not_found' : 'book_source_unavailable');
    const book = JSON.parse((await readBounded(response, MAX_CATALOG_BYTES)).toString('utf8'))?.books?.[0];
    if (!book || String(book.id) !== id) throw fail('book_source_not_found');
    const sections = (Array.isArray(book.sections) ? book.sections : [])
        .map(section => ({ order: Number(section.section_number), title: String(section.title || '').trim(), url: String(section.listen_url || ''),
            duration: Number(section.playtime) || 0 }))
        .filter(section => /^https:\/\//.test(section.url)).sort((a, b) => a.order - b.order);
    if (!sections.length) throw fail('book_source_format_missing');
    const author = (book.authors || []).map(entry => [entry.first_name, entry.last_name].filter(Boolean).join(' ')).join(', ');
    return { provider: 'librivox', id, kind: 'audiobook', format: 'mp3', title: String(book.title || '').trim(), author,
        language: String(book.language || ''), rights: 'LibriVox recordings are in the public domain.',
        source_url: String(book.url_librivox || `https://librivox.org/api/feed/audiobooks/?id=${id}`),
        files: sections.map((section, index) => ({ index, title: section.title, url: section.url, mime: 'audio/mpeg',
            duration_seconds: section.duration, name: `librivox_${id}_${String(index + 1).padStart(3, '0')}.mp3` })) };
};

const readManifest = async (provider, id, context) => {
    const key = `${provider}:${id}`, now = context.now();
    for (const [entry, value] of manifests) if (now - value.at >= MANIFEST_TTL_MS) manifests.delete(entry);
    if (manifests.has(key)) return manifests.get(key).manifest;
    const manifest = provider === 'gutenberg' ? await gutenbergManifest(id, context) : await librivoxManifest(id, context);
    manifests.set(key, { at: now, manifest });
    return manifest;
};

const readChunk = (manifest, message, context) => readFileChunk(manifest.provider, manifest.files[Number(message.file)], Number(message.offset), context);

export async function handleWsBookSource(message, address, { fetchResource = fetch, resolve = lookup, now = Date.now } = {}) {
    if (message?.type !== 'book-source' && message?.type !== 'book-fetch') return null;
    const type = `${message.type}-response`;
    const provider = String(message.provider || ''), id = String(message.id || '');
    if (!Object.hasOwn(PROVIDERS, provider) || !PROVIDERS[provider].id.test(id)) return reply(message, type, { ok: false, error: 'book_source_invalid' });
    if (limited(address, now())) return reply(message, type, { ok: false, error: 'book_source_rate_limited' });
    const context = { fetchResource, resolve, now };
    try {
        const manifest = await readManifest(provider, id, context);
        if (message.type === 'book-source') return reply(message, type, { ok: true, manifest });
        return reply(message, type, { ok: true, ...(await readChunk(manifest, message, context)) });
    } catch (error) {
        const code = String(error?.code || '');
        return reply(message, type, { ok: false, error: code.startsWith('book_') ? code : 'book_source_unavailable' });
    }
}
