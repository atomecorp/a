import { broadcastAtomeRealtimePatch } from './atomeRealtime.js';

export async function handleWsAtomeRealtimeOperation({
  data,
  connection,
  requesterId,
  requestId
} = {}) {
  const atomeId = data?.atome_id || data?.id;
  const particles = data?.particles || data?.properties;

  if (!atomeId) {
    return { type: 'atome-response', requestId, success: false, error: 'Missing atome id' };
  }
  if (!particles || typeof particles !== 'object' || Array.isArray(particles)) {
    return { type: 'atome-response', requestId, success: false, error: 'Missing or invalid particles data' };
  }
  if (!requesterId) {
    return {
      type: 'atome-response', requestId, success: false, ok: false,
      error: 'Unauthenticated (token required)'
    };
  }

  const result = await broadcastAtomeRealtimePatch({
    atomeId,
    particles,
    senderUserId: requesterId,
    senderConnection: connection
  });
  if (!result?.ok) {
    return {
      type: 'atome-response', requestId, success: false, ok: false,
      error: result?.error || 'property_write_denied'
    };
  }
  if (data?.noReply === true) return null;
  return {
    type: 'atome-response', requestId, success: true,
    message: 'Realtime patch broadcasted'
  };
}
