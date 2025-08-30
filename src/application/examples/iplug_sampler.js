// iPlug Sampler Demo (Squirrel UI)
// Validates API: create clips, markers/sprites, play/stop, jump, follow, envelopes, MIDI map, backend swap

(function(){
  const A = (window.Squirrel = window.Squirrel || {}, window.Squirrel.av = window.Squirrel.av || {}, window.Squirrel.av.audio = window.Squirrel.av.audio || window.Squirrel.av.audio);
  const createdClips = new Set();

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
          $('button',{
            id: 'rec-'+idx,
            parent: listWrap,
            text: '▶ '+it.name,
            css:{ display:'block', width:'100%', textAlign:'left', marginBottom:'6px', padding:'6px 8px', background:'#1a1f25', color:'#e6e6e6', border:'1px solid #2c343d', borderRadius:'4px', cursor:'pointer', fontFamily:'monospace', fontSize:'12px' },
            onclick: ()=>{
              const rel = 'Recordings/'+it.name;
              const clipId = it.name.replace(/\.[^.]+$/,'');
              if(!createdClips.has(clipId)){
                A.create_clip({ id: clipId, path_or_bookmark: rel, mode:'preload' });
                createdClips.add(clipId);
              }
              A.play({ clip_id: clipId, when:{type:'now'}, start:0, end:'clip_end', loop:{mode:'off'} });
            }
          });
        });
      });
    }catch(e){ listWrap.textContent = 'Erreur'; console.warn('listRecordings error', e); }
  }

  // Events
  const log = $('div', { id:'log', parent: root, css:{ marginTop:'10px', fontFamily:'monospace', fontSize:'12px', background:'#111', padding:'6px' } });
  function logLine(t, p){ const s = JSON.stringify(p||{}); const l = $('div', { parent: log, text: `${t}: ${s}`, css:{ color:'#8fd' } }); log.scrollTop = 1e9; return l; }
  ['voice_started','voice_ended','marker_hit','follow_action_fired','clip_stream_xrun','backend_changed'].forEach(t => A.on(t, (p)=>logLine(t,p)));

  // Init
  A.detect_and_set_backend(['iplug','html']);
  listRecordings();
})();
