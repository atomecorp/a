import { test, expect, vi, afterEach } from 'vitest';
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/session.js',()=>({getSessionState:()=>({mode:'authenticated',user:{id:'owner'},updatedAt:1})}));
import { CalendarAPI } from '../../eVe/intuition/tools/calendar_api.js';
import { createCanonicalImport } from '../../atome/src/squirrel/shared/canonical_import.js';
import { normalizeImportedEvent } from '../../atome/src/squirrel/calendar/import_source.js';
import { eventCache, alarmTimers } from '../../eVe/intuition/tools/calendar_engine_state.js';
import { projectCalendarRange, rangeOccurrences } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_projection.js';
import { parseCalendarData } from '../../atome/src/squirrel/calendar/icalendar.js';
import { createProjectDropExternalRuntime } from '../../eVe/intuition/tools/project_drop_external_runtime.js';
afterEach(()=>{for(const timers of alarmTimers.values())timers.forEach(clearTimeout);alarmTimers.clear();eventCache.clear();delete globalThis.window;});
test('personal events use canonical global CRUD, retain cancellation exceptions and leave project tasks intact',async()=>{
    const records=new Map(),writes=[];
    const api={
        async listStateCurrent(project,{atomeType}){return [...records.values()].filter(row=>row.type===atomeType && (!project || row.project_id===project));},
        async getStateCurrent(id){return records.get(id)||null;},
        async commit(payload){writes.push(payload);const old=records.get(payload.atome_id);
            records.set(payload.atome_id,{...old,atome_id:payload.atome_id,owner_id:'owner',type:payload.type||old?.type,
                ...(payload.project_id?{project_id:payload.project_id}:{}),properties:payload.props||old?.properties,
                ...(payload.kind==='delete'?{deleted_at:'deleted'}:{})});return {ok:true};}
    };
    globalThis.window={Atome:api,__currentProject:{id:'project'}};
    const store=createCanonicalImport({type:'calendar_event',api:()=>api,normalize:normalizeImportedEvent});
    const content=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:series','SUMMARY:Recurring',
        'DTSTART:20261001T090000Z','DTEND:20261001T100000Z','RRULE:FREQ=DAILY;COUNT=3','END:VEVENT',
        'BEGIN:VEVENT','UID:series','RECURRENCE-ID:20261002T090000Z','STATUS:CANCELLED','END:VEVENT','END:VCALENDAR'].join('\r\n');
    await store.collect(parseCalendarData(content).map(item=>({...item,calendarId:'cal'})),{source_key:'file'});
    const task=await CalendarAPI.createEvent({title:'Existing task',kind:'todo',projectId:'project',start:'2026-10-01T12:00:00Z',alarms:[]});
    expect(task.ok).toBe(true);expect(writes.at(-1).project_id).toBe('project');
    const events=(await CalendarAPI.listEvents({projectId:'project'})).items;
    expect(events).toHaveLength(3);
    const range=projectCalendarRange({view:'week',anchor:new Date('2026-10-01T12:00:00Z')});
    const occurrences=rangeOccurrences(events.filter(e=>e.kind!=='todo'),range);
    expect(occurrences.map(item=>item.start.toISOString())).toEqual(['2026-10-01T09:00:00.000Z','2026-10-03T09:00:00.000Z']);
    const master=events.find(e=>e.recurrence);
    const updated=await CalendarAPI.updateEvent(master.id,{title:'Edited locally'});
    expect(updated.event.sequence).toBe(1);expect(writes.at(-1).scope).toBe('global');expect(writes.at(-1).project_id).toBeUndefined();
    await CalendarAPI.deleteEvent(master.id);
    expect([...records.values()].find(row=>row.type==='import_origin' && row.properties.canonical_id===master.id).properties.suppressed).toBe(true);
    expect(records.get(task.event.id).deleted_at).toBeUndefined();
    eventCache.clear();expect((await CalendarAPI.listEvents()).items.some(e=>e.id===master.id)).toBe(false);
});
test('existing file intake routes VCF/ICS to registered public tools and guards account changes before execution',async()=>{
    globalThis.window={__currentUser:{id:'owner'}};const calls=[];let switched=false;
    const runtime=createProjectDropExternalRuntime({invokeGateway:async payload=>{calls.push(payload);return {ok:true};},
        ensureABoxApi:async()=>{throw new Error('unexpected_media_upload');},computeDropBase:()=>({left:0,top:0}),
        resolveDropType:()=> 'raw',readDroppedTextContent:async entry=>{if(switched)window.__currentUser.id='other';return entry.content;},
        buildDropOffset:()=>({dx:0,dy:0}),buildExtraProperties:()=>({}),resolveCreatorResultAtomeId:()=>null});
    const result=await runtime.importFilesToProjectViaCreator({entries:[{name:'people.vcf',content:'VCF'},{name:'agenda.ics',content:'ICS'}]});
    expect(result.ok).toBe(true);expect(calls.map(call=>call.tool_id)).toEqual(['contacts.import_vcf','calendar.import_ics']);
    expect(calls.map(call=>call.input.content)).toEqual(['VCF','ICS']);
    switched=true;
    expect((await runtime.importFilesToProjectViaCreator({entries:[{name:'late.vcf',content:'Private'}]})).ok).toBe(false);
    expect(calls).toHaveLength(2);
});

