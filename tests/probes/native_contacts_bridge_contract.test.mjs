import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';

const root = new URL('../../', import.meta.url);

test('desktop Contacts bridge uses CNContactStore without JXA or native persistence', async () => {
    const [rust, source] = await Promise.all([
        readFile(new URL('platforms/desktop-tauri/src/native_contacts.rs', root), 'utf8'),
        readFile(new URL('platforms/desktop-tauri/native/personal_import.m', root), 'utf8')]);

    assert.match(source, /CNContactStore/);
    assert.match(rust, /crate::native_personal_import::read/);
    assert.match(source, /requestAccessForEntityType/);
    assert.match(source, /authorizationStatusForEntityType/);
    assert.match(source, /"authorized"/);
    assert.match(source, /contacts_permission_denied/);
    assert.doesNotMatch(source, /osascript|MACOS_CONTACTS_JXA|Application\('Contacts'\)/);
    assert.doesNotMatch(source, /localStorage|File::create|OpenOptions/);
});

test('desktop bundle declares Contacts permission and scoped framework dependencies', async () => {
    const [plist, build] = await Promise.all([
        readFile(new URL('platforms/desktop-tauri/Info.plist', root), 'utf8'),
        readFile(new URL('platforms/desktop-tauri/build.rs', root), 'utf8')
    ]);

    assert.match(plist, /<key>NSContactsUsageDescription<\/key>/);
    assert.match(build, /CARGO_CFG_TARGET_OS.*Ok\("macos"\)/);
    assert.match(build, /"Foundation", "Contacts", "EventKit"/);
});
