import { test, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createProviderCredentialVault } from '../../server/providerCredentialVault.js';
import { handleWsAiProviderOperation } from '../../server/wsAiProviderOperations.js';
import { resolveOpenAiCredentialStatus } from '../../atome/src/squirrel/ai/provider_client.js';

for (const status of [null, {}, { configured: null }]) test('unreadable vault status preserves legacy credentials: ' + JSON.stringify(status), async () => {
 const securityApi = { readToken: vi.fn(), removeToken: vi.fn(), listTokens: vi.fn() };
 await expect(resolveOpenAiCredentialStatus({ userId: 'fixture-owner', securityApi,
  providerRequest: async () => status })).rejects.toThrow('provider_credential_status_invalid');
 expect(securityApi.readToken).not.toHaveBeenCalled();
 expect(securityApi.removeToken).not.toHaveBeenCalled();
});

test('a stored OpenAI key survives vault recreation; storage errors and refusal remain distinct from absence', async () => {
 fs.mkdirSync('temp', { recursive: true });
 const root = fs.mkdtempSync(path.resolve('temp/provider-reopen-'));
 try {
  await createProviderCredentialVault({ root, secret: 'fixture-master' }).store('openai', 'fixture-reopen-key');
  const reopened = createProviderCredentialVault({ root, secret: 'fixture-master' });
  const connection = Object.assign(new EventEmitter(), { _wsApiUserId: 'fixture-owner', send() {} });
  const dependencies = { resolvePrincipal: c => c._wsApiUserId, provisioned: async () => true,
   fetchImpl: async () => Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }] }) };
  const h = { dependencies, call: (action, payload = {}) => handleWsAiProviderOperation({
   type: 'ai-provider', requestId: crypto.randomUUID(), action, payload }, connection, dependencies) };
  h.dependencies.resolveVault = async () => reopened;
  expect(await h.call('credential.status')).toMatchObject({ ok: true, configured: true });
  expect(await h.call('responses', { input: 'hello' })).toMatchObject({ ok: true, data: { output: expect.any(Array) } });
  h.dependencies.fetchImpl = async () => Response.json({ error: { code: 'invalid_api_key' } }, { status: 401 });
  expect(await h.call('responses', { input: 'hello' })).toMatchObject({ ok: false, error: 'invalid_api_key' });
  expect(await h.call('credential.status')).toMatchObject({ ok: true, configured: true });
  h.dependencies.resolveVault = async () => createProviderCredentialVault({ root, secret: 'wrong-master' });
  expect(await h.call('credential.status')).toMatchObject({ ok: false, error: 'provider_operation_failed' });
  h.dependencies.resolveVault = async () => createProviderCredentialVault({ root: path.join(root, 'empty'), secret: 'fixture-master' });
  expect(await h.call('credential.status')).toMatchObject({ ok: true, configured: false });
  expect(await h.call('responses', { input: 'hello' })).toMatchObject({ ok: false, error: 'no_ai_key_configured' });
 } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
