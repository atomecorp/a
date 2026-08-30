import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { handleWsApiAccountProvision } from '../../server/wsApiAuthProvisioning.js';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

describe('explicit provisioning and isolated guest contract', () => {
    it('keeps Fastify provisioning explicit, verified and idempotent', () => {
        const schema = read('database/schema.sql');
        const identity = read('server/auth_identity.js');
        const adole = read('database/adole.js');
        const provisioning = read('server/wsApiAuthProvisioning.js');
        const server = read('server/server.js');

        expect(schema).toContain('account_provision_operations');
        expect(schema).toContain('guest_workspace_principals');
        expect(identity).toContain('const credentialless = (legacyUsers || []).filter');
        expect(identity).toContain('INSERT INTO guest_workspace_principals');
        expect(identity).toContain("SET atome_type = 'guest_workspace'");
        expect(adole).toContain('isGuestWorkspacePrincipal');
        expect(provisioning).toContain("action !== 'account-provision'");
        expect(provisioning).toContain("message?.intent === 'account_provision'");
        expect(provisioning).toContain('remote_identity_unverified');
        expect(provisioning).toContain('operation_digest');
        expect(provisioning).not.toContain('local_principal_id');
        expect(server).toContain('handleWsApiAccountProvision');
    });

    it('fails closed before any credential or account write when remote identity is not verified', async () => {
        const response = await handleWsApiAccountProvision({
            type: 'auth',
            action: 'account-provision',
            requestId: 'provision-negative',
            intent: 'account_provision',
            operation_id: 'operation-id-is-long-enough',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            verified_server_fingerprint: 'sha256:untrusted',
            phone: '+15550001111',
            password: 'valid-password'
        }, {
            dataSource: { query: async () => { throw new Error('must_not_write'); } },
            jwtSecret: () => 'x'.repeat(32),
            generatePrincipalId: () => 'must-not-generate',
            attach: () => { throw new Error('must_not_attach'); }
        });
        expect(response).toMatchObject({ success: false, error: 'remote_identity_unverified' });
    });

    it('rejects unprovisioned remote identities without creating a shadow account', () => {
        const server = read('server/server.js');
        const wsOperations = read('server/wsAtomeOperations.js');
        const authUsers = read('server/auth_users.js');
        const directMessage = server.slice(server.indexOf("if (data.type === 'direct-message')"), server.indexOf("if (data.type === 'auth')"));

        expect(wsOperations).toContain('remote_account_not_provisioned');
        expect(directMessage).toContain('remote_account_not_provisioned');
        expect(directMessage).not.toContain('createUserAtome(');
        expect(authUsers).not.toContain('ensureAnonymousUser');
        expect(authUsers).not.toContain("ANONYMOUS_PHONE");
        expect(server).not.toContain('db.isAnonymousUser');
    });

    it('keeps browser guests local, random and explicitly adoptable', () => {
        const session = read('atome/src/squirrel/apis/unified/adole_api/session.js');
        const account = read('atome/src/squirrel/apis/unified/adole_api/auth_methods_session_account.js');
        const workspace = read('atome/src/squirrel/apis/unified/adole_api/auth_workspace.js');
        const adapter = read('atome/src/squirrel/apis/unified/adole_adapter.js');
        const atomes = read('atome/src/squirrel/apis/unified/adole_api/atomes.js');
        const guestStore = read('atome/src/squirrel/apis/unified/adole_api/guest_workspace_store.js');

        expect(session).toContain("squirrel_guest_v1");
        expect(account).toContain('async startGuest');
        expect(account).toContain('globalThis.crypto?.randomUUID?.()');
        expect(account).toContain('guest_adoption_confirmation_required');
        expect(account).toContain('async leaveGuest');
        expect(workspace).toContain('adoptBrowserGuestWorkspace');
        expect(workspace).toContain("type: 'guest-adoption'");
        expect(atomes).toContain("source: 'local_guest'");
        expect(atomes).toContain('commitGuestAtome');
        expect(guestStore).toContain("squirrel_guest_workspace_v1");
        expect(guestStore).toContain('globalThis.indexedDB');
        expect(guestStore).not.toContain('localStorage');
        expect(workspace).toContain("action: 'stage-file'");
        expect(adapter).toContain('async provisionAccount');
        expect(workspace).toContain('adoption_confirmed');
        expect(account).not.toContain('bootstrapBackend(backend');
    });
});
