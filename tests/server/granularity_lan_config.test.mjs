import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const projectFile = (relativePath) => new URL(`../../${relativePath}`, import.meta.url);

const isPrivateIpv4 = (value) => {
    const parts = String(value || '').split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    if (parts[0] === 10) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
};

test('granularity local configuration advertises a LAN-reachable Fastify endpoint', async () => {
    const config = JSON.parse(await readFile(projectFile('server_config.json'), 'utf8'));
    assert.equal(isPrivateIpv4(config.fastify?.host), true);
    assert.equal(config.fastify.port, 3001);
    assert.equal(config.fastify.apiWsPath, '/ws/api');
    assert.equal(config.fastify.syncWsPath, '/ws/sync');

    const serverSource = await readFile(projectFile('server/server.js'), 'utf8');
    assert.match(
        serverSource,
        /process\.env\.HOST\s*\|\|\s*\(process\.env\.NODE_ENV\s*===\s*'production'\s*\?\s*'127\.0\.0\.1'\s*:\s*'0\.0\.0\.0'\)/
    );

    for (const entrypoint of ['platforms/desktop-tauri/src/main.rs', 'platforms/desktop-tauri/src/lib.rs']) {
        const tauriSource = await readFile(projectFile(entrypoint), 'utf8');
        assert.match(
            tauriSource,
            /const TAURI_RUNTIME_INIT_SCRIPT:[\s\S]*__SQUIRREL_FORCE_TAURI_RUNTIME__[\s\S]*__ATOME_LOCAL_HTTP_PORT__/,
            `${entrypoint} must define the pre-page Tauri runtime identity`
        );
        assert.match(
            tauriSource,
            /append_invoke_initialization_script\(TAURI_RUNTIME_INIT_SCRIPT\)/,
            `${entrypoint} must publish the Tauri runtime identity before page scripts execute`
        );
    }
});

test('Tauri sync binds a Fastify credential to each authenticated local principal', async () => {
    const localAtomeSource = await readFile(
        projectFile('platforms/desktop-tauri/src/server/local_atome.rs'),
        'utf8'
    );
    const extendedSource = await readFile(
        projectFile('platforms/desktop-tauri/src/server/local_atome_extended.rs'),
        'utf8'
    );
    const adapterSource = await readFile(
        projectFile('atome/src/squirrel/apis/unified/adole_adapter.js'),
        'utf8'
    );

    assert.doesNotMatch(localAtomeSource, /std::env::var\("SQUIRREL_SYNC_TOKEN"\)/);
    assert.match(localAtomeSource, /remote_sync_credentials/);
    assert.match(extendedSource, /"configure-remote"/);
    assert.match(extendedSource, /"clear-remote"/);
    assert.match(adapterSource, /async configureRemote\(/);
    assert.match(adapterSource, /async clearRemote\(/);
});
