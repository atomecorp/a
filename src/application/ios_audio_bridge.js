// Ultra simplifié: uniquement des boutons (aucun texte hors boutons)
// Boutons: Route (Local/Auto/Host), C4, A4, E5, Chord, Stop

// Etat de routage
const ROUTE = ['Local','Auto','Host'];
let routeIdx = 1; // Auto par défaut
window.forceAUv3Mode = undefined; // AUTO
window.forceHostRouting = false;

function applyRoute(){
    const mode = ROUTE[routeIdx];
    if(mode==='Local'){ window.forceHostRouting=false; window.forceAUv3Mode=false; }
    else if(mode==='Auto'){ window.forceHostRouting=false; window.forceAUv3Mode=undefined; }
    else { window.forceHostRouting=true; window.forceAUv3Mode=true; }
    const b=grab('routeBtn'); if(b){ b.textContent=mode; b.style.background= mode==='Local'? '#2d6cdf': (mode==='Auto'? '#6a5acd':'#27986a'); }
}

// Helpers
function hostAvailable(){ return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge); }
function sendHost(obj){ try{ window.webkit.messageHandlers.swiftBridge.postMessage(obj); }catch(e){} }
let AC=null; function ensureAC(){ if(!AC){ AC=new (window.AudioContext||window.webkitAudioContext)(); } if(AC.state==='suspended') AC.resume().catch(()=>{}); return AC; }
// Suivi des oscillateurs locaux par note/accord
let localNotes = new Map(); // key: note label => Array<{osc:OscillatorNode,gain:GainNode}>
const FADE_TIME = 0.2; // seconds
const HOST_SUSTAIN_SEC = 3600; // sustain long côté host
// Streaming continu binaire: envoie des chunks 200ms (ArrayBuffer) pendant que des notes Host ou un sample sont actifs
const STREAM_SR = 44100;
const STREAM_CHUNK_SEC = 0.2; // 200ms recommandés (doc)
const hostActive = new Set(); // labels actifs côté host
const hostFreq = new Map(); // label -> freq
const hostPhase = new Map(); // label -> phase
let streamTimer = null;
// Optional sample playback mixed into host stream
let samplePlaybackHost = null; // { pcm: Float32Array, pos: number }
// Send JSON audio buffer to host (Swift expects a frequency field)
function sendHostJSONChunk(f32, sr=STREAM_SR){
    try{
        window.webkit.messageHandlers.swiftBridge.postMessage({
            type:'audioBuffer',
            data:{ frequency: 0.0, sampleRate: sr, duration: f32.length / sr, audioData: Array.from(f32) }
        });
    }catch(_){ }
}
function genBinChunk(){
 const hasNotes = hostActive.size>0; const hasSample = !!(samplePlaybackHost && samplePlaybackHost.pcm);
 if(!hasNotes && !hasSample) return null;
 const n=Math.max(1,Math.floor(STREAM_SR*STREAM_CHUNK_SEC)); const buf=new Float32Array(n);
 const labels=[...hostActive]; const ampBase = hasNotes? (0.35/Math.max(labels.length,1)) : 0;
 for(let i=0;i<n;i++){
  let s=0; const t=i/STREAM_SR;
  // mix notes
  for(const l of labels){ const f=hostFreq.get(l)||0; if(f<=0) continue; const p0=hostPhase.get(l)||0; const w=2*Math.PI*f; s += Math.sin(p0 + w*t); }
  let mix = s*ampBase;
  // mix sample if any
  if(hasSample){ const sp = samplePlaybackHost; if(sp.pos < sp.pcm.length){ mix += sp.pcm[sp.pos++] * 0.8; } }
  buf[i] = mix;
 }
 // advance phases
 for(const l of labels){ const f=hostFreq.get(l)||0; const p0=hostPhase.get(l)||0; const adv = 2*Math.PI*f*(n/STREAM_SR); let ph = p0+adv; ph = ((ph + Math.PI) % (2*Math.PI)) - Math.PI; hostPhase.set(l, ph); }
 // sample end check
 if(hasSample && samplePlaybackHost.pos >= samplePlaybackHost.pcm.length){ samplePlaybackHost = null; }
 return buf.buffer; }
