import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createDashboardLayout, hitTestDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { buildDashboardRecords } from '../../eVe/domains/dashboard/dashboard_records.js';
import { mergeDashboardTokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { createDashboardActionRuntime } from '../../eVe/domains/dashboard/dashboard_actions.js';

test('Settings uses the shared header above Contacts without creating a data lane', async () => {
 const tokens=mergeDashboardTokens();
 const categories=['news','contacts','projects'].map(id=>({id,label_key:'eve.dashboard.category.'+id}));
 for(const handedness of ['left','right']) {
  const layout=createDashboardLayout({width:1000,height:900,categories,tokens,handedness});
  const contacts=layout.projection_lanes.find(lane=>lane.category.id==='contacts');
  const box=layout.settings.header_rect;
  assert.equal(box.x,contacts.header_rect.x);
  assert.equal(box.width,contacts.header_rect.width);
  assert.equal(box.y+layout.vertical_scroll_step,contacts.header_rect.y);
  assert.equal(layout.projection_lanes.length,categories.length);
  assert.equal(hitTestDashboardLayout(layout,{x:box.x+box.width/2,y:box.y+box.height/2}).kind,'settings');
  const records=buildDashboardRecords({layout,tokens});
  assert.ok(records.some(record=>record.id==='__eve_dashboard_header_bg_settings'));
  assert.ok(!records.some(record=>record.id.startsWith('__eve_dashboard_card_')&&record.id.includes('settings')));
 }
 let args;
 let homeContext;
 const actions=createDashboardActionRuntime({
  openPanel:async(...input)=>{args=input;return {ok:true};},
  openHomePanel:async(context)=>{homeContext=context;return {ok:true};}
 });
 await actions.openSettings();
 assert.equal(homeContext.source.type,'dashboard_settings');
 assert.equal(args,undefined,'Settings must not open the home surface directly');
});
