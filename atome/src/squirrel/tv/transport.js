import { FastifyAdapter } from '../apis/unified/adole.js';
import { ensureRemoteSurfacePrincipal, ensureSurfaceAnnounced, getLocalSurfaceId } from '../apis/unified/adole_api/surfaces.js';

// Reuse the authenticated application WebSocket. Resolve responses are private
// player descriptors and never pass through runtime/MCP result projection.
export async function requestTvDistribution(action, input = {}, { signal } = {}) {
    if (signal?.aborted) return { ok: false, error: 'CANCELLED' };
    const principal = await ensureRemoteSurfacePrincipal();
    if (!principal.ok) return { ok: false, error: 'AUTH_REQUIRED' };
    const announced = await ensureSurfaceAnnounced();
    if (!announced.ok && !announced.success) return { ok: false, error: 'NO_ACTIVE_CLIENT' };
    try {
        const result = await FastifyAdapter.ws.send({ type: 'tv', action, ...input,
            surface_id: getLocalSurfaceId(), project_id: globalThis.window?.__eveWorkspaceMode?.projectId || null });
        return signal?.aborted ? { ok: false, error: 'CANCELLED' } : result;
    } catch { return { ok: false, error: 'NOT_CONFIGURED' }; }
}
