import { describe, expect, it, vi } from 'vitest';
import { createWsPhoneLinkHandler } from '../../server/wsPhoneLinkAuth.js';

describe('coordinated authentication protocol cutover', () => {
    it('rejects every retired password, OTP, phone lookup and provisioning action before database access', async () => {
        const query = vi.fn();
        const { handle } = createWsPhoneLinkHandler({ projectRoot: new URL('../../temp', import.meta.url).pathname,
            jwtSecret: () => 'isolated-test-auth-secret'.repeat(3), sendLink: vi.fn(),
            database: { getDataSourceAdapter: () => ({}), query, withTransaction: work => work() } });
        for (const action of ['login', 'register', 'bootstrap', 'lookup-phone', 'request-phone-verification',
            'verify-phone-verification', 'provision-account', 'change-password', 'refresh', 'delete']) {
            expect(await handle({ type: 'auth', action, requestId: action }, {}, '192.0.2.1'))
                .toMatchObject({ ok: false, error: 'auth_protocol_upgrade_required' });
        }
        expect(query).not.toHaveBeenCalled();
    });
});
