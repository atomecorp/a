import { test, expect, vi } from 'vitest';
import { createWakeRuntime } from '../../atome/src/squirrel/voice/wake_runtime.js';
const tick = async () => { for (let i=0; i<15; i++) await Promise.resolve(); };
function fixture(preferences) {
    const env = new EventTarget(); env.document = new EventTarget(); env.document.visibilityState='visible';
    env.setTimeout=setTimeout; env.clearTimeout=clearTimeout; env.__eveProfilePreferences=preferences;
    const close=vi.fn(async()=>{}), start=vi.fn(async()=>{}); let callbacks;
    const backend={ create:vi.fn(async value=> {callbacks=value; let closing; return {start,close:()=>closing ||= close()};}), captureAvailable:vi.fn(async()=>true), hasVerifier:vi.fn(async()=>false) };
    const runtime=createWakeRuntime({env,backend});
    return {env,backend,close,start,runtime,detect:()=>callbacks.onDetection()};
}
test('a published profile arms the device by default; an explicit refusal never acquires',async()=>{
    const on=fixture({}); await tick();
    expect(on.runtime.getState()).toMatchObject({enabled:true,armed:true,phase:'listening'}); expect(on.start).toHaveBeenCalledTimes(1); await on.runtime.dispose();
    const off=fixture({assistant:{voiceActivation:false}}); await tick();
    expect(off.backend.create).not.toHaveBeenCalled(); expect(off.runtime.getState().phase).toBe('off'); await off.runtime.dispose();
});
test('preferences not yet published wait for the profile announcement',async()=>{
    const f=fixture(); await tick(); expect(f.backend.create).not.toHaveBeenCalled();
    f.env.dispatchEvent(Object.assign(new Event('eve:profile-preferences-updated'),{detail:{preferences:{}}})); await tick();
    expect(f.runtime.getState().armed).toBe(true); expect(f.start).toHaveBeenCalledTimes(1);
    f.env.dispatchEvent(Object.assign(new Event('eve:profile-preferences-updated'),{detail:{preferences:{assistant:{voiceActivation:false}}}})); await tick();
    expect(f.close).toHaveBeenCalledTimes(1); expect(f.runtime.getState().phase).toBe('off'); await f.runtime.dispose();
});
test('an error disarms and an unchanged preference does not retry it',async()=>{
    const f=fixture(); f.backend.create.mockRejectedValueOnce(new Error('wake_model_missing'));
    await f.runtime.setEnabled(true); expect(f.runtime.getState()).toMatchObject({phase:'unavailable',error:'wake_model_missing',armed:false});
    await f.runtime.setEnabled(true); expect(f.backend.create).toHaveBeenCalledTimes(1);
    await f.runtime.setEnabled(false); await f.runtime.setEnabled(true); expect(f.start).toHaveBeenCalledTimes(1); await f.runtime.dispose();
});
test('a disabled option cannot start and enabling acquires once',async()=>{
    const f=fixture(); await expect(f.runtime.start()).rejects.toThrow('wake_disabled');
    await f.runtime.setEnabled(true); expect(f.start).toHaveBeenCalledTimes(1);
    await f.runtime.stop(); expect(f.close).toHaveBeenCalledTimes(1); await f.runtime.dispose();
});
test('disabling while resource initialization waits never starts late capture',async()=>{
    const f=fixture(); let resolve; f.backend.create.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    const opening=f.runtime.setEnabled(true); await tick(); const disabling=f.runtime.setEnabled(false);
    resolve({start:f.start,close:f.close}); await opening; await disabling;
    expect(f.start).not.toHaveBeenCalled(); expect(f.close).toHaveBeenCalledTimes(1); await f.runtime.dispose();
});
test('permission granted after disabling is released and never becomes listening',async()=>{
    const f=fixture(); let resolve; f.start.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    const opening=f.runtime.setEnabled(true); await tick(); const disabling=f.runtime.setEnabled(false);
    expect(f.close).toHaveBeenCalled(); resolve(); await opening; await disabling; expect(f.close).toHaveBeenCalled(); expect(f.runtime.getState().phase).toBe('off'); await f.runtime.dispose();
});
test('foreground lifecycle pauses and resumes an armed device',async()=>{
    const f=fixture(); await f.runtime.setEnabled(true);
    f.env.document.visibilityState='hidden'; f.env.document.dispatchEvent(new Event('visibilitychange')); await tick();
    expect(f.close).toHaveBeenCalledTimes(1); expect(f.runtime.getState().phase).toBe('suspended');
    f.env.document.visibilityState='visible'; f.env.document.dispatchEvent(new Event('visibilitychange')); await tick();
    expect(f.start).toHaveBeenCalledTimes(2); await f.runtime.dispose();
});
test('microphone arbitration suspends until the other capture is released',async()=>{
    const f=fixture(); await f.runtime.setEnabled(true); await f.runtime.suspend('capture');
    expect(f.runtime.getState().phase).toBe('suspended'); await f.runtime.resume('capture'); expect(f.start).toHaveBeenCalledTimes(2); await f.runtime.dispose();
});
test('one detection opens the assistant once and resumes standby after it closes',async()=>{
    const f=fixture(); let emit;
    const assistant={subscribe:fn=>{emit=fn; fn({active:false}); return ()=>{};},open:vi.fn(async()=>{emit({active:true,phase:'connecting'});})};
    f.runtime.connectAssistant(assistant); await f.runtime.setEnabled(true); f.detect(); f.detect(); await tick();
    expect(assistant.open).toHaveBeenCalledTimes(1); expect(assistant.open).toHaveBeenCalledWith({source:'wake_phrase'});
    emit({active:true,phase:'listening',microphoneActive:true}); await tick(); expect(f.runtime.getState().cause).toBe('detection');
    emit({active:true,phase:'speaking'}); await tick(); expect(f.start).toHaveBeenCalledTimes(1);
    emit({active:false}); await tick(); expect(f.start).toHaveBeenCalledTimes(2); await f.runtime.dispose();
});
test('logout releases resources and a back/forward cache restore re-arms',async()=>{
    const f=fixture(); await f.runtime.setEnabled(true);
    f.env.dispatchEvent(new Event('pagehide')); await tick(); expect(f.close).toHaveBeenCalledTimes(1); expect(f.runtime.getState().armed).toBe(true);
    f.env.dispatchEvent(new Event('pageshow')); await tick(); expect(f.start).toHaveBeenCalledTimes(2);
    f.env.dispatchEvent(new Event('squirrel:user-logged-out')); await tick(); expect(f.runtime.getState().enabled).toBe(false);
    expect(f.close).toHaveBeenCalledTimes(2); await f.runtime.dispose();
});
test('losing window focus suspends standby without disarming the device',async()=>{
 const f=fixture(); await f.runtime.setEnabled(true);
 f.env.dispatchEvent(new Event('blur')); await tick(); expect(f.runtime.getState().phase).toBe('suspended'); expect(f.runtime.getState().armed).toBe(true);
 f.env.dispatchEvent(new Event('focus')); await tick(); expect(f.start).toHaveBeenCalledTimes(2); await f.runtime.dispose();
});
test('native microphone preemption waits on availability before resuming',async()=>{
 vi.useFakeTimers(); const f=fixture(); let onError;
 f.backend.create.mockImplementation(async c=>{onError=c.onError;let closing;return{start:f.start,close:()=>closing ||= f.close()};});
 f.backend.captureAvailable.mockResolvedValue(false); await f.runtime.setEnabled(true);
 onError(new Error('wake_capture_busy')); await tick(); expect(f.runtime.getState().phase).toBe('suspended');
 await vi.advanceTimersByTimeAsync(1000); expect(f.start).toHaveBeenCalledTimes(1);
 f.backend.captureAvailable.mockResolvedValue(true); await vi.advanceTimersByTimeAsync(1000); expect(f.start).toHaveBeenCalledTimes(2);
 await f.runtime.dispose(); vi.useRealTimers();
});
test('cleanup failure is explicit and cannot strand the lifecycle promise',async()=>{
 const f=fixture(); await f.runtime.setEnabled(true); f.close.mockRejectedValue(new Error('wake_capture_failed'));
 await f.runtime.stop(); expect(f.runtime.getState().phase).toBe('unavailable'); expect(f.runtime.getState().error).toBe('wake_capture_failed');
 f.close.mockResolvedValue(); await f.runtime.start(); expect(f.runtime.getState().phase).toBe('listening'); await f.runtime.dispose();
});
test('an assistant that fails to start leaves standby listening; the assistant speaks its own failure',async()=>{
    const f=fixture(); let emit;
    f.runtime.connectAssistant({subscribe:fn=>{emit=fn; fn({active:false}); return ()=>{};},open:vi.fn(async()=>{emit({active:true,phase:'connecting'});})});
    await f.runtime.setEnabled(true); f.detect(); await tick();
    emit({active:true,phase:'error',connected:false,microphoneActive:false,error:'no_ai_key_configured'}); await tick();
    expect(f.runtime.getState()).toMatchObject({phase:'listening',error:''}); await f.runtime.dispose();
});
test('an explicit switch re-arms a device that an error disarmed; a profile publication does not',async()=>{
    const f=fixture(); f.backend.create.mockRejectedValueOnce(new Error('wake_capture_failed'));
    await f.runtime.setEnabled(true); expect(f.runtime.getState().armed).toBe(false);
    await f.runtime.setEnabled(true); expect(f.backend.create).toHaveBeenCalledTimes(1);
    await f.runtime.setEnabled(true,{cause:'preference'}); expect(f.runtime.getState()).toMatchObject({armed:true,phase:'listening',cause:'profile'}); await f.runtime.dispose();
});
test('enrollment suspends standby and restarts it afterwards',async()=>{
    const f=fixture(); await f.runtime.setEnabled(true); expect(f.start).toHaveBeenCalledTimes(1);
    f.backend.openCollector=vi.fn(async()=>{throw new Error('wake_engine_failed');});
    await expect(f.runtime.enroll({prompt:async()=>{}})).rejects.toThrow('wake_engine_failed');
    expect(f.close).toHaveBeenCalledTimes(1); expect(f.start).toHaveBeenCalledTimes(2); await f.runtime.dispose();
});
