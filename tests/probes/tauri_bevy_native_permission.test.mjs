import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';

const ROOT = new URL('../../', import.meta.url);
const nativeCommands = [
    'bevy_native_start',
    'bevy_native_apply_ops',
    'bevy_native_resize'
];

const readText = async (path) => readFile(new URL(path, ROOT), 'utf8');

test('Tauri capability allows every native Bevy renderer command registered by the app', async () => {
    const [capabilityText, generatedCapabilityText, permissionText, mainText, libText] = await Promise.all([
        readText('platforms/desktop-tauri/capabilities/default.json'),
        readText('platforms/desktop-tauri/gen/schemas/capabilities.json'),
        readText('platforms/desktop-tauri/permissions/bevy-native-renderer.toml'),
        readText('platforms/desktop-tauri/src/main.rs'),
        readText('platforms/desktop-tauri/src/lib.rs')
    ]);

    const capability = JSON.parse(capabilityText);
    const generatedCapability = JSON.parse(generatedCapabilityText);

    assert.ok(capability.permissions.includes('bevy-native-renderer'));
    assert.ok(generatedCapability.default.permissions.includes('bevy-native-renderer'));

    for (const command of nativeCommands) {
        assert.match(permissionText, new RegExp(`commands\\.allow = \\["${command}"\\]`));
        assert.match(mainText, new RegExp(`bevy_backend::${command}`));
        assert.match(libText, new RegExp(`bevy_backend::${command}`));
    }
});