test('an exact event read does not reopen a deleted cached event',async()=>{
    eventCache.set('deleted',{id:'deleted',title:'Stale event',projectId:'old-project'});
    globalThis.window={Atome:{getStateCurrent:async()=>null}};
    expect(await CalendarAPI.getEvent('deleted')).toBeNull();
    expect(eventCache.has('deleted')).toBe(false);
});

test('canonical event identity lookup is independent of a list page and propagates source errors',async()=>{
    const {createCalendarService}=await import('../../atome/src/squirrel/calendar/service.js');
    const events=Array.from({length:700},(_,index)=>({id:'event-'+index,title:'Event '+index,calendarId:'personal',start:new Date(2026,9,1,index)}));
    const service=createCalendarService({primarySource:{source_id:'canonical',role:'primary',writable:true,listEvents:async()=>({ok:true,items:events})}});
    expect((await service.calendarSearch('',{limit:50})).items).toHaveLength(50);
    expect((await service.calendarRead('event-699',{limit:1})).event.id).toBe('event-699');
    const failed=createCalendarService({primarySource:{source_id:'canonical',listEvents:async()=>({ok:false,error:'permission_denied'})}});
    expect((await failed.calendarSearch('')).ok).toBe(false);
    expect((await failed.calendarSearch('')).error).toBe('permission_denied');
});

test('Dashboard event opening awaits the exact event despite a stale source filter, positions its date, and reports disappearance',async()=>{
    const {calendarSurface,calendarRuntimeState}=await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js');
    const event={id:'target',title:'Exact event',start:new Date('2026-12-03T14:00:00Z'),end:new Date('2026-12-03T15:00:00Z'),calendarId:'personal',source_id:'canonical'};
    let release;const ready=new Promise(resolve=>{release=resolve;});let requestedOptions;
    globalThis.window={atome:{calendar:{search:async(_,options)=>{requestedOptions=options;await ready;return {ok:true,items:[],sources:[]};},read:async()=>({ok:true,event})}}};
    calendarRuntimeState.sourceId='other_calendar';let revealed='',settled=false;
    const opening=calendarSurface.onOpen({context:{eventId:'target'},refresh:()=>{},reveal:id=>{revealed=id;}}).then(cleanup=>{settled=true;return cleanup;});
    await Promise.resolve();expect(settled).toBe(false);release();const cleanup=await opening;
    try {
        expect(requestedOptions.source_id).toBeUndefined();
        expect(calendarSurface.readState().selectedEventId).toBe('target');
        expect(calendarSurface.readState().anchor).toEqual(event.start);
        expect(calendarSurface.readState().draft.title).toBe('Exact event');expect(revealed).toBe('calendar_editor_title');
    } finally {cleanup();calendarSurface.onClose();}
    window.atome.calendar.read=async()=>({ok:false,error:'calendar_event_not_found'});
    const missing=await calendarSurface.onOpen({context:{eventId:'deleted'},refresh:()=>{}});
    try {expect(calendarSurface.readState().error).toBe(true);expect(calendarSurface.readState().notice).toMatch(/introuvable|not found/i);} finally {missing();calendarSurface.onClose();}
});
