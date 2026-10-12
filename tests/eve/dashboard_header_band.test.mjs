import { describe, it, expect } from 'vitest';
import { createDashboardLayout, hitTestDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { buildDashboardRecords, dashboardRecordId } from '../../eVe/domains/dashboard/dashboard_records.js';
import { buildDashboardBevyUiTree, frameRecord } from '../../eVe/domains/dashboard/dashboard_bevy_ui_tree.js';
import { mergeDashboardTokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';

const categories = ['news','calendar','contacts','monitor','projects'].map((id,order)=>({id,order,color:'#123456'}));
describe('Professional Dashboard continuous rail glass', () => {
    for (const handedness of ['left','right']) {
        for (const [width,height] of [[900,720],[390,640]]) {
            it(`retains its light glass and separate shadow at ${width}×${height}, ${handedness}`, () => {
                const tokens=mergeDashboardTokens();
                const layout=createDashboardLayout({width,height,categories,handedness,tokens,
                    verticalScrollOffset:200,allowPartialLanes:true});
                const records=buildDashboardRecords({layout,tokens});
                const band=records.find(r=>r.id===dashboardRecordId('header_band'));
                expect(band.properties.material.backdrop).toEqual({blurPx:16,tint:[1,1,1,.2]});
                expect(band.properties.material.shadow).toBeUndefined();
                expect(band.properties.color).toBe('rgba(0,0,0,0)');
                expect(band.properties.height).toBe(layout.header_band_rect.height);
                expect(band.properties.top).toBe(layout.header_band_rect.y);
                expect(records.some(r=>r.id===dashboardRecordId('header_side_shadow'))).toBe(true);
                const tree=buildDashboardBevyUiTree({layout,tokens,handlers:{activate:()=>null}});
                const nodes=(node)=>[node,...(node.children||[]).flatMap(nodes)];
                const projected=nodes(tree.root).find(n=>n.id===band.id);
                expect(projected.style.backdrop).toEqual(band.properties.material.backdrop);
                expect(projected.on?.activate).toBeUndefined();
                const embedded=frameRecord(band,{x:40,y:60,width,height,zIndex:20});
                expect(embedded.properties.material).toEqual(band.properties.material);
                expect(embedded.properties.z_index).toBeLessThan(band.properties.z_index);
            });
        }
    }
    it('allows the skin override to survive token merging',()=>{
        expect(mergeDashboardTokens({headerBand:{opacity:25}}).headerBand)
            .toMatchObject({color:'#ffffff',opacity:25,blurPx:16});
    });
    for (const handedness of ['left', 'right']) for (const [width, height] of [[900, 720], [360, 280]]) {
        it(`reclaims the rail column and retains row alignment at ${width}×${height}, ${handedness}`, () => {
            const tokens = mergeDashboardTokens();
            const opts = { width, height, categories, handedness, tokens, sidebarEnabled: true,
                itemsByCategory: new Map(categories.map(c => [c.id, [{ id: 'one', category_id: c.id }]])) };
            const open = createDashboardLayout({ ...opts, sidebarOpen: true });
            const closed = createDashboardLayout({ ...opts, sidebarOpen: false });
            expect(closed.sidebar_toggle_rect).toEqual(open.sidebar_toggle_rect);
            expect(closed.sidebar_toggle_rect.height).toBe(closed.block_unit_size / 2);
            expect(closed.sidebar_toggle_rect.x).toBe(handedness === 'left' ? tokens.metrics.margin : width - tokens.metrics.margin - closed.block_unit_size);
            expect(closed.vertical_viewport_rect.y + closed.vertical_viewport_rect.height + tokens.metrics.gap).toBe(closed.sidebar_toggle_rect.y);
            closed.projection_lanes.forEach((lane, i) => {
                expect(lane.scroll_clip_rect.width - open.projection_lanes[i].scroll_clip_rect.width).toBe(closed.block_unit_size + tokens.metrics.gap);
                expect(lane.lane_rect.y).toBe(lane.header_rect.y);
                expect(lane.lane_rect.y).toBe(open.projection_lanes[i].lane_rect.y);
                expect(lane.header_visible_rect).toBeNull();
            });
            const lane = closed.lanes.at(-1);
            expect(hitTestDashboardLayout(closed, { x: lane.header_rect.x + 1, y: lane.header_rect.y + 1 }).kind).not.toBe('header');
            const tree = buildDashboardBevyUiTree({ layout: closed, tokens, sidebarProgress: 0, handlers: { sidebarActivate: () => null } });
            expect(tree.root.children.some(n => n.id.startsWith('__eve_dashboard_header'))).toBe(false);
            expect(tree.root.children.find(n => n.id === '__eve_dashboard_sidebar_toggle').on.activate).toBeTypeOf('function');
        });
    }
});
