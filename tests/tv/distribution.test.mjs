import test from 'node:test';
import assert from 'node:assert/strict';
import { createTvDistribution } from '../../server/tvDistribution.js';
const time = Date.parse('2026-10-01T12:00:00Z');
const principal = { user_id: 'u', surface_id: 's', platform: 'web', country: 'FR' };
const input = { surface_id: 's', project_id: 'p', channel_id: 'france2', route_id: 'official' };
const route = { id: 'official', channel_id: 'france2', provider: 'francetv', mode: 'native', verification: 'verified',
    user_ids: ['u'], project_ids: ['p'], platforms: ['web'], countries: ['FR'], domains: ['media.example.test'],
    access: { source: 'https://media.example.test/live?token=private', format: 'hls', expires_at: '2026-10-01T12:01:00Z' } };
const setup = value => createTvDistribution({ readConfiguration: () => ({ routes: value }), now: () => time });
test('private distribution catalogue omits access credentials and filters user/project grants', async () => {
    const distribution = setup([route]);
    const result = await distribution('catalog', input, principal);
    assert.equal(result.channels.filter(c => c.id === 'france2').length, 1);
    assert.equal(result.channels.find(c => c.id === 'france2').routes.length, 1);
    assert.ok(!JSON.stringify(result).includes('token'));
    const wrong = await distribution('catalog', { ...input, project_id: 'other' }, principal);
    assert.equal(wrong.channels.find(c => c.id === 'france2').routes.length, 0);
    assert.equal((await distribution('resolve', input, { ...principal, user_id: 'other' })).error, 'RIGHTS_NOT_VERIFIED');
});
test('resolve enforces identity, surface, expiry, territory, protocol, domains and DRM', async () => {
    assert.equal((await setup([route])('resolve', input, principal)).ok, true);
    assert.equal((await setup([route])('resolve', input, { ...principal, surface_id: 'other' })).error, 'NO_ACTIVE_CLIENT');
    assert.equal((await setup([route])('resolve', input, { ...principal, country: null })).error, 'GEO_BLOCKED');
    assert.equal((await setup([{ ...route, drm: true }])('resolve', input, principal)).error, 'DRM_UNSUPPORTED');
    for (const source of ['https://evil.example/live', 'http://media.example.test/live', 'https://u:p@media.example.test/live'])
        assert.equal((await setup([{ ...route, access: { ...route.access, source } }])('resolve', input, principal)).error, 'EMBED_NOT_ALLOWED');
    for (const expires_at of ['2026-10-01T11:59:00Z', '2026-10-02T12:00:00Z', 'invalid'])
        assert.equal((await setup([{ ...route, access: { ...route.access, expires_at } }])('resolve', input, principal)).error, 'NOT_CONFIGURED');
});
test('SoFast and external access cannot be promoted to integrated playback', async () => {
    assert.equal((await setup([{ ...route, provider: 'sofast', verification: 'NOT_CONFIGURED' }])('resolve', input, principal)).error, 'RIGHTS_NOT_VERIFIED');
    assert.equal((await setup([{ ...route, mode: 'external' }])('resolve', input, principal)).error, 'EXTERNAL_ONLY');
});