function sendHostBin(ab){ try{ window.webkit.messageHandlers.swiftBridge.postMessage({ type:'audioBuffer_bin', data: ab }); }catch(e){} }
function ensureStreaming(){
 if(streamTimer) return;
 if(hostActive.size===0 && !samplePlaybackHost) return;
 const ms = Math.floor(STREAM_CHUNK_SEC*1000);
 streamTimer = setInterval(()=>{
    if(hostActive.size===0 && !samplePlaybackHost){ clearInterval(streamTimer); streamTimer=null; return; }
    const ab = genBinChunk(); if(!ab) return;
    // If a sample is active, prefer JSON chunks to match Swift 'audioBuffer' schema
    if(samplePlaybackHost){
        try { const f32 = new Float32Array(ab); sendHostJSONChunk(f32, STREAM_SR); } catch(_){ }
    } else {
        sendHostBin(ab);
    }
 }, ms);
}
function maybeStopStreaming(){ if(hostActive.size===0 && !samplePlaybackHost && streamTimer){ clearInterval(streamTimer); streamTimer=null; } }

function playLocalSustain(note,freq){ const ctx=ensureAC(); const osc=ctx.createOscillator(); const g=ctx.createGain(); osc.type='sine'; osc.frequency.value=freq; osc.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.3,ctx.currentTime+0.01); // sustain
    osc.start(); const arr=localNotes.get(note)||[]; arr.push({osc,gain:g}); localNotes.set(note,arr); }
function stopLocalNote(note){ const ctx=ensureAC(); const arr=localNotes.get(note); if(arr&&arr.length){ arr.forEach(({osc,gain})=>{ try{ const t=ctx.currentTime; gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value,t); gain.gain.exponentialRampToValueAtTime(0.0008, t+FADE_TIME); osc.stop(t+FADE_TIME+0.02);}catch(_){}}); localNotes.delete(note); } }
function genBuf(freq,lenSec=0.2,sr=44100){ const n=Math.floor(sr*lenSec); const a=new Float32Array(n); for(let i=0;i<n;i++){ a[i]=Math.sin(2*Math.PI*freq*i/sr)*0.5; } return {frequency:freq,sampleRate:sr,duration:lenSec,audioData:Array.from(a),channels:1}; }

function routePlay(note,freq){ const forceHost= window.forceHostRouting|| window.forceAUv3Mode===true; const forceLocal = window.forceAUv3Mode===false; if(forceHost){ // Primer + activer streaming
 sendHost({type:'audioBuffer',data:genBuf(freq,0.5,44100)});
 hostActive.add(note); hostFreq.set(note,freq); if(!hostPhase.has(note)) hostPhase.set(note,0);
 ensureStreaming();
 sendHost({type:'audioNote',data:{command:'playNote',note,frequency:freq,duration:HOST_SUSTAIN_SEC,amplitude:0.5,sustain:true,gate:1}}); return; } if(forceLocal){ if(!localNotes.has(note)) playLocalSustain(note,freq); return; } // AUTO
 if(hostAvailable()){ sendHost({type:'audioBuffer',data:genBuf(freq,0.5,44100)}); hostActive.add(note); hostFreq.set(note,freq); if(!hostPhase.has(note)) hostPhase.set(note,0); ensureStreaming(); sendHost({type:'audioNote',data:{command:'playNote',note,frequency:freq,duration:HOST_SUSTAIN_SEC,amplitude:0.5,sustain:true,gate:1}}); } else { if(!localNotes.has(note)) playLocalSustain(note,freq); } }
