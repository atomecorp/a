// iOS Audio Streaming (Tap only) + Upload/List/Play UI
// Keep it minimal: Tap stream to host, upload .m4a, list, play, stop. Every UI element gets an id.

// Env helpers
const IN_AUV3 = !!(window && window.__HOST_ENV);
function hostAvailable(){ return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge); }
function bridgeLog(msg){ try{ window.webkit.messageHandlers.swiftBridge.postMessage({ type:'log', data:String(msg) }); }catch(_){ }
}

// WebAudio context
let AC = null;
function ensureAC(){ if(!AC){ AC = new (window.AudioContext||window.webkitAudioContext)(); } if(AC.state==='suspended') AC.resume().catch(()=>{}); return AC; }

// Tap streaming state
const STREAM_SR = 44100;
const STREAM_CHUNK_SEC = 0.2;
const STREAM_CHUNK_BG_MAX_SEC = 1.2;
let sampleTapActive = false;
let sampleTapQueue = [];
let sampleTapSR = STREAM_SR;
let sampleTapEnded = false;
let sampleTapNodes = null; // { processor }
let sampleTapSource = null; // MediaElementSource
let sampleTapSink = null;   // zero-gain sink
let streamTimer = null;
let streamLastTs = 0;
let PAGE_HIDDEN = false;
let __tapSessionId = 0;
let __tapLastSig = null; let __tapLastSentAt = 0;
let __hostRenderWoke = false;
let __tapDrainCount = 0;

function tapNewSession(){ __tapSessionId++; __tapLastSig=null; __tapLastSentAt=0; return __tapSessionId; }
function tapSameSession(id){ return id===__tapSessionId; }
function tapHash64(f32){ const n=f32.length, k=Math.min(64,n); let s1=0,s2=0; for(let i=0;i<k;i++){ s1+=f32[i]; s2+=f32[n-1-i]; } return [(s1*1e6|0),(s2*1e6|0)]; }
function sendHostJSONChunk(f32, sr){ try{ window.webkit.messageHandlers.swiftBridge.postMessage({ type:'audioBuffer', data:{ frequency:0.0, sampleRate: sr|0, duration: f32.length/(sr|0), audioData: Array.from(f32) } }); }catch(_){ } }
function sendTapChunk(f32, sr){ try{ const now = (performance&&performance.now)?performance.now():Date.now(); const [h1,h2]=tapHash64(f32); const sig={len:f32.length|0,sr:sr|0,h1,h2}; const last=__tapLastSig; const recent=(now-__tapLastSentAt)<80; if(last&&recent&&last.len===sig.len&&last.sr===sig.sr&&last.h1===sig.h1&&last.h2===sig.h2){return;} __tapLastSig=sig; __tapLastSentAt=now; sendHostJSONChunk(f32,sr); }catch(_){ } }

// Worklet source (inline)
const MEDIA_TAP_WORKLET_SOURCE = `class MediaTapProcessor extends AudioWorkletProcessor {\n constructor(options){\n  super();\n  const sec = options?.processorOptions?.chunkDurationSec ?? 0.12;\n  this.setChunkSamples(sec);\n  this.buf = new Float32Array(this.chunkSamples);\n  this.w = 0;\n  this.port.onmessage = (e)=>{ const m=e.data||{}; if(m.cmd==='setChunkSec'){ this.setChunkSamples(m.sec); this.buf=new Float32Array(this.chunkSamples); this.w=0; } };\n }\n setChunkSamples(sec){ const c=Math.min(0.5,Math.max(0.02,Number(sec)||0.12)); this.chunkSamples=Math.max(128, Math.round(c*sampleRate)); }\n process(inputs, outputs){ const input=inputs[0]; const out=outputs&&outputs[0]?outputs[0][0]:null; if(!input||input.length===0){ if(out) out.fill(0); return true; } const L=input[0]||new Float32Array(128); const R=input[1]||L; const n=L.length; for(let i=0;i<n;i++){ const mono=(L[i]+R[i])*0.5; if(this.w>=this.chunkSamples){ this.port.postMessage({sr:sampleRate, pcm:this.buf}, [this.buf.buffer]); this.buf=new Float32Array(this.chunkSamples); this.w=0; } this.buf[this.w++]=mono; if(out){ out[i]=0.0; } } return true; } }\nregisterProcessor('media-tap-processor', MediaTapProcessor);`;
let __tapWorkletURL=null, tapWorkletReady=null;
function getTapWorkletURL(){ if(__tapWorkletURL) return __tapWorkletURL; try{ const b=new Blob([MEDIA_TAP_WORKLET_SOURCE],{type:'application/javascript'}); __tapWorkletURL=URL.createObjectURL(b);}catch(_){__tapWorkletURL=null;} return __tapWorkletURL; }
async function ensureTapWorkletLoaded(ctx){ if(!ctx||!ctx.audioWorklet) throw new Error('no-audioWorklet'); if(!tapWorkletReady){ const url=getTapWorkletURL(); if(!url) throw new Error('worklet-url'); tapWorkletReady = ctx.audioWorklet.addModule(url).catch(e=>{ tapWorkletReady=null; throw e; }); } return tapWorkletReady; }
async function createTapWorkletNode(ctx, sec){ await ensureTapWorkletLoaded(ctx); return new AudioWorkletNode(ctx,'media-tap-processor',{ numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[1], channelCount:2, processorOptions:{ chunkDurationSec: sec }}); }

