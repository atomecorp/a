import { TV_PROVIDERS } from './registry.js';

// All providers share the authorization gate. Provider-specific SDK/access data
// must come from distribution configuration, never from scraped player pages.
export function createTvProviderAdapters({ request = null } = {}) {
    return Object.fromEntries(TV_PROVIDERS.map(provider => [provider, Object.freeze({
        capabilities(route, context) {
            if (route.verification !== 'verified') return { ok: false, error: route.verification || 'RIGHTS_NOT_VERIFIED' };
            if (!route.platforms?.includes(context.platform)) return { ok: false, error: 'EMBED_NOT_ALLOWED' };
            if (route.countries?.length && !route.countries.includes(context.country)) return { ok: false, error: 'GEO_BLOCKED' };
            if (route.mode === 'external') return { ok: false, error: 'EXTERNAL_ONLY' };
            if (!['native', 'sdk'].includes(route.mode)) return { ok: false, error: 'NOT_CONFIGURED' };
            return { ok: true, mode: route.mode, observable: route.observable === true };
        },
        async resolveAccess(channel, route, context, signal) {
            const gate = this.capabilities(route, context);
            if (!gate.ok) return gate;
            if (!request) return { ok: false, error: 'NOT_CONFIGURED' };
            // Access descriptors are private to the player and are never returned by MCP.
            return request('resolve', { channel_id: channel.id, route_id: route.id, provider }, { signal });
        },
        async getEpg(channel, period, signal) {
            if (!request) return { ok: false, error: 'EPG_UNAVAILABLE' };
            return request('epg', { channel_id: channel.id, provider,
                from: new Date(period.from).toISOString(), to: new Date(period.to).toISOString() }, { signal });
        }
    })]));
}
export function validateTvAccess(access, route) {
    if (!access?.ok) return access;
    if (access.mode !== route.mode || !['native', 'sdk'].includes(access.mode)) return { ok: false, error: 'EMBED_NOT_ALLOWED' };
    if (access.mode === 'sdk') return { ok: false, error: 'NOT_CONFIGURED' };
    let url;
    try { url = new URL(access.source); } catch { return { ok: false, error: 'PLAYBACK_FAILED' }; }
    if (url.protocol !== 'https:' || url.username || url.password || !route.domains?.includes(url.hostname)) return { ok: false, error: 'EMBED_NOT_ALLOWED' };
    if (!['hls', 'dash', 'video'].includes(access.format)) return { ok: false, error: 'PLAYBACK_FAILED' };
    return access;
}
