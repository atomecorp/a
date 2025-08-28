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
function bridgeLog(msg){ try{ window.webkit.messageHandlers.swiftBridge.postMessage({ type:'log', data: String(msg) }); }catch(_){ } }
let AC=null; let __toneCtxSet=false; function ensureAC(){ if(!AC){ AC=new (window.AudioContext||window.webkitAudioContext)(); try{ if(window.Tone && typeof window.Tone.setContext==='function'){ window.Tone.setContext(AC); __toneCtxSet=true; } }catch(_){} }
    try{ if(AC && AC.sampleRate){ const sr = (AC.sampleRate|0); if(sr && sr!==OUT_SR){ OUT_SR = sr; } } }catch(_){ }
    if(AC.state==='suspended') AC.resume().catch(()=>{}); return AC; }
// Suivi des oscillateurs locaux par note/accord
let localNotes = new Map(); // key: note label => Array<{osc:OscillatorNode,gain:GainNode}>
const FADE_TIME = 0.2; // seconds
const HOST_SUSTAIN_SEC = 3600; // sustain long côté host
// Streaming continu binaire: envoie des chunks 200ms (ArrayBuffer) pendant que des notes Host ou un sample sont actifs
const STREAM_SR = 44100;
let OUT_SR = STREAM_SR; // actual output SR for synthesized sine (synced to AudioContext)
const STREAM_CHUNK_SEC = 0.2; // 200ms recommandés (doc)
const STREAM_CHUNK_BG_MAX_SEC = 1.2; // when page hidden, allow up to ~1.2s per send to survive timer throttling
const SINE_CHUNK_SEC = 0.12; // smaller chunks for smoother sine streaming
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
let __tapDrainCount = 0;    // first drains are fully logged for debugging
let __hostRenderWoke = false; // ensure we only wake host once per sample
let __tapFirstDrainDone = false; // per-playback guard
// Local decoded sample playback (WebAudio) state
let localDecodedSample = null; // {ctx, src, gain}

// AudioWorklet-based media tap (lower latency/CPU) — loaded via Blob URL to avoid path issues
const MEDIA_TAP_WORKLET_SOURCE = `class MediaTapProcessor extends AudioWorkletProcessor {\n  constructor(options) {\n    super();\n    const sec = options?.processorOptions?.chunkDurationSec ?? 0.12;\n    this.setChunkSamples(sec);\n    this.buf = new Float32Array(this.chunkSamples);\n    this.write = 0;\n    this.port.onmessage = (e) => {\n      const msg = e.data || {};\n      if (msg.cmd === 'setChunkSec') {\n        this.setChunkSamples(msg.sec);\n        this.buf = new Float32Array(this.chunkSamples);\n        this.write = 0;\n      }\n    };\n  }\n  setChunkSamples(sec) {\n    const clamped = Math.min(0.5, Math.max(0.02, Number(sec) || 0.12));\n    this.chunkSamples = Math.max(128, Math.round(clamped * sampleRate));\n  }\n  process(inputs, outputs) {\n    const input = inputs[0];\n    const out = outputs && outputs[0] ? outputs[0][0] : null;\n    if (!input || input.length === 0) { if(out){ out.fill(0); } return true; }\n    const L = input[0] || new Float32Array(128);\n    const R = input[1] || L;\n    const n = L.length;\n    for (let i = 0; i < n; i++) {\n      const mono = (L[i] + R[i]) * 0.5;\n      if (this.write >= this.chunkSamples) {\n        this.port.postMessage({ sr: sampleRate, pcm: this.buf }, [this.buf.buffer]);\n        this.buf = new Float32Array(this.chunkSamples);\n        this.write = 0;\n      }\n      this.buf[this.write++] = mono;\n      if(out){ out[i] = 0.0; }\n    }\n    return true;\n  }\n}\nregisterProcessor('media-tap-processor', MediaTapProcessor);`;
let __tapWorkletURL=null; function getTapWorkletURL(){ if(__tapWorkletURL) return __tapWorkletURL; try{ const blob=new Blob([MEDIA_TAP_WORKLET_SOURCE],{type:'application/javascript'}); __tapWorkletURL=URL.createObjectURL(blob); }catch(_){ __tapWorkletURL=null; } return __tapWorkletURL; }
let tapWorkletReady=null; async function ensureTapWorkletLoaded(ctx){ if(!ctx || !ctx.audioWorklet) throw new Error('no-audioWorklet'); if(!tapWorkletReady){ const url=getTapWorkletURL(); if(!url) throw new Error('worklet-url'); tapWorkletReady = ctx.audioWorklet.addModule(url).catch(e=>{ tapWorkletReady=null; throw e; }); } return tapWorkletReady; }
async function createTapWorkletNode(ctx, chunkSec){ await ensureTapWorkletLoaded(ctx); const node = new AudioWorkletNode(ctx, 'media-tap-processor', { numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[1], channelCount:2, processorOptions:{ chunkDurationSec: chunkSec } }); return node; }