// Page visibility
let __bgTimers=[];
function clearBg(){ try{ __bgTimers.forEach(id=>clearTimeout(id)); }catch(_){ } __bgTimers=[]; }
function prebufferOnHide(){ const coverSec = Math.min(1.2, STREAM_CHUNK_BG_MAX_SEC); if(sampleTapActive && sampleTapQueue.length){ const sr=sampleTapSR||STREAM_SR; let need=Math.max(1,Math.floor(sr*coverSec)); const parts=[]; while(need>0 && sampleTapQueue.length){ const head=sampleTapQueue[0]; if(head.length<=need){ parts.push(head); sampleTapQueue.shift(); need-=head.length; } else { parts.push(head.subarray(0,need)); sampleTapQueue[0]=head.subarray(need); need=0; } } if(parts.length){ const total=parts.reduce((a,p)=>a+p.length,0); const out=new Float32Array(total); let off=0; for(const p of parts){ out.set(p,off); off+=p.length; } sendTapChunk(out,sr); } return; } const sr=sampleTapSR||STREAM_SR; const frames=Math.floor(sr*Math.min(0.2,coverSec)); if(frames>0) sendTapChunk(new Float32Array(frames), sr); }
function onVisibilityChange(){ PAGE_HIDDEN = (document.visibilityState==='hidden'); try{ if(sampleTapNodes && sampleTapNodes.processor && sampleTapNodes.processor.port){ sampleTapNodes.processor.port.postMessage({cmd:'setChunkSec', sec: PAGE_HIDDEN?0.24:0.12}); } streamLastTs = performance.now(); if(PAGE_HIDDEN){ prebufferOnHide(); clearBg(); __bgTimers.push(setTimeout(()=>{ if(PAGE_HIDDEN) prebufferOnHide(); }, 550)); __bgTimers.push(setTimeout(()=>{ if(PAGE_HIDDEN) prebufferOnHide(); }, 1100)); } else { clearBg(); } }catch(_){ } }
try{ document.addEventListener('visibilitychange', onVisibilityChange, false); }catch(_){ }

// Host wake
function wakeHostRender(){ try{ if(__hostRenderWoke) return; if(!hostAvailable()) return; __hostRenderWoke=true; bridgeLog('[tap] host wake'); const noteId='__WAKE__'; window.webkit.messageHandlers.swiftBridge.postMessage({ type:'audioNote', data:{ command:'playNote', note:noteId, frequency:30.0, duration:0.06, amplitude:0.02, sustain:false, gate:1 } }); setTimeout(()=>{ try{ window.webkit.messageHandlers.swiftBridge.postMessage({ type:'audioNote', data:{ command:'stopNote', note:noteId, gate:0 } }); }catch(_){ } }, 60); }catch(_){ } }

