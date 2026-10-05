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
import { hierarchicalSelectableListNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_selectable_list.js';
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
test('panel surfaces retain all reference gradients, ink and hierarchy colours', () => {
    const expected = { shell: ['#292e35','#24292f','#20252b'], control: ['#292e35','#24292f','#20252b'],
        rig: ['#2b3037','#252a31','#1e2329'], input: ['#14181d','#181d22'],
        active: ['#25364d','#24354b','#213146'], button: ['#2d333a','#23282f'],
        footer: ['#24292f','#191e24','#191e24'], close: ['#2d333a','#242930'],
        placeholder: ['#555b62','#3d434a'], arrow: ['#343a42','#2b3037'], activeArrow: ['#33445c','#2b3d54'] };
    for (const [name, colours] of Object.entries(expected)) {
        assert.deepEqual(T.surfaces[name].surfacePaint.gradient.stops.map(stop => hex(stop.color)), colours);
    }
    assert.equal(hex(T.material.surfacePaint.border.color),'#383e46');
    assert.equal(hex(T.colors.text),'#f1f3f5'); assert.equal(hex(T.colors.muted),'#9a9fa7');
    assert.equal(hex(T.colors.referenceBackdrop),'#080b0f');
    assert.deepEqual(T.hierarchy.colors.map(hex),['#f28c29','#2a80ed']);
    assert.equal(T.surfaces.input.surfacePaint.insetShadows[0].color[3],0.34);
    assert.equal(T.surfaces.control.shadow.color[3],0.48);
    assert.equal(T.surfaces.control.shadows[0].color[3],0.30);
    assert.deepEqual(T.surfaces.control.surfacePaint.border.colors.map(color=>color[3]),[.09,.09,.045,.09]);
    assert.deepEqual(T.surfaces.button.surfacePaint.border.colors.map(color=>color[3]),[.08,.08,.035,.08]);
    assert.equal(T.surfaces.arrow.surfacePaint.border.color[3],0);
    assert.equal(T.material.shadow,T.surfaces.shell.shadow);
    assert.equal(T.material.shadows,T.surfaces.shell.shadows);
    assert.equal(T.material.surfacePaint.gradient,T.surfaces.shell.surfacePaint.gradient);
    assert.equal(T.material.background,T.surfaces.control.background);
    assert.equal(T.material.surfacePaint.gradient,T.surfaces.control.surfacePaint.gradient);
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
    assert.equal(textInputNode({id:'workspace_input',panelTokens:W,value:'original'}).style.surfacePaint,undefined);
    assert.ok(textInputNode({id:'panel_input',value:'dark'}).style.surfacePaint.gradient);
    assert.equal(tileMediaCardNode({id:'workspace_tile',panelTokens:W,label:'Original'}).style.surfacePaint,undefined);
    assert.equal(tileMediaCardNode({id:'workspace_tile',panelTokens:W,label:'Original'}).style.backdrop,undefined);
    assert.ok(tileMediaCardNode({id:'panel_tile',label:'Panel'}).style.surfacePaint.gradient);
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
    const axis=handedness==='left'?-T.paddingPx/2:width+T.paddingPx/2;
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
        renderLayer:2,material:{fill:T.surfaces.control.background,surfacePaint:shape.properties.material.surfacePaint}});
    assert.equal(payload.surface_paint.gradient.angle,145);
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
    near(shared.style.position[0]+T.hierarchy.lineWidthPx/2,handedness==='left'?-T.paddingPx/2:340+T.paddingPx/2);
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
        assert.deepEqual(footer.style.radius_corners,[0,0,15,15]);
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
        assert.deepEqual(projected.properties.corner_radii,[0,0,15,15]);
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
        assert.deepEqual(body.style.radius_corners,[T.radiusPx,T.radiusPx,0,0]);
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
