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

  return {
    type: 'atome-response', requestId, success: false, ok: false,
    error: 'canonical_event_commit_required'
  };
}