function drainTapOnce(sec){ try{ if(!sampleTapActive) return; const sr=sampleTapSR||STREAM_SR; let remaining=Math.max(1,Math.floor(sr*Math.max(0.05,Math.min(0.25, sec||0.12)))); const parts=[]; while(remaining>0 && sampleTapQueue.length){ const head=sampleTapQueue[0]; if(head.length<=remaining){ parts.push(head); sampleTapQueue.shift(); remaining-=head.length; } else { parts.push(head.subarray(0,remaining)); sampleTapQueue[0]=head.subarray(remaining); remaining=0; } } if(parts.length){ const total=parts.reduce((a,p)=>a+p.length,0); const out=new Float32Array(total); let off=0; for(const p of parts){ out.set(p,off); off+=p.length; } sendTapChunk(out,sr); } }catch(_){ } }

function ensureStreaming(){ if(streamTimer) return; if(!sampleTapActive) return; const ms=Math.floor(STREAM_CHUNK_SEC*1000); streamLastTs = (performance&&performance.now)?performance.now():Date.now(); streamTimer=setInterval(()=>{ const now=(performance&&performance.now)?performance.now():Date.now(); let dtSec=(now-streamLastTs)/1000; if(!isFinite(dtSec)||dtSec<=0) dtSec=STREAM_CHUNK_SEC; const drainSec = PAGE_HIDDEN? Math.min(STREAM_CHUNK_BG_MAX_SEC, Math.max(STREAM_CHUNK_SEC, dtSec)) : Math.max(STREAM_CHUNK_SEC, Math.min(dtSec, STREAM_CHUNK_BG_MAX_SEC)); streamLastTs=now; if(!sampleTapActive){ clearInterval(streamTimer); streamTimer=null; return; } const need=Math.max(1,Math.floor(sampleTapSR*drainSec)); let out=null; let remaining=need; if(sampleTapQueue.length){ const parts=[]; while(remaining>0 && sampleTapQueue.length){ const head=sampleTapQueue[0]; if(head.length<=remaining){ parts.push(head); sampleTapQueue.shift(); remaining-=head.length; } else { parts.push(head.subarray(0,remaining)); sampleTapQueue[0]=head.subarray(remaining); remaining=0; } } if(parts.length){ const total=parts.reduce((a,p)=>a+p.length,0); out=new Float32Array(total); let off=0; for(const p of parts){ out.set(p,off); off+=p.length; } } } if(out && out.length){ sendTapChunk(out, sampleTapSR); } else if(PAGE_HIDDEN){ const filler=Math.floor(sampleTapSR*0.06); if(filler>0) sendTapChunk(new Float32Array(filler), sampleTapSR); } if(sampleTapEnded && sampleTapQueue.length===0 && (!out || out.length===0)){ sampleTapActive=false; sampleTapSR=STREAM_SR; sampleTapEnded=false; sampleTapNodes=null; } }, ms); }

function stopSample(){ try{ const el=document.getElementById('samplePlayer'); if(el){ try{ el.pause(); el.currentTime=0; }catch(_){ } } try{ const ctx=AC; if(sampleTapSource){ try{ sampleTapSource.disconnect(); }catch(_){ } try{ if(ctx){ sampleTapSource.disconnect(ctx.destination); } }catch(_){ } try{ if(sampleTapSink){ sampleTapSource.disconnect(sampleTapSink); } }catch(_){ } try{ if(sampleTapNodes && sampleTapNodes.processor){ sampleTapSource.disconnect(sampleTapNodes.processor); } }catch(_){ } } if(sampleTapNodes && sampleTapNodes.processor){ try{ sampleTapNodes.processor.disconnect(); }catch(_){ } } }catch(_){ } if(sampleTapActive){ sampleTapActive=false; sampleTapQueue=[]; sampleTapEnded=false; sampleTapNodes=null; } __hostRenderWoke=false; __tapDrainCount=0; try{ if(streamTimer){ clearInterval(streamTimer); streamTimer=null; } }catch(_){ } }catch(_){ } }

