import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const { listStateCurrentOnBackend } = await import(
    '../../atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js'
);

const webRendererSource = await readFile(
    new URL('../../platforms/web/bevy-renderer/src/lib.rs', import.meta.url),
    'utf8'
);
const serverInfoSource = await readFile(
    new URL('../../platforms/ios/atome-auv3/Common/ServerInfoProvider.swift', import.meta.url),
    'utf8'
);
const rendererWasm = await readFile(
    new URL('../../atome/src/wasm/squirrel_bevy_renderer_bg.wasm', import.meta.url)
);
const localHttpServerSource = await readFile(
    new URL('../../platforms/ios/atome-auv3/Common/LocalHTTPServer.swift', import.meta.url),
    'utf8'
);
const adoleAdapterSource = await readFile(
    new URL('../../atome/src/squirrel/apis/unified/adole_adapter_atome.js', import.meta.url),
    'utf8'
);
const atomeCommitFetchSource = await readFile(
    new URL('../../eVe/core/atome_commit_fetch.js', import.meta.url),
    'utf8'
);

function readUleb(bytes, start) {
    let value = 0;
    let shift = 0;
    let offset = start;
    while (offset < bytes.length) {
        const byte = bytes[offset];
        offset += 1;
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) return { value, offset };
        shift += 7;
    }
    throw new Error('truncated_uleb128');
}

function definedFunctionCount(bytes) {
    assert.equal(bytes.subarray(0, 4).toString('hex'), '0061736d', 'renderer must be a WebAssembly module');
    let offset = 8;
    while (offset < bytes.length) {
        const sectionId = bytes[offset];
        const sectionSize = readUleb(bytes, offset + 1);
        const payloadStart = sectionSize.offset;
        if (sectionId === 3) return readUleb(bytes, payloadStart).value;
        offset = payloadStart + sectionSize.value;
    }
    throw new Error('wasm_function_section_missing');
}

test('web renderer keeps the canonical Bevy plugin graph', () => {
    assert.ok(webRendererSource.includes('DefaultPlugins'));
    assert.equal(webRendererSource.includes('AtomeCore2dPipelinePlugin'), false);
});

test('iPhone WebContent capacity budget rejects renderer graph regrowth', () => {
    assert.ok(rendererWasm.byteLength <= 13_100_000, `renderer WASM grew to ${rendererWasm.byteLength} bytes`);
    assert.ok(
        definedFunctionCount(rendererWasm) <= 76_000,
        `renderer WASM grew to ${definedFunctionCount(rendererWasm)} functions`
    );
});

test('iOS server info publishes the packaged Atome and eVe versions', () => {
    assert.ok(serverInfoSource.includes('"success": true'));
    assert.ok(serverInfoSource.includes('"atomeVersion": runtimeVersion(relativePath: "version.txt")'));
    assert.ok(serverInfoSource.includes('"eveVersion": runtimeVersion(relativePath: "eVe/version.txt")'));
});

test('iOS state_current rows travel once, under the canonical properties shape', () => {
    const anchor = 'var state: [String: Any] = [';
    const rowStart = localHttpServerSource.indexOf(anchor);
    assert.ok(rowStart > 0, 'state_current row serializer must exist');
    const literalStart = rowStart + anchor.length;
    const rowLiteral = localHttpServerSource.slice(literalStart, localHttpServerSource.indexOf(']', literalStart));
    assert.ok(rowLiteral.includes('"properties": properties'));
    assert.equal(
        rowLiteral.includes('"particles": properties'),
        false,
        'state_current rows must not repeat properties under particles'
    );
    assert.equal(
        rowLiteral.includes('"data": properties'),
        false,
        'state_current rows must not repeat properties under data'
    );
});

test('iOS state_current list preserves type and particle exclusions end to end', () => {
    const listStateCurrentStart = adoleAdapterSource.indexOf('async listStateCurrent(params = {})');
    assert.ok(listStateCurrentStart > 0, 'state_current adapter must exist');
    const listStateCurrentSource = adoleAdapterSource.slice(listStateCurrentStart, listStateCurrentStart + 1400);
    assert.ok(listStateCurrentSource.includes('atome_type: params.atome_type || params.atomeType || params.type || null'));
    assert.ok(listStateCurrentSource.includes('exclude_particle_keys: Array.isArray'));

    assert.ok(localHttpServerSource.includes('let atomeType = normalizedOptionalString(message["atome_type"] ?? message["atomeType"])'));
    assert.ok(localHttpServerSource.includes('atomeType: atomeType'));
    assert.ok(localHttpServerSource.includes("LOWER(COALESCE(a.atome_type, '')) = ?"));
    assert.ok(localHttpServerSource.includes("json_extract(sc.properties, '$.type')"));
    assert.ok(localHttpServerSource.includes("json_extract(sc.properties, '$.kind')"));
    assert.ok(localHttpServerSource.includes("LOWER(sc.atome_id) NOT LIKE 'tool_ui.activity.select.%'"));
});

