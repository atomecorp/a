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
const IN_AUV3 = !!(window && window.__HOST_ENV); // In AUv3 extension UI, WebView audio isn't audible; route to host instead
function hostAvailable(){ return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge); }
function sendHost(obj){ try{ window.webkit.messageHandlers.swiftBridge.postMessage(obj); }catch(e){} }
let AC=null; let __toneCtxSet=false; function ensureAC(){ if(!AC){ AC=new (window.AudioContext||window.webkitAudioContext)(); try{ if(window.Tone && typeof window.Tone.setContext==='function'){ window.Tone.setContext(AC); __toneCtxSet=true; } }catch(_){} } if(AC.state==='suspended') AC.resume().catch(()=>{}); return AC; }
// Suivi des oscillateurs locaux par note/accord
let localNotes = new Map(); // key: note label => Array<{osc:OscillatorNode,gain:GainNode}>
const FADE_TIME = 0.2; // seconds
const HOST_SUSTAIN_SEC = 3600; // sustain long côté host
// Streaming continu binaire: envoie des chunks 200ms (ArrayBuffer) pendant que des notes Host ou un sample sont actifs
const STREAM_SR = 44100;
const STREAM_CHUNK_SEC = 0.2; // 200ms recommandés (doc)
const STREAM_CHUNK_BG_MAX_SEC = 1.2; // when page hidden, allow up to ~1.2s per send to survive timer throttling
const hostActive = new Set(); // labels actifs côté host
const hostFreq = new Map(); // label -> freq
const hostPhase = new Map(); // label -> phase
let streamTimer = null;
let streamLastTs = 0;
let PAGE_HIDDEN = false;
// Optional sample playback mixed into host stream (pre-decoded fallback)
let samplePlaybackHost = null; // { pcm: Float32Array, pos: number }
// Direct-from-disk host streaming via Web Audio tap
let sampleTapActive = false;
let sampleTapQueue = []; // Array<Float32Array>
let sampleTapSR = STREAM_SR;
let sampleTapEnded = false;
let sampleTapNodes = null; // { processor }
let sampleTapSource = null; // persistent MediaElementSource for the <audio>
let sampleTapSink = null;   // persistent zero-gain sink to keep graph running on some iOS builds
let __bgBridgeTimers = [];  // scheduled timers to reinforce prebuffer while hidden

// AudioWorklet-based media tap (lower latency/CPU) — loaded via Blob URL to avoid path issues
const MEDIA_TAP_WORKLET_SOURCE = `class MediaTapProcessor extends AudioWorkletProcessor {\n  constructor(options) {\n    super();\n    const sec = options?.processorOptions?.chunkDurationSec ?? 0.12;\n    this.setChunkSamples(sec);\n    this.buf = new Float32Array(this.chunkSamples);\n    this.write = 0;\n    this.port.onmessage = (e) => {\n      const msg = e.data || {};\n      if (msg.cmd === 'setChunkSec') {\n        this.setChunkSamples(msg.sec);\n        this.buf = new Float32Array(this.chunkSamples);\n        this.write = 0;\n      }\n    };\n  }\n  setChunkSamples(sec) {\n    const clamped = Math.min(0.5, Math.max(0.02, Number(sec) || 0.12));\n    this.chunkSamples = Math.max(128, Math.round(clamped * sampleRate));\n  }\n  process(inputs, outputs) {\n    const input = inputs[0];\n    const out = outputs && outputs[0] ? outputs[0][0] : null;\n    if (!input || input.length === 0) { if(out){ out.fill(0); } return true; }\n    const L = input[0] || new Float32Array(128);\n    const R = input[1] || L;\n    const n = L.length;\n    for (let i = 0; i < n; i++) {\n      const mono = (L[i] + R[i]) * 0.5;\n      if (this.write >= this.chunkSamples) {\n        this.port.postMessage({ sr: sampleRate, pcm: this.buf }, [this.buf.buffer]);\n        this.buf = new Float32Array(this.chunkSamples);\n        this.write = 0;\n      }\n      this.buf[this.write++] = mono;\n      if(out){ out[i] = 0.0; }\n    }\n    return true;\n  }\n}\nregisterProcessor('media-tap-processor', MediaTapProcessor);`;
let __tapWorkletURL=null; function getTapWorkletURL(){ if(__tapWorkletURL) return __tapWorkletURL; try{ const blob=new Blob([MEDIA_TAP_WORKLET_SOURCE],{type:'application/javascript'}); __tapWorkletURL=URL.createObjectURL(blob); }catch(_){ __tapWorkletURL=null; } return __tapWorkletURL; }
let tapWorkletReady=null; async function ensureTapWorkletLoaded(ctx){ if(!ctx || !ctx.audioWorklet) throw new Error('no-audioWorklet'); if(!tapWorkletReady){ const url=getTapWorkletURL(); if(!url) throw new Error('worklet-url'); tapWorkletReady = ctx.audioWorklet.addModule(url).catch(e=>{ tapWorkletReady=null; throw e; }); } return tapWorkletReady; }
async function createTapWorkletNode(ctx, chunkSec){ await ensureTapWorkletLoaded(ctx); const node = new AudioWorkletNode(ctx, 'media-tap-processor', { numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[1], channelCount:2, processorOptions:{ chunkDurationSec: chunkSec } }); return node; }

