// Reading a file from a public provider for the client that asked (free books,
// the Médiathèque): the client names a provider and an item, never a URL. Every
// address comes from the provider's own record and is checked before it is
// requested (https, an allowed host of that provider, a public address), every
// redirect is followed by hand and checked the same way, and a file travels in
// byte ranges over /ws/api: this is not an open proxy. `sourceCode` / `fetchCode`
// prefix the error codes of the owner using it (`book_source`, `book_fetch`…).
import { publicDavAddress } from './ws_personal_import.js';

export const createPublicSourceAccess = ({ allowedHost, sourceCode, fetchCode, chunkBytes, maxFileBytes }) => {
    const fail = code => Object.assign(new Error(code), { code });
    const checkedUrl = async (provider, input, resolve) => {
        const url = new URL(input);
        if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || input.length > 2048)
            throw fail(`${sourceCode}_url_invalid`);
        if (!allowedHost(provider, url.hostname)) throw fail(`${sourceCode}_host_not_allowed`);
        const addresses = await resolve(url.hostname, { all: true });
        if (!addresses.length || addresses.some(entry => !publicDavAddress(entry.address))) throw fail(`${sourceCode}_address_invalid`);
        return url.href;
    };
    // Redirects are followed by hand: each target is checked before it is requested.
    const request = async (provider, target, headers, { fetchResource, resolve }) => {
        let url = target;
        for (let hop = 0; hop < 5; hop += 1) {
            const response = await fetchResource(await checkedUrl(provider, url, resolve), { headers, redirect: 'manual', signal: AbortSignal.timeout(20000) });
            if (response.status < 300 || response.status >= 400) return response;
            const location = response.headers.get('location');
            if (!location) throw fail(`${sourceCode}_redirect_invalid`);
            url = new URL(location, url).href;
        }
        throw fail(`${sourceCode}_redirect_loop`);
    };
    const readBounded = async (response, maxBytes) => {
        const parts = [];
        let total = 0;
        for await (const chunk of response.body || []) {
            total += chunk.length;
            if (total > maxBytes) throw fail(`${sourceCode}_response_too_large`);
            parts.push(chunk);
        }
        return Buffer.concat(parts);
    };
    // One byte range of `file` ({ url, mime }) from `offset`.
    const readChunk = async (provider, file, offset, context) => {
        if (!file || !Number.isSafeInteger(offset) || offset < 0 || offset >= maxFileBytes) throw fail(`${fetchCode}_range_invalid`);
        const response = await request(provider, file.url, { Range: `bytes=${offset}-${offset + chunkBytes - 1}` }, context);
        if (response.status === 416) throw fail(`${fetchCode}_range_invalid`);
        if (response.status !== 206 && !(response.status === 200 && offset === 0)) throw fail(`${sourceCode}_unavailable`);
        const range = /bytes (\d+)-(\d+)\/(\d+)/.exec(response.headers.get('content-range') || '');
        // A whole answer may come without its length (chunked transfer, Flickr): its bytes are its size.
        const whole = !range && !response.headers.get('content-length');
        const declared = range ? Number(range[3]) : Number(response.headers.get('content-length'));
        if (!whole && (!Number.isSafeInteger(declared) || declared <= 0 || declared > maxFileBytes)) throw fail(`${sourceCode}_size_invalid`);
        if (range && Number(range[1]) !== offset) throw fail(`${sourceCode}_range_mismatch`);
        const bytes = await readBounded(response, response.status === 206 ? chunkBytes : maxFileBytes);
        const total = whole ? bytes.length : declared;
        if (total <= 0) throw fail(`${sourceCode}_size_invalid`);
        // A server ignoring Range sends the whole file once: the client receives it in one piece.
        // `base64`, never `data`: the WebSocket client takes a reply's `data` as its envelope.
        return { base64: bytes.toString('base64'), offset, length: bytes.length, total, mime: file.mime };
    };
    return { fail, request, readBounded, readChunk };
};

// At most `max` requests per address within `windowMs`.
export const createAddressRateLimit = ({ windowMs, max }) => {
    const requestsByAddress = new Map();
    return (address, now) => {
        const key = String(address || 'unknown');
        const recent = (requestsByAddress.get(key) || []).filter(at => now - at < windowMs);
        if (recent.length >= max) return true;
        recent.push(now); requestsByAddress.set(key, recent);
        if (requestsByAddress.size > 10000) for (const [entry, times] of requestsByAddress) if (times.every(at => now - at >= windowMs)) requestsByAddress.delete(entry);
        return false;
    };
};
