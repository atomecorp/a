import { test, expect, vi } from 'vitest';
import { resolveOpenAiCredentialStatus } from '../../atome/src/squirrel/ai/provider_client.js';

for (const status of [null, {}, { configured: null }]) test('unreadable vault status preserves legacy credentials: ' + JSON.stringify(status), async () => {
 const securityApi = { readToken: vi.fn(), removeToken: vi.fn(), listTokens: vi.fn() };
 await expect(resolveOpenAiCredentialStatus({ userId: 'fixture-owner', securityApi,
  providerRequest: async () => status })).rejects.toThrow('provider_credential_status_invalid');
 expect(securityApi.readToken).not.toHaveBeenCalled();
 expect(securityApi.removeToken).not.toHaveBeenCalled();
});
