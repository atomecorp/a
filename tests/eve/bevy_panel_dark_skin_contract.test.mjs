import assert from 'node:assert/strict';
import { test } from 'vitest';
import { BEVY_PANEL_TOKENS as T, BEVY_WORKSPACE_PANEL_TOKENS as W } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { SYSTEM_UI_METRICS } from '../../eVe/elements/system_ui_tokens.js';
import { accordionNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_accordion.js';
import { panelHierarchyNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_hierarchy.js';
import { node, buttonNode, buildBevyPanelTree } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { identityMediaFrameNode, mediaCardNode, tileMediaCardNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_media_card.js';
import { fieldNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_nodes.js';
import { textInputNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_editable_text.js';
import { hierarchicalSelectableListNode, virtualizedHierarchicalSelectableListNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_selectable_list.js';
import { applyTreeScrollLayout } from '../../eVe/domains/rendering/bevy_ui_scroll_layout.js';
import { createProjectViewFooter } from '../../eVe/domains/rendering/project_view_footer.js';
import { buildProjectViewSurfaceTree } from '../../eVe/domains/rendering/project_view_surface_tree.js';
import { createContactActionsRuntime } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_actions.js';
import { layoutForNode } from '../../eVe/domains/rendering/bevy_ui_layout_runtime.js';
import { normalizeBevyUiTree } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { normalizeBevySurfacePaint } from '../../eVe/domains/rendering/bevy_projection_style.js';
import { mapVirtualSceneNodeToBevyPayload, mapVirtualSceneStyleToBevyPatch } from '../../eVe/domains/rendering/bevy_projection_adapter.js';
import { buildHomeSettingsBody } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_settings_view.js';
import { normalizeHomeProfile } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js';

const walk = root => [root, ...(root.children || []).flatMap(walk)];
const find = (root, id) => walk(root).find(node => node.id === id);
const hex = color => '#' + color.slice(0,3).map(n => Math.round(n * 255).toString(16).padStart(2,'0')).join('');
const near = (a,b) => assert.ok(Math.abs(a-b)<0.001, `${a} differs from ${b}`);

test('filled disclosure colours match their own branch, including closed nested headers', () => {
    for (const direction of ['up', 'down']) for (const handedness of ['left', 'right']) {
        const child = accordionNode({ id: 'coloured_child', label: 'Child', width: 340, direction, handedness });
        const parent = accordionNode({ id: 'coloured_parent', label: 'Parent', width: 340, direction, handedness,
            expanded: true, bodyHeight: child.style.size[1], bodyChildren: [child] });
        const rail = panelHierarchyNode({ id: 'coloured', width: 340, children: [parent], handedness });
        assert.equal(T.hierarchy.lineWidthPx, 6);
        assert.equal(T.hierarchy.returnLengthPx, 2);
        const rootGlyph = find(rail, 'coloured_parent_chevron_triangle');
        near(rootGlyph.style.size[1] * (direction === "up" || direction === "down" ? 10 : 12) / 14, T.accordion.headerHeightPx * 0.28);
        const childGlyph = find(rail, 'coloured_child_chevron_triangle');
        assert.deepEqual(rootGlyph.image.tint, find(rail, 'coloured_parent_return_end').style.background);
        assert.equal(hex(rootGlyph.image.tint), '#f28c29');
        assert.equal(hex(childGlyph.image.tint), '#2a80ed');
        assert.equal(find(rail, 'coloured_child_return_end'), undefined);
        const records = projectBevyUiTreeRecords({ tree: { root: rail }, treeId: 'coloured', workspaceLayer: 'panel' });
        const glyph = records.find(record => record.id.endsWith('_coloured_parent_chevron_triangle_image'));
        assert.equal(glyph.type, 'image');
        assert.equal(glyph.properties.rotate, direction === 'up' ? -90 : 90);
        assert.ok(walk(rail).filter(n => n.id.includes('_return_')).every(n => n.style.size[0] === 8 && !n.on));
    }
});

test('fixed List symbols scale with cells and empty Molecules remain passive square leaves', () => {
    for (const side of [44, 60, 90]) for (const direction of ['up', 'down']) for (const handedness of ['left', 'right']) {
        const entries = [{ id: 'parent', label: 'Parent', depth: 0, hasChildren: true, expanded: true,
            expandDirection: direction }, { id: 'empty', label: 'Empty', depth: 1, hasChildren: false,
            visualRecord: { id: 'empty', properties: { molecule_entity: 'molecule' } } }];
        const list = hierarchicalSelectableListNode({ id: 'symbols', panelTokens: W,
            entries, width: 600, rowHeight: side, handedness,
            fixedColumns: { unit: side, hierarchyWidth: side, muteWidth: 0, nameWidth: side },
            onToggle: () => assert.fail('a leaf cannot expand') });
        const painted = panelHierarchyNode({ id: 'symbols_paint', width: 600, handedness, children: [list.node] });
        const control = find(painted, 'symbols_entry_0_hierarchy_chevron');
        const triangle = find(painted, 'symbols_entry_0_hierarchy_chevron_triangle');
        near(triangle.style.size[1] * (direction === "up" || direction === "down" ? 10 : 12) / 14, side * 0.28);
        assert.deepEqual(control.style.size, [W.select.chevronSizePx, W.select.chevronSizePx]);
        const leaf = find(painted, 'symbols_entry_1_hierarchy');
        const square = find(leaf, 'symbols_entry_1_hierarchy_square');
        assert.deepEqual(square.style.size, [side * 0.18, side * 0.18]);
        near(square.style.position[0] + square.style.size[0] / 2, side / 2);
        assert.equal(leaf.kind, 'panel');
        assert.equal(leaf.on, undefined);
        assert.equal(square.on, undefined);
        assert.equal(find(leaf, 'symbols_entry_1_hierarchy_chevron'), undefined);
        assert.deepEqual(square.style.background, triangle.image.tint);
        assert.deepEqual(find(painted, 'symbols_entry_1').style.size, [600, side]);
    }
});

test('virtual List retains an offscreen parent rail without changing scroll extent or row geometry', () => {
    for (const direction of ['up', 'down']) for (const handedness of ['left', 'right']) {
        const entries = [{ id: 'parent', label: 'Parent', depth: 0, hasChildren: true, expanded: true },
            ...Array.from({ length: 39 }, (_, i) => ({ id: 'leaf_' + i, label: 'Leaf', depth: 1 }))]
            .map(entry => ({ ...entry, expandDirection: direction }));
        if (direction === 'up') entries.reverse();
        const visibleStart = direction === 'up' ? 0 : 12;
        const list = virtualizedHierarchicalSelectableListNode({ id: 'window', panelTokens: W,
            width: 400, rowHeight: 60, entries, handedness, viewportHeight: 120, overscanRows: 1,
            windowState: { pageSize: 100, visibleStart },
            fixedColumns: { unit: 60, hierarchyWidth: 60, muteWidth: 0, nameWidth: 60 } });
        const parentIndex = direction === 'up' ? 39 : 0;
        assert.equal(find(list.node, `window_entry_${parentIndex}`), undefined);
        const leaf = walk(list.node).find(n => n.id.endsWith('_hierarchy_square'));
        assert.deepEqual(leaf.style.background, T.hierarchy.colors[1], 'offscreen parent still owns leaf colour');
        const start = find(list.node, `window_entry_${parentIndex}_return_start`);
        const end = find(list.node, `window_entry_${parentIndex}_return_end`);
        assert.equal(hex(start.style.background), '#2a80ed');
        assert.equal(hex(end.style.background), '#2a80ed');
        assert.ok(end.style.position[1] > start.style.position[1]);
        near(start.style.position[1] + 3, 30);
        near(end.style.position[1] + 3, 39 * 64 + 30);
        assert.deepEqual(find(list.node, `window_entry_${visibleStart}`).style.size, [400, 60]);
        const scrollEntries = new Map([['window_tree:window_virtual_list', { offsetY: visibleStart * 64 }]]);
        const scrolled = applyTreeScrollLayout({ tree: list.node, treeId: 'window_tree', entries: scrollEntries });
        const scroll = scrollEntries.get('window_tree:window_virtual_list');
        // Empty spacers do not add scrollable pixels.
        assert.equal(scroll.maxY, 40 * 60 + 39 * 4 - 120);
        assert.equal(scroll.offsetY, visibleStart * 64);
        const records = projectBevyUiTreeRecords({ tree: { root: scrolled }, treeId: 'window_tree', workspaceLayer: 'projectView' });
        const segment = records.find(record => record.id.includes('window_hierarchy_segment_'));
        assert.ok(segment);
        assert.equal(segment.properties.width, 6);
        const clip = segment.properties.clip;
        assert.ok(segment.properties.left >= clip.x && segment.properties.left + 6 <= clip.x + clip.width);
    }
});

test('List project header reuses row material and root rail while keeping its existing placement', () => {
    const previous = globalThis.window;
    try {
        for (const direction of ['up', 'down']) for (const handedness of ['left', 'right']) for (const collapsed of [false, true]) {
            globalThis.window = { __eveProfilePreferences: { visual: { accordionDirection: direction } } };
            const footer = createProjectViewFooter({ requestRefresh: () => {}, renameLevel: async () => true });
            const content = { build: ({ width }) => [node('tracks', 'panel', { size: [width, 120] })], recordsFor: () => [] };
            const tree = buildProjectViewSurfaceTree({ surface: { clientWidth: 800, clientHeight: 600 },
                state: { mode: 'list', projectId: 'project', tracksCollapsed: collapsed, presentationRatio: 1 / 3,
                    transportSnapshot: { status: 'stopped' } }, activeContent: () => content,
                syncVisualSubject: () => null, contextualState: { handedness }, emit: () => {}, footer,
                navigation: { current: { id: 'project' }, depth: 0 }, currentProjectName: () => 'Project' });
            const band = find(tree.root, 'project_view_footer_band');
            assert.deepEqual(band.style.background, W.controlMaterial.background);
            assert.deepEqual(band.style.backdrop, W.controlMaterial.backdrop);
            assert.equal(band.style.shadow, null, 'the background correction adds no footer shadow');
            assert.deepEqual(find(band, 'project_view_footer').style.background, W.colors.transparent);
            assert.equal(band.style.size[1], 60);
            assert.equal(find(band, 'project_view_footer_back'), undefined);
            assert.equal(find(band, 'project_view_footer_back_icon'), undefined);
            assert.deepEqual(find(band, 'project_view_footer_accordion').style.background,
                [...W.controlMaterial.tint.slice(0, 3), 0.10]);
            const root = find(tree.root, 'project_view_root_hierarchy');
            assert.deepEqual(root.style.size, band.style.size);
            const glyph = find(root, 'project_view_footer_accordion_symbol_triangle');
            near(glyph.style.size[1] * (collapsed ? 12 : 10) / 14, 60 * 0.28);
            assert.equal(hex(glyph.image.tint), '#f28c29');
            assert.equal(glyph.style.rotation, collapsed ? (handedness === 'left' ? 0 : 180) : (direction === 'up' ? -90 : 90));
            const marks = walk(root).filter(n => n.id.includes('_segment_'));
            assert.equal(marks.length, collapsed ? 0 : 1);
            if (!collapsed) {
                const start = find(root, 'project_view_footer_band_return_start');
                const end = find(root, 'project_view_footer_band_return_end');
                const top = marks[0].style.position[1], bottom = top + marks[0].style.size[1];
                near(start.style.position[1], top); near(end.style.position[1] + end.style.size[1], bottom);
                const innerEdge = handedness === 'left' ? -8 : band.style.size[0];
                near(start.style.position[0], innerEdge); near(end.style.position[0], innerEdge);
                near(start.style.size[0], 8); near(end.style.size[0], 8);
                const headerReturn = direction === 'up' ? end : start;
                near(headerReturn.style.position[1] + 3, band.style.size[1] / 2);
                const childReturn = direction === 'up' ? start : end;
                const body = find(tree.root, 'eve_bevy_ui_project_view_body');
                const content = find(tree.root, 'eve_bevy_ui_project_view_content');
                near(childReturn.style.position[1] + 3 + root.style.position[1],
                    content.style.position[1] + body.style.position[1] + (direction === 'up' ? 30 : 90));
            }
            if (!collapsed) assert.deepEqual(marks[0].style.background, glyph.image.tint);
        }
    } finally { globalThis.window = previous; }
});

test('nested language settings respect their actual content width', () => {
    const state = { profile: normalizeHomeProfile({preferences:{language:'fr'}}), guest:false,
        subsections:{'settings.preferences':true,'preferences.language':true}, selectOpen:'' };
    for (const width of [200,355,600]) {
        const root = buildHomeSettingsBody({state,width,emit:()=>{},editing:{}});
        assert.equal(find(root,'home_language_select_control').style.size[0],width);
    }
});

// Literal reference values guard the approved palette, rather than testing a
// builder against values derived from that same builder.
test('panel surfaces share the approved glass, opaque white ink and semantic hierarchy colours', () => {
    for (const [key, surface] of Object.entries(T.surfaces)) {
        if (key === 'input') {
            assert.deepEqual(surface.background, [0,0,0,.14]); assert.equal(surface.backdrop, null);
            assert.equal(surface.surfacePaint.border.color[3],0); continue;
        }
        assert.equal(surface.surfacePaint.gradient, null);
        assert.deepEqual(surface.background, [0,0,0,0]);
        assert.deepEqual(surface.backdrop, {blurPx:16,tint:[4/255,9/255,26/255,.69]});
    }
    assert.deepEqual(T.colors.text,[1,1,1,1]); assert.deepEqual(T.colors.muted,[1,1,1,1]);
    assert.deepEqual(T.hierarchy.colors.map(hex),['#f28c29','#2a80ed']);
    assert.equal(T.surfaces.control.shadow.color[3],.48);
    assert.equal(T.surfaces.control.shadows[0].color[3],.30);
    assert.equal(T.material.shadow,T.surfaces.shell.shadow);
    assert.equal(T.accordion.collapsedShadow,T.surfaces.control.shadow);
    assert.equal(T.select.menuShadow,T.surfaces.control.shadow);
});

test('standard rows, photo cards and minimum controls use the existing unit', () => {
    const unit = SYSTEM_UI_METRICS.scalePx(60);
    assert.equal(T.radiusPx,unit/4); assert.equal(T.inputHeightPx,unit/2);
    assert.equal(T.accordion.headerHeightPx,unit); assert.equal(T.contactIdentity.photoHeightPx,unit);
    assert.equal(T.footerHeightPx,unit); assert.equal(T.closeSizePx,unit/2);
    const tiny = buttonNode({id:'small_control',text:'+',width:8,height:8});
    assert.deepEqual(tiny.style.size,[unit/2,unit/2]); assert.equal(tiny.style.radius,unit/4);
    assert.equal(W.radiusPx,3); assert.equal(W.hierarchy,undefined);
    assert.equal(textInputNode({id:'workspace_input',panelTokens:W,value:'original'}).style.backdrop.blurPx,16);
    assert.equal(textInputNode({id:'panel_input',value:'dark'}).style.surfacePaint.gradient,null);
    assert.equal(tileMediaCardNode({id:'workspace_tile',panelTokens:W,label:'Original'}).style.surfacePaint.gradient,null);
    assert.equal(tileMediaCardNode({id:'workspace_tile',panelTokens:W,label:'Original'}).style.backdrop.blurPx,16);
    assert.equal(tileMediaCardNode({id:'panel_tile',label:'Panel'}).style.surfacePaint.gradient,null);
    const legacy=projectBevyUiTreeRecords({tree:normalizeBevyUiTree({id:'legacy',tree:node('legacy_border','panel',{
        size:[100,40],background:[0,0,0,0],border:[1,1,1,1],border_color:[1,1,1,1]})}),treeId:'legacy'});
    assert.equal(legacy.length,0);
});

for (const direction of ['up','down']) for (const handedness of ['left','right']) test(`four disclosure levels share a passive rail in the existing inset (${direction}, ${handedness})`, () => {
    const width=340;
    let child=node('deep_content','panel',{size:[width,30]});
    for(let level=5;level>=2;level--) {
        child=accordionNode({id:'level_'+level,label:'Level '+level,width,expanded:true,direction,handedness,
            bodyHeight:child.style.size[1],bodyChildren:[child]});
    }
    const rail=panelHierarchyNode({id:'hierarchy',width,children:[child],gap:T.gapPx,handedness});
    assert.equal(walk(rail).some(node=>/_level_(badge|number|endpoint)$/.test(node.id)),false);
    assert.deepEqual(find(rail,'hierarchy_content').style.position,[0,0]);
    assert.equal(find(rail,'hierarchy_content').style.size[0],width);
    for(let level=2;level<=5;level++) {
        const header=find(rail,'level_'+level+'_header'),body=find(rail,'level_'+level+'_body');
        assert.equal(header.style.size[0],width); assert.equal(body.style.size[0],width);
        assert.deepEqual(body.style.padding,[0,0,0,0]);
        if(direction==='up') assert.ok(header.style.position[1]>=body.style.position[1]+body.style.size[1]);
        else assert.ok(body.style.position[1]>=header.style.size[1]);
        assert.equal(hex(find(rail,'level_'+level+'_return_start').style.background),level%2===0?'#f28c29':'#2a80ed');
    }
    const segments=walk(rail).filter(node=>node.id.includes('_segment_'));
    assert.equal(new Set(segments.map(segment=>segment.style.position[0])).size,1);
    const axis=handedness==='left'?-5:width+5;
    segments.forEach(segment=>{
        near(segment.style.position[0]+segment.style.size[0]/2,axis);
        assert.equal(segment.on,undefined);
    });
    const returns=walk(rail).filter(node=>node.id.includes('_return_'));
    assert.equal(returns.length,8);
    returns.forEach(ret=>{
        assert.equal(ret.on,undefined);
        if(handedness==='left') near(ret.style.position[0]+ret.style.size[0],0);
        else near(ret.style.position[0],width);
    });
    const normalized=normalizeBevyUiTree({id:'hierarchy_tree',tree:rail});
    assert.ok(projectBevyUiTreeRecords({tree:normalized,treeId:'hierarchy_tree',workspaceLayer:'panel'}).length);
});

test('photo, field and footer contents are vertically centred in their actual layout boxes', () => {
    const photo=identityMediaFrameNode({id:'photo',width:340,title:'Contact photo',subtitle:'Profile image',source:'/actual-photo.jpg'});
    const avatar=find(photo,'photo_avatar'); const inset=(photo.style.size[1]-avatar.style.size[1])/2;
    near(avatar.style.position[0],inset); near(avatar.style.position[1],inset);
    const title=find(photo,'photo_title'),subtitle=find(photo,'photo_subtitle');
    near(title.style.position[1],photo.style.size[1]-(subtitle.style.position[1]+subtitle.style.size[1]));
    assert.equal(find(photo,'photo_image').image.source,'/actual-photo.jpg');
    const arrow=find(photo,'photo_arrow'); near(arrow.style.position[1]+arrow.style.size[1]/2,photo.style.size[1]/2);
    const media = mediaCardNode({id:'centred_media',accessibilityLabel:'Media',status:'ready',title:'Media',message:'Metadata',source:'/actual-photo.jpg'});
    const mediaTitle=find(media,'centred_media_title'),mediaMessage=find(media,'centred_media_message');
    near(mediaTitle.style.position[1],media.style.size[1]-mediaMessage.style.position[1]-mediaMessage.style.size[1]);
    const field=fieldNode({id:'name',field:'name',label:'Name',width:340,editing:{
        registerFieldWidth:()=>{},displayValue:()=> 'Ada',fieldView:()=>({})},emit:()=>{}});
    const boxes=layoutForNode(field,{x:0,y:0,width:340,height:T.inputHeightPx}).childBoxes;
    boxes.forEach(box=>near(box.y+box.height/2,T.inputHeightPx/2));
    const tree=buildBevyPanelTree({id:'centred',title:'Contacts',surfaceSize:{width:800,height:600},geometry:{left:0,top:0,width:420,height:360},
        bodyChildren:[],onClose:()=>{},onResize:()=>{},footerChildren:[buttonNode({id:'all',text:'Select all',width:102})]});
    const footer=find(tree.root,'centred_footer'); const close=find(footer,'centred_footer_close_indicator');
    near(close.style.position[1]+close.style.size[1]/2,T.footerHeightPx/2);
    const label=find(footer,'centred_footer_status'); assert.equal(label.style.text_vertical_align,'center');
    near(label.style.position[1]+label.style.size[1]/2,T.footerHeightPx/2);
    const selection=find(footer,'all'); near(selection.style.position[1]+selection.style.size[1]/2,T.footerHeightPx/2);
});

test('material survives normalization and the native bridge, while removal is explicit', () => {
    const source=node('material','panel',{size:[100,40],radius:15,...T.surfaces.control});
    const tree=normalizeBevyUiTree({id:'material_tree',tree:source});
    const records=projectBevyUiTreeRecords({tree,treeId:'material_tree',workspaceLayer:'panel'});
    const shape=records.find(record=>record.id.endsWith('_material'));
    const shadows=records.filter(record=>record.id.includes('_outer_shadow_'));
    assert.equal(shadows.length,1); assert.ok(shadows.every(record=>record.interactive!==true));
    const payload=mapVirtualSceneNodeToBevyPayload({id:'paint',kind:'shape',bounds:{x:0,y:0,width:100,height:40},
        renderLayer:2,material:{fill:T.surfaces.control.background,backdrop:shape.properties.material.backdrop,surfacePaint:shape.properties.material.surfacePaint}});
    assert.equal(payload.surface_paint.gradient,null);
    assert.equal(payload.backdrop.blur_px,16);
    assert.deepEqual(payload.backdrop.tint,[4/255,9/255,26/255,.69]);
    const clear=mapVirtualSceneStyleToBevyPatch({id:'paint',patch:{material:{surfacePaint:null}}});
    assert.ok(Object.hasOwn(clear,'surface_paint')); assert.equal(clear.surface_paint,null);
    assert.equal(Object.hasOwn(mapVirtualSceneStyleToBevyPatch({id:'plain',patch:{opacity:0.5}}),'surface_paint'),false);
    assert.throws(()=>normalizeBevySurfacePaint({gradient:{angle:0,stops:[{offset:1,color:'#fff'},{offset:0,color:'#000'}]}}));
});

test('flat hierarchical lists use real depths without consuming another indentation gutter', () => {
    for(const direction of ['up','down']) for(const handedness of ['left','right']) {
    const entries=[
        {id:'parent',label:'Parent',depth:0,hasChildren:true,expanded:true},
        {id:'child',label:'Child',depth:1,hasChildren:true,expanded:true},
        {id:'leaf',label:'Leaf',depth:2}].map(entry=>({...entry,expandDirection:direction}));
    if(direction==='up') entries.reverse();
    const list=hierarchicalSelectableListNode({id:'flat',width:340,entries,handedness,onToggle:()=>{}}).node;
    const rail=panelHierarchyNode({id:'flat_rail',width:340,children:[list],gap:0,handedness});
    assert.equal(walk(rail).some(node=>node.id.endsWith('_level_number')),false);
    assert.deepEqual(walk(rail).filter(node=>node.id.endsWith('_return_start')).map(node=>hex(node.style.background)),
        direction==='up'?['#2a80ed','#f28c29']:['#f28c29','#2a80ed']);
    assert.equal(find(list,'flat_entry_0').style.size[0],find(list,'flat_entry_2').style.size[0]);
    const childStart=find(rail,'flat_entry_1_return_start').style.position[1];
    const childEnd=find(rail,'flat_entry_1_return_end').style.position[1];
    const childMid=(childStart+childEnd)/2+T.hierarchy.lineWidthPx/2;
    const shared=walk(rail).find(node=>node.id.includes('_segment_')&&node.style.position[1]<=childMid
        &&node.style.position[1]+node.style.size[1]>=childMid);
    assert.equal(hex(shared.style.background),'#2a80ed');
    near(shared.style.position[0]+T.hierarchy.lineWidthPx/2,handedness==='left'?-5:345);
    }
});

test('contact commands fit narrow and wide bands without a footer selection action', () => {
    const snapshot={loading:false,importBusy:false,importSources:[],selectedIds:[],selectableCount:2,allSelected:false,mode:'book'};
    const actions=createContactActionsRuntime({state:{},reload:()=>{},setNotice:()=>{},contactForId:()=>{},contactId:()=>{},deletable:()=>false});
    for(const width of [200,380,600]) {
        const band=actions.buildFixedContent(snapshot,{emit:()=>{},bodyWidth:width})[0];
        const commands=walk(band).filter(node=>node.kind==='button');
        assert.ok(commands.some(node=>node.id==='contact_create_user')); assert.ok(commands.some(node=>node.id==='contact_add'));
        for(const row of band.children) {
            const boxes=layoutForNode(row,{x:0,y:0,width,height:T.actionButton.heightPx}).childBoxes;
            boxes.forEach(box=>{assert.ok(box.x>=0); assert.ok(box.x+box.width<=width+0.001); assert.ok(box.width>=2*T.radiusPx);});
        }
        assert.ok(commands.every(node=>node.accessibility.label));
    }
    assert.equal(actions.buildFooterContent,undefined);
    assert.equal(walk(actions.buildFixedContent(snapshot,{emit:()=>{},bodyWidth:380})[0]).some(node=>node.id==='contact_select_all'),false);
});

test('compact footer retains centered title, inset close, edge grips and bottom-only corners', () => {
    for(const handedness of ['right','left']) for(const width of [120,200,320,420]) {
        const calls=[];
        const tree=buildBevyPanelTree({id:'compact',title:'Contacts',handedness,
            surfaceSize:{width:800,height:600},geometry:{x:0,y:0,width,height:360},
            bodyChildren:[],onClose:()=>calls.push('close'),onDrag:()=>calls.push('drag'),
            onResize:(_event,edge)=>calls.push(edge)});
        const footer=find(tree.root,'compact_footer');
        assert.deepEqual(footer.style.size,[width,60]);
        assert.deepEqual(footer.style.radius_corners,[0,0,8,8]);
        assert.equal(find(tree.root,'compact_body').style.size[1],300);
        assert.equal(find(footer,'compact_footer_level_badge'),undefined);
        const close=find(footer,'compact_footer_close'),disc=find(footer,'compact_footer_close_indicator');
        assert.deepEqual(disc.style.size,[30,30]);
        near(close.style.position[1]+disc.style.position[1]+15,30);
        near(handedness==='left' ? close.style.position[0]+disc.style.position[0] :
            width-close.style.position[0]-disc.style.position[0]-30,T.paddingPx);
        const label=find(footer,'compact_footer_status');
        near(label.style.position[0]+label.style.size[0]/2,width/2);
        near(label.style.position[1]+label.style.size[1]/2,30);
        const drag=find(footer,'compact_footer_drag');
        assert.ok(handedness==='left' ? drag.style.position[0]>=close.style.position[0]+close.style.size[0] :
            drag.style.position[0]+drag.style.size[0]<=close.style.position[0]);
        const left=find(footer,'compact_footer_resize_left'),right=find(footer,'compact_footer_resize');
        near(left.style.position[0],0); near(right.style.position[0]+right.style.size[0],width);
        close.on.activate(); drag.on.drag({}); left.on.drag({}); right.on.drag({});
        assert.deepEqual(calls,['close','drag','left','right']);
        const records=projectBevyUiTreeRecords({tree:normalizeBevyUiTree({id:'compact_tree',tree:tree.root}),treeId:'compact_tree'});
        const projected=records.find(record=>record.id.endsWith('_compact_footer'));
        assert.deepEqual(projected.properties.corner_radii,[0,0,8,8]);
    }
});

test('closed sections have no hierarchy decoration or reserved column', () => {
    const closed=accordionNode({id:'closed',width:340,label:'Closed',expanded:false});
    const rail=panelHierarchyNode({id:'closed_rail',width:340,children:[closed]});
    assert.deepEqual(rail.children.map(node=>node.id),['closed_rail_content']);
    assert.deepEqual(rail.style.size,closed.style.size);
    assert.deepEqual(rail.children[0].style.position,[0,0]);
});

test('rail limits connect header centre to revealed content in either direction', () => {
    for(const direction of ['up','down']) {
        const accordion=accordionNode({id:'limit',width:340,label:'Section',expanded:true,direction,
            bodyHeight:120,bodyChildren:[node('limit_child','panel',{size:[340,120]})]});
        const rail=panelHierarchyNode({id:'limit_rail',width:340,children:[accordion]});
        const header=find(accordion,'limit_header');
        const start=find(rail,'limit_return_start'),end=find(rail,'limit_return_end');
        near((direction==='up'?end:start).style.position[1]+T.hierarchy.lineWidthPx/2,
            header.style.position[1]+header.style.size[1]/2);
        near((direction==='up'?start:end).style.position[1]+T.hierarchy.lineWidthPx/2,
            direction==='up'?0:accordion.style.size[1]);
    }
});

test('production projection gives all content the complete symmetric body width', async () => {
    const {buildPanelTreeForDefinition}=await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_projection.js');
    for(const [surfaceWidth,surfaceHeight] of [[320,640],[850,390],[900,800]]) {
        const surface={clientWidth:surfaceWidth,clientHeight:surfaceHeight};
        const runtimeState={geometryBySurfaceKey:new Map(),requestedHeightBySurfaceKey:new Map(),
            desktopGeometryBySurfaceKey:new Map(),fullscreenGeometryBySurfaceKey:new Map(),
            detachedSurfaceKeys:new Set(),chromeStateBySurfaceKey:new Map(),mounted:new Map()};
        const widths=[];
        const tree=buildPanelTreeForDefinition({surface,runtimeState,definition:{surfaceKey:'width_fixture',title:'Panel',
            buildContent:(_,{bodyWidth})=>{widths.push(bodyWidth);return [accordionNode({id:'width_header',width:bodyWidth,label:'Section'})];}},
            refresh:()=>{},closeBevyPanelSurface:()=>{},getPanelRuntime:()=>null,treeIdFor:key=>'eve_bevy_panel_'+key,
            surfaceSize:()=>({width:surfaceWidth,height:surfaceHeight}),pinnedAccordionAlign:()=>'',
            applyHeaderPinShift:({geometry})=>geometry,warnDuplicateNodeIds:(_,tree)=>tree,decoratePanelSweepTree:({tree})=>tree});
        const shell=find(tree.root,'eve_bevy_panel_width_fixture_panel');
        const header=find(tree.root,'width_header_header');
        near(header.style.size[0],shell.style.size[0]-2*T.paddingPx);
        assert.equal(widths.at(-1),header.style.size[0]);
        const body=find(tree.root,'eve_bevy_panel_width_fixture_body');
        assert.deepEqual(body.style.radius_corners,[T.shellRadiusPx,T.shellRadiusPx,0,0]);
        const records=projectBevyUiTreeRecords({tree:normalizeBevyUiTree({id:tree.id,tree}),treeId:tree.id,workspaceLayer:'panel'});
        const headerRecord=records.find(record=>record.id.endsWith('_width_header_header'));
        // Record projection snaps paint coordinates to pixels; layout remains exact.
        const left=headerRecord.properties.left-shell.style.position[0];
        const right=shell.style.position[0]+shell.style.size[0]-headerRecord.properties.left-headerRecord.properties.width;
        assert.ok(Math.abs(left-T.paddingPx)<=0.5);
        assert.ok(Math.abs(right-T.paddingPx)<=1);
        assert.ok(Math.abs(left-right)<=1);
    }
});


test('common settings reach GPU and CSS independently of opaque system text at every endpoint', async () => {
    const {SYSTEM_UI_THEME_TOKENS:theme,resolveSystemUiSurface}=await import('../../eVe/elements/system_ui_tokens.js');
    assert.deepEqual(theme.surface,{color:'#0d1e57',opacity:69,darkness:70,blur:'all',blurPx:16});
    assert.equal(theme.panelBackground,'rgba(4,9,26,0.69)');
    for(const [opacity,darkness,expected] of [[0,0,[13/255,30/255,87/255,0]],[100,100,[0,0,0,1]]]) {
        const paint=resolveSystemUiSurface({...theme.surface,opacity,darkness});
        assert.deepEqual(paint.backdrop.tint,expected);
        assert.deepEqual(paint.background,[0,0,0,0]);
        assert.deepEqual(resolveSystemUiSurface({...theme.surface,opacity,darkness,blur:'none'}).background,expected);
        assert.equal(resolveSystemUiSurface({...theme.surface,opacity,darkness},{blur:false}).backdrop,null);
        assert.deepEqual(theme.textRgba,[1,1,1,1]);
    }
});

test('real Monitor lines and values stay opaque while input placeholders fade without fading their containers', async () => {
    const {createProgramPanelSurface}=await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_program_runtime.js');
    const {initialProgram}=await import('../../eVe/domains/programs/project_program_model.js');
    const {buildBevyToolSliderNode}=await import('../../eVe/intuition/shared/bevy_ui_tool_slider.js');
    const surface=createProgramPanelSurface({surfaceKey:'white_monitor',call:async()=>({ok:false})});
    Object.assign(surface.readState(),{tab:'monitor',data:{program:initialProgram('sleep'),observations:[],events:[],revisions:[]}});
    const content=surface.buildContent(surface.readState(),{bodyWidth:500,emit:()=>{}});
    const root=buildBevyPanelTree({id:'white',title:'Moniteur',surfaceSize:{width:900,height:800},
        geometry:{x:0,y:0,width:600,height:600},bodyChildren:[...content,
            ...['age','weight','height'].map(id=>textInputNode({id,placeholder:id,value:''})),
            buildBevyToolSliderNode({id:'white_slider',value:8,min:1,max:11,step:1,unit:'h',expanded:true,itemSize:60,
                orientation:'horizontal',availableLength:300,sliderOptions:{showBounds:true,lengthPx:'fill'}})]}).root;
    const texts=walk(root).filter(item=>item.text);
    assert.ok(texts.some(item=>item.id==='white_monitor_version'));
    assert.ok(texts.some(item=>item.id==='age_text'));
    assert.ok(texts.some(item=>item.id.includes('white_slider')));
    for(const item of texts) {
        assert.deepEqual(item.style.color,[1,1,1,1],item.id);
        assert.equal(item.style.opacity??1,['age_text','weight_text','height_text'].includes(item.id)?0.63:1,item.id);
    }
    for(const item of walk(root)) assert.equal(item.style?.opacity??1,['age_text','weight_text','height_text'].includes(item.id)?0.63:1,item.id);
    const records=projectBevyUiTreeRecords({tree:normalizeBevyUiTree({id:'white_tree',tree:root}),treeId:'white_tree'});
    for(const record of records.filter(item=>item.type==='text')) {
        assert.equal(record.properties.color,'rgba(255,255,255,1)',record.id);
        assert.equal(record.properties.opacity, /_(age|weight|height)_text(?:_text)?$/.test(record.id)?0.63:1,record.id);
    }
});

test('a fully visible virtual List has no phantom scrollbar and genuine overflow remains scrollable', () => {
    for (const count of [1, 2, 20]) for (const handedness of ['left', 'right']) {
        const list = virtualizedHierarchicalSelectableListNode({ id: 'extent', panelTokens: W, width: 320, rowHeight: 60, handedness,
            entries: Array.from({ length: count }, (_, index) => ({ id: 'leaf_' + index, label: 'Draw', depth: 0 })),
            viewportHeight: 124, minimumViewportHeight: 0, windowState: { pageSize: 100 },
            fixedColumns: { unit: 60, nameWidth: 60, hierarchyWidth: 60, muteWidth: 0 } });
        const entries = new Map([['extent_tree:extent_virtual_list', { active: true, offsetY: 0 }]]);
        const scrolled = applyTreeScrollLayout({ tree: list.node, treeId: 'extent_tree', entries });
        const scroll = entries.get('extent_tree:extent_virtual_list');
        assert.equal(scroll.maxY, Math.max(0, count * 60 + (count - 1) * 4 - 124));
        assert.equal(Boolean(find(scrolled, 'extent_virtual_list__scroll_thumb')), count > 2);
        assert.equal(find(scrolled, 'extent_before'), undefined);
    }
});