function routeStop(note){ stopLocalNote(note); sendHost({type:'audioNote',data:{command:'stopNote',note}}); hostActive.delete(note); hostFreq.delete(note); hostPhase.delete(note); maybeStopStreaming(); }
let hostChordActive = [];
function routeChord(freqs){ const key='CHORD'; const forceHost= window.forceHostRouting|| window.forceAUv3Mode===true; const forceLocal = window.forceAUv3Mode===false; if(forceHost){ hostChordActive = freqs.slice(); freqs.forEach((f,i)=>{ const label=`CH_${i}`; sendHost({type:'audioBuffer',data:genBuf(f,0.5,44100)}); hostActive.add(label); hostFreq.set(label,f); if(!hostPhase.has(label)) hostPhase.set(label,0); sendHost({type:'audioNote',data:{command:'playNote',note:label,frequency:f,duration:HOST_SUSTAIN_SEC,amplitude:0.3,sustain:true,gate:1}}); }); ensureStreaming(); return;} if(forceLocal){ if(!localNotes.has(key)){ freqs.forEach(f=>playLocalSustain(key,f)); } return;} if(hostAvailable()){ hostChordActive = freqs.slice(); freqs.forEach((f,i)=>{ const label=`CH_${i}`; sendHost({type:'audioBuffer',data:genBuf(f,0.5,44100)}); hostActive.add(label); hostFreq.set(label,f); if(!hostPhase.has(label)) hostPhase.set(label,0); sendHost({type:'audioNote',data:{command:'playNote',note:label,frequency:f,duration:HOST_SUSTAIN_SEC,amplitude:0.3,sustain:true,gate:1}}); }); ensureStreaming(); } else { if(!localNotes.has(key)){ freqs.forEach(f=>playLocalSustain(key,f)); } } }
function stopChord(){ stopLocalNote('CHORD'); hostChordActive.forEach((f,i)=>{ const label=`CH_${i}`; sendHost({type:'audioNote',data:{command:'stopNote',note:label,gate:0}}); hostActive.delete(label); hostFreq.delete(label); hostPhase.delete(label); }); hostChordActive=[]; maybeStopStreaming(); }
function stopAll(){ // stop locaux
    Array.from(localNotes.keys()).forEach(k=>stopLocalNote(k));
    // stop host
    sendHost({type:'audioNote',data:{command:'stopAll'}});
    sendHost({type:'audioChord',data:{command:'stopChord'}});
    // stop sample (local + host)
    stopSample();
    hostActive.clear(); hostFreq.clear(); hostPhase.clear(); maybeStopStreaming();
}

// API minimale exposée (compat)
window.audioSwiftBridge = {
    playNote:(note,freq,dur)=>routePlay(note,freq,dur),
    stopNote:(note)=>routeStop(note),
        playChord:(freqs)=>routeChord(freqs),
        stopChord:()=>stopChord(),
    stopAll:()=>stopAll()
};

// Bouton route (cycle)
Button({ id:'routeBtn', onText:'', offText:'', onAction:()=>{ routeIdx=(routeIdx+1)%ROUTE.length; applyRoute(); }, offAction:()=>{ routeIdx=(routeIdx+1)%ROUTE.length; applyRoute(); }, parent:'body', css:{position:'absolute',left:'14px',top:'14px',width:'90px',height:'34px',background:'#6a5acd',color:'#fff',border:'none',borderRadius:'6px',fontFamily:'Arial, sans-serif',fontSize:'13px',cursor:'pointer'} });
applyRoute();

// Notes (toggle)
const c4 = Button({ onText:'C4 ●', offText:'C4', parent:'body', onAction:()=>routePlay('C4',261.63), offAction:()=>routeStop('C4'), onStyle:{background:'#ff6b35',color:'#fff'}, offStyle:{background:'#3b9157',color:'#fff'}, css:{position:'absolute',left:'120px',top:'14px',width:'70px',height:'34px',border:'none',borderRadius:'5px',fontFamily:'Arial, sans-serif',fontSize:'13px',cursor:'pointer'} });
const a4 = Button({ onText:'A4 ●', offText:'A4', parent:'body', onAction:()=>routePlay('A4',440), offAction:()=>routeStop('A4'), onStyle:{background:'#ff6b35',color:'#fff'}, offStyle:{background:'#5a4fb3',color:'#fff'}, css:{position:'absolute',left:'195px',top:'14px',width:'70px',height:'34px',border:'none',borderRadius:'5px',fontFamily:'Arial, sans-serif',fontSize:'13px',cursor:'pointer'} });
const e5 = Button({ onText:'E5 ●', offText:'E5', parent:'body', onAction:()=>routePlay('E5',659.25), offAction:()=>routeStop('E5'), onStyle:{background:'#ff6b35',color:'#fff'}, offStyle:{background:'#914d91',color:'#fff'}, css:{position:'absolute',left:'270px',top:'14px',width:'70px',height:'34px',border:'none',borderRadius:'5px',fontFamily:'Arial, sans-serif',fontSize:'13px',cursor:'pointer'} });