// Tone.js persistent synth + capture worklet (replace custom sine generator)
const CAPTURE_WORKLET_SOURCE = `class HostCaptureProcessor extends AudioWorkletProcessor {\n  constructor(options){\n    super();\n    const frames = options?.processorOptions?.chunkFrames || 256;\n    this.chunk = Math.max(128, Math.min(1024, frames|0));\n    this.buf = new Float32Array(this.chunk);\n    this.w = 0;\n  }\n  process(inputs, outputs){\n    const input = inputs[0];\n    const ch0 = input && input[0] ? input[0] : null;\n    const ch1 = input && input[1] ? input[1] : null;\n    const n = ch0 ? ch0.length : 128;\n    for(let i=0;i<n;i++){\n      const s = ch0 ? (ch1 ? ((ch0[i]+ch1[i])*0.5) : ch0[i]) : 0;\n      this.buf[this.w++] = s;\n      if(this.w >= this.chunk){ this.port.postMessage({ sr: sampleRate, pcm: this.buf }, [this.buf.buffer]); this.buf = new Float32Array(this.chunk); this.w = 0; }\n    }\n    // produce silence on output to keep graph pulled\n    if(outputs && outputs[0] && outputs[0][0]){ outputs[0][0].fill(0); if(outputs[0][1]) outputs[0][1].fill(0); }\n    return true;\n  }\n}\nregisterProcessor('host-capture-processor', HostCaptureProcessor);`;
let __captureWorkletURL = null; function getCaptureWorkletURL(){ if(__captureWorkletURL) return __captureWorkletURL; try{ const blob = new Blob([CAPTURE_WORKLET_SOURCE], { type:'application/javascript' }); __captureWorkletURL = URL.createObjectURL(blob); }catch(_){ __captureWorkletURL = null; } return __captureWorkletURL; }
let captureWorkletReady = null; let __captureCtx = null;
async function ensureCaptureWorkletLoaded(ctx){ if(!ctx || !ctx.audioWorklet) throw new Error('no-audioWorklet'); if(__captureCtx !== ctx){ captureWorkletReady = null; __captureCtx = ctx; } if(!captureWorkletReady){ const url = getCaptureWorkletURL(); if(!url) throw new Error('capture-worklet-url'); captureWorkletReady = ctx.audioWorklet.addModule(url).catch(e=>{ captureWorkletReady=null; throw e; }); } return captureWorkletReady; }

