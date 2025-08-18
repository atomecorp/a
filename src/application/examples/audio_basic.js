    // Audio basic example (Squirrel friendly). Conserve l'ancien comportement tout en ajoutant
    // une initialisation progressive (port dynamique local si dispo, sinon asset fallback).

    // Container (facultatif) pour grouper le player et un petit statut
    const audioBox = $('div', {
      id: 'riffPlayerBox',
      css: {
        margin: '16px',
        padding: '12px',
        background: '#111',
        border: '1px solid #333',
        borderRadius: '8px',
        maxWidth: '360px',
        fontFamily: 'monospace',
        color: '#ddd'
      }
    });

    // Statut initial
    const status = $('div', {
      id: 'riffPlayerStatus',
      text: 'Init player...',
      css: { fontSize: '11px', opacity: 0.7, margin: '0 0 4px 0' }
    });

    // Player principal (src défini ensuite)
    const riffPlayer = $('audio', {
      id: 'riffPlayer',
      attrs: {
        controls: true,
        preload: 'none'
      },
      css: {
        margin: '4px 0 6px 0',
        width: '300px',
        outline: 'none',
        borderRadius: '6px',
        background: '#000'
      },
      on: {
        play: () => { status.textContent = 'Lecture: ' + (riffPlayer.currentSrc.split('/').pop() || '...?'); },
        pause: () => { status.textContent = 'Pause'; },
        ended: () => { status.textContent = 'Terminé'; }
      }
    });

    // Boutons (Squirrel) optionnels
    const btnRow = $('div', { css:{ display:'flex', gap:'6px', margin:'6px 0 0 0' } });
    Button({
      id: 'riffPlayBtn',
      onText: 'Play', offText: 'Play',
      onAction: ()=> riffPlayer.play(),
      offAction: ()=> riffPlayer.play(),
      css: { width:'70px', height:'26px' }
    });
    Button({
      id: 'riffPauseBtn',
      onText: 'Pause', offText: 'Pause',
      onAction: ()=> riffPlayer.pause(),
      offAction: ()=> riffPlayer.pause(),
      css: { width:'70px', height:'26px' }
    });
    Button({
      id: 'riffStopBtn',
      onText: 'Stop', offText: 'Stop',
      onAction: ()=> { riffPlayer.pause(); riffPlayer.currentTime=0; },
      offAction: ()=> { riffPlayer.pause(); riffPlayer.currentTime=0; },
      css: { width:'70px', height:'26px' }
    });

    // Fonction pour définir la source avec fallback
    function setRiffSource(url, label){
      riffPlayer.src = url;
      status.textContent = 'Source: ' + label;
    }

    // 1) Fallback immédiat (ancien comportement) => asset local
    setRiffSource('assets/audios/riff.m4a', 'assets/audios/riff.m4a');

    // 2) Tentative (optionnelle) d’utiliser le serveur local si Runaway.m4a dispo
    (function tryLocalServer(){
      const port = window.ATOME_LOCAL_HTTP_PORT || window.__ATOME_LOCAL_HTTP_PORT__;
      if(!port){
        status.textContent += ' | Port local en attente...';
        return setTimeout(tryLocalServer, 300); // réessayer
      }
      const target = 'Runaway.m4a';
      const url = 'http://127.0.0.1:' + port + '/audio/' + encodeURIComponent(target);
      // Test HEAD rapide (serveAudio répondra 404 si absent)
      fetch(url, { method:'GET' })
        .then(r=>{
          if(!r.ok){ status.textContent += ' | Runaway.m4a pas trouvé ('+r.status+')'; return; }
          setRiffSource(url, target + ' (serveur local)');
        })
        .catch(()=>{ status.textContent += ' | Serveur local indisponible'; });
    })();

    // Expose minimal API (facultatif)
    window.RiffPlayerAPI = {
      play: ()=> riffPlayer.play(),
      pause: ()=> riffPlayer.pause(),
      stop: ()=> { riffPlayer.pause(); riffPlayer.currentTime=0; },
      setSource: (u)=> setRiffSource(u, u)
    };