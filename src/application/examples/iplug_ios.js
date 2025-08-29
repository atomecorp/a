'use strict';

// Example: iPlug AUv3 control + file loader for iOS (Squirrel UI only)
// Creates controls to pick a file, play/stop, set gain and position.
// Sends JSON over the 'squirrel' bridge consumed by AUViewController.swift.

(function(){
  const send = (msg) => {
    try {
      if (window.webkit && window.webkit.messageHandlers) {
        if (window.webkit.messageHandlers.swiftBridge) {
          window.webkit.messageHandlers.swiftBridge.postMessage(msg);
          return;
        }
        if (window.webkit.messageHandlers.squirrel) {
          window.webkit.messageHandlers.squirrel.postMessage(msg);
          return;
        }
      }
      if (window.AtomeDSP && typeof window.AtomeDSP.setParam === 'function') {
        if (msg.type === 'param') {
          const idMap = { gain: 0, play: 1, position: 2 };
          window.AtomeDSP.setParam(idMap[msg.id] ?? 0, Number(msg.value) || 0);
        }
        return;
      }
    } catch(e) { console.error(e); }
  };

  const root = $('div', {
    id: 'iplug-ios-example',
    css: { padding: '12px', color: '#eee', backgroundColor: '#222', display: 'block' },
    text: 'iPlug AUv3 — iOS File Loader & Transport'
  });

  const row1 = $('div', { id: 'iplug-ios-row1', css: { marginTop: '10px' }, parent: root });
  $('button', {
    id: 'iplug-ios-load-button',
    text: 'Load audio file',
    css: { padding: '6px 12px', cursor: 'pointer', marginRight: '10px' },
    parent: row1,
  onclick: () => importM4A()
  });

  const row2 = $('div', { id: 'iplug-ios-row2', css: { marginTop: '10px' }, parent: root });
  const playBtn = $('button', {
    id: 'iplug-ios-play-button',
    text: 'Play',
    css: { padding: '6px 12px', cursor: 'pointer', marginRight: '10px' },
    parent: row2,
    onclick: () => {
      const playing = playBtn._playing = !playBtn._playing;
      playBtn.textContent = playing ? 'Stop' : 'Play';
      send({ type: 'param', id: 'play', value: playing ? 1 : 0 });
    }
  });
  // Debug controls
  const dbgRow = $('div', { id: 'iplug-ios-dbg', css: { marginTop: '8px' }, parent: root });
  const toneBtn = $('button', { id:'iplug-ios-tone', text:'Tone', css:{ padding:'4px 8px', marginRight:'8px' }, parent: dbgRow, onclick:()=>{
    toneBtn._on = !toneBtn._on; toneBtn.textContent = toneBtn._on? 'Tone: ON':'Tone';
    send({ type:'param', id:'tone', value: toneBtn._on? 1:0 });
  }});
  const capBtn = $('button', { id:'iplug-ios-cap', text:'Cap', css:{ padding:'4px 8px', marginRight:'8px' }, parent: dbgRow, onclick:()=>{
    capBtn._on = !capBtn._on; capBtn.textContent = capBtn._on? 'Cap: ON':'Cap';
    send({ type:'param', id:'cap', value: capBtn._on? 1:0 });
  }});
  $('button', { id:'iplug-ios-dump', text:'Dump', css:{ padding:'4px 8px' }, parent: dbgRow, onclick:()=>{
    try { window.webkit.messageHandlers.swiftBridge.postMessage({ debug: 'dumpCapture' }); } catch(e){}
  }});

  const row3 = $('div', { id: 'iplug-ios-row3', css: { marginTop: '10px' }, parent: root });
  $('span', { id: 'iplug-ios-gain-label', text: 'Gain', css: { marginRight: '8px' }, parent: row3 });
  $('input', {
    id: 'iplug-ios-gain-slider',
    type: 'range', min: '0', max: '2', step: '0.01', value: '1',
    css: { width: '220px', verticalAlign: 'middle' }, parent: row3,
    oninput: (e) => send({ type: 'param', id: 'gain', value: Number(e.target.value) })
  });

  const row4 = $('div', { id: 'iplug-ios-row4', css: { marginTop: '10px' }, parent: root });
  $('span', { id: 'iplug-ios-position-label', text: 'Position', css: { marginRight: '8px' }, parent: row4 });
  $('input', {
    id: 'iplug-ios-position-slider',
    type: 'range', min: '0', max: '1000000', step: '256', value: '0',
    css: { width: '320px', verticalAlign: 'middle' }, parent: row4,
    oninput: (e) => send({ type: 'param', id: 'position', value: Number(e.target.value) })
  });

  // Meter/Status display
  const meter = $('div', { id: 'iplug-ios-meter', css: { marginTop: '12px', fontFamily: 'monospace' }, parent: root, text: 'meter: -- dB' });
  const status = $('div', { id: 'iplug-ios-status', css: { marginTop: '8px', fontFamily: 'monospace', color:'#8fd' }, parent: root, text: 'status: idle' });
  const listWrap = $('div', { id: 'iplug-ios-list', parent: root, css: { marginTop:'8px', maxHeight:'140px', overflowY:'auto', backgroundColor:'#111', border:'1px solid #2c343d', borderRadius:'6px', padding:'6px', color:'#e6e6e6', fontFamily:'monospace', fontSize:'12px' }, text:'Recordings (.m4a):' });
  window.addEventListener('meter', (ev) => {
    const d = ev.detail || {}; meter.textContent = `meter: ${d.level ?? '--'} dB`; 
  });

  if (document && document.body && !root.parentNode) document.body.appendChild(root);
  

  // Import exactly like ios_audio_bridge.js: only m4a, then refresh the list
  function importM4A(){
    try{
      if(!window.AtomeFileSystem){ console.warn('AtomeFileSystem indisponible'); return; }
      window.AtomeFileSystem.copy_to_ios_local('Recordings', ['m4a'], (res)=>{
        if(res && res.success){ listRecordings(); }
        else { console.warn('Import échoué', res && res.error); }
      });
    }catch(e){ console.warn('importM4A error', e); }
  }

  function listRecordings(){
    try{
      const fs = window.AtomeFileSystem;
      if(!fs || typeof fs.listFiles !== 'function'){ listWrap.textContent = 'API fichier indisponible'; return; }
      fs.listFiles('Recordings', (res)=>{
        if(!res || !res.success){ listWrap.textContent = 'Erreur de liste'; return; }
        const files = (res.data && res.data.files) ? res.data.files : [];
        const items = files.filter(f=>!f.isDirectory && /\.m4a$/i.test(f.name));
        // Clear and render
        listWrap.innerHTML = '';
        $('div',{ id:'iplug-ios-list-title', parent:listWrap, css:{marginBottom:'6px',color:'#9db2cc'}, text: items.length? 'Recordings (.m4a):' : 'Aucun fichier .m4a dans Recordings/' });
        items.forEach((it, idx)=>{
          $('button',{
            id: 'iplug-ios-file-'+idx,
            parent: listWrap,
            text: it.name,
            css:{ display:'block', width:'100%', textAlign:'left', marginBottom:'6px', padding:'6px 8px', background:'#1a1f25', color:'#e6e6e6', border:'1px solid #2c343d', borderRadius:'4px', cursor:'pointer', fontFamily:'monospace', fontSize:'12px' },
            onclick: ()=> {
              const rel = 'Recordings/'+it.name;
              status.textContent = 'selected: '+rel;
              if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge){
                try { window.webkit.messageHandlers.swiftBridge.postMessage({ type:'iplug', action:'loadLocalPath', relativePath: rel }); } catch(_){ }
              }
            }
          });
        });
      });
    }catch(e){ listWrap.textContent = 'Erreur'; console.warn('listRecordings error', e); }
  }

  // initial list
  listRecordings();
})();