// Page visibility handling for AUv3 UI close/minimize cases (timers may throttle)
function onVisibilityChange(){
    PAGE_HIDDEN = (document.visibilityState === 'hidden');
    try{
        // If worklet is active, ask it to increase chunk size a bit when hidden
        if(PAGE_HIDDEN && sampleTapNodes && sampleTapNodes.processor && sampleTapNodes.processor.port){
            sampleTapNodes.processor.port.postMessage({ cmd:'setChunkSec', sec: 0.24 });
        } else if(sampleTapNodes && sampleTapNodes.processor && sampleTapNodes.processor.port) {
            sampleTapNodes.processor.port.postMessage({ cmd:'setChunkSec', sec: 0.12 });
        }
        // Reset drain timing
        try{ streamLastTs = performance.now(); }catch(_){ }
        if(PAGE_HIDDEN){ prebufferOnHide(); }
        // Arm 2 short follow-up prebuffers to cover deeper throttling
        clearBackgroundBridgeTimers();
        if(PAGE_HIDDEN){
            __bgBridgeTimers.push(setTimeout(()=>{ try{ if(PAGE_HIDDEN) prebufferOnHide(); }catch(_){ } }, 550));
            __bgBridgeTimers.push(setTimeout(()=>{ try{ if(PAGE_HIDDEN) prebufferOnHide(); }catch(_){ } }, 1100));
        } else {
            clearBackgroundBridgeTimers();
        }
    }catch(_){ }
}
try{ document.addEventListener('visibilitychange', onVisibilityChange, false); }catch(_){ }

