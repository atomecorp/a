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

/*
 * ios_apis.js
 * High-level JavaScript helpers for iOS & AUv3 bridge.
 * Reuses existing logic from auv3_file_handling.js and audio_swift.js.
 * Each function documents the Swift / iOS API it expects.
 */

(function(global){
    'use strict';

    // ------------------------------------------------------------
    // Environment detection (reuses estDansAUv3 logic idea)
    // ------------------------------------------------------------
    function isAUv3() {
        if (typeof window.webkit !== 'undefined' &&
            typeof window.webkit.messageHandlers !== 'undefined' &&
            typeof window.webkit.messageHandlers.swiftBridge !== 'undefined') {
            return true;
        }
        return false;
    }

    function bridgeAvailable() {
        return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge);
    }

    function postToSwift(payload) {
        if (bridgeAvailable()) {
            try {
                window.webkit.messageHandlers.swiftBridge.postMessage(payload);
            } catch (e) {
                console.warn('[AUv3API] Failed to post to swiftBridge', e, payload);
            }
        } else {
            console.warn('[AUv3API] swiftBridge not available (probably not in AUv3 extension)', payload);
        }
    }

    // Simple ID generator for callbacks
    let _reqId = 0;
    function nextId(){ return ++_reqId; }

    // Central callback registries for async replies coming from Swift.
    const pendingFileSaves = {};      // id -> {resolve,reject}
    const pendingFileLoads = {};      // id -> {resolve,reject}
    const pendingLists     = {};      // id -> {resolve,reject}
    const tempoCallbacks   = [];      // listeners for tempo updates (pull once)
    const timeCallbacks    = [];      // listeners for timeline updates (stream)
    const hostStateCallbacks = [];    // listeners for host transport state
    const midiCallbacks    = [];      // listeners for midi events

    // Flags to avoid redundant start/stop messages to Swift.
    let timeStreamActive = false;
    let hostStateStreamActive = false;
    let midiStreamActive = false;

    // ------------------------------------------------------------
    // PUBLIC API
    // ------------------------------------------------------------
    const API = {};

    // 1. ios_file_saver(file_name, data)
    // Opens a UIDocumentPickerViewController (Swift: iCloudFileManager.saveFileWithDocumentPicker)
    // The Swift side should implement action: 'saveFileWithDocumentPicker' calling:
    //   UIDocumentPickerViewController(forExporting:) to let user choose a location and optionally rename.
    API.ios_file_saver = function ios_file_saver(file_name, data){
        return new Promise((resolve, reject) => {
            if (!bridgeAvailable()) return reject(new Error('swiftBridge not available'));
            const id = nextId();

            // Normalize data to string for transport (Swift expects text / base64 / JSON)
            let serialized;
            if (data instanceof ArrayBuffer) {
                // Convert to base64
                const bytes = new Uint8Array(data);
                let binary = '';
                for (let i=0; i<bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                serialized = btoa(binary);
            } else if (typeof data === 'object') {
                serialized = JSON.stringify(data);
            } else {
                serialized = String(data);
            }

            pendingFileSaves[id] = {resolve, reject};

            // Allow user to change name before sending (optional prompt)
            const userName = prompt('Save as (you can change filename):', file_name) || file_name;

            postToSwift({
                action: 'saveFileWithDocumentPicker', // existing Swift method in iCloudFileManager
                requestId: id,
                fileName: userName,
                // Accept any file type: Swift side just exports the temp file; extension decided there
                data: serialized,
                encoding: (data instanceof ArrayBuffer) ? 'base64' : 'utf8'
            });
        });
    };

    // 2. ios_file_loader()
    // Nouvelle version: n'utilise PLUS le Document Picker natif (pas de fenêtre système AUv3)
    // Reprend la logique du bouton 'import_file_button_library' (showFileImportDialog) pour un input caché.
    // Retourne une Promise avec { fileName, data, encoding, rawFile } (premier fichier) ou rejette.
    API.ios_file_loader = function ios_file_loader(acceptExtensions = ['.atome','.json','.txt','.lrc','.md','.wav','.mp3','.m4a','.flac','.ogg']){
        return new Promise((resolve, reject) => {
            try {
                const lowerExts = acceptExtensions.map(e=>e.toLowerCase());
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = false; // simple loader (peut évoluer)
                input.accept = '*/*'; // permissif, filtrage JS manuel comme showFileImportDialog
                input.style.display = 'none';
                document.body.appendChild(input);

                const cleanup = () => { try { input.parentNode && document.body.removeChild(input); } catch(_){} };

                input.addEventListener('change', () => {
                    try {
                        if (!input.files || !input.files.length){ cleanup(); return reject(new Error('Aucun fichier sélectionné')); }
                        const file = input.files[0];
                        const name = file.name;
                        const lowerName = name.toLowerCase();

                        // Filtrage inspiré showFileImportDialog (ultra permissif)
                        const isAccepted = lowerExts.some(ext => lowerName.endsWith(ext)) ||
                                           file.type.startsWith('text/') ||
                                           file.type === 'application/json' ||
                                           file.type.startsWith('audio/') ||
                                           file.type === '';
                        if (!isAccepted) {
                            cleanup();
                            return reject(new Error('Type de fichier non accepté: '+name));
                        }

                        const reader = new FileReader();
                        reader.onerror = (err)=>{ cleanup(); reject(new Error('Erreur lecture')); };

                        // Choix encodage: texte vs binaire → base64
                        const treatAsText = /\.(atome|json|txt|lrc|md)$/i.test(name) || file.type.startsWith('text') || file.type==='application/json' || file.type==='';

                        reader.onload = () => {
                            try {
                                if (treatAsText) {
                                    resolve({ fileName: name, data: reader.result, encoding: 'utf8', rawFile: file });
                                } else {
                                    // reader.result = ArrayBuffer
                                    const buf = new Uint8Array(reader.result);
                                    let bin=''; for (let i=0;i<buf.length;i++) bin += String.fromCharCode(buf[i]);
                                    const b64 = btoa(bin);
                                    resolve({ fileName: name, data: b64, encoding: 'base64', rawFile: file });
                                }
                            } finally { cleanup(); }
                        };

                        if (treatAsText) reader.readAsText(file); else reader.readAsArrayBuffer(file);
                    } catch(e){ cleanup(); reject(e); }
                });

                input.click();
            } catch(e){ reject(e); }
        });
    };

    // 3. auv3_file_saver(file_name, data)
    // Saves a file in AUv3 sandbox / App Group (Swift FileSystemBridge or iCloudFileManager.saveFile)
    // JS side reuses existing sauvegarderProjetAUv3 if available; else direct message.
    API.auv3_file_saver = function auv3_file_saver(file_name, data){
        return new Promise(async (resolve, reject) => {
            try {
                if (typeof window.sauvegarderProjetAUv3 === 'function') {
                    // Reuse existing higher-level function (it already calls swiftBridge saveFileWithDocumentPicker)
                    await window.sauvegarderProjetAUv3(data, file_name.replace(/\.[^/.]+$/, ''));
                    resolve(true);
                    return;
                }
                if (!bridgeAvailable()) return reject(new Error('swiftBridge not available'));
                const id = nextId();
                pendingFileSaves[id] = {resolve, reject};
                let serialized = (typeof data === 'object') ? JSON.stringify(data) : String(data);
                postToSwift({
                    action: 'saveProjectInternal', // EXPECTED Swift action (to implement if missing)
                    requestId: id,
                    fileName: file_name,
                    data: serialized
                });
            } catch(e){
                reject(e);
            }
        });
    };

    // 4. auv3_file_list(path?)
    // Lists files from folder via App Group / Documents (Swift: FileSystemBridge.listFiles or AtomeFileSystem.listFiles)
    API.auv3_file_list = function auv3_file_list(path = 'Projects'){
        return new Promise((resolve, reject) => {
            // Prefer existing AtomeFileSystem API if available (main app)
            if (window.AtomeFileSystem && window.AtomeFileSystem.listFiles) {
                window.AtomeFileSystem.listFiles(path, (result) => {
                    if (result.success) resolve(result.data.files);
                    else reject(new Error(result.error || 'List failed'));
                });
                return;
            }
            if (!bridgeAvailable()) return reject(new Error('swiftBridge not available'));
            const id = nextId();
            pendingLists[id] = {resolve, reject};
            postToSwift({ action: 'listFiles', requestId: id, path }); // EXPECTED Swift action
        });
    };

    // 5. auv3_file_loader(path?, filename?)
    // Loads a file using internal storage (Swift: FileSystemBridge.loadFile or iCloudFileManager.loadFile)
    API.auv3_file_loader = function auv3_file_loader(path = 'Projects', filename){
        return new Promise((resolve, reject) => {
            if (!filename) return reject(new Error('filename required for auv3_file_loader'));
            if (window.AtomeFileSystem && window.AtomeFileSystem.loadProject && path === 'Projects') {
                // Reuse existing bridging (main app context)
                window.AtomeFileSystem.loadProject(filename, (result) => {
                    if (result.success) resolve(result.data);
                    else reject(new Error(result.error || 'Load failed'));
                });
                return;
            }
            if (!bridgeAvailable()) return reject(new Error('swiftBridge not available'));
            const id = nextId();
            pendingFileLoads[id] = {resolve, reject};
            postToSwift({ action: 'loadFileInternal', requestId: id, path, filename }); // EXPECTED Swift action
        });
    };

    // 6. auv3_tempo()
    // One-shot request for host tempo. Swift should respond with {action:'hostTempo', bpm:Number, requestId}
    // Swift side uses host's AudioUnit hostTempo (e.g., via AUHostMusicalContextBlock).
    API.auv3_tempo = function auv3_tempo(){
        return new Promise((resolve, reject) => {
            if (!bridgeAvailable()) return reject(new Error('swiftBridge not available'));
            const id = nextId();
            tempoCallbacks.push({id, resolve});
            postToSwift({ action: 'requestHostTempo', requestId: id }); // EXPECTED Swift action
        });
    };

    // 7. auv3_current_time(start, format?)
    // start=true  => ask Swift to begin streaming timeline updates
    // start=false => ask Swift to stop streaming
    // format: 'time' (default) or 'samples'. Swift should send periodic messages:
    //   {action:'hostTimeUpdate', positionSeconds, positionSamples, tempo, ppq, playing}
    API.auv3_current_time = function auv3_current_time(start, format='time', callback){
        if (typeof callback === 'function' && timeCallbacks.indexOf(callback) === -1) {
            timeCallbacks.push(callback);
        }
        if (!bridgeAvailable()) return console.warn('swiftBridge not available');
        if (start && !timeStreamActive) {
            timeStreamActive = true;
            postToSwift({ action: 'startHostTimeStream', format }); // EXPECTED Swift action
        } else if (!start && timeStreamActive) {
            timeStreamActive = false;
            postToSwift({ action: 'stopHostTimeStream' }); // EXPECTED Swift action
        }
    };

    // 8. auv3_host_state(start)
    // Toggles reception of host play/stop events. Swift should send messages:
    //   {action:'hostTransport', playing:true/false, positionSeconds}
    API.auv3_host_state = function auv3_host_state(start, callback){
        if (typeof callback === 'function' && hostStateCallbacks.indexOf(callback) === -1) {
            hostStateCallbacks.push(callback);
        }
        if (!bridgeAvailable()) return console.warn('swiftBridge not available');
        if (start && !hostStateStreamActive) {
            hostStateStreamActive = true;
            postToSwift({ action: 'startHostStateStream' }); // EXPECTED Swift action
        } else if (!start && hostStateStreamActive) {
            hostStateStreamActive = false;
            postToSwift({ action: 'stopHostStateStream' }); // EXPECTED Swift action
        }
    };

    // 9. auv3_midi_receive(start)
    // Swift should stream MIDI as either structured or raw packets:
    //   {action:'midiEvent', status, data1, data2, timestamp} OR {action:'midiEventRaw', bytes:[...]}
    API.auv3_midi_receive = function auv3_midi_receive(start, callback){
        if (typeof callback === 'function' && midiCallbacks.indexOf(callback) === -1) {
            midiCallbacks.push(callback);
        }
        if (!bridgeAvailable()) return console.warn('swiftBridge not available');
        if (start && !midiStreamActive) {
            midiStreamActive = true;
            postToSwift({ action: 'startMidiStream' }); // EXPECTED Swift action
        } else if (!start && midiStreamActive) {
            midiStreamActive = false;
            postToSwift({ action: 'stopMidiStream' }); // EXPECTED Swift action
        }
    };

    // 10. auv3_midi_send(midi_data)
    // Sends MIDI data to Swift (which injects into AU MIDI output). midi_data can be:
    //  - Array of bytes [status, data1, data2]
    //  - Object {status, data1, data2}
    API.auv3_midi_send = function auv3_midi_send(midi_data){
        if (!bridgeAvailable()) return console.warn('swiftBridge not available');
        let bytes;
        if (Array.isArray(midi_data)) bytes = midi_data;
        else if (midi_data && typeof midi_data === 'object') bytes = [midi_data.status, midi_data.data1, midi_data.data2];
        else return console.warn('Invalid midi_data');
        postToSwift({ action: 'sendMidi', bytes }); // EXPECTED Swift action
    };

    // ------------------------------------------------------------
    // Incoming messages entry point (Swift -> JS)
    // Swift should call: window.AUv3API._receiveFromSwift(jsonPayload)
    // ------------------------------------------------------------
    API._receiveFromSwift = function _receiveFromSwift(msg){
        try {
            if (typeof msg === 'string') msg = JSON.parse(msg);
        } catch(e){ console.warn('Invalid JSON from Swift', msg); return; }
        if (!msg || typeof msg !== 'object') return;

        switch(msg.action){
            case 'saveFileWithDocumentPickerResult': {
                const cb = pendingFileSaves[msg.requestId];
                if (cb){
                    delete pendingFileSaves[msg.requestId];
                    if (msg.success) cb.resolve({ success:true, fileName: msg.fileName, path: msg.path||null });
                    else cb.reject(new Error(msg.error||'Save failed'));
                }
                break;
            }
            case 'saveProjectInternalResult': { // nouveau type attendu pour auv3_file_saver
                const cb = pendingFileSaves[msg.requestId];
                if (cb){
                    delete pendingFileSaves[msg.requestId];
                    if (msg.success) cb.resolve({ success:true, fileName: msg.fileName, path: msg.path||null });
                    else cb.reject(new Error(msg.error||'Save failed'));
                }
                break;
            }
            case 'loadFileWithDocumentPickerResult': {
                const cb = pendingFileLoads[msg.requestId];
                if (cb){
                    delete pendingFileLoads[msg.requestId];
                    if (msg.success){
                        cb.resolve({ fileName: msg.fileName, data: msg.data, encoding: msg.encoding||'utf8' });
                    } else cb.reject(new Error(msg.error||'Load failed'));
                }
                break;
            }
            case 'listFilesResult': {
                const cb = pendingLists[msg.requestId];
                if (cb){
                    delete pendingLists[msg.requestId];
                    msg.success ? cb.resolve(msg.files||[]) : cb.reject(new Error(msg.error||'List failed'));
                }
                break;
            }
            case 'hostTempo': {
                // Resolve all pending tempo promises matching requestId
                for (let i=tempoCallbacks.length-1;i>=0;i--){
                    if (tempoCallbacks[i].id === msg.requestId){
                        tempoCallbacks[i].resolve(msg.bpm);
                        tempoCallbacks.splice(i,1);
                    }
                }
                break;
            }
            case 'hostTimeUpdate': {
                // Broadcast to registered callbacks
                timeCallbacks.forEach(fn => { try { fn(msg); } catch(_){} });
                break;
            }
            case 'hostTransport': {
                hostStateCallbacks.forEach(fn => { try { fn(msg); } catch(_){} });
                break;
            }
            case 'midiEvent': {
                midiCallbacks.forEach(fn => { try { fn({ type:'parsed', status:msg.status, data1:msg.data1, data2:msg.data2, timestamp:msg.timestamp }); } catch(_){} });
                break;
            }
            case 'midiEventRaw': {
                midiCallbacks.forEach(fn => { try { fn({ type:'raw', bytes:msg.bytes, timestamp:msg.timestamp }); } catch(_){} });
                break;
            }
            default:
                console.log('[AUv3API] Unhandled message from Swift:', msg);
        }
    };

    // Expose globally
    global.AUv3API = API;

})(window);

