// `public-events` frames of /ws/api (an account only): what a reader does to a public event
// besides reading it (server/public_events.js). Reading goes through `shows-nearby` kind `declared`.
import { isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { wsResponse } from './wsResponse.js';

export async function handleWsPublicEvents(data, connection) {
    if (data?.type !== 'public-events') return null;
    const userId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
    if (!userId || !await isWsApiPrincipalProvisioned(userId)) return wsResponse('public-events', data, false, { error: 'events_auth_required' });
    if (!connection?._wsApiPublicEvents) return wsResponse('public-events', data, false, { error: 'events_unavailable' });
    const result = await connection._wsApiPublicEvents.handle(data, userId);
    return wsResponse('public-events', data, result.ok !== false, result);
}