// On UI close/minimize, proactively push ~1.2s of real audio to the host to bridge timer throttling
function prebufferOnHide(){
    const coverSec = Math.min(1.2, STREAM_CHUNK_BG_MAX_SEC);
    // 1) Prefer draining from tap queue if active
    if(sampleTapActive && sampleTapQueue && sampleTapQueue.length){
        const sr = sampleTapSR || STREAM_SR;
        let need = Math.max(1, Math.floor(sr * coverSec));
        const parts = [];
        while(need > 0 && sampleTapQueue.length){
            const head = sampleTapQueue[0];
            if(head.length <= need){ parts.push(head); sampleTapQueue.shift(); need -= head.length; }
            else { parts.push(head.subarray(0, need)); sampleTapQueue[0] = head.subarray(need); need = 0; }
        }
        if(parts.length){ const total = parts.reduce((a,p)=>a+p.length,0); const out = new Float32Array(total); let off=0; for(const p of parts){ out.set(p, off); off+=p.length; }
            try{ sendHostJSONChunk(out, sr); }catch(_){ }
            return;
        }
    }
    // 2) If we have a pre-decoded buffer, send next slice now
    if(samplePlaybackHost && samplePlaybackHost.pcm){
        const sr = samplePlaybackHost.sr || STREAM_SR;
        const need = Math.max(1, Math.floor(sr * coverSec));
        const start = samplePlaybackHost.pos;
        const end = Math.min(samplePlaybackHost.pcm.length, start + need);
        if(end > start){ const slice = samplePlaybackHost.pcm.subarray(start, end); samplePlaybackHost.pos = end; try{ sendHostJSONChunk(slice, sr); }catch(_){ } return; }
    }
    // 3) If notes are active, pre-send a few binary chunks to cover coverSec
    if(hostActive && hostActive.size > 0){
        const count = Math.max(1, Math.ceil(coverSec / STREAM_CHUNK_SEC));
        for(let i=0;i<count;i++){ const ab = genBinChunk(); if(ab){ try{ sendHostBin(ab); }catch(_){ } } }
        return;
    }
    // 4) Last resort: a tiny silence buffer to keep host from underrun
    const sr = STREAM_SR; const frames = Math.floor(sr * Math.min(0.2, coverSec));
    if(frames > 0){ try{ sendHostJSONChunk(new Float32Array(frames), sr); }catch(_){ } }
}

