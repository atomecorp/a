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

const selectionSnapshotSource = readFileSync(new URL('../../eVe/intuition/runtime/selection_snapshot.js', import.meta.url), 'utf8');
assert.doesNotMatch(selectionSnapshotSource, /entry\.dataset\?\.atomeId/);
assert.doesNotMatch(selectionSnapshotSource, /entry\.dataset\?\.atome_id/);

const toolRuntimeSource = readFileSync(new URL('../../eVe/intuition/tools/core/tool_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(toolRuntimeSource, /dataset\?\.toolShortcut/);
assert.doesNotMatch(toolRuntimeSource, /data-tool-shortcut/);
assert.doesNotMatch(toolRuntimeSource, /dataset\?\.atomeRole/);
assert.doesNotMatch(toolRuntimeSource, /dataset\?\.atomeKind/);

const toolGenesisSource = readFileSync(new URL('../../eVe/intuition/runtime/tool_genesis.js', import.meta.url), 'utf8');
assert.doesNotMatch(toolGenesisSource, /element\.dataset\?\.toolShortcut/);
assert.doesNotMatch(toolGenesisSource, /dataset\.toolShortcut/);
assert.doesNotMatch(toolGenesisSource, /element\.dataset\?\.atomeRole/);
assert.doesNotMatch(toolGenesisSource, /dataset\.atomeRole/);
assert.doesNotMatch(toolGenesisSource, /element\.dataset\?\.atomeKind/);
assert.doesNotMatch(toolGenesisSource, /dataset\.atomeType/);
assert.doesNotMatch(toolGenesisSource, /dataset\.textToolKeepEmpty/);
assert.doesNotMatch(toolGenesisSource, /dataset\.text_tool_keep_empty/);
assert.doesNotMatch(toolGenesisSource, /dataset\.mtrackPreviewText/);
assert.doesNotMatch(toolGenesisSource, /dataset\.mtrack_preview_text/);

const flowerContextTargetSource = readFileSync(new URL('../../eVe/intuition/flower/context_target.js', import.meta.url), 'utf8');
assert.doesNotMatch(flowerContextTargetSource, /host\.dataset\?\.toolShortcut/);
assert.doesNotMatch(flowerContextTargetSource, /host\.dataset\?\.atomeRole/);
assert.doesNotMatch(flowerContextTargetSource, /data-tool-shortcut/);

const flowerMenuContextSource = readFileSync(new URL('../../eVe/intuition/tools/contextual/flower_menu_context.js', import.meta.url), 'utf8');
assert.doesNotMatch(flowerMenuContextSource, /host\.dataset\?\.toolShortcut/);
assert.doesNotMatch(flowerMenuContextSource, /host\.dataset\?\.atomeRole/);
assert.doesNotMatch(flowerMenuContextSource, /host\.getAttribute\?\('data-tool-shortcut'\)/);
assert.doesNotMatch(flowerMenuContextSource, /atomeHost\.dataset\?\.atomeRole/);
assert.doesNotMatch(flowerMenuContextSource, /projectRoot\.dataset\?\.projectId/);

const performSource = readFileSync(new URL('../../eVe/intuition/tools/perform.js', import.meta.url), 'utf8');
assert.doesNotMatch(performSource, /element\.dataset\?\.toolShortcut/);
assert.doesNotMatch(performSource, /element\.dataset\?\.atomeRole/);
assert.doesNotMatch(performSource, /element\.dataset\?\.atomeKind/);
assert.doesNotMatch(performSource, /data-tool-shortcut/);
assert.doesNotMatch(performSource, /element\.getAttribute\?\('data-tool-shortcut'\)/);

const selectionContextRuntimeSource = readFileSync(new URL('../../eVe/core/atome_events/selection_context_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(selectionContextRuntimeSource, /host\?\.dataset\?\.atomeKind/);
assert.doesNotMatch(selectionContextRuntimeSource, /host\?\.dataset\?\.atomeId/);

const moleculeApiSource = readFileSync(new URL('../../eVe/core/media_engine/molecule.api.js', import.meta.url), 'utf8');
assert.doesNotMatch(moleculeApiSource, /host\.dataset\?\.ownerId/);
assert.doesNotMatch(moleculeApiSource, /host\.dataset\?\.owner_id/);

const mediaProjectionStateSource = readFileSync(new URL('../../eVe/domains/media/shared/media_projection_state.js', import.meta.url), 'utf8');
assert.doesNotMatch(mediaProjectionStateSource, /getAttribute\?\('data-eve-media-source'\)/);
assert.doesNotMatch(mediaProjectionStateSource, /getAttribute\?\('data-eve-media-identifier'\)/);
assert.doesNotMatch(mediaProjectionStateSource, /getAttribute\?\('data-media-api-error'\)/);

const hostBindingRuntimeSource = readFileSync(new URL('../../eVe/core/atome_events/host_binding_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(hostBindingRuntimeSource, /host\.dataset\?\.toolShortcut/);

const traceRuntimeSource = readFileSync(new URL('../../eVe/core/atome_events/trace_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(traceRuntimeSource, /host\.dataset\?\.toolShortcut/);
assert.doesNotMatch(traceRuntimeSource, /atomeHost\?\.dataset\?\.atomeRole/);
assert.doesNotMatch(traceRuntimeSource, /atomeHost\?\.dataset\?\.atomeKind/);
assert.doesNotMatch(traceRuntimeSource, /target\?\.dataset\?\.atomeId/);

const matrixRuntimeSource = readFileSync(new URL('../../eVe/intuition/matrix/core/matrix_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(matrixRuntimeSource, /host\.dataset\?\.toolShortcut/);
assert.doesNotMatch(matrixRuntimeSource, /data-tool-shortcut/);
assert.doesNotMatch(matrixRuntimeSource, /data-atome-type/);
assert.doesNotMatch(matrixRuntimeSource, /data-source-tool-/);
assert.doesNotMatch(matrixRuntimeSource, /host\?\.dataset\?\.atomeId/);
assert.doesNotMatch(matrixRuntimeSource, /view\?\.dataset\?\.projectId/);
assert.doesNotMatch(matrixRuntimeSource, /view\?\.dataset\?\.project_id/);

const captureSource = readFileSync(new URL('../../eVe/intuition/tools/capture.js', import.meta.url), 'utf8');
assert.doesNotMatch(captureSource, /host\?\.dataset\?\.atomeKind/);
assert.doesNotMatch(captureSource, /entry\.dataset\?\.atomeId/);
assert.doesNotMatch(captureSource, /entry\.dataset\?\.atome_id/);
assert.doesNotMatch(captureSource, /host\?\.dataset\?\.groupAtome/);
assert.doesNotMatch(captureSource, /data-source-tool-/);

const playbackMirrorSource = readFileSync(new URL('../../eVe/domains/mtrax/project/project_playback_mirror_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(playbackMirrorSource, /host\?\.dataset\?\.atomeKind/);
assert.doesNotMatch(playbackMirrorSource, /host\.dataset\?\.atomeKind/);

const playbackTargetSource = readFileSync(new URL('../../eVe/domains/mtrax/project/project_playback_target_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(playbackTargetSource, /host\?\.dataset\?\.atomeKind/);
assert.doesNotMatch(playbackTargetSource, /host\.dataset\?\.atomeKind/);

const footerEmbedSource = readFileSync(new URL('../../eVe/domains/mtrax/ui/footer_embed_primitives.js', import.meta.url), 'utf8');
assert.doesNotMatch(footerEmbedSource, /node\.dataset\?\.atomeKind/);
assert.doesNotMatch(footerEmbedSource, /node\.dataset\?\.groupAtome/);

const timelinePlaySource = readFileSync(new URL('../../eVe/domains/mtrax/timeline/play_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(timelinePlaySource, /node\.dataset\?\.atomeKind/);

const textEditRuntimeSource = readFileSync(new URL('../../eVe/core/atome_events/text_edit_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(textEditRuntimeSource, /host\.dataset\?\.textToolKeepEmpty/);
assert.doesNotMatch(textEditRuntimeSource, /host\.dataset\?\.text_tool_keep_empty/);
assert.doesNotMatch(textEditRuntimeSource, /host\.dataset\?\.mtrackPreviewText/);
assert.doesNotMatch(textEditRuntimeSource, /host\.dataset\?\.mtrack_preview_text/);

const resizeRuntimeSource = readFileSync(new URL('../../eVe/core/atome_events/resize_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(resizeRuntimeSource, /host\?\.dataset\?\.groupPreview/);
assert.doesNotMatch(resizeRuntimeSource, /host\?\.dataset\?\.group_preview/);

const groupStateRuntimeSource = readFileSync(new URL('../../eVe/intuition/shared/group_state_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(groupStateRuntimeSource, /host\?\.dataset\?\.groupPreview/);
assert.doesNotMatch(groupStateRuntimeSource, /host\?\.dataset\?\.group_preview/);
assert.doesNotMatch(groupStateRuntimeSource, /host\?\.dataset\?\.groupSteps/);
assert.doesNotMatch(groupStateRuntimeSource, /host\?\.dataset\?\.group_steps/);

const eveIntuitionSource = readFileSync(new URL('../../eVe/intuition/eVeIntuition.js', import.meta.url), 'utf8');
assert.doesNotMatch(eveIntuitionSource, /String\(node\.dataset\?\.atomeKind \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'group'/);
assert.doesNotMatch(eveIntuitionSource, /host\.dataset\.toolShortcut === 'true'/);
assert.doesNotMatch(eveIntuitionSource, /state\.role \|\| host\.dataset\?\.atomeRole/);
assert.doesNotMatch(eveIntuitionSource, /dataset\?\.atomeId/);
assert.doesNotMatch(eveIntuitionSource, /dataset\?\.atomeType/);
assert.doesNotMatch(eveIntuitionSource, /dataset\?\.mediaType/);
assert.doesNotMatch(eveIntuitionSource, /dataset\?\.mediaSource/);
assert.doesNotMatch(eveIntuitionSource, /dataset\?\.media_source/);
assert.doesNotMatch(eveIntuitionSource, /dataset\?\.atomeName/);
assert.doesNotMatch(eveIntuitionSource, /dataset\?\.groupLabel/);
assert.doesNotMatch(eveIntuitionSource, /dataset\?\.group_label/);
assert.doesNotMatch(eveIntuitionSource, /host\?\.dataset\?\.groupPreview/);
assert.doesNotMatch(eveIntuitionSource, /host\?\.dataset\?\.group_preview/);
assert.doesNotMatch(eveIntuitionSource, /groupHost\?\.dataset\?\.groupSteps/);
assert.doesNotMatch(eveIntuitionSource, /groupHost\?\.dataset\?\.group_steps/);
assert.doesNotMatch(eveIntuitionSource, /data-source-tool-/);

const selectionStyleApplySource = readFileSync(new URL('../../eVe/intuition/tools/selection_style_apply.js', import.meta.url), 'utf8');
assert.doesNotMatch(selectionStyleApplySource, /nextHost\.dataset\?\.atomeKind/);
assert.doesNotMatch(selectionStyleApplySource, /dataset\?\.atomeId/);

const userToolSource = readFileSync(new URL('../../eVe/intuition/tools/user.js', import.meta.url), 'utf8');
assert.doesNotMatch(userToolSource, /data-atome-role/);

const toolShortcutVisualSource = readFileSync(new URL('../../eVe/intuition/shared/tool_shortcut_visual.js', import.meta.url), 'utf8');
assert.doesNotMatch(toolShortcutVisualSource, /dataset\.atomeRole/);
assert.doesNotMatch(toolShortcutVisualSource, /dataset\.toolShortcut/);

const mtrackDockControllerSource = readFileSync(new URL('../../eVe/intuition/runtime/mtrack_dock_controller.js', import.meta.url), 'utf8');
assert.doesNotMatch(mtrackDockControllerSource, /groupHost\.dataset\?\.atomeId/);
assert.doesNotMatch(mtrackDockControllerSource, /groupHost\?\.dataset\?\.atomeId/);
assert.doesNotMatch(mtrackDockControllerSource, /groupHost\.dataset\?\.groupId/);
assert.doesNotMatch(mtrackDockControllerSource, /groupHost\?\.dataset\?\.groupId/);

const mtraxBridgeRuntimeSource = readFileSync(new URL('../../eVe/intuition/runtime/eve_intuition/mtrax_bridge_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(mtraxBridgeRuntimeSource, /dataset\?\.atomeId/);
assert.doesNotMatch(mtraxBridgeRuntimeSource, /dataset\?\.groupId/);

const mtraxDiagnosticsSource = readFileSync(new URL('../../eVe/domains/mtrax/core/diagnostics.js', import.meta.url), 'utf8');
assert.doesNotMatch(mtraxDiagnosticsSource, /dataset\?\.atomeId/);

const projectDropSource = readFileSync(new URL('../../eVe/intuition/tools/project_drop.js', import.meta.url), 'utf8');
assert.doesNotMatch(projectDropSource, /host\?\.dataset\?\.atomeId/);
assert.doesNotMatch(projectDropSource, /host\.dataset\?\.projectId/);
assert.doesNotMatch(projectDropSource, /host\?\.dataset\?\.projectId/);
assert.doesNotMatch(projectDropSource, /hostEl\.dataset\?\.projectId/);
assert.doesNotMatch(projectDropSource, /hostEl\?\.dataset\?\.projectId/);

const mtraxRecordCaptureSource = readFileSync(new URL('../../eVe/domains/mtrax/media/record_capture_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(mtraxRecordCaptureSource, /data-source-tool-/);

const mtraxClipSelectionSource = readFileSync(new URL('../../eVe/domains/mtrax/clips/selection_runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(mtraxClipSelectionSource, /data-source-tool-/);

const clockToolSource = readFileSync(new URL('../../eVe/intuition/tools/clock.js', import.meta.url), 'utf8');
assert.doesNotMatch(clockToolSource, /data-atome-clock-canvas/);
