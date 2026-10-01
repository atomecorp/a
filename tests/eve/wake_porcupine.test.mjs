import {test,expect,vi} from 'vitest';
import {createPorcupineWakeBackend} from '../../atome/src/squirrel/voice/wake_porcupine.js';
function fixture(config={accessKey:'test-only-key',keywordPath:'/wake/fr.ppn',modelPath:'/wake/fr.pv'}) {
 const engine={sampleRate:16000,frameLength:512,release:vi.fn(async()=>{}),terminate:vi.fn()};
 const sdk={PorcupineWorker:{create:vi.fn(async()=>engine)},WebVoiceProcessor:{setOptions:vi.fn(),subscribe:vi.fn(async()=>{}),unsubscribe:vi.fn(async()=>{})}};
 const loadSdk=vi.fn(async()=>sdk),security={vaultStatus:()=>({configured:true}),storeToken:vi.fn(async()=>({ok:true})),readToken:vi.fn(async()=>({ok:true,value:config}))};
 const env={location:{href:'https://atome.test/',origin:'https://atome.test'},setTimeout,clearTimeout};
 const backend=createPorcupineWakeBackend({env,security,loadSdk,loadProfile:async()=>({ok:true,userId:'u'})});
 return {backend,engine,sdk,security,loadSdk};
}
test('missing key prevents loading the engine or capturing audio',async()=>{
 const f=fixture({keywordPath:'/wake/fr.ppn',modelPath:'/wake/fr.pv'});
 await expect(f.backend.create({onDetection:vi.fn(),onError:vi.fn()})).rejects.toThrow('wake_key_missing'); expect(f.loadSdk).not.toHaveBeenCalled();
});
test('resources must have the application origin before saving the account-bound secret',async()=>{
 const f=fixture(); await expect(f.backend.configure({accessKey:'test-only-key',keywordPath:'https://other.test/k.ppn',modelPath:'/wake/fr.pv'})).rejects.toThrow('wake_model_origin_invalid');
 expect(f.security.storeToken).not.toHaveBeenCalled();
 await f.backend.configure({accessKey:'test-only-key',keywordPath:'/wake/fr.ppn',modelPath:'/wake/fr.pv'});
 expect(f.security.storeToken.mock.calls[0][0]).toBe('voice.wake.porcupine.u');
});
test('French custom resources run locally and teardown releases both capture and worker',async()=>{
 const f=fixture(); const detection=vi.fn(); const detector=await f.backend.create({onDetection:detection,onError:vi.fn()});
 expect(f.sdk.PorcupineWorker.create.mock.calls[0][1][0].publicPath).toBe('/wake/fr.ppn');
 expect(f.sdk.PorcupineWorker.create.mock.calls[0][3].publicPath).toBe('/wake/fr.pv');
 await detector.start(); await detector.close(); await detector.close();
 expect(f.sdk.WebVoiceProcessor.subscribe).toHaveBeenCalledTimes(1); expect(f.sdk.WebVoiceProcessor.unsubscribe).toHaveBeenCalledTimes(1);
 expect(f.engine.release).toHaveBeenCalledTimes(1); expect(f.engine.terminate).toHaveBeenCalledTimes(1);
});
test('SDK startup errors never expose SDK messages or access keys',async()=>{
 const f=fixture(); f.sdk.PorcupineWorker.create.mockRejectedValue(new Error('Invalid test-only-key'));
 await expect(f.backend.create({onDetection:vi.fn(),onError:vi.fn()})).rejects.toThrow('wake_engine_failed');
});
