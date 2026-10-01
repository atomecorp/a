import { chromium } from 'playwright';
import { findBevyUiNodeTarget,clickCanvasTarget,awaitBevyUiNodeTarget } from './molecule_ui_acceptance_support.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('temp/finder-import-audit',{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:980}});
const evidence={steps:[],errors:[]}; page.on('pageerror',error=>evidence.errors.push(error.message));
try {
 await page.goto(process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__authCheckComplete===true);
 await page.evaluate(async()=>{
  const {auth}=await import('/atome/src/squirrel/apis/unified/adole_api/auth.js');await auth.startGuest({force:true});
  const workspace=await import('/eVe/intuition/tools/user_workspace_surface_runtime.js');await workspace.openWorkspaceDashboardAndMainMenu({source:'finder_canvas_qa'});
  const {createFinderPanelSurface}=await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_finder_runtime.js');
  const {registerBevyPanelSurface,openBevyPanelSurface,closeBevyPanelSurface}=await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
  const realFinder=createFinderPanelSurface(); await realFinder.handleEvent({type:'finder.scope.activate',value:'tools'});
  window.__finderRealInventory={registered:(await window.atome.tools.v2Registry.listTools({includeDisabled:true})).map(tool=>({id:tool.id,label:tool.ui?.label_fallback})),visible:realFinder.readState().records.map(record=>({id:record.id,label:record.name,toolId:record.properties?.tool_id})),error:realFinder.state.errorCode};
  const {getMainMenuRuntime}=await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
  const {collectSurfaceRootKeys,collectSurfaceTools}=await import('/eVe/intuition/tools/core/exposable_tools.js');
  const {CONTEXT_MENUS}=await import('/eVe/intuition/menu/context_menus_loader.js');
  const {resolveCanonicalToolId}=await import('/eVe/intuition/tools/core/finder_tools_projection.js');
  const content=getMainMenuRuntime().getContent();
  const exposed=collectSurfaceTools(content,{rootKeys:collectSurfaceRootKeys({content,contextMenus:CONTEXT_MENUS})});
  const registered=new Set(window.__finderRealInventory.registered.map(tool=>resolveCanonicalToolId(tool.id)));
  const visible=new Set(window.__finderRealInventory.visible.map(tool=>resolveCanonicalToolId(tool.toolId)));
  window.__finderRealInventory.exposed=[...exposed].map(([id,definition])=>({id,...definition}));
  window.__finderRealInventory.missingRegistered=[...exposed.keys()].filter(id=>!registered.has(id));
  window.__finderRealInventory.missingFinder=[...exposed.keys()].filter(id=>!visible.has(id));
  const records=Array.from({length:500},(_,i)=>({id:'qa_'+i,name:'QA '+String(i).padStart(3,'0'),type:'image',properties:{},textIndex:'qa'}));
  window.__finderQaBatches=[];
  window.__finderQa=createFinderPanelSurface({loadRecords:async()=>records,resolveProjectId:()=> 'qa_fixture',resolveDropPoint:()=>({x:950,y:700}),closePanel:()=>closeBevyPanelSurface('finder'),importRecords:async batch=>{window.__finderQaBatches.push(batch.map(entry=>entry.id));return {ok:true,created:batch.length};}});
  registerBevyPanelSurface(window.__finderQa.surface);await openBevyPanelSurface('finder');
 });
 evidence.steps.push({step:'real_catalogue',inventory:await page.evaluate(()=>window.__finderRealInventory)});
 if((await page.evaluate(()=>window.__finderRealInventory.missingRegistered.length+window.__finderRealInventory.missingFinder.length))!==0)throw Error('exposed_tools_missing_from_registry_or_finder');
 evidence.steps.push({step:'finder_open',state:await page.evaluate(()=>({count:window.__finderQa.readState().records.length,trees:[...window.eveBevyUiRuntime.state.trees.keys()]}))});
 const target=await awaitBevyUiNodeTarget(page,{nodePrefix:'finder_list_entry_',treeId:'eve_bevy_panel_finder'});
 evidence.steps.push({step:'first_hit',target});
 if(!target)throw Error('finder_first_row_not_hittable');
 await page.mouse.move(target.x,target.y); await page.mouse.wheel(0,20000);await page.waitForTimeout(700);
 evidence.steps.push({step:'wheel_end',state:await page.evaluate(()=>({visibleStart:window.__finderQa.readState().visibleStart,nodes:(()=>{const tree=window.eveBevyUiRuntime.state.trees.get('eve_bevy_panel_finder')?.tree; const ids=[];const visit=node=>{if(!node)return;if(node.id?.startsWith('finder_list_entry_'))ids.push(node.id);(node.children||[]).forEach(visit)};visit(tree?.root);return ids})()}))});
 await page.screenshot({path:'temp/finder-import-audit/finder-canvas.png'});
 await page.mouse.wheel(0,40000); await page.waitForTimeout(600);
 const end=await page.evaluate(()=>window.__finderQa.readState().visibleStart);
 evidence.steps.push({step:'last_window',visibleStart:end});
 const last=await awaitBevyUiNodeTarget(page,{nodeId:'finder_list_entry_499_checkbox',treeId:'eve_bevy_panel_finder'});
 if(!last)throw Error('finder_last_row_unreachable');
 const firstVisible=498;
 for(const index of [498,499]) {
  if(index===499) {await page.mouse.move(target.x,target.y);await page.mouse.wheel(0,4000);await page.waitForTimeout(350);}
  const checkbox=await awaitBevyUiNodeTarget(page,{nodeId:'finder_list_entry_'+index+'_checkbox',treeId:'eve_bevy_panel_finder'});
  if(!checkbox)throw Error('finder_checkbox_unhittable_'+index);
  await clickCanvasTarget(page,checkbox);await page.waitForTimeout(250);
 }
 evidence.steps.push({step:'multiselection',ids:await page.evaluate(()=>window.__finderQa.readState().selectedKeys)});
 const thumbnail=await awaitBevyUiNodeTarget(page,{nodeId:'finder_list_entry_'+firstVisible+'_preview',treeId:'eve_bevy_panel_finder'});
 if(!thumbnail)throw Error('finder_thumbnail_unhittable');
 await page.mouse.move(thumbnail.x,thumbnail.y);await page.mouse.down();await page.mouse.move(thumbnail.x+25,thumbnail.y+25,{steps:3});await page.waitForTimeout(350);
 evidence.steps.push({step:'real_drag',hidden:await page.evaluate(()=>window.__finderQa.readState().transferHidden)});
 await page.mouse.move(1050,750,{steps:8});await page.mouse.up();await page.waitForTimeout(600);
 evidence.steps.push({step:'drop',batches:await page.evaluate(()=>window.__finderQaBatches)});
 if(evidence.steps.at(-1).batches[0]?.length!==2)throw Error('finder_group_drop_not_committed');
 await page.evaluate(async()=>{const {openBevyPanelSurface}=await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');await openBevyPanelSurface('finder');});
 const single=await awaitBevyUiNodeTarget(page,{nodeId:'finder_list_entry_0_checkbox',treeId:'eve_bevy_panel_finder'});
 await clickCanvasTarget(page,single);await page.waitForTimeout(300);
 const action=await awaitBevyUiNodeTarget(page,{nodeId:'finder_import_selection',treeId:'eve_bevy_panel_finder'});
 if(!action)throw Error('finder_import_selection_not_hittable');
 await clickCanvasTarget(page,action);await page.waitForTimeout(500);
 evidence.steps.push({step:'import_selection',batches:await page.evaluate(()=>window.__finderQaBatches)});
 if(evidence.steps.at(-1).batches.length!==2||evidence.steps.at(-1).batches[1].length!==1)throw Error('finder_selection_replayed');

} catch(error) {evidence.failure=error.message;}
finally {writeFileSync('temp/finder-import-audit/canvas-evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({steps:evidence.steps.map(step=>step.step),failure:evidence.failure||null,errors:evidence.errors}));await browser.close();}

if(evidence.failure) throw new Error(evidence.failure);