const toneState = { ready:false, poly:null, gain:null, capture:null, sink:null };
const toneActive = new Set();
function ensureTone(){
    const ctx = ensureAC();
    if(!window.Tone){ return ctx; }
    try{ if(typeof window.Tone.setContext==='function' && !__toneCtxSet){ window.Tone.setContext(ctx); __toneCtxSet=true; } }catch(_){ }
    if(!toneState.ready){
        try{
            // Create a poly synth and route through a capture gain
            const Poly = window.Tone.PolySynth || window.Tone.Synth; // fallback to mono
            const poly = new Poly(window.Tone.Synth, { volume: -6, maxPolyphony: 8, voice: { oscillator:{ type:'sine' } } });
            const gain = ctx.createGain(); gain.gain.value = 1.0;
            // Connect Tone poly output to the WebAudio gain node
            try{ poly.connect(gain); }catch(_){ }
            // Create capture worklet
            (async()=>{
                try{
                    await ensureCaptureWorkletLoaded(ctx);
                    const node = new AudioWorkletNode(ctx, 'host-capture-processor', { numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[1], channelCount:2, processorOptions:{ chunkFrames: 256 } });
                    node.port.onmessage = (e)=>{
                        try{
                            if(!hostAvailable()) return; // only forward when host bridge is present
                            if(toneActive.size === 0) return; // forward only when notes active
                            let pcm = e.data?.pcm; const sr = (e.data?.sr|0)||ctx.sampleRate|0;
                            if(pcm && !(pcm instanceof Float32Array) && pcm.byteLength!==undefined){ try{ pcm = new Float32Array(pcm); }catch(_){ } }
                            if(pcm && pcm.length){ sendHostJSONChunk(pcm, sr); }
                        }catch(_){ }
                    };
                    // Build a zero-gain sink to ensure pulling in AUv3
                    if(!toneState.sink){ toneState.sink = ctx.createGain(); toneState.sink.gain.value = 0.0; toneState.sink.connect(ctx.destination); }
                    gain.connect(node);
                    try{ node.connect(toneState.sink); }catch(_){ }
                    // Also route audible path (for Local route)
                    try{ gain.connect(ctx.destination); }catch(_){ }
                    toneState.capture = node;
                }catch(_){ }
            })();
            toneState.poly = poly; toneState.gain = gain; toneState.ready = true;
        }catch(_){ toneState.ready = false; }
    }
    return ctx;
}

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
    // 3) If notes are active, do not prebuffer Tone PCM (host will receive ongoing capture)
    if(toneActive && toneActive.size > 0){
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

// Kick the host's render engine with a tiny, silent note so it starts pulling the AU pipeline
function wakeHostRender(){
    try{
        if(__hostRenderWoke) return;
        if(!hostAvailable()) return;
        __hostRenderWoke = true;
        bridgeLog('[tap] host wake');
        const noteId = '__WAKE__';
    // Use a very low frequency and tiny amplitude to avoid any audible artifact
    sendHost({ type:'audioNote', data:{ command:'playNote', note: noteId, frequency: 30.0, duration: 0.06, amplitude: 0.02, sustain: false, gate: 1 } });
    setTimeout(()=>{ try{ sendHost({ type:'audioNote', data:{ command:'stopNote', note: noteId, gate: 0 } }); }catch(_){ } }, 60);
    }catch(_){ }
}

// Force-send a short Tap slice immediately (helps when timers are throttled or to kick the pipe)
function drainTapOnce(maxSec){
    try{
        if(!sampleTapActive) return;
        const sr = sampleTapSR || STREAM_SR;
        let remaining = Math.max(1, Math.floor(sr * Math.max(0.05, Math.min(0.25, maxSec || 0.12))));
        const parts = [];
        while(remaining > 0 && sampleTapQueue.length){
            const head = sampleTapQueue[0];
            if(head.length <= remaining){ parts.push(head); sampleTapQueue.shift(); remaining -= head.length; }
            else { parts.push(head.subarray(0, remaining)); sampleTapQueue[0] = head.subarray(remaining); remaining = 0; }
        }
        if(parts.length){
            const total = parts.reduce((a,p)=>a+p.length,0);
            const out = new Float32Array(total);
            let off=0; for(const p of parts){ out.set(p, off); off+=p.length; }
            try{ sendHostJSONChunk(out, sr); }catch(_){ }
            try{ bridgeLog(`[tap] drain-once len=${out.length} sr=${sr}`); }catch(_){ }
        }
    }catch(_){ }
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

function genBinChunk(sec = STREAM_CHUNK_SEC){
    const hasNotes = hostActive.size>0;
    if(!hasNotes) return null;
    const n = Math.max(1, Math.floor(OUT_SR * Math.max(0.01, sec)));
    const buf = new Float32Array(n);
    const labels = [...hostActive];
    const ampBase = 0.35 / Math.max(labels.length, 1);
    // slightly longer edge fade to avoid clicks between chunks
    const fadeN = Math.min(128, Math.floor(n*0.02));
    for(let i=0;i<n;i++){
        let s=0; const t=i/OUT_SR;
        for(const l of labels){ const f=hostFreq.get(l)||0; if(f<=0) continue; const p0=hostPhase.get(l)||0; const w=2*Math.PI*f; s += Math.sin(p0 + w*t); }
        let sample = s * ampBase;
        if(fadeN>0){ if(i<fadeN){ sample *= (i/fadeN); } else if(i>n-1-fadeN){ sample *= ((n-1-i)/fadeN); } }
        buf[i] = sample;
    }
    for(const l of labels){ const f=hostFreq.get(l)||0; const p0=hostPhase.get(l)||0; const adv = 2*Math.PI*f*(n/OUT_SR); let ph = p0+adv; ph = ((ph + Math.PI) % (2*Math.PI)) - Math.PI; hostPhase.set(l, ph); }
    return buf.buffer;
}
function sendHostBin(ab, sr=OUT_SR){
    // Reliability-first: convert to Float32Array and use JSON path
    try{
        const f32 = (ab instanceof Float32Array) ? ab : new Float32Array(ab);
        sendHostJSONChunk(f32, sr);
    }catch(_){ }
}
function ensureStreaming(){
    if(streamTimer) return;
    // Only needed for sample streaming (Tap or Decode), not for host-generated sine notes
    if(!samplePlaybackHost && !sampleTapActive) return;
    const ms = Math.floor(STREAM_CHUNK_SEC*1000);
    streamLastTs = performance.now();
    streamTimer = setInterval(()=>{
        const now = performance.now();
        let dtSec = (now - streamLastTs) / 1000;
        if(!isFinite(dtSec) || dtSec <= 0) dtSec = STREAM_CHUNK_SEC;
        const drainSec = PAGE_HIDDEN ? Math.min(STREAM_CHUNK_BG_MAX_SEC, Math.max(STREAM_CHUNK_SEC, dtSec))
                                     : Math.max(STREAM_CHUNK_SEC, Math.min(dtSec, STREAM_CHUNK_BG_MAX_SEC));
        streamLastTs = now;
        try{ if(typeof __streamTickCount === 'number' && __streamTickCount < 3){ bridgeLog(`[tap] tick dt=${dtSec.toFixed(3)} drain=${drainSec.toFixed(3)} q=${sampleTapQueue.length}`); __streamTickCount++; } }catch(_){ }
        // Stop condition: only watch sample paths
        if(!samplePlaybackHost && !sampleTapActive){ clearInterval(streamTimer); streamTimer=null; return; }
        // 1) Tap drain
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
            if(out && out.length){
                // Send JSON only to avoid duplicates
                try{ sendHostJSONChunk(out, sampleTapSR); }catch(_){ }
                try{ bridgeLog(`[tap] drain len=${out.length} sr=${sampleTapSR}`); }catch(_){ }
            }
            else if(PAGE_HIDDEN){
                // If hidden and no tap data, feed a tiny zero-fill to avoid crackles
                const filler = Math.floor(sampleTapSR * 0.06);
                if(filler > 0) try{ sendHostJSONChunk(new Float32Array(filler), sampleTapSR); }catch(_){ }
            }
            if(sampleTapEnded && sampleTapQueue.length===0 && (!out || out.length===0)){
                sampleTapActive = false; sampleTapSR = STREAM_SR; sampleTapEnded = false; sampleTapNodes = null;
            }
        }
        // 2) Pre-decoded sample drain
        if(samplePlaybackHost && samplePlaybackHost.pcm){
            const sr = samplePlaybackHost.sr || STREAM_SR;
            const need = Math.max(1, Math.floor(sr * drainSec));
            const start = samplePlaybackHost.pos;
            const end = Math.min(samplePlaybackHost.pcm.length, start + need);
            if(end > start){ const slice = samplePlaybackHost.pcm.subarray(start, end); samplePlaybackHost.pos = end; sendHostJSONChunk(slice, sr); }
            if(samplePlaybackHost.pos >= samplePlaybackHost.pcm.length){ samplePlaybackHost = null; }
        }
    }, ms);
}
function maybeStopStreaming(){ if(hostActive.size===0 && !samplePlaybackHost && streamTimer){ clearInterval(streamTimer); streamTimer=null; } }

function playLocalSustain(note,freq){ const ctx=ensureAC(); const osc=ctx.createOscillator(); const g=ctx.createGain(); osc.type='sine'; osc.frequency.value=freq; osc.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.3,ctx.currentTime+0.01); // sustain
    osc.start(); const arr=localNotes.get(note)||[]; arr.push({osc,gain:g}); localNotes.set(note,arr); }
