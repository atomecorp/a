import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { brotliDecompressSync } from 'node:zlib';

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
// The copy the page downloads: the build's Brotli variant (platforms/web/bevy-renderer/build.sh).
const rendererWasmBrotli = await readFile(
    new URL('../../atome/src/wasm/squirrel_bevy_renderer_bg.wasm.br', import.meta.url)
);
// The iOS app runs the shared local host in process (`atome-server::local`); its
// state_current list is the one Tauri runs too.
const stateCurrentListSource = await readFile(
    new URL('../../atome/servers/atome-server/src/local/local_atome_state_current_list.rs', import.meta.url),
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
    // Budgeted on what WebContent downloads, the Brotli copy, not the raw module (R-118 final checks,
    // 2026-11-06, todo/REGISTRE_DEMANDES.md: the raw 13.1 MB budget was passed on 4 Nov. at 13.44 MB while
    // the Brotli copy grew 2 %): 3.36 MB measured then, plus a 10 % guard.
    assert.ok(brotliDecompressSync(rendererWasmBrotli).equals(rendererWasm), 'the Brotli copy must be the current module');
    assert.ok(
        rendererWasmBrotli.byteLength <= 3_360_000 * 1.1,
        `renderer WASM grew to ${rendererWasmBrotli.byteLength} Brotli bytes`
    );
    // The 76 000 of 2026-09-04 was already passed by the Nov. 4 renderer (6afa45b4, 76 440: the plates' blurred
    // capture). Its growth to 76 920 since then is the GPU and Rust paths of R-118 steps 4–6 and the cleanup lot,
    // each kept on a measured win (register R-118, decision of 2026-11-06; FRAMEWORK_STATE §5 of that date): band
    // lens path B +82 (59.8 fps against 47), hover clock, scroll path B and slider light path +170 (300 rows: 60.9
    // → 6.8 ms CPU a frame), GPU shape masks and shadow blur +79 (star 6.0 → 0.8 ms), GPU text bitmap +76
    // (0 read-backs, pinch 14.8 → 8.5 ms a frame), GPU spatial mask +73 (75.4 → 0.9 ms). 76 920 measured, plus
    // the Brotli guard's 10 %.
    assert.ok(
        definedFunctionCount(rendererWasm) <= 76_920 * 1.1,
        `renderer WASM grew to ${definedFunctionCount(rendererWasm)} functions`
    );
});

test('iOS server info publishes the packaged Atome and eVe versions', () => {
    assert.ok(serverInfoSource.includes('"success": true'));
    assert.ok(serverInfoSource.includes('"atomeVersion": runtimeVersion(relativePath: "version.txt")'));
    assert.ok(serverInfoSource.includes('"eveVersion": runtimeVersion(relativePath: "eVe/version.txt")'));
});

test('iOS state_current list preserves type and particle exclusions end to end', () => {
    const listStateCurrentStart = adoleAdapterSource.indexOf('async listStateCurrent(params = {})');
    assert.ok(listStateCurrentStart > 0, 'state_current adapter must exist');
    const listStateCurrentSource = adoleAdapterSource.slice(listStateCurrentStart, listStateCurrentStart + 1400);
    assert.ok(listStateCurrentSource.includes('atome_type: params.atome_type || params.atomeType || params.type || null'));
    assert.ok(listStateCurrentSource.includes('exclude_particle_keys: Array.isArray'));

    // Behaviour: local_atome_state_current_list_tests.rs (cargo test -p atome-server --lib local::).
    assert.ok(stateCurrentListSource.includes('.or_else(|| message.get("atomeType"))'));
    assert.ok(stateCurrentListSource.includes('.get("exclude_particle_keys")'));
    assert.ok(stateCurrentListSource.includes("json_extract(sc.properties, '$.type')"));
    assert.ok(stateCurrentListSource.includes("json_extract(sc.properties, '$.kind')"));
    assert.ok(stateCurrentListSource.includes("LOWER(sc.atome_id) NOT LIKE 'tool_ui.activity.select.%'"));
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
    assert.ok(atomeCommitFetchSource.includes('const pageSize = Math.min(requestedLimit, configuredPageSize, 1000)'));
    assert.ok(atomeCommitFetchSource.includes('const page = await fetchStateCurrentPage(projectId, { ...options, limit, offset })'));
});
