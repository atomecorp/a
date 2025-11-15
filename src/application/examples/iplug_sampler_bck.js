  // Console redefinition
        window.console.log = (function(oldLog) {
            return function(message) {
                oldLog(message);
                try {
                    window.webkit.messageHandlers.console.postMessage("LOG: " + message);
                } catch(e) {
                    oldLog();
                }
            }
        })(window.console.log);

        window.console.error = (function(oldErr) {
            return function(message) {
                oldErr(message);
                try {
                    window.webkit.messageHandlers.console.postMessage("ERROR: " + message);
                } catch(e) {
                    oldErr();
                }
            }
        })(window.console.error);

//tests

        console.log("Console redefined for Swift communication");
        console.error(" error redefined for Swift communication");



// Validates API: create clips, markers/sprites, play/stop, jump, follow, envelopes, MIDI map, backend swap

(function(){
  const A = (window.Squirrel = window.Squirrel || {}, window.Squirrel.av = window.Squirrel.av || {}, window.Squirrel.av.audio = window.Squirrel.av.audio || window.Squirrel.av.audio);
  const createdClips = new Set();
  const clipState = new Map(); // clipId -> { path, ready:boolean, pendingPlay:boolean, retryTimer?:any }
  let currentClipId = null;
  let currentPlayTimer = null;
  let currentToken = 0;

  function swiftSend(obj){
    try{ if(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge){ window.webkit.messageHandlers.swiftBridge.postMessage(obj); } }catch(_){ }
  }

  function stopAllPlayback(){
    // invalidate pending
    currentToken++;
    if(currentPlayTimer){ clearTimeout(currentPlayTimer); currentPlayTimer = null; }
  // Single global stop at native bridge to avoid message races
    swiftSend({ type:'param', id:'play', value:0 });
  swiftSend({ type:'param', id:'position', value:0 });
  // clear any pendingPlay flags and retry timers for all clips
  for (const [id, st] of clipState.entries()) { st.pendingPlay = false; if (st.retryTimer) { clearTimeout(st.retryTimer); st.retryTimer = null; } }
    currentClipId = null;
  }

  // Root
  const root = $('div', { id:'iplug-sampler-demo', css:{ padding:'10px', color:'#eee', backgroundColor:'#222', display:'block' }, text:'iPlug Sampler Demo' });
  if (document && document.body && !root.parentNode) document.body.appendChild(root);

  const row1 = $('div', { id:'row1', parent: root, css:{ marginTop:'8px' } });
  const row2 = $('div', { id:'row2', parent: root, css:{ marginTop:'8px' } });
  const fileRow = $('div', { id:'row-files', parent: root, css:{ marginTop:'10px' } });
  const listWrap = $('div', { id:'recordings-list', parent: root, css:{ marginTop:'8px', maxHeight:'160px', overflowY:'auto', background:'#111', border:'1px solid #2c343d', borderRadius:'6px', padding:'6px', color:'#e6e6e6', fontFamily:'monospace', fontSize:'12px' }, text:'Recordings (.m4a):' });

  // Backend picker
  $('span', { text:'Backend: ', parent: row1, css:{ marginRight:'6px' } });
  const bI = $('button', { id:'b-iplug', parent: row1, text:'iPlug', css:{ padding:'4px 8px', marginRight:'6px' }, onclick:()=>A.set_backend('iplug') });
  const bH = $('button', { id:'b-html', parent: row1, text:'HTML', css:{ padding:'4px 8px' }, onclick:()=>A.set_backend('html') });

  // Gain slider
  $('span', { text:'Gain', parent: row2, css:{ marginRight:'6px' } });
  $('input', { id:'gain', type:'range', min:'0', max:'2', step:'0.01', value:'1', parent: row2, css:{ width:'200px', verticalAlign:'middle' }, oninput:(e)=>A.set_param({ target:'global', name:'gain', value:Number(e.target.value) }) });

  // Buttons
  const row3 = $('div', { id:'row3', parent: root, css:{ marginTop:'8px' } });
  $('button', { text:'Create clips', parent: row3, css:{ padding:'4px 8px', marginRight:'6px' }, onclick:()=>{
    A.create_clip({ id:'c1', path_or_bookmark:'Recordings/clip1.m4a', mode:'preload',
      markers:[{name:'A', frame:48000},{name:'B', frame:96000}], sprites:[{name:'intro', start:0, end:24000}], envelope_default:{a:0.001,d:0.05,s:0.8,r:0.1} });
    A.create_clip({ id:'c2', path_or_bookmark:'Recordings/clip2.m4a', mode:'stream', markers:[{name:'start', frame:0}] });
  }});
  $('button', { text:'Play c1@A', parent: row3, css:{ padding:'4px 8px', marginRight:'6px' }, onclick:()=>{
    A.play({ clip_id:'c1', when:{type:'now'}, start:{marker:'A'}, end:'clip_end', loop:{mode:'off'}, xfade_samples:64 });
  }});
  $('button', { text:'Jump to B', parent: row3, css:{ padding:'4px 8px', marginRight:'6px' }, onclick:()=>{
    A.jump({ voice_id:'v1', to:{marker:'B'}, xfade_samples:64 });
  }});
  $('button', { text:'Stop c1', parent: row3, css:{ padding:'4px 8px', marginRight:'6px' }, onclick:()=>{
    A.stop_clip({ clip_id:'c1', release_ms:50 });
  }});

  // Follow-actions
  const row4 = $('div', { id:'row4', parent: root, css:{ marginTop:'8px' } });
  $('button', { text:'Follow A->B 70%', parent: row4, css:{ padding:'4px 8px' }, onclick:()=>{
    A.set_marker_follow_actions({ clip_id:'c1', marker:'A', actions:[{ action:'jump', target_marker:'B', probability:0.7 }] });
  }});

  // MIDI map stub
  const row5 = $('div', { id:'row5', parent: root, css:{ marginTop:'8px' } });
  $('button', { text:'Map MIDI (stub)', parent: row5, css:{ padding:'4px 8px' }, onclick:()=>{
    A.map_midi({ cc:[{cc:1, target:'env_attack', range:[0.001,0.5]}, {cc:2, target:'env_release', range:[0.01,1.0]}] });
  }});

  // File import/list
  $('button', { id:'btn-import', parent:fileRow, text:'Importer fichier (.m4a)', css:{ padding:'4px 8px', marginRight:'6px' }, onclick:()=>{
    try{
      if(!window.AtomeFileSystem){ console.warn('AtomeFileSystem indisponible'); return; }
      window.AtomeFileSystem.copy_to_ios_local('Recordings', ['m4a'], (res)=>{ if(res && res.success){ listRecordings(); } else { console.warn('Import échoué', res && res.error); } });
    }catch(e){ console.warn('import error', e); }
  }});
  $('button', { id:'btn-refresh', parent:fileRow, text:'Rafraîchir la liste', css:{ padding:'4px 8px' }, onclick:()=>listRecordings() });
  // Stop all playback
  $('button', { id:'btn-stop-all', parent:fileRow, text:'Stop', css:{ padding:'4px 8px', marginLeft:'6px' }, onclick:()=>{ try{ stopAllPlayback(); }catch(e){ console.warn('stop all error', e); } }});

  function listRecordings(){
    try{
      const fs = window.AtomeFileSystem;
      if(!fs || typeof fs.listFiles !== 'function'){ listWrap.textContent = 'API fichier indisponible'; return; }
      fs.listFiles('Recordings', (res)=>{
        if(!res || !res.success){ listWrap.textContent = 'Erreur de liste'; return; }
        const files = (res.data && res.data.files) ? res.data.files : [];
        const items = files.filter(f=>!f.isDirectory && /\.(m4a)$/i.test(f.name));
        listWrap.innerHTML = '';
        $('div',{ id:'list-title', parent:listWrap, css:{marginBottom:'6px',color:'#9db2cc'}, text: items.length? 'Recordings (.m4a):' : 'Aucun fichier .m4a dans Recordings/' });
        items.forEach((it, idx)=>{
          const btn = $('button',{
            id: 'rec-'+idx,
            parent: listWrap,
            text: '▶ '+it.name,
            css:{
              display:'block', width:'100%', textAlign:'left', marginBottom:'6px', padding:'6px 8px',
              background:'#1a1f25', color:'#e6e6e6', border:'1px solid #2c343d', borderRadius:'4px', cursor:'pointer',
              fontFamily:'monospace', fontSize:'12px',
              // Better touch behavior
              touchAction:'manipulation', WebkitTapHighlightColor:'rgba(0,0,0,0)', userSelect:'none', WebkitUserSelect:'none'
            }
          });

          const rel = 'Recordings/'+it.name;
          const clipId = it.name.replace(/\.[^.]+$/,'');

          // Unified fast handler for mouse+touch on pointerdown
          const handleActivate = (ev)=>{
            try{
              if (ev) { ev.preventDefault && ev.preventDefault(); ev.stopPropagation && ev.stopPropagation(); }
              const now = Date.now();
              // Debounce rapid double-fires from multiple event types
              if (btn.__lastDown && (now - btn.__lastDown) < 160) return; btn.__lastDown = now;

              // Exclusivity: stop any current playback and clear other pendings
              stopAllPlayback();
              for (const [id, s] of clipState.entries()) { if (id !== clipId) { s.pendingPlay = false; if (s.retryTimer) { clearTimeout(s.retryTimer); s.retryTimer = null; } } }

              const prev = clipState.get(clipId);
              const st = prev || { path: rel, ready:false, pendingPlay:false };
              // If the path changed for same clipId, forget readiness from previous decode
              if (prev && prev.path !== rel) { st.ready = false; }
              st.path = rel;
              // If already decoded for this path, start immediately and DON'T re-create (prevents duplicate ready -> double start)
              if (st.ready && st.path === rel) {
                st.pendingPlay = false; if (st.retryTimer) { clearTimeout(st.retryTimer); st.retryTimer = null; }
                clipState.set(clipId, st);
                currentClipId = clipId;
                try { if (typeof A.jump==='function') A.jump({ clip_id: clipId, to: 0 }); } catch(_){ }
                if (typeof A.play === 'function') { A.play({ clip_id: clipId, when:{type:'now'}, start:0, end:'clip_end', loop:{mode:'off'} }); }
                return;
              }

              // Not ready yet: request (re)load and arm pending play
              A.create_clip({ id: clipId, path_or_bookmark: rel, mode:'preload' });
              createdClips.add(clipId);
              st.pendingPlay = true; clipState.set(clipId, st);
              currentClipId = clipId;

              // Retry once if not ready within 1500ms (handles decode=0 edge case)
              if (st.retryTimer) { clearTimeout(st.retryTimer); }
              st.retryTimer = setTimeout(()=>{
                const cur = clipState.get(clipId); if (!cur || !cur.pendingPlay || cur.ready) return;
                A.create_clip({ id: clipId, path_or_bookmark: rel, mode:'preload' });
              }, 1500);
            }catch(e){ console.warn('activate error', e); }
          };

          // Prefer pointerdown for immediate response on both mouse and touch
          try{ btn.addEventListener && btn.addEventListener('pointerdown', handleActivate, { passive:false }); }catch(_){ }
          // Fallbacks
          try{ btn.addEventListener && btn.addEventListener('mousedown', handleActivate, { passive:false }); }catch(_){ }
          try{ btn.addEventListener && btn.addEventListener('touchstart', handleActivate, { passive:false }); }catch(_){ }
          // Swallow the subsequent click if pointerdown already handled
          try{ btn.addEventListener && btn.addEventListener('click', (e)=>{ if (btn.__lastDown && (Date.now()-btn.__lastDown) < 500) { e.preventDefault(); e.stopPropagation(); } }, true); }catch(_){ }
          // Keyboard accessibility
          try{ btn.addEventListener && btn.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') handleActivate(e); }); }catch(_){ }

          // Don’t pre-create at render time to avoid parallel decodes; will create on first tap
          if(!clipState.has(clipId)) clipState.set(clipId, { path: rel, ready:false, pendingPlay:false });
        });
      });
    }catch(e){ listWrap.textContent = 'Erreur'; console.warn('listRecordings error', e); }
  }

  // Events
  const log = $('div', { id:'log', parent: root, css:{ marginTop:'10px', fontFamily:'monospace', fontSize:'12px', background:'#111', padding:'6px' } });
  function logLine(t, p){ const s = JSON.stringify(p||{}); const l = $('div', { parent: log, text: `${t}: ${s}`, css:{ color:'#8fd' } }); log.scrollTop = 1e9; return l; }
  ['voice_started','voice_ended','marker_hit','follow_action_fired','clip_stream_xrun','backend_changed'].forEach(t => A.on(t, (p)=>logLine(t,p)));
  // Native will emit clip_ready as soon as first PCM chunk is available
  A.on('clip_ready', (payload)=>{
    try{
      const clipId = payload && (payload.clip_id || (payload.path||'').split('/').pop().replace(/\.[^.]+$/,''));
      if(!clipId) return;
      const st = clipState.get(clipId) || { path: payload && payload.path, ready:false, pendingPlay:false };
      st.ready = true; clipState.set(clipId, st);
      logLine('clip_ready', { clip_id: clipId });
      if(st.pendingPlay && currentClipId === clipId){
        st.pendingPlay = false;
        if (st.retryTimer) { clearTimeout(st.retryTimer); st.retryTimer = null; }
  try { if (typeof A.jump==='function') A.jump({ clip_id: clipId, to: 0 }); } catch(_){ }
        if (typeof A.play === 'function') { A.play({ clip_id: clipId, when:{type:'now'}, start:0, end:'clip_end', loop:{mode:'off'} }); }
      }
    }catch(e){ console.warn('clip_ready handler error', e); }
  });

  // Init
  try{
    if(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge && A && typeof A.set_backend==='function'){
      A.set_backend('iplug');
    } else {
      A.detect_and_set_backend(['iplug','html']);
    }
  }catch(_){ A.detect_and_set_backend(['iplug','html']); }
  listRecordings();
})();