// Accord (toggle)
const chord = Button({ onText:'Chord ●', offText:'Chord', parent:'body', onAction:()=>routeChord([261.63,329.63,392.00]), offAction:()=>stopChord(), onStyle:{background:'#ff6b35',color:'#fff'}, offStyle:{background:'#2d6cdf',color:'#fff'}, css:{position:'absolute',left:'345px',top:'14px',width:'80px',height:'34px',border:'none',borderRadius:'5px',fontFamily:'Arial, sans-serif',fontSize:'13px',cursor:'pointer'} });

// Stop (simple)
$('button',{ id:'stopAllBtn', parent:document.body, text:'Stop', css:{position:'absolute',left:'430px',top:'14px',width:'70px',height:'34px',background:'#cc3333',color:'#fff',border:'none',borderRadius:'5px',fontFamily:'Arial, sans-serif',fontSize:'13px',cursor:'pointer'} , onClick:()=>{ stopAll(); c4.setState(false); a4.setState(false); e5.setState(false); chord.setState(false); }});

console.log('ios_audio_bridge simplifié chargé');

// === AUv3 File: Upload .m4a, List, and Play ===
// UI: upload + refresh buttons, and a scrollable list
const uploadBtn = Button({
    id:'uploadM4ABtn', onText:'Upload m4a', offText:'Upload m4a', parent:'body',
    onAction:()=>importM4A(), offAction:()=>importM4A(),
    css:{position:'absolute',left:'510px',top:'14px',width:'100px',height:'34px',background:'#2d6cdf',color:'#fff',border:'none',borderRadius:'5px',fontFamily:'Arial, sans-serif',fontSize:'12px',cursor:'pointer'}
});
const refreshBtn = Button({
    id:'refreshListBtn', onText:'Refresh', offText:'Refresh', parent:'body',
    onAction:()=>listRecordings(), offAction:()=>listRecordings(),
    css:{position:'absolute',left:'615px',top:'14px',width:'80px',height:'34px',background:'#3b9157',color:'#fff',border:'none',borderRadius:'5px',fontFamily:'Arial, sans-serif',fontSize:'12px',cursor:'pointer'}
});
const listWrap = $('div', { id:'auv3List', parent:document.body, css:{ position:'absolute', left:'14px', right:'14px', top:'60px', bottom:'14px', overflowY:'auto', backgroundColor:'#0f1215', border:'1px solid #2c343d', borderRadius:'6px', padding:'6px', color:'#e6e6e6', fontFamily:'monospace', fontSize:'12px' }, text:'Recordings (.m4a):' });

function importM4A(){ try{ if(!window.AtomeFileSystem){ console.warn('AtomeFileSystem indisponible'); return; }
    // Importer via Document Picker dans Recordings/
    window.AtomeFileSystem.copy_to_ios_local('Recordings', ['m4a'], (res)=>{ if(res && res.success){ listRecordings(); } else { console.warn('Import échoué', res && res.error); } });
 }catch(e){ console.warn('importM4A error', e); } }

