import assert from 'node:assert/strict';
import { test } from 'vitest';
import { intersectBoxes, overflowClipForNode } from '../../eVe/domains/rendering/bevy_ui_layout_runtime.js';
import { readBevyProjectionRoundedClips } from '../../eVe/domains/rendering/bevy_projection_clip_contract.js';
import { scaleTreeForRender } from '../../eVe/domains/rendering/bevy_ui_render_scale.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { patchBevyUiTreeMotion, projectBevyUiTreeOverlay } from '../../eVe/domains/rendering/bevy_ui_project_overlay_runtime.js';
import { clearAllProjectScenes, getProjectSceneState, renderProjectScene } from '../../eVe/domains/rendering/project_scene_runtime.js';
import { createTestCompositor, installDom } from './unified_rendering_test_helpers.mjs';

const box = { x: 10, y: 20, width: 200, height: 180 };
const viewport = { id: 'viewport', kind: 'scroll_area', style: { position: [10,20], size: [200,180], overflow: 'scroll_y', radius_corners: [15,15,0,0] }, children: [
    { id: 'content', kind: 'panel', style: { size: [200,300] }, children: [
        { id: 'rail', kind: 'panel', style: { position: [192,-80], size: [3.5,280], background: [0,0.5,1,1] } }
    ] }
] };
const tree = () => ({ id: 'eve_bevy_panel_rounded', root: { id:'root', kind:'root', style:{size:[500,400]}, children:[structuredClone(viewport)] } });

test('rounded overflow preserves original arcs through square and nested intersections', () => {
    const clip = overflowClipForNode(viewport, box);
    const nested = overflowClipForNode({style:{overflow:'hidden'}},{x:0,y:0,width:500,height:300},clip);
    assert.deepEqual(nested.roundedRects,clip.roundedRects);
    assert.deepEqual(intersectBoxes(clip,{x:20,y:30,width:180,height:80}).roundedRects,clip.roundedRects);
    assert.deepEqual(readBevyProjectionRoundedClips(clip),[[10,20,200,180,15,15,0,0]]);
    assert.deepEqual(readBevyProjectionRoundedClips({x:0,y:0,width:20,height:20}),[]);
    assert.throws(()=>readBevyProjectionRoundedClips({roundedRects:[[0,0,20,20,-1,0,0,0]]}));
});

test('scrolling moves only rail geometry and scales rounded overflow with the viewport', () => {
    const project = source => projectBevyUiTreeRecords({tree:source,treeId:source.id,workspaceLayer:'panel'}).find(record=>record.id.endsWith('_rail'));
    const first = project(tree());
    const scrolled = tree(); scrolled.root.children[0].style.scroll=[0,40];
    const next = project(scrolled);
    assert.equal(next.id,first.id);
    assert.deepEqual(next.properties.clip,first.properties.clip);
    assert.equal(next.properties.top,first.properties.top-40);
    const scaled = project(scaleTreeForRender({tree:tree(),scale:2}));
    assert.deepEqual(scaled.properties.clip.roundedRects,[[20,40,400,360,30,30,0,0]]);
});

test('resizing recomputes the rounded viewport while keeping scroll and render scale', () => {
    for (const scale of [1,2]) {
        const source=tree();
        const resized=source.root.children[0];
        resized.style.position=[30,40]; resized.style.size=[260,140]; resized.style.scroll=[0,60];
        resized.children[0].style.size[0]=260;
        resized.children[0].children[0].style.position[0]=252;
        const records=projectBevyUiTreeRecords({tree:scaleTreeForRender({tree:source,scale}),treeId:source.id,workspaceLayer:'panel'});
        const rail=records.find(record=>record.id.endsWith('_rail'));
        assert.deepEqual(rail.properties.clip.roundedRects,[[30,40,260,140,15,15,0,0].map(value=>value*scale)]);
        assert.equal(rail.properties.left,282*scale);
        assert.equal(rail.properties.top,-100*scale);
    }
});

test('direct whole-tree motion translates rounded boundaries without respawning content', async () => {
    const dom = installDom('<html><body><main id="project"></main></body></html>');
    const calls=[];
    dom.window.__ATOME_COMPOSITOR__=createTestCompositor(calls);
    try {
        await clearAllProjectScenes({documentRef:dom.window.document});
        await renderProjectScene({projectId:'__eve_dashboard_workspace__',records:[],host:dom.window.document.getElementById('project'),compositor:createTestCompositor(calls),documentRef:dom.window.document});
        const source=tree();
        await projectBevyUiTreeOverlay({tree:source,documentRef:dom.window.document});
        calls.length=0;
        const result=await patchBevyUiTreeMotion({treeId:source.id,updates:[{translateTree:[30,40]}],documentRef:dom.window.document});
        assert.equal(result.ok,true);
        const rail=getProjectSceneState('__eve_dashboard_workspace__').records.find(record=>record.id.endsWith('_rail'));
        assert.deepEqual(rail.properties.clip.roundedRects,[[40,60,200,180,15,15,0,0]]);
        const ops=calls.flatMap(call=>call.ops||[]);
        assert.equal(ops.some(op=>op.type==='spawn'||op.type==='despawn'),false);
        assert.ok(ops.some(op=>op.type==='transform'&&op.patch?.clip_rounded_rects?.length===1), JSON.stringify(calls));
    } finally { await clearAllProjectScenes({documentRef:dom.window.document}); }
});

test('nested rounded viewports retain both original boundaries', () => {
    const outer = overflowClipForNode(viewport, box);
    const inner = overflowClipForNode({style:{overflow:'hidden',radius:5}}, {x:12,y:20,width:196,height:160}, outer);
    assert.deepEqual(inner.roundedRects, [[10,20,200,180,15,15,0,0],[12,20,196,160,5,5,5,5]]);
});
