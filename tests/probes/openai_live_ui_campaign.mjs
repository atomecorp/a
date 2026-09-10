import fs from 'node:fs';
import { switchView } from './molecule_ui_drop_core.mjs';
import { chromium } from 'playwright';
import { awaitBevyUiNodeTarget,clickCanvasTarget,recordCenter,waitFor } from './molecule_ui_acceptance_support.mjs';
if(process.env.ATOME_OPENAI_LIVE !== '1') throw Error('explicit_live_opt_in_required');
fs.mkdirSync('temp/openai-live-browser',{recursive:true,mode:0o700});
const context=await chromium.launchPersistentContext('temp/openai-live-browser',{headless:false,viewport:{width:1280,height:900},permissions:process.env.ATOME_TEST_RECORD==='1'?['microphone']:[],args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-gpu-sandbox',...(process.env.ATOME_TEST_RECORD==='1'?['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']:[])]});
const expectedText=('Le projet Atome conserve un texte précis, ses accents et sa ponctuation. ').repeat(10);
const prompt=process.env.ATOME_TEST_TEXT==='1'?`Crée un objet texte dans le projet courant, à gauche 100 et en haut 100, sans ouvrir son édition, avec exactement ce contenu : «${expectedText}». Puis déplace ce même objet de 40 pixels vers la droite sans changer sa hauteur.`:process.argv[2]||'Crée une photographie PNG d’une pomme verte sur fond blanc. Prépare un aperçu sans appliquer.';
const page=await context.newPage();const report={errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));
try {
 report.stage='load';await page.goto('http://127.0.0.1:3001',{waitUntil:'commit'});
 await page.waitForFunction(()=>window.AdoleAPI&&window.__authCheckComplete,null,{timeout:45000});
 report.stage='login';const ok=await page.evaluate(async(credentials)=>{const {requestProviderService}=await import('#squirrel/ai/provider_broker.js');try{if((await requestProviderService('credential.status')).configured)return true;}catch{} const r=await window.AdoleAPI.auth.login(credentials.phone,credentials.password,credentials.phone);if(!r.success&&!r.fastify?.success)throw Error(r.error||r.fastify?.error||'login_failed');return true;},{phone:process.env.ATOME_TEST_PHONE,password:process.env.ATOME_TEST_PASSWORD});if(!ok)throw Error('login_failed');
 report.stage='reload';await page.reload({waitUntil:'commit'});
 report.stage='menu_ready';await waitFor(page,async()=>{const {getMainMenuRuntime}=await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');return getMainMenuRuntime()?.measure()?.treeMounted&&typeof window.Atome?.commit==='function';},null,45000);
 report.stage='icon';const projectId=await page.evaluate(async()=>(await import('/eVe/domains/rendering/project_scene_state.js')).sceneState.foregroundProjectId);
 const hint=await recordCenter(page,projectId,r=>r.id.endsWith('main_menu_tool_atome_icon_image'));
 const target=await awaitBevyUiNodeTarget(page,{treeId:'eve_bevy_ui_main_menu',nodeId:'eve_bevy_ui_main_menu_tool_atome',hint});
 await page.mouse.move(target.x,target.y);await page.mouse.down();
 try {await page.waitForFunction(()=>window.eveAssistantApi?.getState()?.active,null,{timeout:5000});}finally{await page.mouse.up();}
 if(process.env.ATOME_TEST_RETOUCH_ID) {
  const id=process.env.ATOME_TEST_RETOUCH_ID;
  report.stage="retouch_view";await switchView(page,projectId,'natural');
  report.original=await page.evaluate(id=>window.Atome.getStateCurrent(id),id);
  await clickCanvasTarget(page,await recordCenter(page,projectId,r=>r.id===id,{sceneCoordinates:true}));
  await clickCanvasTarget(page,await awaitBevyUiNodeTarget(page,{treeId:'eve_bevy_ui_main_menu',nodeId:'assistant_retouch'}));
  await waitFor(page,id=>window.__eveDrawTool?.retouch?.snapshot()?.atomeId===id&&window.__eveDrawTool.isActive(),id,30000);
  report.stage="mask_draw";const pos=await recordCenter(page,projectId,r=>r.id===id,{sceneCoordinates:true});
  await page.keyboard.down('Alt');await page.mouse.move(pos.x-35,pos.y-35);await page.mouse.down();
  try{await page.mouse.move(pos.x+35,pos.y+35,{steps:12});}finally{await page.mouse.up();await page.keyboard.up('Alt');}
  await waitFor(page,()=>window.__eveDrawTool.retouch.snapshot()?.strokes===1);
  await page.screenshot({path:'temp/openai-live-mask.png'});
 }
 report.stage='field';const field=await awaitBevyUiNodeTarget(page,{treeId:'eve_bevy_ui_main_menu',nodePrefix:'eve_assistant_prompt'});
 const historyObservation=process.env.ATOME_TEST_HISTORY==='1'?page.evaluate(async()=>{
  const {default:bus}=await import('/eVe/core/event_bus.js');const events=[];
  return new Promise(resolve=>{let timer;const stop=()=>{off();clearTimeout(timer);resolve(events);};const off=bus.on('atome:changed',({event,state})=>{
   if(!String(event?.tx_id).startsWith('history:'))return;
   events.push({id:event.atome_id,kind:event.kind,tx:event.tx_id,props:event.payload?.props,stateDeleted:state?.properties?.__deleted,statePresent:!!state});if(events.length===2)stop();
  });timer=setTimeout(stop,60000);});
 }):null;
 const beforeImages=process.env.ATOME_TEST_DIRECT_IMAGE==='1'?await page.evaluate(id=>(window.eveToolBase.getProjectSceneState(id)?.records||[]).map(r=>r.id),projectId):null;
 report.stage='send';await clickCanvasTarget(page,field);await page.keyboard.press('Meta+A');await page.keyboard.type(prompt);await page.keyboard.press('Enter');
 await page.waitForFunction(()=>{const s=window.eveAssistantApi.getState().conversation;return s.turns.some(t=>t.role==='user');},null,{timeout:10000});
 report.stage='response';await page.waitForFunction(()=>{const s=window.eveAssistantApi.getState().conversation;return s.error||s.confirmation||s.phase==='idle';},null,{timeout:180000});
 if(process.env.ATOME_TEST_RECORD==='1') {
  const confirmation=await page.evaluate(()=>window.eveAssistantApi.getState().conversation.confirmation);
  if(confirmation){
   if(confirmation.name!=='eve.timeline.record.start'||confirmation.arguments.duration_ms!==2000)throw Error('unexpected_record_confirmation');
   await clickCanvasTarget(page,await awaitBevyUiNodeTarget(page,{treeId:'eve_bevy_ui_main_menu',nodeId:'assistant_approve'}));
   await page.waitForFunction(()=>{const s=window.eveAssistantApi.getState().conversation;return s.error||s.phase==='idle';},null,{timeout:90000});
  }
 }
 if(process.env.ATOME_TEST_APPLY_IMAGE === '1') {
  report.stage='preview';await page.waitForFunction(()=>window.eveAssistantApi.getState().image.phase==='preview',null,{timeout:180000});
  report.beforeApply=await page.evaluate(async()=>{const {currentProjectId}=await import('/eVe/domains/rendering/project_view_records.js');return (window.eveToolBase.getProjectSceneState(currentProjectId())?.records||[]).map(r=>r.id);});
  await page.screenshot({path:'temp/openai-live-preview.png'});
  report.stage='apply';await clickCanvasTarget(page,await awaitBevyUiNodeTarget(page,{treeId:'eve_bevy_ui_main_menu',nodeId:'assistant_image_apply'}));
  await page.waitForFunction(()=>{const s=window.eveAssistantApi.getState().image;return s.phase==='idle'||s.error;},null,{timeout:60000});
  report.applied=await page.evaluate(async previous=>{const {currentProjectId}=await import('/eVe/domains/rendering/project_view_records.js');return (window.eveToolBase.getProjectSceneState(currentProjectId())?.records||[]).filter(r=>!previous.includes(r.id)&&!r.id.startsWith('eve_')&&!r.id.startsWith('__eve_')).map(r=>({id:r.id,type:r.type,properties:r.properties}));},report.beforeApply);
  if(!report.applied.some(r=>r.properties?.type==='image'||r.type==='image'||r.properties?.kind==='image')) throw Error('applied_image_record_missing');
 }
 if(process.env.ATOME_TEST_RETOUCH_ID){
  const after=await page.evaluate(id=>window.Atome.getStateCurrent(id),process.env.ATOME_TEST_RETOUCH_ID);
  report.originalUnchanged=JSON.stringify(report.original?.properties)===JSON.stringify(after?.properties);
  if(!report.originalUnchanged)throw Error('retouch_modified_original');
 }
 report.state=await page.evaluate(()=>window.eveAssistantApi.getState());if(report.state.conversation.error)throw Error(report.state.conversation.error);report.inputExact=report.state.conversation.turns.find(t=>t.role==='user')?.text===prompt;report.inputCharacters=prompt.length;
 if(!report.inputExact)throw Error('submitted_text_mismatch');
 const failedTool=report.state.conversation.turns.find(t=>t.role==='tool'&&(t.result?.ok===false||t.result?.result?.ok===false));
 if(failedTool)throw Error('tool_failed:'+failedTool.name);
 if(beforeImages) {
  if(!report.state.conversation.turns.some(t=>t.name==='ui.ai.image.generate'))throw Error('image_generation_tool_not_called');
  if(report.state.image.phase!=='idle')throw Error('direct_image_not_applied');
  report.directImages=await page.evaluate(({projectId,before})=>(window.eveToolBase.getProjectSceneState(projectId)?.records||[]).filter(r=>!before.includes(r.id)&&!r.id.startsWith('__eve_')&&!r.id.startsWith('eve_')&&(r.type==='image'||r.properties?.kind==='image'||r.properties?.type==='image')).map(r=>({id:r.id,type:r.type,properties:r.properties})),{projectId,before:beforeImages});
  if(report.directImages.length!==1)throw Error('direct_image_record_missing_or_duplicate');
 }
 if(process.env.ATOME_TEST_TEXT==='1') {
  const turn=report.state.conversation.turns.find(t=>t.name==='ui.text.create');
  const id=turn?.result?.result?.atome_id;
  if(!id)throw Error('text_creation_tool_missing');
  report.createdText=await page.evaluate(id=>window.Atome.getStateCurrent(id),id);
  if(report.createdText.properties.text!==expectedText)throw Error('canonical_text_mismatch');
  if(parseFloat(report.createdText.properties.left)!==140)throw Error('canonical_text_move_mismatch');
 }
 if(historyObservation){
  report.historyEvents=await historyObservation;
  const id=report.state.conversation.turns.find(t=>t.name==='ui.draw.edit')?.result?.result?.id;
  if(!id)throw Error('history_fixture_missing');
  report.historyCanonical=await page.evaluate(id=>window.Atome.getStateCurrent(id),id);
  await waitFor(page,async id=>{const {currentProjectId}=await import('/eVe/domains/rendering/project_view_records.js');return window.eveToolBase.getProjectSceneState(currentProjectId())?.records?.some(r=>r.id===id);},id,10000);
 }
 report.scene=await page.evaluate(async()=>{const {currentProjectId}=await import('/eVe/domains/rendering/project_view_records.js');const id=currentProjectId();return {id,records:window.eveToolBase?.getProjectSceneState(id)?.records?.filter(r=>r.properties?.svg_markup).map(r=>({id:r.id,properties:r.properties}))};});
 await page.screenshot({path:'temp/openai-live-ui-campaign.png'});
} catch(e){process.exitCode=1;report.error=e.message;report.state=await page.evaluate(async()=>({assistant:window.eveAssistantApi?.getState(),menu:(await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js')).getMainMenuRuntime()?.measure(),atome:typeof window.Atome?.commit}));await page.screenshot({path:'temp/openai-live-ui-campaign.png'});}
finally {fs.writeFileSync('temp/openai-live-ui-campaign.json',JSON.stringify(report,null,2));console.log(JSON.stringify({stage:report.stage,error:report.error,phase:report.state?.conversation?.phase,conversationError:report.state?.conversation?.error,turns:report.state?.conversation?.turns?.map(t=>({role:t.role,name:t.name,text:t.text,resultBytes:t.result?JSON.stringify(t.result).length:0})),errors:report.errors}));await context.close();}
