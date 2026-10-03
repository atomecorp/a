import { test, expect, vi } from 'vitest';
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/surfaces.js', () => ({
    ensureRemoteSurfacePrincipal: async () => ({ ok: true }), ensureSurfaceAnnounced: async () => ({ ok: true }),
    getLocalSurfaceId: () => 'surface', describeLocalSurface: () => ({ surface_id: 'surface', platform: 'browser' })
}));
vi.mock('../../eVe/intuition/tools/tv_viewer.js', () => ({ createTvViewer: () => ({ bind() {}, player: {}, close: async () => ({ ok: true }) }) }));
vi.mock('../../eVe/intuition/tools/finder.js', () => ({ openFinderPanel: async () => ({}), closeFinderPanel: async () => ({}) }));
import { FastifyAdapter } from '../../atome/src/squirrel/apis/unified/adole.js';
import { requestTvDistribution } from '../../atome/src/squirrel/tv/transport.js';
import { executeTvCommand } from '../../eVe/intuition/tools/tv.js';
test('TV transport preserves data envelope and catalog errors are never converted to empty success', async () => {
    const send = vi.spyOn(FastifyAdapter.ws, 'send');
    try {
        send.mockResolvedValue({ ok: true, data: { ok: true, channels: [{ id: 'france2', routes: [] }] } });
        expect(await requestTvDistribution('catalog')).toMatchObject({ ok: true, channels: [{ id: 'france2' }] });
        expect(send.mock.calls[0][0]).toMatchObject({ type: 'tv', action: 'catalog', surface_id: 'surface' });
        send.mockResolvedValue({ ok: true, data: { ok: false, error: 'AUTH_REQUIRED' } });
        expect(await executeTvCommand('list_channels', {})).toMatchObject({ ok: false, error: 'AUTH_REQUIRED' });
        send.mockResolvedValue({ ok: true, data: { ok: true } });
        expect(await executeTvCommand('list_channels', {})).toMatchObject({ ok: false, error: 'PROVIDER_UNAVAILABLE' });
    } finally { send.mockRestore(); }
});
test('a catalog reply arriving after close is cancelled', async () => {
    let finish; const send = vi.spyOn(FastifyAdapter.ws, 'send').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    try {
        const pending = executeTvCommand('list_channels', {});
        await new Promise(resolve => setTimeout(resolve, 0)); await executeTvCommand('close', {});
        finish({ ok: true, data: { ok: true, channels: [] } }); expect((await pending).error).toBe('CANCELLED');
    } finally { send.mockRestore(); }
});