function listRecordings(){
    try{
        if(!window.AtomeFileSystem){ listWrap.textContent = 'API fichier indisponible'; return; }
        window.AtomeFileSystem.listFiles('Recordings', (res)=>{
            if(!res || !res.success){ listWrap.textContent = 'Erreur de liste'; return; }
            const files = (res.data && res.data.files) ? res.data.files : [];
            const items = files.filter(f=>!f.isDirectory && /\.m4a$/i.test(f.name));
            // Clear list
            listWrap.innerHTML = '';
            $('div',{ parent:'#auv3List', css:{marginBottom:'6px',color:'#9db2cc'}, text: items.length? 'Recordings (.m4a):' : 'Aucun fichier .m4a dans Recordings/'});
            items.forEach((it, idx)=>{
                Button({
                    onText: it.name, offText: it.name, parent:'#auv3List',
                    onAction: ()=> playSample('Recordings/'+it.name), offAction: ()=> playSample('Recordings/'+it.name),
                    css:{ display:'block', width:'100%', textAlign:'left', marginBottom:'6px', padding:'6px 8px', background:'#1a1f25', color:'#e6e6e6', border:'1px solid #2c343d', borderRadius:'4px', cursor:'pointer', fontFamily:'monospace', fontSize:'12px' },
                    onStyle:{ background:'#25303a' }, offStyle:{ background:'#1a1f25' }
                });
            });
        });
    }catch(e){ listWrap.textContent = 'Erreur'; console.warn('listRecordings error', e); }
}

// Local audio element for Local route playback
const sampleAudioEl = $('audio', { id:'samplePlayer', parent:document.body, css:{ position:'absolute', left:'-9999px', width:'1px', height:'1px' }, controls:false, preload:'auto' });

function stopSample(){
    try{
        // Local
        const el = document.getElementById('samplePlayer'); if(el){ try{ el.pause(); el.currentTime = 0; }catch(_){}}
        // Host stream
        samplePlaybackHost = null; maybeStopStreaming();
    }catch(_){ }
}

function playSample(relPath){
    stopSample();
    const mode = ROUTE[routeIdx];
    const forceHost = (window.forceHostRouting|| window.forceAUv3Mode===true) || (mode!=='Local' && hostAvailable());
    if(forceHost && hostAvailable()){
        playSampleHost(relPath);
    } else {
        playSampleLocal(relPath);
    }
}

function playSampleLocal(relPath){
    try{
        const id='samplePlayer';
        // Try local HTTP server for range support, else fallback to custom scheme
        const used = (typeof window.__atomePreferHTTP==='function') ? window.__atomePreferHTTP(id, relPath) : false;
        if(!used){ const el = document.getElementById(id); if(el){ el.src = 'atome:///audio/'+encodeURI(relPath); } }
        const el = document.getElementById(id); if(el){ el.play().catch(()=>{}); }
    }catch(e){ console.warn('playSampleLocal error', e); }
}

async function playSampleHost(relPath){
    try{
        // Fetch via local HTTP server
        const port = window.__ATOME_LOCAL_HTTP_PORT__;
        if(!port){ console.warn('HTTP server not ready, fallback local playback'); playSampleLocal(relPath); return; }
        const url = 'http://127.0.0.1:'+port+'/audio/'+encodeURI(relPath);
        const resp = await fetch(url);
        if(!resp.ok){ console.warn('HTTP fetch failed', resp.status); playSampleLocal(relPath); return; }
        const ab = await resp.arrayBuffer();
        // Decode using a temporary AudioContext
        const ctx = ensureAC();
        const decoded = await ctx.decodeAudioData(ab.slice(0));
        // Resample to 44.1k mono using OfflineAudioContext
        const length = Math.ceil(decoded.duration * STREAM_SR);
        const off = new OfflineAudioContext(1, length, STREAM_SR);
        const src = off.createBufferSource();
        src.buffer = decoded; src.connect(off.destination); src.start();
        const rendered = await off.startRendering();
        const mono = rendered.numberOfChannels>0 ? rendered.getChannelData(0) : new Float32Array(rendered.length);
        const copy = new Float32Array(mono.length); copy.set(mono);
    // Send a JSON primer (~0.5s) to match host expectations
    const primer = Math.min(copy.length, Math.floor(STREAM_SR * 0.5));
    if(primer > 0){ sendHostJSONChunk(copy.subarray(0, primer), STREAM_SR); }
    samplePlaybackHost = { pcm: copy, pos: primer };
        ensureStreaming();
    } catch(e){ console.warn('playSampleHost error, fallback local', e); playSampleLocal(relPath); }
}

// Initial populate
setTimeout(listRecordings, 300);
