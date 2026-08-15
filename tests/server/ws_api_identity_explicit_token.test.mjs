import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';

test('an explicit valid WS token replaces a stale attached principal', async () => {
    const previousSecret = process.env.JWT_SECRET;
    const secret = 'gv-ws-explicit-token-precedence-secret-2026';
    process.env.JWT_SECRET = secret;
    const identity = await import(`../../server/wsApiIdentity.js?gv_explicit_token=${Date.now()}`);
    const state = await import('../../server/wsApiState.js');
    const staleUserId = 'gv_stale_cookie_principal';
    const authenticatedUserId = 'gv_authenticated_principal';
    const connection = {
        _wsApiUserId: staleUserId,
        _wsApiAuthExpMs: Date.now() + 60_000
    };

    try {
        state.attachWsApiClientToUser(connection, staleUserId);
        const token = jwt.sign({ userId: authenticatedUserId }, secret, { expiresIn: '1h' });
        const resolved = identity.resolveWsApiPrincipal(connection, { token });

        assert.equal(resolved, authenticatedUserId);
        assert.equal(connection._wsApiUserId, authenticatedUserId);
        assert.ok(connection._wsApiAuthExpMs > Date.now());
        assert.equal(state.wsApiClientsByUserId.get(staleUserId)?.has(connection) || false, false);
        assert.equal(state.wsApiClientsByUserId.get(authenticatedUserId)?.has(connection) || false, true);
    } finally {
        state.detachWsApiClient(connection);
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    }
});
