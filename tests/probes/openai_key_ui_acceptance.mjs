// Opt-in credential presence UI acceptance. Never reads or replaces the primary key.
import fs from 'node:fs';
import { chromium } from 'playwright';
import { awaitBevyUiNodeTarget, clickCanvasTarget, visibleMenuTool, waitFor } from './molecule_ui_acceptance_support.mjs';
const browser=await chromium.launch({headless:false,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const report={checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:3001',{waitUntil:'commit'});
 await page.waitForFunction(()=>window.AdoleAPI&&window.__authCheckComplete,null,{timeout:45000});
 const ok=await page.evaluate(async credentials=>{const r=await window.AdoleAPI.auth.login(credentials.phone,credentials.password,credentials.phone);return r.success===true||r.fastify?.success===true||r.tauri?.success===true;},{phone:process.env.ATOME_TEST_PHONE,password:process.env.ATOME_TEST_PASSWORD});
 if(!ok)throw new Error('login_failed');
 for(const cycle of ['first','reload']) {
  await page.reload({waitUntil:'commit'});
  await waitFor(page,async()=>{const {getMainMenuRuntime}=await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');return getMainMenuRuntime()?.measure()?.treeMounted&&window.__authCheckComplete;},null,45000);
  const project=await page.evaluate(async()=>(await import('/eVe/domains/rendering/project_scene_state.js')).sceneState.foregroundProjectId);
  report.stage='home';
  await clickCanvasTarget(page,await visibleMenuTool(page,project,'home'));
  await waitFor(page,async()=>{const {readHomePanelState}=await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js');return !readHomePanelState().loading;},null,30000);
  await clickCanvasTarget(page,await awaitBevyUiNodeTarget(page,{treeId:'eve_bevy_panel_home',nodeId:'home_identity_accordion_header'}));
  report.stage='keys_section';
  await clickCanvasTarget(page,await awaitBevyUiNodeTarget(page,{treeId:'eve_bevy_panel_home',nodeId:'home_passkeys_accordion_header'}));
  await waitFor(page,async()=>{const {readHomePanelState}=await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js');return readHomePanelState().vault.providers.find(p=>p.id==='openai')?.configured===true;},null,30000);
  report.stage='key_field';
  const field=await awaitBevyUiNodeTarget(page,{treeId:'eve_bevy_panel_home',nodeId:'home_key_openai_api_input'});
  await page.screenshot({path:`temp/openai-key-${cycle}.png`});
  const state=await page.evaluate(async()=>{const {readHomePanelState}=await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js');const s=readHomePanelState();return {configured:s.vault.providers.find(p=>p.id==='openai')?.configured,draftEmpty:!s.security?.aiKeys?.openai};});
  if(!state.configured||!state.draftEmpty)throw new Error('saved_key_projection_invalid');
  await clickCanvasTarget(page,field);
  // Focusing an empty replacement field must never reload or delete the stored key.
  await page.keyboard.press('Tab');
  const status=await page.evaluate(async()=>{const {requestProviderService}=await import('#squirrel/ai/provider_broker.js');return (await requestProviderService('credential.status')).configured;});
  if(!status)throw new Error('empty_field_focus_removed_key');
  report.checks.push(cycle+'_stored_key_with_empty_replacement_draft');
 }
 report.status='passed';
}catch(error){await page.screenshot({path:'temp/openai-key-ui-failure.png'});report.status='failed';report.error=error.message;process.exitCode=1;}
finally{fs.writeFileSync('temp/openai-key-ui-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
