function createBasicConsole() {
  const console1 = Console({
    title: 'Debug Console',
    position: { x: 50, y: 50 },
    size: { width: 500, height: 350 },
    template: 'dark_theme'
  });
  
  console1.show();
  return console1;
}
console.log('[web_swift_audio_test] Creating debug console');
createBasicConsole();
   
   
   // Replace static audio with custom scheme + fallback
(function(){
  const existing = document.getElementById('riffPlayer');
  if(existing) existing.remove();
  const player = $('audio', {
    id: 'alivePlayer',
    // Use triple slash so host is empty and path is /audio/Alive.m4a
    attrs: { controls: true, src: 'atome:///audio/Alive.m4a', playsinline: true },
    css: { margin: '20px', width: '320px' }
  });
  console.log('[web_swift_audio_test] Injected <audio id="alivePlayer" src="atome:///audio/Alive.m4a">');
  const events = ['loadstart','loadedmetadata','loadeddata','canplay','canplaythrough','play','playing','pause','stalled','suspend','ended'];
  events.forEach(ev=> player.addEventListener(ev, ()=> console.log(`[audio event] ${ev}`)));
  player.addEventListener('error', (e)=>{
    const mediaError = player.error;
    console.log('⚠️ audio error', mediaError ? mediaError.code : 'no-code', mediaError);
  }, { once:false });

  let fallbackTried = false;
  player.addEventListener('error', async ()=>{
    if(fallbackTried) return;
    fallbackTried = true;
    console.log('⚠️ atome:// playback error, attempting Blob fallback');
    if(typeof window.readFileFromIOS === 'function') {
      try {
        const base64 = await window.readFileFromIOS('Alive.m4a');
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i=0;i<len;i++) bytes[i]=binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/mp4' });
        const url = URL.createObjectURL(blob);
        player.src = url;
        player.load();
        console.log('✅ Fallback Blob URL loaded');
      } catch(e){ console.log('❌ Fallback failed', e); }
    }
  });
})();