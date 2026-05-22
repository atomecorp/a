import assert from 'node:assert/strict';

const calls = [];

globalThis.window = {
    eveAtomeEditFooterApi: {
        resolveToolDefinitions({ toolKeys = [] } = {}) {
            return toolKeys.map((key) => ({
                key,
                label: key,
                type: 'tool',
                tool_id: `tool.${key}`
            }));
        },
        invokeToolDefinition(definition, payload) {
            calls.push({ type: 'footer', definition, payload });
            return { ok: true, source: 'footer' };
        }
    },
    eveMtrackApi: {
        recordMedia(input) {
            calls.push({ type: 'recordMedia', input });
            return { ok: true, source: 'recordMedia' };
        },
        setTrackRecordSource(input) {
            calls.push({ type: 'setTrackRecordSource', input });
            return { ok: true, source: 'setTrackRecordSource' };
        }
    }
};

const moduleUrl = new URL('../../eVe/domains/mtrax/ui/tool_keys.js', import.meta.url);
const {
    MTRACK_PANEL_TOOL_KEYS,
    resolveMtrackPanelToolDefinitions,
    invokeMtrackPanelToolDefinition
} = await import(moduleUrl.href);

const requiredKeys = [
    'detail',
    'record_action',
    'mtrack_record_audio',
    'mtrack_record_video',
    'mtrack_record_camera_front',
    'mtrack_record_camera_back',
    'mtrack_track_source_audio',
    'mtrack_track_source_video'
];

for (const key of requiredKeys) {
    assert.ok(MTRACK_PANEL_TOOL_KEYS.includes(key), `${key} must be present in Molecule panel tools`);
}

const definitions = resolveMtrackPanelToolDefinitions();
for (const key of requiredKeys) {
    assert.ok(definitions.some((definition) => definition.key === key), `${key} definition must resolve`);
}

await invokeMtrackPanelToolDefinition(
    definitions.find((definition) => definition.key === 'mtrack_record_video'),
    {},
    { atomeId: 'group_1', source: 'test' }
);
await invokeMtrackPanelToolDefinition(
    definitions.find((definition) => definition.key === 'mtrack_track_source_audio'),
    {},
    { atomeId: 'group_1', source: 'test' }
);

assert.equal(calls[0].type, 'recordMedia');
assert.equal(calls[0].input.record_source, 'video');
assert.equal(calls[1].type, 'setTrackRecordSource');
assert.equal(calls[1].input.record_source, 'audio');
assert.equal(calls[1].input.select_tracks, true);

console.log('molecule_panel_record_tools_contract.test: PASS');
