// `objective-network` frames of /ws/api (an account only): the people found for an objective, a report
// (server/objective_network.js). Being findable is written by the person's own Atomes, never by this frame.
import { isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { wsResponse } from './wsResponse.js';

export async function handleWsObjectiveNetwork(data, connection) {
    if (data?.type !== 'objective-network') return null;
    const userId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
    if (!userId || !await isWsApiPrincipalProvisioned(userId)) return wsResponse('objective-network', data, false, { error: 'objective_network_auth_required' });
    if (!connection?._wsApiObjectiveNetwork) return wsResponse('objective-network', data, false, { error: 'objective_network_unavailable' });
    const result = await connection._wsApiObjectiveNetwork.handle(data, userId);
    return wsResponse('objective-network', data, result.ok !== false, result);
}
