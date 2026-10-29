// `site` frames of /ws/api (an account only): the websites of the user (server/site_services.js) — publishing,
// versions, planned operations, the address, the domain, the mail boxes and the hosting summary.
import { isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { wsResponse } from './wsResponse.js';

export async function handleWsSite(data, connection) {
    if (data?.type !== 'site') return null;
    const userId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
    if (!userId || !await isWsApiPrincipalProvisioned(userId)) return wsResponse('site', data, false, { error: 'AUTH_REQUIRED' });
    if (!connection?._wsApiSite) return wsResponse('site', data, false, { error: 'SOURCE_UNAVAILABLE' });
    try {
        const result = await connection._wsApiSite.handle(data, userId);
        if (!result) return wsResponse('site', data, false, { error: 'INVALID_ARGUMENT' });
        return wsResponse('site', data, result.ok !== false, result);
    } catch (error) {
        return wsResponse('site', data, false, { error: 'WRITE_FAILED', detail: error.message });
    }
}