function clearBackgroundBridgeTimers(){
    try{ __bgBridgeTimers.forEach(id=>clearTimeout(id)); }catch(_){ }
    __bgBridgeTimers = [];
}
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
    const hasNotes = hostActive.size>0;
    if(!hasNotes) return null;
    const n = Math.max(1, Math.floor(STREAM_SR * STREAM_CHUNK_SEC));
    const buf = new Float32Array(n);
    const labels = [...hostActive];
    const ampBase = 0.35 / Math.max(labels.length, 1);
    for(let i=0;i<n;i++){
        let s=0; const t=i/STREAM_SR;
        for(const l of labels){ const f=hostFreq.get(l)||0; if(f<=0) continue; const p0=hostPhase.get(l)||0; const w=2*Math.PI*f; s += Math.sin(p0 + w*t); }
        buf[i] = s * ampBase;
    }
    for(const l of labels){ const f=hostFreq.get(l)||0; const p0=hostPhase.get(l)||0; const adv = 2*Math.PI*f*(n/STREAM_SR); let ph = p0+adv; ph = ((ph + Math.PI) % (2*Math.PI)) - Math.PI; hostPhase.set(l, ph); }
    return buf.buffer;
}
function sendHostBin(ab){ try{ window.webkit.messageHandlers.swiftBridge.postMessage({ type:'audioBuffer_bin', data: ab }); }catch(e){} }
function ensureStreaming(){
    if(streamTimer) return;
    if(hostActive.size===0 && !samplePlaybackHost && !sampleTapActive) return;
    const ms = Math.floor(STREAM_CHUNK_SEC*1000);
    streamLastTs = performance.now();
    streamTimer = setInterval(()=>{
        const now = performance.now();
        let dtSec = (now - streamLastTs) / 1000;
        if(!isFinite(dtSec) || dtSec <= 0) dtSec = STREAM_CHUNK_SEC;
        const drainSec = PAGE_HIDDEN ? Math.min(STREAM_CHUNK_BG_MAX_SEC, Math.max(STREAM_CHUNK_SEC, dtSec))
                                     : Math.max(STREAM_CHUNK_SEC, Math.min(dtSec, STREAM_CHUNK_BG_MAX_SEC));
        streamLastTs = now;
        // Stop condition
        if(hostActive.size===0 && !samplePlaybackHost && !sampleTapActive){ clearInterval(streamTimer); streamTimer=null; return; }
        // 1) Send sample tap chunk if active
    if(sampleTapActive){
            const need = Math.max(1, Math.floor(sampleTapSR * drainSec));
            let out = null; let remaining = need;
            if(sampleTapQueue.length){
                const parts = [];
                while(remaining > 0 && sampleTapQueue.length){
                    const head = sampleTapQueue[0];
                    if(head.length <= remaining){ parts.push(head); sampleTapQueue.shift(); remaining -= head.length; }
                    else { parts.push(head.subarray(0, remaining)); sampleTapQueue[0] = head.subarray(remaining); remaining = 0; }
                }
                if(parts.length){ const total = parts.reduce((a,p)=>a+p.length,0); out = new Float32Array(total); let off=0; for(const p of parts){ out.set(p, off); off+=p.length; } }
            }
            if(out && out.length){ sendHostJSONChunk(out, sampleTapSR); }
            else if(PAGE_HIDDEN){
                // If hidden and no tap data, feed a tiny zero-fill to avoid crackles
                const filler = Math.floor(sampleTapSR * 0.06);
                if(filler > 0) try{ sendHostJSONChunk(new Float32Array(filler), sampleTapSR); }catch(_){ }
            }
            if(sampleTapEnded && sampleTapQueue.length===0 && (!out || out.length===0)){
                sampleTapActive = false; sampleTapSR = STREAM_SR; sampleTapEnded = false; sampleTapNodes = null;
            }
        }
        // 2) Send pre-decoded sample chunk (JSON) if present (legacy path)
        if(samplePlaybackHost && samplePlaybackHost.pcm){
            const sr = samplePlaybackHost.sr || STREAM_SR;
            const need = Math.max(1, Math.floor(sr * drainSec));
            const start = samplePlaybackHost.pos;
            const end = Math.min(samplePlaybackHost.pcm.length, start + need);
            if(end > start){ const slice = samplePlaybackHost.pcm.subarray(start, end); samplePlaybackHost.pos = end; sendHostJSONChunk(slice, sr); }
            if(samplePlaybackHost.pos >= samplePlaybackHost.pcm.length){ samplePlaybackHost = null; }
        }
        // 3) Send note-generated sine chunk (binary) if any notes active
        if(hostActive.size>0){ const ab = genBinChunk(); if(ab){ sendHostBin(ab); } }
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
 sendHost({type:'audioNote',data:{command:'playNote',note,frequency:freq,duration:HOST_SUSTAIN_SEC,amplitude:0.5,sustain:true,gate:1}}); return; }
 // In AUv3 UI, local WebAudio is not audible -> route to host
 if(forceLocal){ if(IN_AUV3 && hostAvailable()){ sendHost({type:'audioBuffer',data:genBuf(freq,0.5,44100)}); hostActive.add(note); hostFreq.set(note,freq); if(!hostPhase.has(note)) hostPhase.set(note,0); ensureStreaming(); sendHost({type:'audioNote',data:{command:'playNote',note,frequency:freq,duration:HOST_SUSTAIN_SEC,amplitude:0.5,sustain:true,gate:1}}); } else { if(!localNotes.has(note)) playLocalSustain(note,freq); } return; } // AUTO
 if(hostAvailable()){ sendHost({type:'audioBuffer',data:genBuf(freq,0.5,44100)}); hostActive.add(note); hostFreq.set(note,freq); if(!hostPhase.has(note)) hostPhase.set(note,0); ensureStreaming(); sendHost({type:'audioNote',data:{command:'playNote',note,frequency:freq,duration:HOST_SUSTAIN_SEC,amplitude:0.5,sustain:true,gate:1}}); } else { if(!localNotes.has(note)) playLocalSustain(note,freq); } }
function routeStop(note){ stopLocalNote(note); sendHost({type:'audioNote',data:{command:'stopNote',note}}); hostActive.delete(note); hostFreq.delete(note); hostPhase.delete(note); maybeStopStreaming(); }
let hostChordActive = [];
function routeChord(freqs){ const key='CHORD'; const forceHost= window.forceHostRouting|| window.forceAUv3Mode===true; const forceLocal = window.forceAUv3Mode===false; if(forceHost){ hostChordActive = freqs.slice(); freqs.forEach((f,i)=>{ const label=`CH_${i}`; sendHost({type:'audioBuffer',data:genBuf(f,0.5,44100)}); hostActive.add(label); hostFreq.set(label,f); if(!hostPhase.has(label)) hostPhase.set(label,0); sendHost({type:'audioNote',data:{command:'playNote',note:label,frequency:f,duration:HOST_SUSTAIN_SEC,amplitude:0.3,sustain:true,gate:1}}); }); ensureStreaming(); return;} if(forceLocal){ if(IN_AUV3 && hostAvailable()){ hostChordActive = freqs.slice(); freqs.forEach((f,i)=>{ const label=`CH_${i}`; sendHost({type:'audioBuffer',data:genBuf(f,0.5,44100)}); hostActive.add(label); hostFreq.set(label,f); if(!hostPhase.has(label)) hostPhase.set(label,0); sendHost({type:'audioNote',data:{command:'playNote',note:label,frequency:f,duration:HOST_SUSTAIN_SEC,amplitude:0.3,sustain:true,gate:1}}); }); ensureStreaming(); } else { if(!localNotes.has(key)){ freqs.forEach(f=>playLocalSustain(key,f)); } } return;} if(hostAvailable()){ hostChordActive = freqs.slice(); freqs.forEach((f,i)=>{ const label=`CH_${i}`; sendHost({type:'audioBuffer',data:genBuf(f,0.5,44100)}); hostActive.add(label); hostFreq.set(label,f); if(!hostPhase.has(label)) hostPhase.set(label,0); sendHost({type:'audioNote',data:{command:'playNote',note:label,frequency:f,duration:HOST_SUSTAIN_SEC,amplitude:0.3,sustain:true,gate:1}}); }); ensureStreaming(); } else { if(!localNotes.has(key)){ freqs.forEach(f=>playLocalSustain(key,f)); } } }
function stopChord(){ stopLocalNote('CHORD'); hostChordActive.forEach((f,i)=>{ const label=`CH_${i}`; sendHost({type:'audioNote',data:{command:'stopNote',note:label,gate:0}}); hostActive.delete(label); hostFreq.delete(label); hostPhase.delete(label); }); hostChordActive=[]; maybeStopStreaming(); }
function stopAll(){ // stop locaux
    Array.from(localNotes.keys()).forEach(k=>stopLocalNote(k));
    // stop host
    sendHost({type:'audioNote',data:{command:'stopAll'}});
    sendHost({type:'audioChord',data:{command:'stopChord'}});
    // stop sample (local + host)
    stopSample();
    hostActive.clear(); hostFreq.clear(); hostPhase.clear(); maybeStopStreaming();
    FIRST_HIDE_PRIMED = false;
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

// Default: in AUv3, force decode fallback for file playback unless explicitly overridden
if(IN_AUV3 && typeof window.forceSampleDecodeFallback === 'undefined'){
    window.forceSampleDecodeFallback = true;
}

// Quick toggle for Tap vs Decode fallback
const modeBtn = Button({
    id:'modeBtn', parent:'body',
    onText:'Mode: Decode', offText:'Mode: Tap',
    onAction:()=>{ window.forceSampleDecodeFallback = true; },
    offAction:()=>{ window.forceSampleDecodeFallback = false; },
    css:{position:'absolute',left:'705px',top:'14px',width:'110px',height:'34px',background:'#455063',color:'#fff',border:'none',borderRadius:'6px',fontFamily:'Arial, sans-serif',fontSize:'12px',cursor:'pointer'}
});
// Initialize button state to reflect current mode
try{ modeBtn.setState(!!window.forceSampleDecodeFallback); }catch(_){ }

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
                samplePlaybackHost = null;
                // Stop tap
                if(sampleTapActive){
                    try{
                        if(sampleTapSource && sampleTapNodes && sampleTapNodes.processor){
                            try{ sampleTapSource.disconnect(sampleTapNodes.processor); }catch(_){ }
                        }
                        if(sampleTapNodes && sampleTapNodes.processor){ try{ sampleTapNodes.processor.disconnect(); }catch(_){ }}
                    }catch(_){ }
                    sampleTapActive = false; sampleTapQueue = []; sampleTapEnded = false; sampleTapNodes = null;
                }
                FIRST_HIDE_PRIMED = false; // reset for next playback
                maybeStopStreaming();
    }catch(_){ }
}

