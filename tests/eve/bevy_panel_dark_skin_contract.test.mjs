import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
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
import { panelBandHeight, panelBandReserve, panelBandTool } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_band.js';
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
        // The nesting reads through the symbols alone: the rail beside the cells is gone (bevy_panel_hierarchy.js).
        assert.deepEqual(Object.keys(T.hierarchy), ['colors']);
        const rootGlyph = find(rail, 'coloured_parent_chevron_triangle');
        near(rootGlyph.style.size[1] * (direction === "up" || direction === "down" ? 10 : 12) / 14, T.accordion.headerHeightPx * 0.28);
        const childGlyph = find(rail, 'coloured_child_chevron_triangle');
        assert.deepEqual(rootGlyph.image.tint, T.hierarchy.colors[0]);
        assert.equal(hex(rootGlyph.image.tint), '#f28c29');
        assert.equal(hex(childGlyph.image.tint), '#2a80ed');
        const records = projectBevyUiTreeRecords({ tree: { root: rail }, treeId: 'coloured', workspaceLayer: 'panel' });
        const glyph = records.find(record => record.id.endsWith('_coloured_parent_chevron_triangle_image'));
        assert.equal(glyph.type, 'image');
        assert.equal(glyph.properties.rotate, direction === 'up' ? -90 : 90);
        assert.equal(walk(rail).some(n => /_(return|segment)_/.test(n.id)), false, 'no rail is drawn beside the cells');
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

test('virtual List keeps an offscreen parent\'s leaf colour without a rail, scroll extent or row geometry change', () => {
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
        assert.equal(walk(list.node).some(n => /_(return|segment)_/.test(n.id)), false, 'no rail is drawn beside the rows');
        assert.deepEqual(find(list.node, `window_entry_${visibleStart}`).style.size, [400, 60]);
        const scrollEntries = new Map([['window_tree:window_virtual_list', { offsetY: visibleStart * 64 }]]);
        const scrolled = applyTreeScrollLayout({ tree: list.node, treeId: 'window_tree', entries: scrollEntries });
        const scroll = scrollEntries.get('window_tree:window_virtual_list');
        // Empty spacers do not add scrollable pixels.
        assert.equal(scroll.maxY, 40 * 60 + 39 * 4 - 120);
        assert.equal(scroll.offsetY, visibleStart * 64);
        const records = projectBevyUiTreeRecords({ tree: { root: scrolled }, treeId: 'window_tree', workspaceLayer: 'projectView' });
        assert.ok(records.length);
        assert.equal(records.some(record => /_(return|segment)_/.test(record.id)), false);
    }
});

test('List project header reuses row material and the root symbol colour while keeping its existing placement', () => {
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
            // Open or folded, the header's symbol alone tells the level: no rail runs to the tracks.
            assert.equal(walk(root).some(n => /_(return|segment)_/.test(n.id)), false);
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
            assert.equal(surface.surfacePaint.border,undefined,'an inset tint, never an outline'); continue;
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
    // One radius rule (AGENTS.md rule 14): 3 px for every corner that is not a disc.
    assert.equal(T.radiusPx,SYSTEM_UI_METRICS.radiusPx); assert.equal(T.radiusPx,3); assert.equal(T.inputHeightPx,unit/2);
    assert.equal(T.accordion.headerHeightPx,unit); assert.equal(T.contactIdentity.photoHeightPx,unit);
    assert.equal(T.footerHeightPx,unit); assert.equal(T.backSizePx,unit/2);
    const tiny = buttonNode({id:'small_control',text:'+',width:8,height:8});
    assert.deepEqual(tiny.style.size,[unit/2,unit/2]); assert.equal(tiny.style.radius,T.radiusPx);
    assert.equal(W.radiusPx,3); assert.equal(W.hierarchy,undefined);
    assert.equal(textInputNode({id:'workspace_input',panelTokens:W,value:'original'}).style.backdrop.blurPx,16);
    assert.equal(textInputNode({id:'panel_input',value:'dark'}).style.surfacePaint.gradient,null);
    assert.equal(tileMediaCardNode({id:'workspace_tile',panelTokens:W,label:'Original'}).style.surfacePaint.gradient,null);
    assert.equal(tileMediaCardNode({id:'workspace_tile',panelTokens:W,label:'Original'}).style.backdrop.blurPx,16);
    assert.equal(tileMediaCardNode({id:'panel_tile',label:'Panel'}).style.surfacePaint.gradient,null);
    // A border the user did not name is refused, never silently painted (AGENTS.md rule 15, design_charter.js).
    assert.throws(()=>normalizeBevyUiTree({id:'legacy',tree:node('legacy_border','panel',{
        size:[100,40],background:[0,0,0,0],border:[1,1,1,1],border_color:[1,1,1,1]})}),/design_charter_border_forbidden/);
});

