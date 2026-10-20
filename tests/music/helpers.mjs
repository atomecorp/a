import { expect, vi } from 'vitest';
import { validateParams, stableStringify } from '../../atome/src/squirrel/ai/agent_gateway_normalize.js';
import { MUSIC_OPERATION_TYPE } from '../../atome/src/shared/music_operation_contract.js';

export const config = { clientId: 'public-client', deezerProfile: '5', publicBase: 'https://atome.example' };
export const session = overrides => ({ access_token: 'private-access', refresh_token: 'private-refresh', expires_at: Date.now() + 1e7,
    authorization_id: 'authorization-session-1',
    authorized_at: Date.now(), identity: { id: 'stable-account', name: 'Alice' }, spotify_user_id: 'alice-spotify', scopes: [], ...overrides });
export function vaultWith(initial = session()) {
    let value = initial;
    return { readRecord: vi.fn(async name => { expect(name).toBe('music.spotify'); return structuredClone(value); }),
        storeRecord: vi.fn(async (name, record) => { expect(name).toBe('music.spotify'); value = structuredClone(record); }),
        removeRecord: vi.fn(name => { expect(name).toBe('music.spotify'); value = null; }) };
}
export function receiptBackend() {
    const states = new Map(), events = new Map();
    return { states, events,
        getStateCurrent: vi.fn(async id => structuredClone(states.get(id) || null)),
        commit: vi.fn(async event => {
            expect(event.scope).toBe('global'); expect(event.type).toBe('music_operation');
            expect(validateParams({ type: 'object', additionalProperties: false, properties: MUSIC_OPERATION_TYPE.schema }, event.payload.props).ok).toBe(true);
            if (events.has(event.id)) return { ok: events.get(event.id) === stableStringify(event) };
            const record = states.get(event.atome_id), expected = event.payload.expected_versions?.revision;
            if (expected !== undefined && expected !== record?.property_versions.revision) return { ok: false, error: 'property_version_conflict' };
            states.set(event.atome_id, { id: event.atome_id, owner_id: 'alice', type: event.type, project_id: null,
                properties: { ...record?.properties, ...event.payload.props }, property_versions: { revision: (record?.property_versions.revision || 0) + 1 } });
            events.set(event.id, stableStringify(event)); return { ok: true };
        }) };
}
export const response = (body, status = 200, headers = {}) => new Response(status === 204 ? null : JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', ...headers } });
export function providerDouble(routes) {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init = {}) => {
        const parsed = new URL(url), method = init.method || 'GET';
        const call = { url: parsed, method, init }; calls.push(call);
        const route = routes.find(([verb, pathname]) => verb === method && pathname === parsed.pathname);
        if (!route) throw new Error('Unexpected provider route: ' + method + ' ' + parsed.pathname);
        const result = await route[2](call);
        return result instanceof Response ? result : response(result);
    });
    return { calls, fetchImpl };
}
export const context = overrides => ({ principal: 'alice', vault: vaultWith(), config, check() {},
    signal: new AbortController().signal, receiptApi: receiptBackend(), ...overrides });