function playSample(relPath){
    stopSample();
    const mode = ROUTE[routeIdx];
    // In AUv3 UI, even when Local is selected, route to host for audibility
    const forceHost = IN_AUV3 ? hostAvailable() : ((window.forceHostRouting|| window.forceAUv3Mode===true) || (mode!=='Local' && hostAvailable()));
    if(forceHost && hostAvailable()){
        console.log('[sample] route=Host (IN_AUV3='+IN_AUV3+')', relPath);
        playSampleHost(relPath);
    } else {
        console.log('[sample] route=Local', relPath);
        playSampleLocal(relPath);
    }
}

async function playSampleHost(relPath){
    try{
        if(window.forceSampleDecodeFallback===true){
            console.warn('[sample] forceSampleDecodeFallback enabled, bypassing tap');
            await playSampleHostFallbackDecode(relPath);
            return;
        }
        // Setup Web Audio tap from the hidden <audio>
        const ctx = ensureAC(); sampleTapSR = ctx.sampleRate|0;
        const el = document.getElementById('samplePlayer');
        if(!el){ console.warn('no samplePlayer element'); return; }
        try{ el.crossOrigin = 'anonymous'; }catch(_){ }
        // Do NOT mute element: muting can cause silence in MediaElementSource
        try{ el.muted = false; el.volume = 1.0; }catch(_){ }
        // Prefer local HTTP (range-supported) if available; fallback to custom scheme
        const port = window.__ATOME_LOCAL_HTTP_PORT__;
        el.src = port ? ('http://127.0.0.1:'+port+'/audio/'+encodeURI(relPath)) : ('atome:///audio/'+encodeURI(relPath));
        // Build nodes
    // Reuse a single MediaElementSource for this element across plays (spec: only one per element)
    if(!sampleTapSource){ sampleTapSource = ctx.createMediaElementSource(el); }
        let tapGotData = false;
    // Try AudioWorklet tap first for lower latency/CPU
        try{
            if(ctx.audioWorklet && window.AudioWorkletNode){
                const workletNode = await createTapWorkletNode(ctx, 0.12);
                workletNode.port.onmessage = (e)=>{
                    try{
                        const msg = e.data || {};
                        const pcm = msg.pcm; const sr = msg.sr|0 || sampleTapSR;
                        if(pcm && pcm.length){ sampleTapQueue.push(pcm); sampleTapSR = sr; tapGotData = true; }
                    }catch(_){ }
                };
        // Ensure a persistent zero-gain sink exists
        if(!sampleTapSink){ sampleTapSink = ctx.createGain(); sampleTapSink.gain.value = 0.0; sampleTapSink.connect(ctx.destination); }
        sampleTapSource.connect(workletNode);
        // Connect worklet output to the sink so the processor is actively pulled
        try{ workletNode.connect(sampleTapSink); }catch(_){ }
                sampleTapNodes = { processor: workletNode };
            }
        }catch(err){ console.warn('[tap] worklet failed, fallback to ScriptProcessor', err); sampleTapNodes = null; }
        // If worklet unavailable or failed, fallback to ScriptProcessor
        if(!sampleTapNodes){
            const proc = ctx.createScriptProcessor ? ctx.createScriptProcessor(2048, 2, 1) : null;
            if(!proc){ console.warn('ScriptProcessor not available, aborting tap'); throw new Error('no-processor'); }
            proc.onaudioprocess = (ev)=>{
                try{
                    const ib = ev.inputBuffer; const ch0 = ib.getChannelData(0);
                    const ch1 = ib.numberOfChannels>1 ? ib.getChannelData(1) : null;
                    const n = ib.length; const mono = new Float32Array(n);
                    if(ch1){ for(let i=0;i<n;i++){ mono[i] = (ch0[i] + ch1[i]) * 0.5; } }
                    else { mono.set(ch0); }
                    sampleTapQueue.push(mono);
                    tapGotData = true;
                    if((sampleTapQueue.length % 8)===0){ console.log('[tap] queued chunks=', sampleTapQueue.length, 'sr=', sampleTapSR); }
                }catch(_){ }
            };
            try{ sampleTapSource.connect(proc); }catch(_){ }
            try{ proc.connect(ctx.destination); }catch(_){ }
            sampleTapNodes = { processor: proc };
        }
    // Some iOS builds require media element to be connected to destination to run; feed it into zero-gain sink as well
    try{ if(sampleTapSink){ sampleTapSource.connect(sampleTapSink); } }catch(_){ }
    sampleTapQueue = []; sampleTapEnded = false; sampleTapActive = true; firstHideHandled = false;
        el.onended = ()=>{ sampleTapEnded = true; };
        try{ await el.play(); }catch(e){ console.warn('audio element play failed', e); }
    // Primer silence to avoid underrun while tap warms up; larger if page hidden
    const primerSec = PAGE_HIDDEN ? 1.0 : 0.3;
    const zeros = new Float32Array(Math.floor(sampleTapSR * primerSec)); if(zeros.length) sendHostJSONChunk(zeros, sampleTapSR);
        ensureStreaming();
        // Fallback if tap produces no data in time (e.g., scheme not tappable)
    setTimeout(()=>{
            try{
                if(!tapGotData && sampleTapActive){
                    // Tear down tap and fallback to pre-decode streaming
                    if(sampleTapSource && sampleTapNodes && sampleTapNodes.processor){ try{ sampleTapSource.disconnect(sampleTapNodes.processor); }catch(_){ }}
                    if(sampleTapNodes && sampleTapNodes.processor){ try{ sampleTapNodes.processor.disconnect(); }catch(_){ }}
                    sampleTapActive=false; sampleTapQueue=[]; sampleTapEnded=false; sampleTapNodes=null;
                    playSampleHostFallbackDecode(relPath);
                }
            }catch(_){ }
    }, 700);
    } catch(e){ console.warn('playSampleHost error, fallback local', e); playSampleLocal(relPath); }
}

