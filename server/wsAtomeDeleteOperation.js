import { commitAtomeEvent } from './atomeRoutes.orm.js';
import { broadcastAtomeDelete } from './atomeRealtime.js';

export async function handleWsAtomeDeleteOperation({
    data,
    requesterId,
    connection
} = {}) {
    const atomeId = data?.atome_id || data?.id || null;
    if (!requesterId) {
        return { success: false, ok: false, error: 'Unauthenticated (token required)' };
    }
    if (!atomeId) {
        return { success: false, ok: false, error: 'Missing atome_id' };
    }

    const committed = await commitAtomeEvent({
        authenticatedUserId: requesterId,
        event: {
            atome_id: atomeId,
            kind: 'delete',
            actor: { type: 'user', id: requesterId },
            tx_id: data?.tx_id || data?.txId || null,
            gesture_id: data?.gesture_id || data?.gestureId || null
        }
    });
    if (!committed.ok) {
        return { success: false, ok: false, error: committed.error };
    }

    if (committed.inserted) {
        await broadcastAtomeDelete({
            atomeId,
            senderUserId: requesterId,
            senderConnection: connection
        });
    }
    return {
        success: true,
        ok: true,
        message: 'Atome deleted',
        data: { event: committed.event }
    };
}