for (const direction of ['up','down']) for (const handedness of ['left','right']) test(`four disclosure levels alternate their symbol colours at full width, without a rail (${direction}, ${handedness})`, () => {
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
        assert.equal(hex(find(rail,'level_'+level+'_chevron_triangle').image.tint),level%2===0?'#f28c29':'#2a80ed');
    }
    // The rail beside the cells is gone (bevy_panel_hierarchy.js): no segment, no return, nothing to touch.
    assert.equal(walk(rail).some(node=>/_(return|segment)_/.test(node.id)),false);
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
    const tree=buildBevyPanelTree({id:'centred',title:'Contacts',name:'Contacts',surfaceSize:{width:800,height:600},geometry:{x:0,y:0,width:420,height:360},
        bodyChildren:[],onClose:()=>{},onResize:()=>{},bandItems:[panelBandTool('all',{onSelect:()=>{}})]});
    const footer=find(tree.root,'centred_footer'),height=footer.style.size[1];
    assert.equal(height,panelBandHeight());
    const close=find(footer,'centred_footer_close'); near(close.style.position[1]+close.style.size[1]/2,height/2);
    const label=find(footer,'centred_footer_name'); assert.equal(label.style.text_vertical_align,'center');
    near(label.style.position[1]+label.style.size[1]/2,height/2);
    const selection=find(footer,'centred_footer_all'); near(selection.style.position[1]+selection.style.size[1]/2,height/2);
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
    // Each row's own depth colours its symbol (listHierarchy.levelOffset), with no rail beside the rows.
    assert.deepEqual(walk(rail).filter(node=>node.id.endsWith('_hierarchy_chevron_triangle')).map(node=>hex(node.image.tint)),
        direction==='up'?['#2a80ed','#f28c29']:['#f28c29','#2a80ed']);
    assert.equal(walk(rail).some(node=>/_(return|segment)_/.test(node.id)),false);
    assert.equal(find(list,'flat_entry_0').style.size[0],find(list,'flat_entry_2').style.size[0]);
    }
});

test('contact commands fit narrow and wide bands without a footer selection action', () => {
    const snapshot={loading:false,importBusy:false,importSources:[],selectedIds:[],selectableCount:2,allSelected:false,mode:'book',query:''};
    const actions=createContactActionsRuntime({state:{},reload:()=>{},setNotice:()=>{},contactForId:()=>{},contactId:()=>{},deletable:()=>false});
    const editing={registerField:()=>{},fieldView:()=>({})};
    // The Contact commands lie in the panel's foot band (bevy_panel_contact_actions.js#buildBandTools), never a footer row.
    assert.equal(actions.buildFixedContent,undefined); assert.equal(actions.buildFooterContent,undefined);
    const tools=actions.buildBandTools(snapshot,{emit:()=>{},editing});
    assert.equal(tools.some(tool=>tool.key==='contact_select_all'),false,'nothing ticked, no selection action');
    for(const width of [200,380,600]) {
        const tree=buildBevyPanelTree({id:'contact_fit',title:'Contacts',surfaceSize:{width:800,height:600},
            geometry:{x:0,y:0,width,height:360},bodyChildren:[],onClose:()=>{},bandItems:tools});
        const band=find(tree.root,'contact_fit_footer');
        const commands=band.children.filter(node=>node.on?.activate||node.kind==='text_input');
        assert.ok(commands.some(node=>node.id==='contact_fit_footer_contact_create'));
        assert.ok(commands.some(node=>node.id==='contact_fit_footer_close'));
        commands.forEach(node=>{
            assert.ok(node.style.position[0]>=0); assert.ok(node.style.position[0]+node.style.size[0]<=band.style.size[0]+0.001);
            assert.ok(node.style.size[0]>=2*T.radiusPx); assert.ok(node.accessibility.label,node.id);
        });
        assert.equal(walk(band).some(node=>node.id.endsWith('contact_select_all')),false);
    }
});