async function playSampleTap(relPath){ try{ const ctx=ensureAC(); sampleTapSR=ctx.sampleRate|0; const mySession=tapNewSession(); const el=document.getElementById('samplePlayer'); if(!el){ console.warn('no samplePlayer'); return; } try{ el.crossOrigin='anonymous'; el.setAttribute('muted',''); el.defaultMuted=true; el.muted=true; el.volume=0.0; el.setAttribute('disableRemotePlayback',''); el.pause(); el.currentTime=0; if(typeof el.load==='function'){ el.load(); } }catch(_){ }
    const port = window.__ATOME_LOCAL_HTTP_PORT__;
    el.src = port ? ('http://127.0.0.1:'+port+'/audio/'+encodeURI(relPath)) : ('atome:///audio/'+encodeURI(relPath));
    if(!sampleTapSource){ sampleTapSource = ctx.createMediaElementSource(el); }
    try{ sampleTapSource.disconnect(); }catch(_){ }
    try{ if(sampleTapNodes && sampleTapNodes.processor){ sampleTapNodes.processor.disconnect(); } }catch(_){ }
    let tapGotData=false;
    try{
        if(ctx.audioWorklet && window.AudioWorkletNode){
            const node = await createTapWorkletNode(ctx, 0.12);
            node.port.onmessage = (e)=>{ try{ let pcm=e.data?.pcm; const sr=(e.data?.sr|0)||sampleTapSR; if(pcm && !(pcm instanceof Float32Array) && pcm.byteLength!==undefined){ try{ pcm=new Float32Array(pcm); }catch(_){ } } if(pcm && pcm.length){ sampleTapQueue.push(pcm); sampleTapSR=sr; tapGotData=true; if(__tapDrainCount===0){ drainTapOnce(0.12); } } }catch(_){ } };
            if(!sampleTapSink){ sampleTapSink = ctx.createGain(); sampleTapSink.gain.value=0.0; sampleTapSink.connect(ctx.destination); }
            sampleTapSource.connect(node);
            try{ node.connect(sampleTapSink); }catch(_){ }
            sampleTapNodes = { processor: node };
        }
    }catch(err){ console.warn('[tap] worklet failed, trying ScriptProcessor', err); sampleTapNodes=null; }
    if(!sampleTapNodes){ const proc = ctx.createScriptProcessor ? ctx.createScriptProcessor(2048,2,1) : null; if(!proc){ console.warn('no processor available'); return; } proc.onaudioprocess=(ev)=>{ try{ if(!tapSameSession(mySession) || !sampleTapActive) return; const ib=ev.inputBuffer; const ch0=ib.getChannelData(0); const ch1= ib.numberOfChannels>1? ib.getChannelData(1): null; const n=ib.length; const mono=new Float32Array(n); if(ch1){ for(let i=0;i<n;i++){ mono[i]=(ch0[i]+ch1[i])*0.5; } } else { mono.set(ch0); } sampleTapQueue.push(mono); tapGotData=true; if(__tapDrainCount===0){ drainTapOnce(0.12); } }catch(_){ } }; try{ sampleTapSource.connect(proc); }catch(_){ } if(!sampleTapSink){ sampleTapSink = ctx.createGain(); sampleTapSink.gain.value=0.0; sampleTapSink.connect(ctx.destination); } try{ proc.connect(sampleTapSink); }catch(_){ } sampleTapNodes={ processor: proc }; }
    sampleTapQueue=[]; sampleTapEnded=false; sampleTapActive=true; __hostRenderWoke=false; __tapDrainCount=0; window.__streamTickCount=0;
    try{ if(streamTimer){ clearInterval(streamTimer); streamTimer=null; } }catch(_){ }
    el.onended=()=>{ sampleTapEnded=true; bridgeLog('[tap] media ended'); };
    el.onplaying=()=>{ try{ el.defaultMuted=true; el.muted=true; el.volume=0.0; }catch(_){ } };
    el.onvolumechange=()=>{ try{ if(sampleTapActive){ el.defaultMuted=true; el.muted=true; el.volume=0.0; } }catch(_){ } };
    el.ontimeupdate=()=>{ if(!tapGotData){ try{ bridgeLog(`[tap] time=${el.currentTime.toFixed(2)}`); }catch(_){ } } };
    try{ await el.play(); bridgeLog('[tap] el.play ok'); }catch(e){ console.warn('audio element play failed', e); }
    const primer = new Float32Array(Math.floor(sampleTapSR*(PAGE_HIDDEN?0.12:0.02))); if(primer.length) sendTapChunk(primer, sampleTapSR);
    wakeHostRender(); ensureStreaming(); drainTapOnce(0.12); setTimeout(()=>{ drainTapOnce(0.12); }, 80); setTimeout(()=>{ drainTapOnce(0.12); }, 200);
    setTimeout(()=>{ if(!tapGotData && sampleTapActive){ bridgeLog('[tap] no data from tap'); } }, 900);
}catch(e){ console.warn('playSampleTap error', e); }
}

