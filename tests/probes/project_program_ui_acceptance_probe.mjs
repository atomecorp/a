import { chromium } from 'playwright';
import fs from 'node:fs';
import { waitFor, findBevyUiNodeTarget, awaitBevyUiNodeTarget, visibleMenuTool, clickCanvasTarget } from './molecule_ui_acceptance_support.mjs';
fs.mkdirSync('temp/sleep-ui', { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--window-position=-32000,-32000', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors=[];const consoleMessages=[];page.on('pageerror', error=>errors.push(error.message));page.on('console', message=>consoleMessages.push(message.type()+':'+message.text()));
const report={steps:[],errors,consoleMessages};
try {
    await page.goto('http://127.0.0.1:3001');
    await page.waitForFunction(()=>!!window.__DEBUG__ || !!document.getElementById('intuition'),null,{timeout:30000});
    await page.waitForFunction(()=>!!window.AdoleAPI && window.__authCheckComplete === true,null,{timeout:45000});
    const guest=await page.evaluate(async()=>{const {auth}=await import('#squirrel/apis/unified/adole_api/auth.js');return auth.startGuest({force:true});});
    report.guest = {ok:guest.ok};
    await page.reload();
    await page.waitForFunction(()=>typeof window.eveToolBase?.loadProjectAtomes === 'function',null,{timeout:45000});
    report.fixture = await page.evaluate(async()=>{
        const {createProjectRecord,activateProjectWorkspace}=await import('/eVe/intuition/matrix/core/project_data.js');
        const workspace=await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
        const created=await createProjectRecord({name:'QA Sleep Finder synthetic'});
        if (!created.createdId) return {ok:false,created};
        workspace.beginDashboardWorkspaceTransition('project',created.createdId);
        const activation=await activateProjectWorkspace({id:created.createdId,name:'QA Sleep Finder synthetic'},{force:true});
        if(activation.ok) workspace.markProjectWorkspaceMode(created.createdId);
        return {ok:activation.ok,projectId:created.createdId,activation};
    });
    await waitFor(page, async()=>{const {getMainMenuRuntime}=await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');const m=getMainMenuRuntime()?.measure?.();return !!document.getElementById('eve_surface_project') && m?.active && m.treeMounted;},null,45000);
    report.steps.push('mounted native WebGPU menu');
    const projectId = await page.evaluate(()=>window.__eveWorkspaceMode?.projectId || window.__currentProject?.id || '__eve_dashboard_workspace__');
    const find=await visibleMenuTool(page,projectId,'find');await clickCanvasTarget(page,find);
    report.steps.push('real Finder click');
    const search=await awaitBevyUiNodeTarget(page,{nodeId:'eve_bevy_ui_main_menu_inline_search_field',treeId:'eve_bevy_ui_main_menu'},{timeoutMs:12000});
    await clickCanvasTarget(page,search);await page.keyboard.type('sommeil');await page.keyboard.press('Enter');
    report.steps.push('typed sommeil in native Finder');
    const row=await awaitBevyUiNodeTarget(page,{nodePrefix:'finder_row_',treeId:'eve_bevy_panel_finder'},{timeoutMs:12000});
    report.row=row; await clickCanvasTarget(page,row);
    const create=await awaitBevyUiNodeTarget(page,{nodeId:'program_create',treeId:'eve_bevy_panel_program'},{timeoutMs:12000});
    await page.screenshot({path:'temp/sleep-ui/discovery.png'});await clickCanvasTarget(page,create);
    report.steps.push('explicit project creation');
    await page.waitForTimeout(3000);
    report.projectId=await page.evaluate(()=>window.__eveWorkspaceMode?.projectId || window.__currentProject?.id || '');
    report.records=await page.evaluate(async id=>{return window.Atome.listStateCurrent(id,{limit:100});},report.projectId);
    report.programRead=await page.evaluate(async pid=>{const {invokeToolGateway}=await import('/eVe/intuition/runtime/tool_gateway.js');return {root:await window.Atome.getStateCurrent(pid),result:await invokeToolGateway({tool_id:'project.program.read',action:'commit',input:{project_id:pid},source:{type:'ui'}})};},report.projectId);
    await page.screenshot({path:'temp/sleep-ui/project.png'});


    const target = async id => {
        await page.mouse.move(750,600);await page.mouse.wheel(0,-10000);await page.waitForTimeout(250);
        for (let i=0;i<18;i++) {
            const found=await findBevyUiNodeTarget(page,{nodeId:id,treeId:'eve_bevy_panel_program',step:5});
            if(found) return found;
            await page.mouse.move(750,850);await page.mouse.wheel(0,300);await page.waitForTimeout(180);
        }
        throw new Error('native_target_missing:'+id);
    };
    const click = async id => clickCanvasTarget(page,await target(id));
    const fill = async (id,value) => {await click(id);await page.waitForTimeout(500);report.focus = report.focus || []; report.focus.push(await page.evaluate(async()=>{const {getActiveTextEditingSession}=await import('/eVe/domains/rendering/text_editing_session.js');return {tag:document.activeElement?.tagName,session:getActiveTextEditingSession()?.getSnapshot?.()};}));await page.keyboard.press('Meta+A');await page.keyboard.type(value);report.afterInput = report.afterInput || []; report.afterInput.push(await page.evaluate(async()=>{const {bevyPanelRuntimeState}=await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');return {value:document.activeElement?.value,fields:{...bevyPanelRuntimeState.definitions.get('program')?.readState().fields}};}));await page.keyboard.press('Enter');await page.waitForTimeout(150);};
    await click('program_days_chip_1');await page.waitForTimeout(500);
    for(const [id,value] of Object.entries({periodStart:'2030-01-07T00:00:00+01:00',periodEnd:'2030-01-08T00:00:00+01:00',windowStart:'2030-01-07T19:00:00+01:00',windowEnd:'2030-01-07T22:00:00+01:00',title:'QA journal',start:'2030-01-07T20:00:00+01:00',reason:'Synthetic UI plan'})) await fill('program_'+id,value);
    await click('program_add');await click('program_preview');await page.waitForTimeout(800);
    await page.screenshot({path:'temp/sleep-ui/preview.png'});
    report.panel = await page.evaluate(async()=>{const {bevyPanelRuntimeState}=await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');return bevyPanelRuntimeState.definitions.get('program')?.readState();});
    await click('program_accept');await page.waitForTimeout(1000);
    report.accepted=await page.evaluate(async pid=>window.Atome.getStateCurrent(pid),report.projectId);
    if(report.accepted?.properties?.project_program?.revision!==1) throw new Error('native_acceptance_not_persisted');
    report.steps.push('real plan fields, preview and acceptance persisted');
    const eventId=report.accepted.properties.project_program.accepted.actions[0].eventId;
    report.event=await page.evaluate(async id=>window.Atome.getStateCurrent(id),eventId);
    if(report.event?.atome_type!=='calendar_event' || report.event.properties?.program_link?.project_id!==report.projectId) throw new Error('native_event_link_missing');
    await click('program_pause');await page.waitForTimeout(800);
    report.paused=await page.evaluate(async pid=>window.Atome.getStateCurrent(pid),report.projectId);
    if(report.paused?.properties?.project_program?.status!=='paused') throw new Error('pause_not_persisted');
    report.steps.push('real pause persisted');
    await page.screenshot({path:'temp/sleep-ui/accepted.png'});
    await click('program_openJournal');
    await fill('program_journal','Synthetic observation');await fill('program_provenance','QA manual');
    await click('program_consent_chip_1');await click('program_observe');await page.waitForTimeout(800);
    report.journal=await page.evaluate(async pid=>window.Atome.listStateCurrent(pid,{limit:100}),report.projectId);
    if(!report.journal.some(record=>record.properties?.program_observation?.useInFollowup===true)) throw new Error('journal_not_persisted');
    const events=report.journal.filter(record=>record.atome_type==='calendar_event'); if(events.length!==1 || events[0].properties?.suspended!==true) throw new Error('calendar_identity_or_pause_failed');
    report.steps.push('real private journal consent and persistence');
    await click('program_tab_chip_2');await page.screenshot({path:'temp/sleep-ui/monitor.png'});
    await page.reload();
    await page.waitForFunction(()=>typeof window.eveToolBase?.loadProjectAtomes==='function',null,{timeout:45000});

    await waitFor(page, async()=>{const {getMainMenuRuntime}=await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');const m=getMainMenuRuntime()?.measure?.();return m?.active && m.treeMounted;},null,30000);
    const reopenFind=await visibleMenuTool(page,report.projectId,'find');await clickCanvasTarget(page,reopenFind);
    const reopenSearch=await awaitBevyUiNodeTarget(page,{nodeId:'eve_bevy_ui_main_menu_inline_search_field',treeId:'eve_bevy_ui_main_menu'},{timeoutMs:12000});await clickCanvasTarget(page,reopenSearch);await page.keyboard.type('sommeil');await page.keyboard.press('Enter');
    const reopenDefinition=await awaitBevyUiNodeTarget(page,{nodePrefix:'finder_row_',treeId:'eve_bevy_panel_finder'},{timeoutMs:12000});await clickCanvasTarget(page,reopenDefinition);
    const reopenInstance=await awaitBevyUiNodeTarget(page,{nodeId:'program_resume_'+report.projectId,treeId:'eve_bevy_panel_program'},{timeoutMs:12000});await clickCanvasTarget(page,reopenInstance);await page.waitForTimeout(1000);
    report.reopenedRoot=await page.evaluate(async pid=>window.Atome.getStateCurrent(pid),report.projectId);
    await click('program_resume');await fill('program_reason','Synthetic resume');await click('program_preview');await page.waitForTimeout(500);await click('program_accept');await page.waitForTimeout(800);
    report.resumed=await page.evaluate(async pid=>window.Atome.getStateCurrent(pid),report.projectId);
    if(report.resumed?.properties?.project_program?.status!=='active' || report.resumed?.properties?.project_program?.revision!==2) throw new Error('resume_not_persisted');
    if(report.resumed.properties.project_program.accepted.actions[0].eventId!==report.accepted.properties.project_program.accepted.actions[0].eventId) throw new Error('resume_event_identity_changed');
    report.steps.push('real close/reopen, future resume acceptance and stable event identity');
    await page.screenshot({path:'temp/sleep-ui/resumed.png'});


} catch(error){ report.failure=error.stack;report.diagnostics=await page.evaluate(async()=>{const {getMainMenuRuntime}=await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');const {getSessionState}=await import('#squirrel/apis/unified/adole_api/session.js');return {menu:getMainMenuRuntime()?.measure?.(),session:getSessionState(),auth:window.__authCheckResult,canvas:!!document.getElementById('eve_surface_project'),overlays:window.eveBevyUiRuntime?.readOverlayDiagnostics?.()};}); await page.screenshot({path:'temp/sleep-ui/failure.png'}).catch(()=>undefined); }
finally { fs.writeFileSync('temp/sleep-ui/report.json', JSON.stringify(report,null,2)); await browser.close(); }
console.log(JSON.stringify({steps:report.steps,failure:report.failure,errors},null,2));

if(report.failure || report.errors.length) process.exitCode=1;
