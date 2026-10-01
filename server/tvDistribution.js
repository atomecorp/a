import { projectTvPrograms } from '../atome/src/squirrel/tv/epg.js';
import { TV_CHANNELS, TV_PROVIDERS } from '../atome/src/squirrel/tv/registry.js';
import { tvPeriod } from '../atome/src/squirrel/tv/contracts.js';
import { validateTvAccess } from '../atome/src/squirrel/tv/providers.js';
import { getWsApiSurface } from './wsApiState.js';
import { wsResponse, wsErrorResponse } from './wsResponse.js';

// Private distribution descriptors are supplied by an operator after rights verification.
// No provider page is scraped and no credentials or playback URLs enter the catalogue.
export function createTvDistribution({ readConfiguration, now = Date.now } = {}) {
    const failure = error => ({ ok: false, error });
    return async (action, input, principal) => {
        if (!principal?.user_id) return failure('AUTH_REQUIRED');
        if (!principal.surface_id || input.surface_id !== principal.surface_id) return failure('NO_ACTIVE_CLIENT');
        let configuration;
        try { configuration = readConfiguration?.() || {}; } catch { return failure('NOT_CONFIGURED'); }
        const routes = Array.isArray(configuration.routes) ? configuration.routes : [];
        const permitted = route => route.verification === 'verified' && TV_PROVIDERS.includes(route.provider)
            && route.user_ids?.includes(principal.user_id)
            && route.project_ids?.includes(input.project_id || null);
        const matching = routes.filter(permitted);
        if (action === 'catalog') {
            const channels = TV_CHANNELS.map(channel => ({ id: channel.id,
                current_program: matching.filter(route => route.channel_id === channel.id && (!route.countries?.length || route.countries.includes(principal.country))).flatMap(route =>
                    projectTvPrograms(route.programs, { channel_id: channel.id, from: now(), to: now() + 1, now: now() }))[0] || null,
                routes: matching.filter(route => route.channel_id === channel.id).map(route => ({
                    id: route.id, provider: route.provider, verification: route.verification,
                    mode: route.mode, platforms: route.platforms || [], countries: route.countries || [], domains: route.domains || [],
                    priority: Number(route.priority) || 0, observable: route.observable === true
                })) }));
            return { ok: true, channels };
        }
        if (!['resolve', 'epg'].includes(action)) return failure('INVALID_ARGUMENT');
        const channel = TV_CHANNELS.find(item => item.id === input.channel_id);
        if (!channel) return failure('CHANNEL_NOT_FOUND');
        const route = matching.find(item => item.channel_id === channel.id
            && (action === 'epg' || item.id === input.route_id));
        if (!route) return failure('RIGHTS_NOT_VERIFIED');
        if (!route.platforms?.includes(principal.platform === 'browser' ? 'web' : principal.platform)) return failure('EMBED_NOT_ALLOWED');
        if (route.countries?.length && !route.countries.includes(principal.country)) return failure('GEO_BLOCKED');
        if (action === 'epg') {
            const period = tvPeriod(input, now());
            if (!period) return failure('INVALID_ARGUMENT');
            if (!Array.isArray(route.programs)) return failure('EPG_UNAVAILABLE');
            return { ok: true, programs: route.programs.filter(item => item.channel_id === channel.id
                && Date.parse(item.end) > period.from && Date.parse(item.start) < period.to)
                .map(item => ({ id: item.id, channel_id: channel.id, title: item.title, description: item.description,
                    start: item.start, end: item.end, provenance: item.provenance,
                    fetched_at: item.fetched_at, expires_at: item.expires_at })) };
        }
        if (route.mode === 'external') return failure('EXTERNAL_ONLY');
        if (route.drm) return failure('DRM_UNSUPPORTED');
        // Only an expiring authorized URL is eligible. Refresh/minting remains provider-owned.
        const expiry = Date.parse(route.access?.expires_at);
        if (!Number.isFinite(expiry) || expiry <= now() || expiry > now() + 600000) return failure('NOT_CONFIGURED');
        const access = validateTvAccess({ ok: true, mode: route.mode, source: route.access.source,
            format: route.access.format, expires_at: route.access.expires_at }, route);
        return access;
    };
}
const distribution = createTvDistribution({ readConfiguration: () => JSON.parse(process.env.ATOME_TV_DISTRIBUTION_CONFIG || '{}') });
export async function handleAuthenticatedTvOperation(message, connection, userId) {
    // The existing authenticated WS router owns principal resolution; payload identity is ignored.
    const result = await distribution(String(message.action || ''), message, {
        user_id: userId, surface_id: connection._wsApiSurfaceId,
        platform: getWsApiSurface(userId, connection._wsApiSurfaceId)?.platform, country: null
    });
    return result.ok ? wsResponse('tv', message, true, result) : wsErrorResponse('tv', message, result.error);
}
