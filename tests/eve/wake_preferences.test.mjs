import {test,expect,vi} from 'vitest';
import {normalizeHomeProfile} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js';
import {buildHomeAssistantBody} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_assistant.js';
import {createHomePreferencesRuntime} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_preferences.js';
const flatten=nodes=>nodes.flatMap(n=>[n,...flatten(n.children||[])]);
test('profile preference defaults on, keeps an explicit refusal and stores no device state',()=>{
 const profile=normalizeHomeProfile({preferences:{assistant:{voiceActivation:false,armed:true}}});
 expect(profile.preferences.assistant).toEqual({voiceActivation:false,engine:false,locale:'fr-FR',ai_budget_tokens_per_day:0});
 expect(normalizeHomeProfile({}).preferences.assistant.voiceActivation).toBe(true);
});
test('the AI engine is off for a new profile and kept on only by an explicit choice (D18 item 7)',()=>{
 expect(normalizeHomeProfile({}).preferences.assistant.engine).toBe(false);
 expect(normalizeHomeProfile({preferences:{assistant:{engine:'yes'}}}).preferences.assistant.engine).toBe(false);
 expect(normalizeHomeProfile({preferences:{assistant:{engine:true}}}).preferences.assistant.engine).toBe(true);
});
test('the assistant section is the engine switch, the voice switch, the fixed phrase and the enrollment button',()=>{
 const intents=[]; const build=state=>flatten([buildHomeAssistantBody({state:{profile:normalizeHomeProfile({}),...state},width:420,emit:i=>intents.push(i)})]);
 const idle=build({});
 expect(idle.filter(n=>n.kind==='text').map(n=>n.id)).toEqual(['home_assistant_engine_label','home_assistant_enabled_label','home_assistant_phrase','home_assistant_improve_label'].filter(id=>idle.some(n=>n.id===id)));
 expect(idle.filter(n=>n.kind==='button').map(n=>n.id)).toEqual(['home_assistant_improve']);
 const running=build({wakeEnrollment:{text:'Phrase 1 sur 4'}});
 expect(running.find(n=>n.id==='home_assistant_enrollment').kind).toBe('text');
});
test('preference intent persists to the profile before enabling the device',async()=>{
 const calls=[]; const wake={setEnabled:async (v,o)=>{calls.push(['enabled',v,o?.cause]); return {phase:'listening',error:''};},subscribe:()=>()=>{}};
 const previous=globalThis.window; globalThis.window={AtomeVoice:{wake}};
 try {
 const handle=createHomePreferencesRuntime({state:{},setNotice:()=>{},updateAndPersist:async(path,value)=>{calls.push([path,value]);return{ok:true};}});
 expect((await handle({type:'home.assistant.enabled',checked:true})).ok).toBe(true);
 expect(calls).toEqual([['preferences.assistant.voiceActivation',true],['enabled',true,'preference']]);
 } finally {globalThis.window=previous;}
});
test('the engine switch persists to the profile and touches no device state',async()=>{
 const calls=[];
 const handle=createHomePreferencesRuntime({state:{},setNotice:()=>{},updateAndPersist:async(path,value)=>{calls.push([path,value]);return{ok:true};}});
 expect((await handle({type:'home.assistant.engine',checked:true})).ok).toBe(true);
 expect((await handle({type:'home.assistant.engine',checked:false})).ok).toBe(true);
 expect(calls).toEqual([['preferences.assistant.engine',true],['preferences.assistant.engine',false]]);
});
