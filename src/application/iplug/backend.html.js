// Backend HTML (WebAudio fallback) - Not sample-accurate; OK for UI prototyping/offline
// Implements the same API surface; schedules via AudioContext time, not host sample time.
// Markers/sprites are resolved in JS; crossfades approximate.

(function(){
  const audio = (window.Squirrel = window.Squirrel || {}, window.Squirrel.av = window.Squirrel.av || {}, window.Squirrel.av.audio = window.Squirrel.av.audio || window.Squirrel.av.audio);
  if(!audio || !audio.__register_backend) return;

  const C = {
    sr: 48000,
  };
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: C.sr });
  const gain = ctx.createGain(); gain.connect(ctx.destination);

  // State
  const clips = new Map(); // id -> { buffer|url, mode, markers:Map, sprites:Map, envDefault }
  const voices = new Map(); // voiceId -> { clipId, srcNode, gainNode, whenTime }
  let voiceCounter = 0;

  function emit(type, payload){ audio.__emit && audio.__emit('av:audio:html:'+type, payload); audio.__emit && audio.__emit(type, payload); }

  function timeFor(when){
    if(!when || when.type === 'now') return ctx.currentTime;
    if(when.type === 'bufferOffset') return ctx.currentTime + (when.value || 0) / C.sr;
    // hostSampleTime unsupported in HTML backend
    return ctx.currentTime;
  }

  async function loadBufferFromUrl(url){
    const res = await fetch(url); const ab = await res.arrayBuffer(); return await ctx.decodeAudioData(ab);
  }

  // Batch dispatcher from facade
  function dispatch_batch(batch){
    for(const {name,arg} of batch){ if (typeof api[name] === 'function') try{ api[name](arg); }catch(e){ console.warn(e);} }
  }

  // Helpers
  function resolveStart(clip, start){
    if(typeof start === 'number') return start;
    if(start && start.marker){ const m=clip.markers.get(start.marker); return m? m.frame:0; }
    if(start && start.sprite){ const s=clip.sprites.get(start.sprite); return s? s.start:0; }
    return 0;
  }

  function create_clip(opts){
    const id = opts.id;
    const clip = { id, mode: opts.mode || 'preload', url: opts.path_or_bookmark, buffer: null,
      markers: new Map(), sprites: new Map(), envDefault: opts.envelope_default || {a:0.001,d:0.05,s:0.8,r:0.1} };
    (opts.markers||[]).forEach(m=>clip.markers.set(m.name, {name:m.name, frame:m.frame}));
    (opts.sprites||[]).forEach(s=>clip.sprites.set(s.name, {name:s.name, start:s.start, end:s.end}));
    clips.set(id, clip);
    if(clip.mode === 'preload'){
      loadBufferFromUrl(clip.url).then(buf=>{ clip.buffer = buf; }).catch(e=>console.warn('decode error', e));
    }
    return true;
  }
  function destroy_clip({id}){ clips.delete(id); return true; }

  function play(opts){
    const clip = clips.get(opts.clip_id); if(!clip) return false;
    const when = timeFor(opts.when);
    const startFrame = resolveStart(clip, opts.start);
    const end = (typeof opts.end === 'number') ? opts.end : undefined;

    const src = ctx.createBufferSource();
    const g = ctx.createGain(); g.gain.value = Math.pow(10, ((opts.gain_db_delta||0) + (clip.gain_db||0)) / 20);
    src.connect(g); g.connect(gain);
    let durationSec = undefined;

    if(clip.buffer){
      src.buffer = clip.buffer;
      const sr = clip.buffer.sampleRate; const startSec = startFrame/sr; const endSec = end? (end/sr): undefined;
      if(endSec !== undefined && endSec>startSec) durationSec = endSec - startSec;
      src.start(when, startSec, durationSec);
    } else {
      // stream: naive approach, not gapless
      loadBufferFromUrl(clip.url).then(buf=>{ src.buffer = buf; src.start(when, startFrame/buf.sampleRate, durationSec); });
    }

    const voice_id = 'v'+(++voiceCounter);
    voices.set(voice_id, { clipId: clip.id, srcNode: src, gainNode: g, whenTime: when });
    src.onended = ()=>{ emit('voice_ended', { clip_id: clip.id, voice_id }); voices.delete(voice_id); };
    emit('voice_started', { clip_id: clip.id, voice_id });
    return true;
  }

  function stop({ voice_id, release_ms }){
    const v = voices.get(voice_id); if(!v) return false;
    try{ v.srcNode.stop(); }catch(_){}
    voices.delete(voice_id); emit('voice_ended', { clip_id: v.clipId, voice_id });
    return true;
  }

  function stop_clip({ clip_id }){
    for(const [vid,v] of Array.from(voices.entries())){
      if(v.clipId === clip_id){ try{ v.srcNode.stop(); }catch(_){} voices.delete(vid); emit('voice_ended', { clip_id, voice_id: vid }); }
    }
    return true;
  }

  function jump({ voice_id, to, xfade_samples }){
    // Not sample-accurate; implemented as stop+play at target
    const v = voices.get(voice_id); if(!v) return false;
    stop({ voice_id });
    play({ clip_id: v.clipId, when:{type:'now'}, start: (typeof to==='number'? to : { marker: to.marker }) });
    return true;
  }
  function set_param({ target, id, name, value }){
    if(target === 'global' && name === 'gain') gain.gain.value = value;
    return true;
  }
  function map_midi(mapping){ /* optional stub */ return true; }
  function add_marker({ clip_id, name, frame }){ const c=clips.get(clip_id); if(!c) return false; c.markers.set(name,{name,frame}); return true; }
  function remove_marker({ clip_id, name }){ const c=clips.get(clip_id); if(!c) return false; c.markers.delete(name); return true; }
  function set_marker_follow_actions({ clip_id, marker, actions }){ /* store in clip if needed */ return true; }
  function clear_marker_follow_actions({ clip_id, marker }){ /* clear */ return true; }
  function query_clip({ id }){ return clips.get(id) ? { id, mode: clips.get(id).mode } : null; }

  const api = { dispatch_batch, create_clip, destroy_clip, play, stop, stop_clip, jump, set_param, map_midi,
    add_marker, remove_marker, set_marker_follow_actions, clear_marker_follow_actions, query_clip };
  audio.__register_backend('html', api);

  // usage
  // Squirrel.av.audio.set_backend('html');
  // Squirrel.av.audio.create_clip({ id:'c1', path_or_bookmark:'/audio/kick.wav', mode:'preload' });
})();
