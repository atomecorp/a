import { MusicFailure, musicArtworkUrl } from '../../atome/src/squirrel/music/contracts.js';

// The Deezer profile entered in Passwords & keys must exist in the public catalog.
export async function verifyDeezerProfile(id, { fetchImpl, signal }) {
    if (!/^[0-9]{1,20}$/.test(id)) throw new Error('provider_key_invalid');
    let response;
    try { response = await fetchImpl('https://api.deezer.com/user/' + id, { method: 'GET', redirect: 'error', signal }); }
    catch { throw new Error('provider_connection_failed'); }
    if (!response.ok) throw new Error('provider_connection_failed');
    const body = await response.json().catch(() => null);
    if (String(body?.id) !== id) throw new Error('provider_key_invalid');
}

// Verified public catalog contract only. No guessed OAuth, private library or playback SDK.
export async function readDeezerCatalog(action, input, ctx) {
    if (action === 'get_state') return { ok: true, provider: 'deezer', supported: true, configured: true,
        state: 'catalog_only', capabilities: ['get_state', 'search', 'open_item'] };
    if (action === 'open_item' && input.kind === 'song' && /^[0-9]{1,30}$/.test(input.id))
        return { ok: true, url: 'https://www.deezer.com/track/' + input.id, playback: 'opened_unconfirmed' };
    if (action !== 'search' || input.kind && input.kind !== 'song') return { ok: false, error: 'DEVELOPER_ACCESS_REQUIRED' };
    const url = new URL('https://api.deezer.com/search');
    url.search = new URLSearchParams({ q: input.query, limit: String(input.limit || 10), index: String(input.offset || 0) }).toString();
    ctx.check();
    let response;
    try { response = await ctx.fetchImpl(url.toString(), { method: 'GET', redirect: 'error', signal: ctx.signal }); }
    catch { throw new MusicFailure('PROVIDER_UNAVAILABLE'); }
    if (!response.ok) throw new MusicFailure(response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE');
    let body;
    try { body = await response.json(); } catch { throw new MusicFailure('PROVIDER_REJECTED'); }
    ctx.check();
    if (body?.error || !Array.isArray(body?.data)) throw new MusicFailure('PROVIDER_REJECTED');
    const items = body.data.filter(item => item?.type === 'track' && Number.isSafeInteger(item.id) && item.id > 0 && typeof item.title === 'string')
        .map((item) => {
            const cover = musicArtworkUrl(item.album?.cover_medium), duration = Number(item.duration);
            return { id: String(item.id), name: item.title, kind: 'song', artist: String(item.artist?.name || ''),
                ...(cover ? { artwork_url: cover } : {}), ...(duration > 0 ? { duration } : {}) };
        });
    return { ok: true, items, has_more: typeof body.next === 'string' && body.next.length > 0 };
}