test('compact foot band retains its centred name, corner close, drag room and edge grips inside one glass', () => {
    const previous=globalThis.window;
    try { for(const handedness of ['right','left']) for(const width of [120,200,320,420]) {
        globalThis.window={innerWidth:800,innerHeight:600,__eveIntuitionXState:{handedness}};
        const calls=[];
        const tree=buildBevyPanelTree({id:'compact',title:'Contacts',name:'Contacts',
            surfaceSize:{width:800,height:600},geometry:{x:0,y:0,width,height:360},
            bodyChildren:[],onClose:()=>calls.push('close'),onDrag:()=>calls.push('drag'),
            onResize:(_event,edge)=>calls.push(edge)});
        const height=panelBandHeight(),pad=T.paddingPx;
        const footer=find(tree.root,'compact_footer');
        // The band lies inside the slab, inset by the padding (AGENTS.md rule 13): one glass, one radius.
        assert.deepEqual(footer.style.size,[width-2*pad,height]);
        assert.deepEqual(footer.style.position,[pad,360-pad-height]);
        assert.equal(find(tree.root,'compact_panel').style.radius,T.shellRadiusPx);
        assert.equal(find(tree.root,'compact_body').style.size[1],360-panelBandReserve());
        assert.equal(find(footer,'compact_footer_level_badge'),undefined);
        const close=find(footer,'compact_footer_close');
        assert.deepEqual(close.style.size,[height,height]);
        near(handedness==='left'?close.style.position[0]:footer.style.size[0]-close.style.position[0]-height,0);
        const label=find(footer,'compact_footer_name');
        if(width>=320) assert.ok(label,'a name that fits is shown');
        if(label) {
            assert.equal(label.style.text_vertical_align,'center');
            near(label.style.position[0]+label.style.size[0]/2,footer.style.size[0]/2);
            near(label.style.position[1]+label.style.size[1]/2,height/2);
        }
        const drag=find(footer,'compact_footer_drag');
        assert.ok(handedness==='left' ? drag.style.position[0]>=close.style.position[0]+close.style.size[0] :
            drag.style.position[0]+drag.style.size[0]<=close.style.position[0]);
        const left=find(tree.root,'compact_footer_resize_left'),right=find(tree.root,'compact_footer_resize');
        near(left.style.position[0],0); near(right.style.position[0]+right.style.size[0],width);
        close.on.activate(); drag.on.drag({}); left.on.drag({}); right.on.drag({});
        assert.deepEqual(calls,['close','drag','left','right']);
    } } finally { globalThis.window=previous; }
});

test('closed sections have no hierarchy decoration or reserved column', () => {
    const closed=accordionNode({id:'closed',width:340,label:'Closed',expanded:false});
    const rail=panelHierarchyNode({id:'closed_rail',width:340,children:[closed]});
    assert.deepEqual(rail.children.map(node=>node.id),['closed_rail_content']);
    assert.deepEqual(rail.style.size,closed.style.size);
    assert.deepEqual(rail.children[0].style.position,[0,0]);
});

test('an open section joins its header to its revealed content in either direction, without rail limits', () => {
    for(const direction of ['up','down']) {
        const accordion=accordionNode({id:'limit',width:340,label:'Section',expanded:true,direction,
            bodyHeight:120,bodyChildren:[node('limit_child','panel',{size:[340,120]})]});
        const rail=panelHierarchyNode({id:'limit_rail',width:340,children:[accordion]});
        const header=find(rail,'limit_header'),body=find(rail,'limit_body');
        // Up: the content stacks above the header, against it; down: right under it (AGENTS.md rule 14).
        if(direction==='up') near(body.style.position[1]+body.style.size[1],header.style.position[1]);
        else near(body.style.position[1],header.style.position[1]+header.style.size[1]);
        assert.equal(find(rail,'limit_return_start'),undefined); assert.equal(find(rail,'limit_return_end'),undefined);
        assert.equal(hex(find(rail,'limit_chevron_triangle').image.tint),'#f28c29');
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
            warnDuplicateNodeIds:(_,tree)=>tree,decoratePanelSweepTree:({tree})=>tree});
        const shell=find(tree.root,'eve_bevy_panel_width_fixture_panel');
        const header=find(tree.root,'width_header_header');
        near(header.style.size[0],shell.style.size[0]-2*T.paddingPx);
        assert.equal(widths.at(-1),header.style.size[0]);
        const body=find(tree.root,'eve_bevy_panel_width_fixture_body');
        // The foot band lies inside the one glass silhouette: the body keeps every corner of the slab.
        assert.deepEqual(body.style.radius_corners,[T.shellRadiusPx,T.shellRadiusPx,T.shellRadiusPx,T.shellRadiusPx]);
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
    // readState is a snapshot: the panel's data comes from its own read (onOpen → project.program.read → hydrate).
    const data={ok:true,program:initialProgram('sleep'),observations:[],events:[],revisions:[]};
    const surface=createProgramPanelSurface({surfaceKey:'white_monitor',readProjects:async()=>[],
        call:async payload=>(payload.tool_id==='project.program.read'?structuredClone(data):{ok:false})});
    const {JSDOM}=await import('jsdom'),dom=new JSDOM('<body></body>',{url:'http://localhost'});
    vi.stubGlobal('window',dom.window); vi.stubGlobal('document',dom.window.document);
    let content;
    try {
        surface.onOpen({context:{project_id:'p',tab:'monitor'},refresh:()=>{}});
        await vi.waitFor(()=>assert.ok(surface.readState().data?.program));
        content=surface.buildContent(surface.readState(),{bodyWidth:500,emit:()=>{}});
    } finally { surface.onClose?.(); dom.window.close(); vi.unstubAllGlobals(); }
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
