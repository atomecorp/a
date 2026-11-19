import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

describe('opaque principal identity contract', () => {
    it('uses private credential aliases instead of phone-derived principals', () => {
        const schema = read('database/schema.sql');
        // atome-server's sign-up names a new account by a random id, never one derived from its phone.
        const signup = read('atome/servers/atome-server/src/auth/signup.rs');
        // The one local host of Tauri and iOS (`atome-server::local`); the iOS app runs it in process.
        const local = read('atome/servers/atome-server/src/local/local_auth_device.rs');
        const ios = read('platforms/ios/bevy-renderer/src/local_server.rs');

        expect(schema).toContain('principal_phone_credentials');
        expect(schema).toContain('principal_identity_aliases');
        expect(schema).toContain('principal_identity_migrations');
        expect(signup).toContain('let principal = uuid::Uuid::new_v4().to_string();');
        expect(signup).not.toMatch(/UPDATE\s+(events|snapshots)/i);
        expect(local).toContain('Uuid::new_v4()');
        expect(ios).toContain('local::prepare(');

        for (const source of [signup, local]) {
            expect(source).not.toMatch(/generateDeterministicUserId|Uuid::new_v5|uuidv5|SQUIRREL_USER_NAMESPACE|userNamespace/);
        }
    });
});
