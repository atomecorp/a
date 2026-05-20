import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('tests/probes/molecule_global_diagnostics_probe.test.mjs', 'utf8');

const requiredSignals = [
    '__DEBUG__',
    'getAppState',
    'getTimelineState',
    'getGPUStats',
    'eveMtrackApi',
    'getState',
    'exportTimeline',
    'getRendererState',
    'eve_mtrack_dialog',
    'eve_mtrack_dialog__preview_section',
    'eve_mtrack_dialog__preview_host',
    'eve_mtrack_dialog__scroll',
    '.eve-mtrack-track',
    '.eve-mtrack-clip',
    'clip_id',
    'persist_id',
    'track_id',
    'parent_track_id',
    'left_handle',
    'right_handle',
    '__dumpEveMtrackTrace',
    '__dumpEveMtrackCriticalTrace',
    '__EVE_MTRACK_EVENT_TRACE__',
    '__EVE_MTRACK_DOCK_TRACE__',
    '__EVE_MTRAX_INTERACTION_TRACE__',
    'page.on(\'console\'',
    'page.on(\'pageerror\'',
    'page.screenshot',
    'temp/probe_reports/molecule_global_diagnostics_probe'
];

for (const signal of requiredSignals) {
    assert.equal(source.includes(signal), true, `global molecule diagnostics must capture ${signal}`);
}

assert.equal(source.includes('debugMountSyntheticTimeline'), false, 'global diagnostics must not synthesize timeline data');
assert.equal(source.includes('createAtome'), false, 'global diagnostics must not create atomes');
assert.equal(source.includes('fix'), false, 'global diagnostics must not perform corrections');
