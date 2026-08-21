import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('remote wallpaper download posts to the Fastify owner from a local Axum page', async () => {
    const calls = [];
    globalThis.window = {
        location: {
            protocol: 'http:',
            origin: 'http://127.0.0.1:3000',
            hostname: '127.0.0.1',
            port: '3000'
        },
        __SQUIRREL_SERVER_CONFIG__: {
            fastify: { port: 3001 }
        },
        AdoleAPI: {
            auth: {
                ensureFastifyToken: async () => {},
                getCurrentInfo: () => ({ id: 'user_wallpaper' })
            }
        },
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {}
    };
    globalThis.localStorage = {
        getItem(key) {
            return key === 'cloud_auth_token' ? 'cloud-token' : '';
        },
        setItem() {},
        removeItem() {}
    };
    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), method: options.method, headers: options.headers || {} });
        return {
            ok: true,
            status: 200,
            json: async () => ({
                success: true,
                file_name: 'wallpaper_contract.png',
                owner_id: 'user_wallpaper',
                mime_type: 'image/png',
                size_bytes: 12,
                source: 'remote_wallpaper'
            })
        };
    };

    const { resolveFastifyApiBase } = await import('../../eVe/domains/media/asset_box_auth.js');
    assert.equal(resolveFastifyApiBase(), 'http://127.0.0.1:3001');

    const { createAssetBoxUploadRuntime } = await import('../../eVe/domains/media/asset_box_upload_transport.js');
    const runtime = createAssetBoxUploadRuntime({
        createUploadAtome: async () => {},
        renderUploadsList() {}
    });

    const result = await runtime.downloadRemoteWallpaper({ preferCloudUpload: true });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://127.0.0.1:3001/api/uploads/remote-wallpaper');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].headers.Authorization, 'Bearer cloud-token');
    assert.equal(calls[0].headers['X-User-Id'], 'user_wallpaper');
    assert.equal(result.mediaUrl, 'http://127.0.0.1:3001/api/uploads/wallpaper_contract.png?media_user_id=user_wallpaper');
});

test('remote wallpaper download does not fall back to the local upload server', async () => {
    const source = await readFile(new URL('../../eVe/domains/media/asset_box_upload_transport.js', import.meta.url), 'utf8');
    assert.match(
        source,
        /return \{ ok: false, reason: 'remote_wallpaper_fastify_base_missing' \}/,
        'remote wallpaper route must fail explicitly when the Fastify owner cannot be resolved'
    );
    assert.match(
        source,
        /base = fastifyBase;[\s\S]*const endpoint = base \? `\$\{base\}\/api\/uploads\/remote-wallpaper` : '\/api\/uploads\/remote-wallpaper'/,
        'remote wallpaper route must bind the endpoint to the resolved Fastify base before posting'
    );
});
