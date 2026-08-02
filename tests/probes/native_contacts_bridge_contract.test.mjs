import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';

const root = new URL('../../', import.meta.url);

test('desktop Contacts bridge uses CNContactStore without JXA or native persistence', async () => {
    const source = await readFile(new URL('platforms/desktop-tauri/src/native_contacts.rs', root), 'utf8');

    assert.match(source, /CNContactStore/);
    assert.match(source, /requestAccessForEntityType_completionHandler/);
    assert.match(source, /authorizationStatusForEntityType/);
    assert.match(source, /"not_determined"/);
    assert.match(source, /"authorized"/);
    assert.match(source, /"denied"/);
    assert.match(source, /"restricted"/);
    assert.doesNotMatch(source, /osascript|MACOS_CONTACTS_JXA|Application\('Contacts'\)/);
    assert.doesNotMatch(source, /localStorage|File::create|OpenOptions/);
});

test('desktop bundle declares Contacts permission and scoped framework dependencies', async () => {
    const [plist, cargo] = await Promise.all([
        readFile(new URL('platforms/desktop-tauri/Info.plist', root), 'utf8'),
        readFile(new URL('platforms/desktop-tauri/Cargo.toml', root), 'utf8')
    ]);

    assert.match(plist, /<key>NSContactsUsageDescription<\/key>/);
    assert.match(cargo, /target\.'cfg\(target_os = "macos"\)'\.dependencies/);
    assert.match(cargo, /objc2-contacts/);
});