// UI — Squirrel components with ids
const uploadBtn = Button({ id:'uploadM4ABtn', parent:'body', onText:'Upload m4a', offText:'Upload m4a', onAction:()=>importM4A(), offAction:()=>importM4A(), css:{ position:'absolute', left:'14px', top:'14px', width:'110px', height:'34px', background:'#2d6cdf', color:'#fff', border:'none', borderRadius:'6px', fontFamily:'Arial, sans-serif', fontSize:'12px', cursor:'pointer' } });
const refreshBtn = Button({ id:'refreshListBtn', parent:'body', onText:'Refresh', offText:'Refresh', onAction:()=>listRecordings(), offAction:()=>listRecordings(), css:{ position:'absolute', left:'132px', top:'14px', width:'90px', height:'34px', background:'#3b9157', color:'#fff', border:'none', borderRadius:'6px', fontFamily:'Arial, sans-serif', fontSize:'12px', cursor:'pointer' } });
const stopBtn = Button({ id:'stopSampleBtn', parent:'body', onText:'Stop', offText:'Stop', onAction:()=>stopSample(), offAction:()=>stopSample(), css:{ position:'absolute', left:'228px', top:'14px', width:'80px', height:'34px', background:'#cc3333', color:'#fff', border:'none', borderRadius:'6px', fontFamily:'Arial, sans-serif', fontSize:'12px', cursor:'pointer' } });
const listWrap = $('div', { id:'auv3List', parent:document.body, css:{ position:'absolute', left:'14px', right:'14px', top:'60px', bottom:'14px', overflowY:'auto', backgroundColor:'#0f1215', border:'1px solid #2c343d', borderRadius:'6px', padding:'6px', color:'#e6e6e6', fontFamily:'monospace', fontSize:'12px' }, text:'Recordings (.m4a):' });
const sampleAudioEl = $('audio', { id:'samplePlayer', parent:document.body, css:{ position:'absolute', left:'-9999px', width:'1px', height:'1px' }, controls:false, preload:'auto', attrs:{ playsinline:'', 'webkit-playsinline':'true' } });

function importM4A(){ try{ if(!window.AtomeFileSystem){ console.warn('AtomeFileSystem indisponible'); return; } window.AtomeFileSystem.copy_to_ios_local('Recordings', ['m4a'], (res)=>{ if(res && res.success){ listRecordings(); } else { console.warn('Import échoué', res && res.error); } }); }catch(e){ console.warn('importM4A error', e); } }
function listRecordings(){ try{ if(!window.AtomeFileSystem){ listWrap.textContent='API fichier indisponible'; return; } window.AtomeFileSystem.listFiles('Recordings', (res)=>{ if(!res||!res.success){ listWrap.textContent='Erreur de liste'; return; } const files=(res.data&&res.data.files)? res.data.files: []; const items=files.filter(f=>!f.isDirectory && /\.m4a$/i.test(f.name)); listWrap.innerHTML=''; $('div',{ id:'listTitle', parent:'#auv3List', css:{ marginBottom:'6px', color:'#9db2cc' }, text: items.length? 'Recordings (.m4a):' : 'Aucun fichier .m4a dans Recordings/' }); items.forEach((it, idx)=>{ const safeId = 'rec_'+idx+'_'+it.name.replace(/[^a-zA-Z0-9_\-]/g,'_'); Button({ id: safeId, onText: it.name, offText: it.name, parent:'#auv3List', onAction:()=>playSampleTap('Recordings/'+it.name), offAction:()=>playSampleTap('Recordings/'+it.name), css:{ display:'block', width:'100%', textAlign:'left', marginBottom:'6px', padding:'6px 8px', background:'#1a1f25', color:'#e6e6e6', border:'1px solid #2c343d', borderRadius:'4px', cursor:'pointer', fontFamily:'monospace', fontSize:'12px' }, onStyle:{ background:'#25303a' }, offStyle:{ background:'#1a1f25' } }); }); }); }catch(e){ listWrap.textContent='Erreur'; console.warn('listRecordings error', e); } }

// Kick things off
setTimeout(listRecordings, 300);

