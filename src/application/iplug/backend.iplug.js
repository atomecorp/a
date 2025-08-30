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

  // Batch dispatcher from facade
  function dispatch_batch(batch){
    // bundle as one message to reduce bridge overhead
    send({ type:'batch', payload: batch });
  }

  // API functions: enqueue compact messages
  function create_clip(opts){ send({ type:'create_clip', payload: opts }); return true; }
  function destroy_clip(arg){ send({ type:'destroy_clip', payload: arg }); return true; }
  function play(opts){ send({ type:'play', payload: opts }); return true; }
  function stop(opts){ send({ type:'stop', payload: opts }); return true; }
  function stop_clip(opts){ send({ type:'stop_clip', payload: opts }); return true; }
  function jump(opts){ send({ type:'jump', payload: opts }); return true; }
  function set_param(opts){ send({ type:'set_param', payload: opts }); return true; }
  function map_midi(mapping){ send({ type:'map_midi', payload: mapping }); return true; }
  function add_marker(arg){ send({ type:'add_marker', payload: arg }); return true; }
  function remove_marker(arg){ send({ type:'remove_marker', payload: arg }); return true; }
  function set_marker_follow_actions(arg){ send({ type:'set_marker_follow_actions', payload: arg }); return true; }
  function clear_marker_follow_actions(arg){ send({ type:'clear_marker_follow_actions', payload: arg }); return true; }
  function query_clip(arg){ send({ type:'query_clip', payload: arg }); return true; }

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

  // usage
  // Squirrel.av.audio.set_backend('iplug');
  // Squirrel.av.audio.play({ clip_id:'c1', when:{type:'now'} });
})();