function stopLocalNote(note){ const ctx=ensureAC(); const arr=localNotes.get(note); if(arr&&arr.length){ arr.forEach(({osc,gain})=>{ try{ const t=ctx.currentTime; gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value,t); gain.gain.exponentialRampToValueAtTime(0.0008, t+FADE_TIME); osc.stop(t+FADE_TIME+0.02);}catch(_){}}); localNotes.delete(note); } }
function genBuf(freq,lenSec=0.2,sr=44100){ const n=Math.floor(sr*lenSec); const a=new Float32Array(n); for(let i=0;i<n;i++){ a[i]=Math.sin(2*Math.PI*freq*i/sr)*0.5; } return {frequency:freq,sampleRate:sr,duration:lenSec,audioData:Array.from(a),channels:1}; }

function routePlay(note,freq){
    const forceHost = window.forceHostRouting || window.forceAUv3Mode===true;
    const forceLocal = window.forceAUv3Mode===false;
    if(forceHost){
        if(sampleTapActive || samplePlaybackHost){ ensureStreaming(); try{ drainTapOnce(0.14); }catch(_){ } return; }
        ensureTone();
        if(toneState.ready && window.Tone){ try{ toneState.poly.triggerAttack(freq); toneActive.add(note); }catch(_){ } }
        return;
    }
    if(forceLocal){
        // For Local, either use Tone if present or fallback to simple oscillator
        if(ensureTone() && toneState.ready && window.Tone){ try{ toneState.poly.triggerAttack(freq); toneActive.add(note); }catch(_){ } }
        else { if(!localNotes.has(note)) playLocalSustain(note,freq); }
        return;
    }
    // AUTO
    if(hostAvailable()){
        if(sampleTapActive || samplePlaybackHost){ ensureStreaming(); try{ drainTapOnce(0.14); }catch(_){ } return; }
        ensureTone();
        if(toneState.ready && window.Tone){ try{ toneState.poly.triggerAttack(freq); toneActive.add(note); }catch(_){ } }
    } else {
        if(ensureTone() && toneState.ready && window.Tone){ try{ toneState.poly.triggerAttack(freq); toneActive.add(note); }catch(_){ } }
        else { if(!localNotes.has(note)) playLocalSustain(note,freq); }
    }
}
function routeStop(note){
    stopLocalNote(note);
    if(toneState.ready && window.Tone){ try{ toneState.poly.triggerRelease(); }catch(_){ } }
    toneActive.delete(note);
    maybeStopStreaming();
}
let hostChordActive = [];
function routeChord(freqs){
    const key='CHORD';
    const forceHost = window.forceHostRouting || window.forceAUv3Mode===true;
    const forceLocal = window.forceAUv3Mode===false;
    if(forceHost){
        if(sampleTapActive || samplePlaybackHost){ ensureStreaming(); try{ drainTapOnce(0.16); }catch(_){ } return; }
        ensureTone();
        if(toneState.ready && window.Tone){ try{ freqs.forEach((f,i)=>{ const label=`CH_${i}`; toneState.poly.triggerAttack(f); toneActive.add(label); }); hostChordActive = freqs.slice(); }catch(_){ } }
        return;
    }
    if(forceLocal){
        if(ensureTone() && toneState.ready && window.Tone){ try{ freqs.forEach((f,i)=>{ const label=`CH_${i}`; toneState.poly.triggerAttack(f); toneActive.add(label); }); hostChordActive = freqs.slice(); }catch(_){ } }
        else { if(!localNotes.has(key)){ freqs.forEach(f=>playLocalSustain(key,f)); } }
        return;
    }
    if(hostAvailable()){
        if(sampleTapActive || samplePlaybackHost){ ensureStreaming(); try{ drainTapOnce(0.16); }catch(_){ } return; }
        ensureTone();
        if(toneState.ready && window.Tone){ try{ freqs.forEach((f,i)=>{ const label=`CH_${i}`; toneState.poly.triggerAttack(f); toneActive.add(label); }); hostChordActive = freqs.slice(); }catch(_){ } }
    } else {
        if(ensureTone() && toneState.ready && window.Tone){ try{ freqs.forEach((f,i)=>{ const label=`CH_${i}`; toneState.poly.triggerAttack(f); toneActive.add(label); }); hostChordActive = freqs.slice(); }catch(_){ } }
        else { if(!localNotes.has(key)){ freqs.forEach(f=>playLocalSustain(key,f)); } }
    }
}
function stopChord(){
    stopLocalNote('CHORD');
    if(toneState.ready && window.Tone){ try{ toneState.poly.triggerRelease(); }catch(_){ } }
    hostChordActive.forEach((_,i)=>{ const label=`CH_${i}`; toneActive.delete(label); });
    hostChordActive = [];
    maybeStopStreaming();
}
function stopAll(){ // stop locaux
    Array.from(localNotes.keys()).forEach(k=>stopLocalNote(k));
    // stop host
    sendHost({type:'audioNote',data:{command:'stopAll'}});
    sendHost({type:'audioChord',data:{command:'stopChord'}});
    // stop sample (local + host)
    stopSample();
    // stop Tone
    try{ if(toneState.ready && window.Tone){ toneState.poly.releaseAll && toneState.poly.releaseAll(); } }catch(_){ }
    toneActive.clear(); maybeStopStreaming();
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

// Default: in AUv3, prefer Tap (direct-from-disk) automatically if host+HTTP are ready; else Decode
if(IN_AUV3 && typeof window.forceSampleDecodeFallback === 'undefined'){
    // Tap desired when both the Swift bridge is available and the local HTTP server port is known
    const canTap = !!(hostAvailable() && window.__ATOME_LOCAL_HTTP_PORT__);
    // forceSampleDecodeFallback === true means Decode mode; false means Tap mode
    window.forceSampleDecodeFallback = !canTap;
    // Mark as auto-managed until user toggles manually
    window.__tapAutoManaged = true;
}

// Quick toggle for Tap vs Decode fallback
const modeBtn = Button({
    id:'modeBtn', parent:'body',
    onText:'Mode: Decode', offText:'Mode: Tap',
    onAction:()=>{ window.forceSampleDecodeFallback = true; window.__tapAutoManaged = false; },
    offAction:()=>{ window.forceSampleDecodeFallback = false; window.__tapAutoManaged = false; },
    css:{position:'absolute',left:'705px',top:'14px',width:'110px',height:'34px',background:'#455063',color:'#fff',border:'none',borderRadius:'6px',fontFamily:'Arial, sans-serif',fontSize:'12px',cursor:'pointer'}
});
// Initialize button state to reflect current mode
try{ modeBtn.setState(!!window.forceSampleDecodeFallback); }catch(_){ }

// Auto-switch to Tap when host bridge + local HTTP port become available (until user toggles manually)
try{
    (function(){
        if(!IN_AUV3) return;
        if(typeof window.__tapAutoManaged === 'undefined') window.__tapAutoManaged = true;
        let tries = 0;
        const maxTries = 20; // ~10s
        const timer = setInterval(()=>{
            tries++;
            if(!window.__tapAutoManaged){ clearInterval(timer); return; }
            const haveTap = !!(hostAvailable() && window.__ATOME_LOCAL_HTTP_PORT__);
            const wantDecode = !haveTap;
            if(window.forceSampleDecodeFallback !== wantDecode){
                window.forceSampleDecodeFallback = wantDecode;
                try{ modeBtn.setState(!!window.forceSampleDecodeFallback); }catch(_){ }
            }
            if(haveTap || tries >= maxTries){ clearInterval(timer); }
        }, 500);
    })();
}catch(_){ }

// Notes (toggle)
const c4 = Button({ onText:'C4 ●', offText:'C4', parent:'body', onAction:()=>routePlay('C4',261.63), offAction:()=>routeStop('C4'), onStyle:{background:'#ff6b35',color:'#fff'}, offStyle:{background:'#3b9157',color:'#fff'}, css:{position:'absolute',left:'120px',top:'14px',width:'70px',height:'34px',border:'none',borderRadius:'5px',fontFamily:'Arial, sans-serif',fontSize:'13px',cursor:'pointer'} });
const a4 = Button({ onText:'A4 ●', offText:'A4', parent:'body', onAction:()=>routePlay('A4',440), offAction:()=>routeStop('A4'), onStyle:{background:'#ff6b35',color:'#fff'}, offStyle:{background:'#5a4fb3',color:'#fff'}, css:{position:'absolute',left:'195px',top:'14px',width:'70px',height:'34px',border:'none',borderRadius:'5px',fontFamily:'Arial, sans-serif',fontSize:'13px',cursor:'pointer'} });
const e5 = Button({ onText:'E5 ●', offText:'E5', parent:'body', onAction:()=>routePlay('E5',659.25), offAction:()=>routeStop('E5'), onStyle:{background:'#ff6b35',color:'#fff'}, offStyle:{background:'#914d91',color:'#fff'}, css:{position:'absolute',left:'270px',top:'14px',width:'70px',height:'34px',border:'none',borderRadius:'5px',fontFamily:'Arial, sans-serif',fontSize:'13px',cursor:'pointer'} });

// Accord (toggle)
const chord = Button({ onText:'Chord ●', offText:'Chord', parent:'body', onAction:()=>routeChord([261.63,329.63,392.00]), offAction:()=>stopChord(), onStyle:{background:'#ff6b35',color:'#fff'}, offStyle:{background:'#2d6cdf',color:'#fff'}, css:{position:'absolute',left:'345px',top:'14px',width:'80px',height:'34px',border:'none',borderRadius:'5px',fontFamily:'Arial, sans-serif',fontSize:'13px',cursor:'pointer'} });

// Stop (simple)
$('button',{ id:'stopAllBtn', parent:document.body, text:'Stop', css:{position:'absolute',left:'430px',top:'14px',width:'70px',height:'34px',background:'#cc3333',color:'#fff',border:'none',borderRadius:'5px',fontFamily:'Arial',fontSize:'13px',cursor:'pointer'} , onClick:()=>{ stopAll(); c4.setState(false); a4.setState(false); e5.setState(false); chord.setState(false); }});

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
const sampleAudioEl = $('audio', {
    id:'samplePlayer', parent:document.body,
    css:{ position:'absolute', left:'-9999px', width:'1px', height:'1px' },
    controls:false, preload:'auto',
    attrs: { playsinline: '', 'webkit-playsinline': 'true' }
});

// Local playback through WebView audio element
function playSampleLocal(relPath){
    try{
        const el = document.getElementById('samplePlayer');
        if(!el){ console.warn('no samplePlayer element'); return; }
        // Ensure WebAudio context is unlocked (some iOS builds require it once per user gesture)
        try{ ensureAC(); }catch(_){ }
        // Stop any previous decoded local playback
        try{
            if(localDecodedSample && localDecodedSample.src){
                try{ localDecodedSample.src.stop(0); }catch(_){ }
            }
        }catch(_){ }
        localDecodedSample = null;
        // Prepare element
        try{ el.pause(); el.currentTime = 0; }catch(_){ }
        try{ el.muted = false; el.volume = 1.0; }catch(_){ }
        // Prefer local HTTP server if available (range supported)
        const port = window.__ATOME_LOCAL_HTTP_PORT__;
        el.src = port ? ('http://127.0.0.1:'+port+'/audio/'+encodeURI(relPath))
                      : ('atome:///audio/'+encodeURI(relPath));
        // Play via HTML audio element
        let played = false; let cancelled = false;
        const onPlaying = ()=>{ played = true; };
        try{ el.addEventListener('playing', onPlaying, { once:true }); }catch(_){ }
        el.play().catch(e=>{ console.warn('local el.play failed', e); });
        // Fallback: if HTML element doesn't start, decode via WebAudio from HTTP (requires port)
        setTimeout(async ()=>{
            if(cancelled || played) return;
            if(!window.__ATOME_LOCAL_HTTP_PORT__) return; // no fetch path
            try{
                const url = 'http://127.0.0.1:'+window.__ATOME_LOCAL_HTTP_PORT__+'/audio/'+encodeURI(relPath);
                const resp = await fetch(url);
                if(!resp.ok){ console.warn('[local] HTTP fetch failed', resp.status); return; }
                const ab = await resp.arrayBuffer();
                const ctx = ensureAC();
                const buf = await ctx.decodeAudioData(ab.slice(0));
                const src = ctx.createBufferSource(); src.buffer = buf;
                const g = ctx.createGain(); g.gain.value = 1.0;
                src.connect(g); g.connect(ctx.destination);
                localDecodedSample = { ctx, src, gain:g };
                try{ src.start(0); }catch(_){ }
            }catch(err){ console.warn('[local] decode fallback failed', err); }
        }, 700);
        // Cleanup listener when source changes
        try{ el.onended = ()=>{}; }catch(_){ }
    }catch(e){ console.warn('playSampleLocal error', e); }
}

function stopSample(){
  try{
    // Local
    const el = document.getElementById('samplePlayer'); if(el){ try{ el.pause(); el.currentTime = 0; }catch(_){ }}
    // Local decoded (WebAudio)
    try{
        if(localDecodedSample && localDecodedSample.src){
            try{ localDecodedSample.src.stop(0); }catch(_){ }
        }
    }catch(_){ }
    localDecodedSample = null;
    // Host stream
                samplePlaybackHost = null;
                // Stop tap
                if(sampleTapActive){
                    try{
                        if(sampleTapSource && sampleTapNodes && sampleTapNodes.processor){
                            try{ sampleTapSource.disconnect(sampleTapNodes.processor); }catch(_){ }
                        }
                        if(sampleTapSource && sampleTapSink){
                            try{ sampleTapSource.disconnect(sampleTapSink); }catch(_){ }
                        }
                        if(sampleTapNodes && sampleTapNodes.processor){ try{ sampleTapNodes.processor.disconnect(); }catch(_){ }}
                    }catch(_){ }
                    sampleTapActive = false; sampleTapQueue = []; sampleTapEnded = false; sampleTapNodes = null;
                }
                __hostRenderWoke = false;
                __tapDrainCount = 0; __tapFirstDrainDone = false;
                FIRST_HIDE_PRIMED = false; // reset for next playback
                stopSineBridge();
                maybeStopStreaming();
  }catch(_){ }
}

function playSample(relPath){
    stopSample();
    const mode = ROUTE[routeIdx];
    const forceHost = (window.forceHostRouting || window.forceAUv3Mode===true);
    const forceLocal = (window.forceAUv3Mode===false);
    if(forceHost && hostAvailable()){
        console.log('[sample] route=Host', relPath);
        playSampleHost(relPath);
        return;
    }
    if(forceLocal){
        console.log('[sample] route=Local (forced)', relPath);
        playSampleLocal(relPath);
        return;
    }
    // AUTO: prefer host when available, otherwise local
    if(hostAvailable()){
        console.log('[sample] route=Host (auto)', relPath);
        playSampleHost(relPath);
    } else {
        console.log('[sample] route=Local (auto)', relPath);
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
    // Reset element to a clean state before assigning a new src
    try{ el.pause(); }catch(_){ }
    try{ el.currentTime = 0; }catch(_){ }
    try{ if(typeof el.load === 'function'){ el.load(); } }catch(_){ }
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
                        let pcm = msg.pcm; const sr = (msg.sr|0) || sampleTapSR;
                        // If payload is an ArrayBuffer (due to transfer), reconstruct Float32Array
                        if(pcm && !(pcm instanceof Float32Array) && pcm.byteLength !== undefined){
                            try{ pcm = new Float32Array(pcm); }catch(_){ }
                        }
                        if(pcm && pcm.length){
                            sampleTapQueue.push(pcm);
                            sampleTapSR = sr; tapGotData = true;
                            // Kick immediate drain on first received data
                            if(typeof __streamTickCount === 'undefined'){ window.__streamTickCount = 0; }
                            try{ if(__tapDrainCount===0){ drainTapOnce(0.12); } }catch(_){ }
                            if((sampleTapQueue.length % 8)===0){ try{ bridgeLog(`[tap] queued=${sampleTapQueue.length} len=${pcm.length} sr=${sampleTapSR}`); }catch(_){ } }
                        }
                    }catch(err){ try{ bridgeLog(`[tap] onmessage error: ${err && err.message}`); }catch(_){ } }
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
            // Kick immediate drain on first received data
            if(typeof __streamTickCount === 'undefined'){ window.__streamTickCount = 0; }
            try{ if(__tapDrainCount===0){ drainTapOnce(0.12); } }catch(_){ }
                    if((sampleTapQueue.length % 8)===0){ console.log('[tap] queued chunks=', sampleTapQueue.length, 'sr=', sampleTapSR); }
                }catch(_){ }
            };
            try{ sampleTapSource.connect(proc); }catch(_){ }
            try{ proc.connect(ctx.destination); }catch(_){ }
            sampleTapNodes = { processor: proc };
        }
    // Some iOS builds require media element to be connected to destination to run; feed it into zero-gain sink as well
    try{ if(sampleTapSink){ sampleTapSource.connect(sampleTapSink); } }catch(_){ }
    sampleTapQueue = []; sampleTapEnded = false; sampleTapActive = true; firstHideHandled = false; __hostRenderWoke = false; __tapDrainCount = 0; __tapFirstDrainDone = false; window.__streamTickCount = 0;
    // Restart streaming timer to ensure Tap starts draining immediately (handles stale interval from previous mode)
    try{ if(streamTimer){ clearInterval(streamTimer); streamTimer=null; } }catch(_){ }
    el.onended = ()=>{ sampleTapEnded = true; bridgeLog('[tap] media ended'); };
        el.onplaying = ()=>{ try{ bridgeLog('[tap] media playing'); }catch(_){ } };
        el.ontimeupdate = ()=>{ if(!tapGotData){ try{ bridgeLog(`[tap] time=${el.currentTime.toFixed(2)}`); }catch(_){ } } };
        try{ await el.play(); bridgeLog('[tap] el.play ok'); }catch(e){ console.warn('audio element play failed', e); bridgeLog(`[tap] el.play error: ${e && e.message}`); }
    // Primer silence to avoid underrun while tap warms up; keep small
    const primerSec = PAGE_HIDDEN ? 0.12 : 0.02;
    const zeros = new Float32Array(Math.floor(sampleTapSR * primerSec)); if(zeros.length) sendHostJSONChunk(zeros, sampleTapSR);
        // Wake the host render engine so it starts pulling the AU pipeline
        wakeHostRender();
        ensureStreaming();
        // Fire an immediate drain right now if we already have data
        try{ drainTapOnce(0.12); }catch(_){ }
            // Force early drains to kick the pipe even if timer is throttled
            setTimeout(()=>{ try{ drainTapOnce(0.12); }catch(_){ } }, 60);
            setTimeout(()=>{ try{ drainTapOnce(0.12); }catch(_){ } }, 180);
        // Fallback if tap produces no data in time (e.g., scheme not tappable)
    setTimeout(()=>{
            try{
                if(!tapGotData && sampleTapActive){
                    bridgeLog('[tap] timeout no data -> fallback Decode');
                    // Tear down tap and fallback to pre-decode streaming
                    if(sampleTapSource && sampleTapNodes && sampleTapNodes.processor){ try{ sampleTapSource.disconnect(sampleTapNodes.processor); }catch(_){ }}
                    if(sampleTapNodes && sampleTapNodes.processor){ try{ sampleTapNodes.processor.disconnect(); }catch(_){ }}
                    sampleTapActive=false; sampleTapQueue=[]; sampleTapEnded=false; sampleTapNodes=null;
                    playSampleHostFallbackDecode(relPath);
                }
            }catch(_){ }
    }, 900);
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
