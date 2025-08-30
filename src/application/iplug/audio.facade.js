// Squirrel AV Audio Facade
// Exposes Squirrel.av.audio with a switchable backend (iplug | html)
// - Dynamic routing to active backend
// - Event bus (type -> Set(callback))
// - detect_and_set_backend(["iplug","html"]) on startup
// - UI->DSP batching per frame (<= 60 Hz)
// Notes: Keep JS allocs out of the audio thread; backends talk to native or WebAudio.

(function(){
  const ns = (window.Squirrel = window.Squirrel || {});
  const av = (ns.av = ns.av || {});
  const audio = (av.audio = av.audio || {});

  // Event bus
  const listeners = new Map(); // type -> Set(fn)
  function emit(type, payload){
    const set = listeners.get(type);
    if(set){ for(const fn of set){ try{ fn(payload); }catch(e){ console.warn(e);} } }
  }
  audio.on = (type, fn)=>{
    if(!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  audio.off = (type, fn)=>{ const s=listeners.get(type); if(s) s.delete(fn); };

  // Backend registry
  const backends = Object.create(null);
  let active = null; // 'iplug' | 'html'

  // Frame-batched command queue (UI -> backend)
  const q = [];
  let rafId = 0;
  function pump(){
    rafId = 0;
    if(!active) return;
    if(q.length === 0) return;
    const batch = q.splice(0, q.length);
    try{ backends[active].dispatch_batch(batch); }catch(e){ console.warn('dispatch_batch error', e); }
  }
  function enqueue(cmd){
    q.push(cmd);
    if(!rafId){ rafId = requestAnimationFrame(pump); }
  }

  // API facade: routes to active backend
  const immediateNames = new Set(['play','jump','set_param']);
  const proxyCall = (name) => (arg)=>{
    if(!active || !backends[active] || typeof backends[active][name] !== 'function'){
      console.warn('No backend for', name); return false;
    }
    // low-latency calls go immediately
    if (immediateNames.has(name)) {
      try { backends[active][name](arg); } catch(e){ console.warn('immediate call failed', e); }
      return true;
    }
    // batch others UI->DSP calls
    enqueue({ name, arg });
    // Return lightweight ack; results delivered via events
    return true;
  };

  audio.set_backend = (name)=>{
    if(!backends[name]) return false;
    active = name; emit('backend_changed', { backend:name }); return true;
  };

  audio.detect_and_set_backend = (order=['iplug','html'])=>{
    const available = [];
    if ((window.__toDSP && window.__fromDSP) || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge)) available.push('iplug');
    if (window.AudioContext || window.webkitAudioContext) available.push('html');
    for(const pref of order){ if(available.includes(pref)) { audio.set_backend(pref); return pref; } }
    return null;
  };

  // Public API (façade)
  audio.create_clip = proxyCall('create_clip');
  audio.destroy_clip = proxyCall('destroy_clip');
  audio.play = proxyCall('play');
  audio.stop = proxyCall('stop');
  audio.stop_clip = proxyCall('stop_clip');
  audio.jump = proxyCall('jump');
  audio.set_param = proxyCall('set_param');
  audio.map_midi = proxyCall('map_midi');
  audio.add_marker = proxyCall('add_marker');
  audio.remove_marker = proxyCall('remove_marker');
  audio.set_marker_follow_actions = proxyCall('set_marker_follow_actions');
  audio.clear_marker_follow_actions = proxyCall('clear_marker_follow_actions');
  audio.query_clip = proxyCall('query_clip');

  // Backend registration hooks
  audio.__register_backend = (name, api)=>{ backends[name] = api; };
  audio.__emit = emit; // allow backends to emit on the facade bus

  // Auto detect backend
  audio.detect_and_set_backend(['iplug','html']);

  // usage
  // Squirrel.av.audio.on('backend_changed', ({backend})=>console.log('backend:', backend));
  // Squirrel.av.audio.create_clip({ id:'k', path_or_bookmark:'path', mode:'preload' });
})();