// NOTE: Removed accidental duplicate file at examples/examples/ios_apis.js. Keep only examples/ios_apis.js as canonical.
// ------------------------------------------------------------
// Usage Examples (see separate examples/examples/ios_apis.js if retained)
// ------------------------------------------------------------
// See separate examples file for live usage patterns.

// === Interactive Test Panel (auto-injected) ===
(function(){
  if (!window.AUv3API) { console.warn('AUv3API not ready for test panel'); return; }
  if (document.getElementById('auv3api-test-panel')) return; // avoid duplicates

  const css = `#auv3api-test-panel{position:fixed;z-index:99999;top:8px;right:8px;width:320px;font:12px/1.3 sans-serif;background:#111;color:#eee;border:1px solid #444;border-radius:6px;box-shadow:0 2px 8px #0009;display:flex;flex-direction:column;max-height:90vh;}
#auv3api-test-panel header{display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:#222;border-bottom:1px solid #333;font-weight:600;font-size:13px;}
#auv3api-test-panel button{cursor:pointer;background:#2d2f34;color:#eee;border:1px solid #444;border-radius:4px;padding:4px 6px;margin:2px;font-size:11px;min-width:64px;}
#auv3api-test-panel button:hover{background:#3a3d44}
#auv3api-test-panel button:active{background:#555}
#auv3api-test-panel .grid{display:flex;flex-wrap:wrap;padding:4px;align-content:flex-start;}
#auv3api-test-panel .log{flex:1;overflow:auto;background:#0a0a0a;border-top:1px solid #222;padding:4px;font-family:monospace;white-space:pre-wrap;}
#auv3api-test-panel .row{display:flex;gap:4px;width:100%;flex-wrap:wrap;margin-bottom:2px;}
#auv3api-test-panel .tag{background:#444;border-radius:3px;padding:2px 4px;margin-right:4px;font-size:10px;}
#auv3api-test-panel footer{padding:2px 6px;background:#191919;border-top:1px solid #222;display:flex;justify-content:space-between;align-items:center;}
#auv3api-test-panel .on{background:#145214 !important}
#auv3api-test-panel .warn{color:#f6c35b}
#auv3api-test-panel .error{color:#ff6d6d}
`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const panel = document.createElement('div'); panel.id='auv3api-test-panel';
  panel.innerHTML = `<header><span>AUv3API Test</span><div><button id="auv3api-close" title="Close">✕</button></div></header>
    <div class="grid" id="auv3api-btns"></div>
    <div class="log" id="auv3api-log"></div>
    <footer><span id="auv3api-status">Idle</span><button id="auv3api-clear">Clear</button></footer>`;
  document.body.appendChild(panel);

  const logEl = panel.querySelector('#auv3api-log');
  const statusEl = panel.querySelector('#auv3api-status');
  function log(msg, cls){ const line=document.createElement('div'); if(cls) line.className=cls; line.textContent = (new Date().toLocaleTimeString())+" "+msg; logEl.appendChild(line); logEl.scrollTop = logEl.scrollHeight; }
  function setStatus(s){ statusEl.textContent=s; }

  panel.querySelector('#auv3api-close').onclick = ()=> panel.remove();
  panel.querySelector('#auv3api-clear').onclick = ()=> { logEl.textContent=''; };

  const btns = panel.querySelector('#auv3api-btns');
  function addBtn(label, handler, opts={}){ const b=document.createElement('button'); b.textContent=label; if(opts.title) b.title=opts.title; b.onclick=async ()=>{ try { setStatus(label+'...'); const r = await handler(b); if(r!==undefined) log(label+': '+JSON.stringify(r)); setStatus('Idle'); } catch(e){ log(label+' ERROR: '+e.message,'error'); setStatus('Error'); } }; btns.appendChild(b); return b; }

  // Ajout champ nom fichier pour AUv3 Save
  const fileNameWrap = document.createElement('div');
  fileNameWrap.style.cssText='width:100%;display:flex;gap:4px;align-items:center;margin:2px 0 4px;';
  fileNameWrap.innerHTML = '<label style="font-size:11px;flex:0 0 auto;color:#bbb">AUv3 Nom:</label>'+
    '<input id="auv3api-auv3-filename" type="text" value="PanelProj.atome" style="flex:1 1 auto;background:#171717;border:1px solid #333;color:#eee;padding:3px 4px;border-radius:4px;font-size:11px;" placeholder="NomFichier.ext" />';
  btns.parentNode.insertBefore(fileNameWrap, btns.nextSibling);

  // Buttons definitions
  addBtn('iOS Save', async()=>{ 
    const inp = document.getElementById('auv3api-auv3-filename');
    let fileName = (inp && inp.value.trim()) || 'demo_file.json';
    if(!/\.[a-z0-9]+$/i.test(fileName)) fileName += '.json';
    const data={time:Date.now(),demo:true, ios:true}; 
    await AUv3API.ios_file_saver(fileName, data); 
    log('iOS Save ok => '+fileName); 
  });
  addBtn('iOS Load', async()=>{ const r= await AUv3API.ios_file_loader(['public.data']); log('Loaded '+r.fileName+' len='+(r.data||'').length); return r.fileName; });
  addBtn('AUv3 Save', async()=>{ 
    const inp = document.getElementById('auv3api-auv3-filename');
    let fileName = (inp && inp.value.trim()) || 'PanelProj.atome';
    if(!fileName.includes('.')) fileName += '.atome';
    const p={name:fileName.replace(/\.[^.]+$/,''),stamp:Date.now(),v:1}; 
    const res = await AUv3API.auv3_file_saver(fileName, p); 
    if(res && res.path) log('AUv3 Save ok => '+fileName+'\nPath: '+res.path); else log('AUv3 Save ok => '+fileName+' (path inconnu)');
  });
  addBtn('List Projects', async()=>{ const files = await AUv3API.auv3_file_list('Projects'); log('DEBUG list raw => '+JSON.stringify(files)); return files; });
  addBtn('Load Proj', async()=>{ const name=prompt('Project name (without .atome)','PanelProj'); if(!name) return; const d= await AUv3API.auv3_file_loader('Projects', name); log('Project keys: '+Object.keys(d)); });
  addBtn('Tempo', async()=>{ const bpm = await AUv3API.auv3_tempo(); log('Tempo='+bpm); return bpm; });

  // Streaming buttons (toggle)
  const timeBtn = addBtn('Time ▶︎', async(btn)=>{
    if(!btn.classList.contains('on')){ AUv3API.auv3_current_time(true,'time',(info)=>{ log('Time '+info.positionSeconds.toFixed(1)+'s'); }); btn.classList.add('on'); btn.textContent='Time ■'; }
    else { AUv3API.auv3_current_time(false); btn.classList.remove('on'); btn.textContent='Time ▶︎'; }
  });
  const hostBtn = addBtn('Transport ▶︎', async(btn)=>{
    if(!btn.classList.contains('on')){ AUv3API.auv3_host_state(true,(s)=>{ log('Transport '+(s.playing?'▶':'⏸')+' '+Number(s.positionSeconds).toFixed(1)); }); btn.classList.add('on'); btn.textContent='Transport ■'; }
    else { AUv3API.auv3_host_state(false); btn.classList.remove('on'); btn.textContent='Transport ▶︎'; }
  });
  const midiInBtn = addBtn('MIDI In ▶︎', async(btn)=>{
    if(!btn.classList.contains('on')){ AUv3API.auv3_midi_receive(true,(m)=>{ if(m.type==='parsed') log('MIDI '+m.status.toString(16)+' '+m.data1+','+m.data2); else log('MIDI RAW '+(m.bytes||[])); }); btn.classList.add('on'); btn.textContent='MIDI In ■'; }
    else { AUv3API.auv3_midi_receive(false); btn.classList.remove('on'); btn.textContent='MIDI In ▶︎'; }
  });
  addBtn('MIDI Test', async()=>{ AUv3API.auv3_midi_send([0x90,60,100]); setTimeout(()=> AUv3API.auv3_midi_send([0x80,60,0]),300); log('Sent test note C4'); });

  // Auto shrink log if too large
  setInterval(()=>{ if(logEl.childNodes.length>400){ while(logEl.childNodes.length>300) logEl.removeChild(logEl.firstChild); log('log truncated'); } }, 5000);

  log('Test panel ready');
})();
// === End Test Panel ===
