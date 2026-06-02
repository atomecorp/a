import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = {
    SelectionAPI: null,
    __EVE_SELECTION_DEBUG__: false,
    __selectedAtomeIds: [],
    __selectedAtomeId: null,
    addEventListener() { },
    removeEventListener() { },
    dispatchEvent() { }
};
globalThis.CustomEvent = class {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
    }
};

const {
    configureSelection,
    selectionState,
    syncSelectionState
} = await import('../../eVe/intuition/runtime/selection.js');

let persisted = 0;
configureSelection({
    updateAtomeProperties: () => {
        persisted += 1;
    }
});

selectionState.ids = new Set();
selectionState.lastId = null;
syncSelectionState(['shape_a'], 'shape_a');
syncSelectionState([], null);

assert.equal(persisted, 0);

const selectionSource = readFileSync(new URL('../../eVe/intuition/runtime/selection.js', import.meta.url), 'utf8');
assert.doesNotMatch(selectionSource, /dataset\?\.toolShortcut/);
assert.doesNotMatch(selectionSource, /data-tool-shortcut/);
assert.doesNotMatch(selectionSource, /dataset\?\.atomeRole/);
assert.doesNotMatch(selectionSource, /dataset\?\.atomeKind/);

const toolRuntimeSource = readFileSync(new URL('../../eVe/intuition/tools/core/tool_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(toolRuntimeSource, /dataset\?\.toolShortcut/);
assert.doesNotMatch(toolRuntimeSource, /data-tool-shortcut/);
assert.doesNotMatch(toolRuntimeSource, /dataset\?\.atomeRole/);
assert.doesNotMatch(toolRuntimeSource, /dataset\?\.atomeKind/);

const toolGenesisSource = readFileSync(new URL('../../eVe/intuition/runtime/tool_genesis.js', import.meta.url), 'utf8');
assert.doesNotMatch(toolGenesisSource, /element\.dataset\?\.toolShortcut/);
assert.doesNotMatch(toolGenesisSource, /element\.dataset\?\.atomeRole/);
assert.doesNotMatch(toolGenesisSource, /element\.dataset\?\.atomeKind/);

const flowerContextTargetSource = readFileSync(new URL('../../eVe/intuition/flower/context_target.js', import.meta.url), 'utf8');
assert.doesNotMatch(flowerContextTargetSource, /host\.dataset\?\.toolShortcut/);
assert.doesNotMatch(flowerContextTargetSource, /host\.dataset\?\.atomeRole/);

const flowerMenuContextSource = readFileSync(new URL('../../eVe/intuition/tools/contextual/flower_menu_context.js', import.meta.url), 'utf8');
assert.doesNotMatch(flowerMenuContextSource, /host\.dataset\?\.toolShortcut/);
assert.doesNotMatch(flowerMenuContextSource, /host\.dataset\?\.atomeRole/);
assert.doesNotMatch(flowerMenuContextSource, /host\.getAttribute\?\('data-tool-shortcut'\)/);
assert.doesNotMatch(flowerMenuContextSource, /atomeHost\.dataset\?\.atomeRole/);

const performSource = readFileSync(new URL('../../eVe/intuition/tools/perform.js', import.meta.url), 'utf8');
assert.doesNotMatch(performSource, /element\.dataset\?\.toolShortcut/);
assert.doesNotMatch(performSource, /element\.dataset\?\.atomeRole/);
assert.doesNotMatch(performSource, /element\.dataset\?\.atomeKind/);
assert.doesNotMatch(performSource, /element\.getAttribute\?\('data-tool-shortcut'\)/);

const selectionContextRuntimeSource = readFileSync(new URL('../../eVe/core/atome_events/selection_context_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(selectionContextRuntimeSource, /host\?\.dataset\?\.atomeKind/);
assert.doesNotMatch(selectionContextRuntimeSource, /host\?\.dataset\?\.atomeId/);

const hostBindingRuntimeSource = readFileSync(new URL('../../eVe/core/atome_events/host_binding_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(hostBindingRuntimeSource, /host\.dataset\?\.toolShortcut/);

const traceRuntimeSource = readFileSync(new URL('../../eVe/core/atome_events/trace_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(traceRuntimeSource, /host\.dataset\?\.toolShortcut/);
assert.doesNotMatch(traceRuntimeSource, /atomeHost\?\.dataset\?\.atomeRole/);
assert.doesNotMatch(traceRuntimeSource, /atomeHost\?\.dataset\?\.atomeKind/);

const matrixRuntimeSource = readFileSync(new URL('../../eVe/intuition/matrix/core/matrix_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(matrixRuntimeSource, /host\.dataset\?\.toolShortcut/);

const captureSource = readFileSync(new URL('../../eVe/intuition/tools/capture.js', import.meta.url), 'utf8');
assert.doesNotMatch(captureSource, /host\?\.dataset\?\.atomeKind/);

const playbackMirrorSource = readFileSync(new URL('../../eVe/domains/mtrax/project/project_playback_mirror_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(playbackMirrorSource, /host\?\.dataset\?\.atomeKind/);
assert.doesNotMatch(playbackMirrorSource, /host\.dataset\?\.atomeKind/);

const playbackTargetSource = readFileSync(new URL('../../eVe/domains/mtrax/project/project_playback_target_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(playbackTargetSource, /host\?\.dataset\?\.atomeKind/);
assert.doesNotMatch(playbackTargetSource, /host\.dataset\?\.atomeKind/);

const footerEmbedSource = readFileSync(new URL('../../eVe/domains/mtrax/ui/footer_embed_primitives.js', import.meta.url), 'utf8');
assert.doesNotMatch(footerEmbedSource, /node\.dataset\?\.atomeKind/);

const timelinePlaySource = readFileSync(new URL('../../eVe/domains/mtrax/timeline/play_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(timelinePlaySource, /node\.dataset\?\.atomeKind/);

const eveIntuitionSource = readFileSync(new URL('../../eVe/intuition/eVeIntuition.js', import.meta.url), 'utf8');
assert.doesNotMatch(eveIntuitionSource, /String\(node\.dataset\?\.atomeKind \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'group'/);
assert.doesNotMatch(eveIntuitionSource, /host\.dataset\.toolShortcut === 'true'/);
assert.doesNotMatch(eveIntuitionSource, /state\.role \|\| host\.dataset\?\.atomeRole/);
