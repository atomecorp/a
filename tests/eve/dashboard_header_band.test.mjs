import { describe, it, expect } from 'vitest';
import { createDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
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
});
