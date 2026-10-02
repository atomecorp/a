import { test, expect, vi } from 'vitest';
import { createImportLifecycle } from '../../atome/src/squirrel/shared/import_lifecycle.js';
import { createCanonicalImport } from '../../atome/src/squirrel/shared/canonical_import.js';
function fixture() {
    let state={mode:'authenticated',user:{id:'a'},updatedAt:1};
    const records=new Map();const env=new EventTarget();env.CustomEvent=CustomEvent;
    const api={async listStateCurrent(_,{atomeType}) {return [...records.values()].filter(r=>r.owner_id===state.user?.id&&r.type===atomeType);},
        async commit(e) {records.set(e.atome_id,{atome_id:e.atome_id,type:e.type,owner_id:state.user?.id,properties:e.props});return {ok:true};}};
    return {env,records,api:()=>api,session:()=>state,device:()=> 'device', logout(){state={mode:'logged_out',updatedAt:2};env.dispatchEvent(new Event('squirrel:user-logged-out'));}};
}
test('activation resumes from durable cursor, coalesces native bursts and leaves data on stop', async () => {
    vi.useFakeTimers(); const f=fixture(), store=createCanonicalImport({type:'contact',...f});
    const calls=[];
    const run=async (id,options)=>{calls.push({id,cursor:options.cursor,year:options.start_year});return store.collect([{id:'external',name:'Name'}],{...options,cursor:'durable',complete:true});};
    let lifecycle=createImportLifecycle({domain:'contact',...f,run});
    await lifecycle.activate('test',{source_key:'book',start_year:1970});
    expect(calls[0].cursor).toBeNull();lifecycle.dispose();
    lifecycle=createImportLifecycle({domain:'contact',...f,run});await lifecycle.resume();
    await vi.runAllTicks();await lifecycle.cycle('test');
    expect(calls.at(-1).cursor).toBe('durable');
    const before=calls.length;
    for(let i=0;i<6;i++)f.env.dispatchEvent(new CustomEvent('atome:native-source-changed',{detail:{domain:'contact'}}));
    await vi.advanceTimersByTimeAsync(500);expect(calls).toHaveLength(before+1);
    await lifecycle.activate('test',{source_key:'book',start_year:1980});expect(calls.at(-1)).toMatchObject({cursor:null,year:1980});
    await lifecycle.deactivate('test');expect(lifecycle.status()).toEqual([]);
    expect([...f.records.values()].filter(r=>r.type==='contact')).toHaveLength(1);
    expect([...f.records.values()].find(r=>r.type==='import_source_state').properties.enabled).toBe(false);
    lifecycle.dispose();vi.useRealTimers();
});
test('logout cancels a late source response before any domain or cursor write', async () => {
    const f=fixture(),store=createCanonicalImport({type:'contact',...f});let release, start;
    const gate=new Promise(resolve=>{release=resolve;});
    const started=new Promise(resolve=>{start=resolve;});
    const lifecycle=createImportLifecycle({domain:'contact',...f,async run(_id,options){start();await gate;return store.collect([{id:'late',name:'Late'}],{...options,cursor:'late',complete:true});}});
    const pending=lifecycle.activate('slow');
    await started;
    f.logout();release();await pending;
    expect([...f.records.values()].some(r=>r.type==='contact')).toBe(false);
    expect([...f.records.values()].some(r=>r.properties.cursor==='late')).toBe(false);
    lifecycle.dispose();
});
test('permission revocation disables the durable collector without deleting canonical data',async()=>{
    const f=fixture(),store=createCanonicalImport({type:'contact',...f});let denied=false;
    const lifecycle=createImportLifecycle({domain:'contact',...f,async run(_,options){
        if(denied)throw new Error('contacts_permission_denied');
        return store.collect([{id:'a',name:'Retained'}],{...options,complete:true,cursor:'token'});
    }});
    await lifecycle.activate('native');denied=true;
    expect(await lifecycle.cycle('native')).toMatchObject({ok:false,error:'contacts_permission_denied'});
    expect(lifecycle.status()).toEqual([]);
    expect([...f.records.values()].find(row=>row.type==='import_source_state').properties.enabled).toBe(false);
    expect([...f.records.values()].filter(row=>row.type==='contact')).toHaveLength(1);
    lifecycle.dispose();
});

test('changing source bounds waits for pending collection before resetting its cursor',async()=>{
    const f=fixture(),store=createCanonicalImport({type:'contact',...f}),calls=[];
    let release,started;
    const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{started=resolve;});
    const lifecycle=createImportLifecycle({domain:'contact',...f,async run(_,options){
        calls.push({year:options.start_year,cursor:options.cursor});
        if(calls.length===1){started();await gate;}
        return store.collect([{id:'a',name:'Retained'}],{...options,complete:true,cursor:`cursor-${options.start_year}`});
    }});
    const initial=lifecycle.activate('test',{start_year:1970});await ready;
    const changed=lifecycle.activate('test',{start_year:1980});
    const coalesced=lifecycle.cycle('test');release();
    await Promise.all([initial,changed,coalesced]);
    expect(calls).toEqual([{year:1970,cursor:null},{year:1970,cursor:'cursor-1970'},{year:1980,cursor:null}]);
    lifecycle.dispose();
});
