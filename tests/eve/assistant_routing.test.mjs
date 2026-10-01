import {test, expect, vi} from 'vitest';
import {resolveAssistantProviderConfig} from '../../atome/src/squirrel/ai/assistant_provider_config.js';
import {executeAssistantGeneration} from '../../eVe/intuition/tools/ai_generators/assistant_generation.js';
import fs from 'node:fs';
test('main assistant selects OpenAI even when the profile selects Claude',async()=>{
 const result=await resolveAssistantProviderConfig({loadProfile:async()=>({ok:true,userId:'u',profile:{activeProvider:'claude'}}),credentialStatus:async()=>({configured:true})});
 expect(result.ok).toBe(true); expect(result.providerId).toBe('openai'); expect(result.serverManaged).toBe(true);
});
test('missing OpenAI does not switch to another configured provider',async()=>{
 const result=await resolveAssistantProviderConfig({loadProfile:async()=>({ok:true,userId:'u'}),credentialStatus:async()=>({configured:false})});
 expect(result.ok).toBe(false); expect(result.providerId).toBe('openai'); expect(result.error).toBe('no_ai_key_configured');
});
test('generation success is announced only after the existing owner confirms import',async()=>{
 const run=vi.fn(async()=>({ok:true,atomeId:'a',job:{status:'succeeded',jobId:'j',provider:'runway'}}));
 const result=await executeAssistantGeneration({kind:'video',input:{project_id:'p',prompt:'teaser'},run});
 expect(result.status).toBe('completed'); expect(result.atome_id).toBe('a'); expect(run).toHaveBeenCalledTimes(1);
});
test('failed or unimported generation never reports completion',async()=>{
 for(const value of [{ok:false,error:'provider_failed'},{ok:true,job:{status:'succeeded'}},{ok:true,atomeId:'a',job:{status:'running'}}]) {
 await expect(executeAssistantGeneration({kind:'video',input:{project_id:'p',prompt:'teaser'},run:async()=>value})).rejects.toThrow();
 }
});
test('audio uses its own completed status and cancelled tasks never invoke generation',async()=>{
 const run=vi.fn(async()=>({ok:true,atomeId:'a',job:{status:'completed',provider:'musicgpt'}}));
 expect((await executeAssistantGeneration({kind:'audio',input:{project_id:'p',prompt:'song'},run})).provider).toBe('musicgpt');
 const controller=new AbortController(); controller.abort();
 await expect(executeAssistantGeneration({kind:'audio',input:{project_id:'p'},run,signal:controller.signal})).rejects.toThrow(); expect(run).toHaveBeenCalledTimes(1);
});
test('shared instructions describe intent and enforce specialized providers in their canonical owners',()=>{
 const common=fs.readFileSync(new URL('../../atome/src/squirrel/ai/conversation_session.js',import.meta.url),'utf8');
 expect(common).toContain('ui.ai.video.generate'); expect(common).toContain('ui.ai.audio.generate'); expect(common).toContain('Runway'); expect(common).toContain('MusicGPT');
 const owner=fs.readFileSync(new URL('../../eVe/intuition/tools/ai_generators/assistant_generation.js',import.meta.url),'utf8');
 expect(owner).toContain("createVideoRun({ provider: 'runway' })"); expect(owner).toContain("createAudioRun({ provider: 'musicgpt' })");
});
