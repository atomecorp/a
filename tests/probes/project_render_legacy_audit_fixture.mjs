import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

export const deleteSource = await readSource('eVe/intuition/tools/delete.js');
export const deleteBlackHoleSource = await readSource('eVe/intuition/tools/delete/blackhole_runtime.js');
export const infosSource = await readSource('eVe/intuition/tools/infos.js');
export const communicationSource = await readSource('eVe/intuition/tools/communication.js');
export const timelineSource = await readSource('eVe/core/atome_timeline.js');
export const toolGenesisSource = await readSource('eVe/intuition/runtime/tool_genesis.js');
export const toolGenesisBootstrapSource = await readSource('eVe/intuition/runtime/tool_genesis_bootstrap_runtime.js');
export const toolGenesisCoreServicesSource = await readSource('eVe/intuition/runtime/tool_genesis_core_services_runtime.js');
export const toolGenesisGroupSource = await readSource('eVe/intuition/runtime/tool_genesis_group_runtime.js');
export const toolGenesisHostSource = await readSource('eVe/intuition/runtime/tool_genesis_host_runtime.js');
export const toolGenesisHostLifecycleSource = await readSource('eVe/intuition/runtime/tool_genesis_host_lifecycle_runtime.js');
export const toolGenesisLifecycleSource = await readSource('eVe/intuition/runtime/tool_genesis_lifecycle_runtime.js');
export const toolGenesisMediaSource = await readSource('eVe/intuition/runtime/tool_genesis_media_runtime.js');
export const toolGenesisMutationSource = await readSource('eVe/intuition/runtime/tool_genesis_mutation_runtime.js');
export const toolGenesisProjectionSupportSource = await readSource('eVe/intuition/runtime/tool_genesis_projection_support_runtime.js');
export const toolGenesisPublicSource = await readSource('eVe/intuition/runtime/tool_genesis_public_runtime.js');
export const toolGenesisRenderStateSource = await readSource('eVe/intuition/runtime/tool_genesis_render_state_runtime.js');
export const projectBridgeSource = await readSource('eVe/intuition/runtime/project_scene_render_bridge.js');
export const infoPanelSyncSource = await readSource('eVe/intuition/runtime/info_panel_sync_runtime.js');
export const mediaIntegritySource = await readSource('eVe/intuition/runtime/media_integrity_runtime.js');
export const shapeSvgSource = await readSource('eVe/intuition/runtime/shape_svg_runtime.js');
export const groupVisualSource = await readSource('eVe/intuition/runtime/group_visual_runtime.js');
export const mediaSourceSource = await readSource('eVe/intuition/runtime/media_source_runtime.js');
export const mediaHydrationSource = await readSource('eVe/intuition/runtime/media_hydration_runtime.js');
export const mediaMountSource = await readSource('eVe/intuition/runtime/media_mount_runtime.js');
export const hostRegistrySource = await readSource('eVe/intuition/runtime/atome_host_registry_runtime.js');
export const implicitGestureCommitSource = await readSource('eVe/intuition/runtime/implicit_gesture_commit_runtime.js');
export const projectAtomeIndexSource = await readSource('eVe/intuition/runtime/project_atome_index_runtime.js');
export const persistenceDiagSource = await readSource('eVe/intuition/runtime/persistence_diag_runtime.js');
export const realtimeEventsSource = await readSource('eVe/intuition/runtime/realtime_atome_events_runtime.js');
export const realtimePatchSource = await readSource('eVe/intuition/runtime/tool_genesis_realtime_patch_runtime.js');
export const sharedOverrideSource = await readSource('eVe/intuition/runtime/shared_project_override_runtime.js');

export const sliceFunction = (source, name) => {
    const directMarker = `const ${name} =`;
    const factoryMarker = `    const ${name} =`;
    const directStart = source.indexOf(directMarker);
    const factoryStart = source.indexOf(factoryMarker);
    const start = directStart >= 0 ? directStart : factoryStart;
    assert.notEqual(start, -1, `${name} must exist`);
    const lineStart = source.lastIndexOf('\n', start) + 1;
    const indentation = source.slice(lineStart, start);
    const isFactoryFunction = indentation.length > 0;
    const nextConst = source.indexOf('\nconst ', start + 1);
    const nextFactoryConst = source.indexOf('\n    const ', start + 1);
    const nextReturnObject = source.indexOf('\n    return {', start + 1);
    const nextExport = source.indexOf('\nexport ', start + 1);
    const nextFactoryEnd = source.indexOf('\n};', start + 1);
    const candidates = isFactoryFunction
        ? [nextFactoryConst, nextReturnObject, nextFactoryEnd].filter((index) => index !== -1)
        : [nextConst, nextExport].filter((index) => index !== -1);
    const nextDeclaration = candidates.length ? Math.min(...candidates) : -1;
    assert.notEqual(nextDeclaration, -1, `${name} boundary must be explicit`);
    return source.slice(start, nextDeclaration);
};
