import {test,expect,vi} from 'vitest';
import {normalizeHomeProfile} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js';
import {buildHomeAssistantBody} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_assistant.js';
import {createHomePreferencesRuntime} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_preferences.js';
const flatten=nodes=>nodes.flatMap(n=>[n,...flatten(n.children||[])]);
test('profile preference defaults off and round-trips without device arming state',()=>{
 const profile=normalizeHomeProfile({preferences:{assistant:{voiceActivation:true,armed:true}}});
 expect(profile.preferences.assistant).toEqual({voiceActivation:true,locale:'fr-FR'});
 expect(normalizeHomeProfile({}).preferences.assistant.voiceActivation).toBe(false);
});
test('shared preferences controls project status, fixed phrase and device arming without editable phrase',()=>{
 const nodes=flatten([buildHomeAssistantBody({state:{profile:normalizeHomeProfile({}),assistantWake:{phase:'off'}},width:420,emit:()=>{}})]);
 expect(nodes.find(n=>n.id==='home_assistant_phrase').kind).toBe('text');
 expect(nodes.find(n=>n.id==='home_assistant_arm').on).toBeUndefined();
 expect(nodes.find(n=>n.id==='home_assistant_test').kind).toBe('button');
 expect(nodes.find(n=>n.id==='home_assistant_status')).toBeDefined();
});
test('preference intent persists to the profile before explicitly arming the device',async()=>{
 const calls=[]; const wake={setEnabled:async v=>calls.push(['enabled',v]),start:async()=>calls.push(['start']),getState:()=>({phase:'listening'})};
 const previous=globalThis.window; globalThis.window={AtomeVoice:{wake}};
 try {
 const handle=createHomePreferencesRuntime({state:{},setNotice:()=>{},updateAndPersist:async(path,value)=>{calls.push([path,value]);return{ok:true};}});
 expect((await handle({type:'home.assistant.enabled',checked:true})).ok).toBe(true);
 expect(calls).toEqual([['preferences.assistant.voiceActivation',true],['enabled',true],['start']]);
 } finally {globalThis.window=previous;}
});
