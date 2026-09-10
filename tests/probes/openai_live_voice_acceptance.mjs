import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { switchView } from './molecule_ui_drop_core.mjs';
import { chromium } from 'playwright';
import { awaitBevyUiNodeTarget,clickCanvasTarget,recordCenter,waitFor } from './molecule_ui_acceptance_support.mjs';
if(process.env.ATOME_OPENAI_LIVE !== '1') throw Error('explicit_live_opt_in_required');
fs.mkdirSync('temp/openai-live-browser',{recursive:true,mode:0o700});
let context=await chromium.launchPersistentContext('temp/openai-live-browser',{headless:false,viewport:{width:1280,height:900},permissions:[],args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-gpu-sandbox']});
const prompt=process.argv[2]||'Crée une photographie PNG d’une pomme verte sur fond blanc. Prépare un aperçu sans appliquer.';
let page=await context.newPage();const report={errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));
try {
 report.stage='load';await page.goto('http://127.0.0.1:3001',{waitUntil:'commit'});
 await page.waitForFunction(()=>window.AdoleAPI&&window.__authCheckComplete,null,{timeout:45000});
 report.stage='login';const ok=await page.evaluate(async(credentials)=>{const {requestProviderService}=await import('#squirrel/ai/provider_broker.js');try{if((await requestProviderService('credential.status')).configured)return true;}catch{} const r=await window.AdoleAPI.auth.login(credentials.phone,credentials.password,credentials.phone);if(!r.success&&!r.fastify?.success)throw Error(r.error||r.fastify?.error||'login_failed');return true;},{phone:process.env.ATOME_TEST_PHONE,password:process.env.ATOME_TEST_PASSWORD});if(!ok)throw Error('login_failed');
 report.stage='reload';await page.reload({waitUntil:'commit'});
 report.stage='menu_ready';await waitFor(page,async()=>{const {getMainMenuRuntime}=await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');return getMainMenuRuntime()?.measure()?.treeMounted&&typeof window.Atome?.commit==='function';},null,45000);

 report.stage='speech_fixture';
 if(process.env.ATOME_VOICE_PROMPT || !fs.existsSync('temp/openai-voice-input.wav')) {
 const bytes=await page.evaluate(async spoken=>{const {requestProviderService}=await import('#squirrel/ai/provider_broker.js');const {OPENAI_MODALITY_MODELS}=await import('#squirrel/ai/model_catalog_registry.js');const r=await requestProviderService('speech',{model:OPENAI_MODALITY_MODELS.tts,voice:'marin',input:spoken,response_format:'wav'});return r.base64;},process.env.ATOME_VOICE_PROMPT||'Dis simplement bonjour, ceci est un test.');
 fs.writeFileSync('temp/openai-voice-input.wav',Buffer.from(bytes,'base64'));
 }
 execFileSync('ffmpeg',['-y','-i','temp/openai-voice-input.wav','-af','adelay=12000:all=1,apad=pad_dur=5','-ar','48000','-ac','1','temp/openai-voice-padded.wav'],{stdio:'ignore'});
 await context.close();
 context=await chromium.launchPersistentContext('temp/openai-live-browser',{headless:false,viewport:{width:1280,height:900},permissions:['microphone'],args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-gpu-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+process.cwd()+'/temp/openai-voice-padded.wav%noloop']});
 page=await context.newPage();await page.goto('http://127.0.0.1:3001',{waitUntil:'commit'});
 await waitFor(page,async()=>{const {getMainMenuRuntime}=await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');return getMainMenuRuntime()?.measure()?.treeMounted&&typeof window.Atome?.commit==='function';},null,45000);
 const projectId=await page.evaluate(async()=>(await import('/eVe/domains/rendering/project_scene_state.js')).sceneState.foregroundProjectId);
 const hint=await recordCenter(page,projectId,r=>r.id.endsWith('main_menu_tool_atome_icon_image'));
 const target=await awaitBevyUiNodeTarget(page,{treeId:'eve_bevy_ui_main_menu',nodeId:'eve_bevy_ui_main_menu_tool_atome',hint});
 report.stage='open_voice';await page.mouse.move(target.x,target.y);await page.mouse.down();try{await page.waitForFunction(()=>window.eveAssistantApi?.getState()?.active,null,{timeout:5000});}finally{await page.mouse.up();}
 report.stage='live_response';
 await page.waitForFunction(()=>{const s=window.eveAssistantApi.getState();return s.error||s.conversation.turns.some(t=>t.role==='assistant');},null,{timeout:60000});
 if(process.env.ATOME_VOICE_TOOL) await page.waitForFunction(name=>window.eveAssistantApi.getState().conversation.turns.some(t=>t.role==='tool'&&t.name===name),process.env.ATOME_VOICE_TOOL,{timeout:90000});
 report.beforeFocus=await page.evaluate(()=>{const s=window.eveAssistantApi.getState();return {phase:s.phase,error:s.error,turns:s.conversation.turns.map(t=>({role:t.role,text:t.text,name:t.name,result:t.result}))};});
 if(report.beforeFocus.error)throw Error(report.beforeFocus.error);
 const field=await awaitBevyUiNodeTarget(page,{treeId:'eve_bevy_ui_main_menu',nodePrefix:'eve_assistant_prompt'});
 report.stage='text_focus';const started=performance.now();await clickCanvasTarget(page,field);
 await page.waitForFunction(()=>window.eveAssistantApi.getState().inputMode==='text');report.textFocusMs=Math.round(performance.now()-started);
 await page.keyboard.type('TEST_VOIX_BROUILLON');
 report.afterFocus=await page.evaluate(()=>{const s=window.eveAssistantApi.getState();return {phase:s.phase,inputMode:s.inputMode,error:s.error};});
 await page.screenshot({path:'temp/openai-live-voice.png'});report.status='passed';
} catch(e){report.status='failed';report.error=e.message;report.state=await page.evaluate(()=>{const s=window.eveAssistantApi?.getState();return s?{phase:s.phase,error:s.error,conversationError:s.conversation?.error,turns:s.conversation?.turns}:null;});await page.screenshot({path:'temp/openai-live-voice.png'});process.exitCode=1;}
finally{await page.evaluate(()=>window.eveAssistantApi?.close()).catch(()=>{});fs.writeFileSync('temp/openai-live-voice.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error,stage:report.stage,turns:report.beforeFocus?.turns?.map(({role,text,name})=>({role,text,name})),afterFocus:report.afterFocus}));await context.close();}