// Fallback: fetch + decode + offline resample, then stream JSON from memory
async function playSampleHostFallbackDecode(relPath){
    try{
    const port = window.__ATOME_LOCAL_HTTP_PORT__;
        if(!port){ console.warn('HTTP server not ready, fallback local'); playSampleLocal(relPath); return; }
        const url = 'http://127.0.0.1:'+port+'/audio/'+encodeURI(relPath);
        const resp = await fetch(url);
        if(!resp.ok){ console.warn('HTTP fetch failed', resp.status); playSampleLocal(relPath); return; }
        const ab = await resp.arrayBuffer();
    const ctx = ensureAC();
    const decoded = await ctx.decodeAudioData(ab.slice(0));
    // Resample to the AudioContext sampleRate for consistency with Host
    const targetSR = (ctx && ctx.sampleRate) ? (ctx.sampleRate|0) : STREAM_SR;
    const length = Math.ceil(decoded.duration * targetSR);
    const off = new OfflineAudioContext(1, length, targetSR);
        const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
        const rendered = await off.startRendering();
        const mono = rendered.numberOfChannels>0 ? rendered.getChannelData(0) : new Float32Array(rendered.length);
        const copy = new Float32Array(mono.length); copy.set(mono);
    const primer = Math.min(copy.length, Math.floor(targetSR * 0.5)); if(primer>0){ sendHostJSONChunk(copy.subarray(0, primer), targetSR); }
    samplePlaybackHost = { pcm: copy, pos: primer, sr: targetSR };
        ensureStreaming();
    }catch(e){ console.warn('host decode fallback failed, use local', e); playSampleLocal(relPath); }
}

// Initial populate
setTimeout(listRecordings, 300);
