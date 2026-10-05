import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buttonNode, panelIconButtonNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { toggleableRowNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_choice.js';
import { segmentedControlNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_segmented_control.js';
import { BEVY_PANEL_TOKENS as T } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { buildBevyIconButtonNode } from '../../eVe/intuition/shared/bevy_ui_icon_button.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';

test('panel material leaves the shared icon source, tint and geometry intact in every state', () => {
    for (const state of ['idle','active','hovered','pressed','focused','disabled']) {
        const options={id:'icon',icon:'fixture.svg',tone:'danger',[state]:true};
        const shared=buildBevyIconButtonNode(options), panel=panelIconButtonNode(options);
        assert.deepEqual(panel.children[1],shared.children[1]);
        assert.deepEqual(panel.style.size,shared.style.size);
        assert.equal(panel.children[0].style.surfacePaint.border.color[3],0);
        assert.notDeepEqual(panel.children[0].style,shared.children[0].style);
    }
});

test('action states have one rounded surface, no coloured outline, and disabled actions cannot activate', () => {
    for (const state of ['idle','primary','hovered','pressed','focused','disabled']) {
        const tree=buttonNode({id:'action',text:'Valider',width:120,[state]:true,onActivate:()=>{}});
        assert.equal(tree.style.surfacePaint.border.color[3],0);
        assert.equal(tree.style.border,undefined);
        const records=projectBevyUiTreeRecords({tree:{root:tree},treeId:'state',workspaceLayer:'panel'});
        const surface=records.find(record=>record.id==='__eve_bevy_ui_state_action');
        assert.equal(surface.properties.width,120);
        assert.equal(surface.properties.height,T.actionButton.heightPx);
        assert.equal(surface.properties.corner_radius,T.actionButton.radiusPx);
        assert.equal(records.filter(record=>record.properties.shape==='rounded_rect' && !record.id.includes('_outer_shadow_')).length,1);
        if(state==='disabled') assert.equal(tree.on,undefined);
    }
});

test('switch and checkbox paint follows the indicator, never the hit column', () => {
    for (const kind of ['switch','checkbox']) for (const state of ['idle','checked','hovered','pressed','focused','disabled']) {
        const tree=toggleableRowNode({id:'choice',kind,label:'Choix',[state]:true});
        assert.equal(tree.children.some(child=>child.id==='choice_background'),false);
        const indicator=tree.children.find(child=>child.id==='choice_indicator');
        assert.equal(indicator.style.surfacePaint.border.color[3],0);
        assert.ok(indicator.style.size[0]<=tree.style.size[0]);
        assert.ok(indicator.style.size[1]<=tree.style.size[1]);
        const records=projectBevyUiTreeRecords({tree:{root:tree},treeId:'choice',workspaceLayer:'panel'});
        assert.ok(records.find(record=>record.id.endsWith('_choice_indicator')));
    }
});

test('segmented selection has an inset rounded surface within the original interactive partition', () => {
    const tree=segmentedControlNode({id:'segments',options:[{value:'a',label:'A'},{value:'b',label:'B'}],value:'a'});
    const segment=tree.children[0], surface=segment.children[0];
    assert.equal(segment.style.size[0],Math.floor(T.inputWidthPx/2));
    assert.deepEqual(surface.style.position,[T.segmentedControl.insetPx,T.segmentedControl.insetPx]);
    assert.ok(surface.style.size[0]+surface.style.position[0]*2<=segment.style.size[0]);
    assert.ok(surface.style.size[1]+surface.style.position[1]*2<=segment.style.size[1]);
    assert.ok(tree.children.every(child=>child.children.every(node=>node.kind!=='divider')));
});
