// `scheduled-send` frames of /ws/api (an account only): save, cancel, send now, read and list the
// owner's scheduled sends (server/scheduled_sends.js).
import { isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { wsResponse } from './wsResponse.js';

export async function handleWsScheduledSends(data, connection) {
    if (data?.type !== 'scheduled-send') return null;
    const userId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
    if (!userId || !await isWsApiPrincipalProvisioned(userId)) return wsResponse('scheduled-send', data, false, { error: 'scheduled_auth_required' });
    if (!connection?._wsApiScheduledSends) return wsResponse('scheduled-send', data, false, { error: 'scheduled_unavailable' });
    try {
        const result = await connection._wsApiScheduledSends.handle(data, userId);
        return wsResponse('scheduled-send', data, result.ok !== false, result);
    } catch (error) {
        return wsResponse('scheduled-send', data, false, { error: error.message || 'scheduled_failed' });
    }
}
