import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

describe('opaque principal identity contract', () => {
    it('uses private credential aliases instead of phone-derived principals', () => {
        const schema = read('database/schema.sql');
        const identity = read('server/auth_identity.js');
        const crypto = read('server/auth_crypto.js');
        const server = read('server/wsPhoneLinkAuth.js');
        // The one local host of Tauri and iOS (`atome-server::local`); the iOS app runs it in process.
        const local = read('atome/servers/atome-server/src/local/local_auth_device.rs');
        const ios = read('platforms/ios/bevy-renderer/src/local_server.rs');

        expect(schema).toContain('principal_phone_credentials');
        expect(schema).toContain('principal_identity_aliases');
        expect(schema).toContain('principal_identity_migrations');
        expect(identity).toContain('withTransaction');
        expect(identity).toContain('principal_identity_aliases');
        expect(identity).not.toMatch(/UPDATE\s+events/i);
        expect(identity).not.toMatch(/UPDATE\s+snapshots/i);
        expect(crypto).toContain('crypto.randomUUID()');
        expect(server).toContain('generateOpaquePrincipalId');
        expect(local).toContain('Uuid::new_v4()');
        expect(ios).toContain('local::prepare(');

        for (const source of [crypto, server, local]) {
            expect(source).not.toMatch(/generateDeterministicUserId|Uuid::new_v5|uuidv5|SQUIRREL_USER_NAMESPACE|userNamespace/);
        }
    });
});
