import { test, expect, vi } from 'vitest';
import { createWakeRuntime } from '../../atome/src/squirrel/voice/wake_runtime.js';
const tick = async () => { for (let i=0; i<15; i++) await Promise.resolve(); };
function fixture(preferences={}) {
    const env = new EventTarget(); env.document = new EventTarget(); env.document.visibilityState='visible';
    env.setTimeout=setTimeout; env.clearTimeout=clearTimeout; env.__eveProfilePreferences=preferences;
    const close=vi.fn(async()=>{}), start=vi.fn(async()=>{}); let callbacks;
    const backend={ create:vi.fn(async value=> {callbacks=value; let closing; return {start,close:()=>closing ||= close()};}), configure:vi.fn(), captureAvailable:vi.fn(async()=>true) };
    const signalReady=vi.fn(async()=>{}), runtime=createWakeRuntime({env,backend,signalReady});
    return {env,backend,close,start,signalReady,runtime,detect:()=>callbacks.onDetection()};
}
test('off and synchronized preference never acquire a microphone without device arming',async()=>{
    const f=fixture({assistant:{voiceActivation:true}}); await tick();
    expect(f.backend.create).not.toHaveBeenCalled(); expect(f.runtime.getState().armed).toBe(false);
    await f.runtime.setEnabled(false); expect(f.backend.create).not.toHaveBeenCalled(); await f.runtime.dispose();
});
test('a disabled option cannot start and enabled explicit start acquires once',async()=>{
    const f=fixture(); await expect(f.runtime.start()).rejects.toThrow('wake_disabled');
    await f.runtime.setEnabled(true); await f.runtime.start(); expect(f.start).toHaveBeenCalledTimes(1);
    await f.runtime.stop(); expect(f.close).toHaveBeenCalledTimes(1); await f.runtime.dispose();
});
test('disabling while resource initialization waits never starts late capture',async()=>{
    const f=fixture(); let resolve; f.backend.create.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    await f.runtime.setEnabled(true); const opening=f.runtime.start(); await tick(); const disabling=f.runtime.setEnabled(false);
    resolve({start:f.start,close:f.close}); await opening; await disabling;
    expect(f.start).not.toHaveBeenCalled(); expect(f.close).toHaveBeenCalledTimes(1); await f.runtime.dispose();
});
test('permission granted after disabling is released and never becomes listening',async()=>{
    const f=fixture(); let resolve; f.start.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    await f.runtime.setEnabled(true); const opening=f.runtime.start(); await tick(); const disabling=f.runtime.setEnabled(false);
    expect(f.close).toHaveBeenCalled(); resolve(); await opening; await disabling; expect(f.close).toHaveBeenCalled(); expect(f.runtime.getState().phase).toBe('off'); await f.runtime.dispose();
});
test('foreground lifecycle pauses and resumes an armed device',async()=>{
    const f=fixture(); await f.runtime.setEnabled(true); await f.runtime.start();
    f.env.document.visibilityState='hidden'; f.env.document.dispatchEvent(new Event('visibilitychange')); await tick();
    expect(f.close).toHaveBeenCalledTimes(1); expect(f.runtime.getState().phase).toBe('suspended');
    f.env.document.visibilityState='visible'; f.env.document.dispatchEvent(new Event('visibilitychange')); await tick();
    expect(f.start).toHaveBeenCalledTimes(2); await f.runtime.dispose();
});
test('microphone arbitration suspends until the other capture is released',async()=>{
    const f=fixture(); await f.runtime.setEnabled(true); await f.runtime.start(); await f.runtime.suspend('capture');
    expect(f.runtime.getState().phase).toBe('suspended'); await f.runtime.resume('capture'); expect(f.start).toHaveBeenCalledTimes(2); await f.runtime.dispose();
});
test('one detection opens once, signals only on readiness, resumes after assistant closure',async()=>{
    const f=fixture(); let emit;
    const assistant={subscribe:fn=>{emit=fn; fn({active:false}); return ()=>{};},open:vi.fn(async()=>{emit({active:true,phase:'connecting'});})};
    f.runtime.connectAssistant(assistant); await f.runtime.setEnabled(true); await f.runtime.start(); f.detect(); f.detect(); await tick();
    expect(assistant.open).toHaveBeenCalledTimes(1); expect(f.signalReady).not.toHaveBeenCalled();
    emit({active:true,phase:'listening',microphoneActive:true}); await tick(); expect(f.signalReady).toHaveBeenCalledTimes(1);
    emit({active:true,phase:'speaking'}); await tick(); expect(f.start).toHaveBeenCalledTimes(1);
    emit({active:false}); await tick(); expect(f.start).toHaveBeenCalledTimes(2); await f.runtime.dispose();
});
test('test detection never opens the assistant',async()=>{
    const f=fixture(); const open=vi.fn(); f.runtime.connectAssistant({subscribe:fn=>{fn({active:false});return()=>{};},open});
    await f.runtime.test(); f.detect(); await tick(); expect(open).not.toHaveBeenCalled(); expect(f.runtime.getState().detected).toBe(true); expect(f.runtime.getState().armed).toBe(false); await f.runtime.dispose();
});
test('test expires after 30 seconds and logout releases resources',async()=>{
    vi.useFakeTimers(); const f=fixture(); await f.runtime.test(); await vi.advanceTimersByTimeAsync(30000);
    expect(f.runtime.getState().armed).toBe(false); await f.runtime.setEnabled(true); await f.runtime.start();
    f.env.dispatchEvent(new Event('squirrel:user-logged-out')); await tick(); expect(f.runtime.getState().enabled).toBe(false);
    expect(f.close).toHaveBeenCalledTimes(2); await f.runtime.dispose(); vi.useRealTimers();
});
test('losing window focus suspends standby without disarming the device',async()=>{
 const f=fixture(); await f.runtime.setEnabled(true); await f.runtime.start();
 f.env.dispatchEvent(new Event('blur')); await tick(); expect(f.runtime.getState().phase).toBe('suspended'); expect(f.runtime.getState().armed).toBe(true);
 f.env.dispatchEvent(new Event('focus')); await tick(); expect(f.start).toHaveBeenCalledTimes(2); await f.runtime.dispose();
});
test('native microphone preemption waits on availability before resuming',async()=>{
 vi.useFakeTimers(); const f=fixture(); let onError;
 f.backend.create.mockImplementation(async c=>{onError=c.onError;let closing;return{start:f.start,close:()=>closing ||= f.close()};});
 f.backend.captureAvailable.mockResolvedValue(false); await f.runtime.setEnabled(true); await f.runtime.start();
 onError(new Error('wake_capture_busy')); await tick(); expect(f.runtime.getState().phase).toBe('suspended');
 await vi.advanceTimersByTimeAsync(1000); expect(f.start).toHaveBeenCalledTimes(1);
 f.backend.captureAvailable.mockResolvedValue(true); await vi.advanceTimersByTimeAsync(1000); expect(f.start).toHaveBeenCalledTimes(2);
 await f.runtime.dispose(); vi.useRealTimers();
});
test('cleanup failure is explicit and cannot strand the lifecycle promise',async()=>{
 const f=fixture(); await f.runtime.setEnabled(true); await f.runtime.start(); f.close.mockRejectedValue(new Error('wake_capture_failed'));
 await f.runtime.stop(); expect(f.runtime.getState().phase).toBe('unavailable'); expect(f.runtime.getState().error).toBe('wake_capture_failed');
 f.close.mockResolvedValue(); await f.runtime.start(); expect(f.runtime.getState().phase).toBe('listening'); await f.runtime.dispose();
});
