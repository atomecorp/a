import { FastifyAdapter } from '../apis/unified/adole.js';
import { ensureRemoteSurfacePrincipal, ensureSurfaceAnnounced, getLocalSurfaceId } from '../apis/unified/adole_api/surfaces.js';

// The WebSocket client wraps the server frame in `data` ({ ok, status, data }):
// the catalogue (`channels`), the access descriptor and the EPG live there. Read
// flat, no route ever reached the service, so no channel could ever play.
const unwrapTvReply = (result) => {
    const data = result?.data && typeof result.data === 'object' ? result.data : null;
    if (!data) return result;
    const ok = result.ok === true && data.ok !== false;
    return { ...data, ok, ...(ok ? {} : { error: data.error || result.error || 'PROVIDER_UNAVAILABLE' }) };
};

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
        return signal?.aborted ? { ok: false, error: 'CANCELLED' } : unwrapTvReply(result);
    } catch { return { ok: false, error: 'NOT_CONFIGURED' }; }
}
