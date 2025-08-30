// Backend iPlug AUv3 bridge
// UI->DSP: via window.__toDSP(msg)
// DSP->UI: via window.__fromDSP(msg) -> we re-emit both specific and generic event names
// Serialization: compact JSON objects; TODO: support ArrayBuffer/SharedArrayBuffer for binary transport to reduce GC/overhead.

(function(){
  const audio = (window.Squirrel = window.Squirrel || {}, window.Squirrel.av = window.Squirrel.av || {}, window.Squirrel.av.audio = window.Squirrel.av.audio || window.Squirrel.av.audio);
  if(!audio || !audio.__register_backend) return;

  function send(msg){
    try{ if(typeof window.__toDSP === 'function') window.__toDSP(msg); }
    catch(e){ console.warn('toDSP failed', e); }
  }

  function swiftSend(obj){
    try{
      if(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge){
        window.webkit.messageHandlers.swiftBridge.postMessage(obj);
      }
    }catch(e){ console.warn('swiftBridge post failed', e); }
  }

  // Batch dispatcher from facade
  function dispatch_batch(batch){
    // If native __toDSP is available, bundle batch; else translate to swiftBridge calls
    if(typeof window.__toDSP === 'function'){
      send({ type:'batch', payload: batch });
      return;
    }
    // Translate each command to the current swiftBridge payloads
    for(const {name, arg} of batch){
      switch(name){
        case 'create_clip': {
          if(arg && arg.path_or_bookmark){
            swiftSend({ type:'iplug', action:'loadLocalPath', relativePath: arg.path_or_bookmark, clipId: arg.id });
          }
          break;
        }
        case 'play': {
          swiftSend({ type:'param', id:'play', value: 1 });
          break;
        }
        case 'stop':
        case 'stop_clip': {
          swiftSend({ type:'param', id:'play', value: 0 });
          break;
        }
        case 'set_param': {
          if(arg && (arg.name === 'gain' || arg.id === 'gain')){
            swiftSend({ type:'param', id:'gain', value: Number(arg.value)||0 });
          }
          break;
        }
        case 'jump': {
          // Optional: if numeric frames provided, map to normalized slider range [0..1e6]
          if(arg && typeof arg.to === 'number'){
            const normalized = Math.max(0, Math.min(1000000, Math.floor(arg.to))); // heuristic
            swiftSend({ type:'param', id:'position', value: normalized });
          }
          break;
        }
        default: break;
      }
    }
  }

  // API functions: enqueue compact messages
  function create_clip(opts){
    if(typeof window.__toDSP === 'function') { send({ type:'create_clip', payload: opts }); return true; }
    if(opts && opts.path_or_bookmark) swiftSend({ type:'iplug', action:'loadLocalPath', relativePath: opts.path_or_bookmark, clipId: opts.id });
    return true;
  }
  function destroy_clip(arg){ if(typeof window.__toDSP === 'function'){ send({ type:'destroy_clip', payload: arg }); } return true; }
  function play(opts){ if(typeof window.__toDSP === 'function'){ send({ type:'play', payload: opts }); } else { swiftSend({ type:'param', id:'play', value: 1 }); } return true; }
  function stop(opts){ if(typeof window.__toDSP === 'function'){ send({ type:'stop', payload: opts }); } else { swiftSend({ type:'param', id:'play', value: 0 }); } return true; }
  function stop_clip(opts){ if(typeof window.__toDSP === 'function'){ send({ type:'stop_clip', payload: opts }); } else { swiftSend({ type:'param', id:'play', value: 0 }); } return true; }
  function jump(opts){ if(typeof window.__toDSP === 'function'){ send({ type:'jump', payload: opts }); } else if(opts && typeof opts.to === 'number'){ const v=Math.max(0, Math.min(1000000, Math.floor(opts.to))); swiftSend({ type:'param', id:'position', value: v }); } return true; }
  function set_param(opts){ if(typeof window.__toDSP === 'function'){ send({ type:'set_param', payload: opts }); } else if(opts && (opts.name==='gain'||opts.id==='gain')){ swiftSend({ type:'param', id:'gain', value: Number(opts.value)||0 }); } return true; }
  function map_midi(mapping){ if(typeof window.__toDSP === 'function'){ send({ type:'map_midi', payload: mapping }); } return true; }
  function add_marker(arg){ if(typeof window.__toDSP === 'function'){ send({ type:'add_marker', payload: arg }); } return true; }
  function remove_marker(arg){ if(typeof window.__toDSP === 'function'){ send({ type:'remove_marker', payload: arg }); } return true; }
  function set_marker_follow_actions(arg){ if(typeof window.__toDSP === 'function'){ send({ type:'set_marker_follow_actions', payload: arg }); } return true; }
  function clear_marker_follow_actions(arg){ if(typeof window.__toDSP === 'function'){ send({ type:'clear_marker_follow_actions', payload: arg }); } return true; }
  function query_clip(arg){ if(typeof window.__toDSP === 'function'){ send({ type:'query_clip', payload: arg }); } return true; }

  // Register backend implementation
  audio.__register_backend('iplug', {
    dispatch_batch,
    create_clip, destroy_clip, play, stop, stop_clip, jump,
    set_param, map_midi,
    add_marker, remove_marker, set_marker_follow_actions, clear_marker_follow_actions,
    query_clip
  });

  // DSP->UI events hook
  function handleFromDSP(msg){
    try{
      const emit = audio.__emit;
      const backendPrefix = 'av:audio:iplug:';
      const t = msg && msg.type || 'unknown';
      emit(backendPrefix + t, msg.payload);
      emit(t, msg.payload);
    }catch(e){ console.warn('fromDSP handler error', e); }
  }
  if(typeof window.__fromDSP === 'function'){
    // Wrap existing callback
    const prev = window.__fromDSP;
    window.__fromDSP = function(msg){ try{ handleFromDSP(msg); } finally { try{ prev(msg); } catch(_){} } };
  } else {
    window.__fromDSP = handleFromDSP;
  }

  // Also listen for DOM CustomEvent 'clip_ready' dispatched by native Swift bridge
  try{
    window.addEventListener('clip_ready', (ev)=>{
      const payload = ev && ev.detail ? ev.detail : {};
      handleFromDSP({ type:'clip_ready', payload });
    });
  }catch(_){ }

  // usage
  // Squirrel.av.audio.set_backend('iplug');
  // Squirrel.av.audio.play({ clip_id:'c1', when:{type:'now'} });
})();