test('iOS WebSocket frames own a single sender and never round-trip through String', () => {
    assert.ok(localHttpServerSource.includes('private func sendWebSocketFrame('));
    assert.equal(
        localHttpServerSource.includes('sendWebSocketText(String(decoding: data, as: UTF8.self)'),
        false,
        'JSON responses must be framed from their serialized bytes'
    );
    assert.equal(
        localHttpServerSource.includes('private func sendWebSocketText('),
        false,
        'the String-based sender must stay removed'
    );
    assert.ok(
        localHttpServerSource.includes('self.cancelConnectionIfNeededLocked(connection)'),
        'a peer that refuses writes must be dropped, not retried'
    );
});

test('state_current pagination bounds each tool catalogue response before parsing', async () => {
    const records = Array.from({ length: 205 }, (_, index) => ({
        atome_id: `tool_${index}`,
        atome_type: 'tool',
        properties: { tool_id: `tool.${index}` }
    }));
    const calls = [];
    const adapters = {
        tauri: {
            atome: {
                async listStateCurrent({ limit, offset }) {
                    calls.push({ limit, offset });
                    return { success: true, states: records.slice(offset, offset + limit) };
                }
            }
        }
    };
    const result = await listStateCurrentOnBackend(adapters, 'tauri', {
        type: 'tool',
        limit: 5000
    });
    assert.equal(result.ok, true);
    assert.equal(result.list.length, 205);
    assert.deepEqual(calls, [
        { limit: 100, offset: 0 },
        { limit: 100, offset: 100 },
        { limit: 100, offset: 200 }
    ]);
});

test('tool catalogue quarantine is shared by local and remote state_current backends', async () => {
    const records = [
        {
            atome_id: 'tool_ui.activity.select.local_album',
            atome_type: 'tool',
            properties: { tool_id: 'ui.activity.select.local_album' }
        },
        {
            atome_id: 'tool_ui.project.open',
            atome_type: 'tool',
            properties: { tool_id: 'ui.project.open' }
        }
    ];
    const adapters = {
        fastify: {
            atome: {
                async listStateCurrent() {
                    return { success: true, states: records };
                }
            }
        }
    };
    const result = await listStateCurrentOnBackend(adapters, 'fastify', {
        type: 'tool',
        limit: 100,
        pageSize: 100
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.list.map((record) => record.id), ['tool_ui.project.open']);
});

test('identical concurrent state_current reads share one transport request', async () => {
    let callCount = 0;
    let resolveRequest;
    const adapters = {
        tauri: {
            atome: {
                listStateCurrent() {
                    callCount += 1;
                    return new Promise((resolve) => { resolveRequest = resolve; });
                }
            }
        }
    };
    const options = { type: 'tool', limit: 10, pageSize: 2 };
    const first = listStateCurrentOnBackend(adapters, 'tauri', options);
    const second = listStateCurrentOnBackend(adapters, 'tauri', { ...options });
    await Promise.resolve();
    assert.equal(callCount, 1);
    resolveRequest({ success: true, states: [{ atome_id: 'tool_shared', properties: {} }] });
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(firstResult.list.length, 1);
    assert.equal(secondResult.list.length, 1);
    assert.equal(callCount, 1);
});

test('core state_current reads preserve filters and page every broad query', () => {
    assert.ok(atomeCommitFetchSource.includes("atome_type: options.atomeType || options.atome_type || options.type || null"));
    assert.ok(atomeCommitFetchSource.includes("exclude_particle_keys: options.excludeParticleKeys || options.exclude_particle_keys || []"));
    assert.ok(atomeCommitFetchSource.includes('const pageSize = Math.min(requestedLimit, configuredPageSize, 250)'));
    assert.ok(atomeCommitFetchSource.includes('const page = await fetchStateCurrentPage(projectId, { ...options, limit, offset })'));
});
