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



$('span', {
  // pas besoin de 'tag'
  id: 'server_test',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: "j'attend le serveur ....."
});

// Ancien lien direct supprimé; on jouera directement Runaway.m4a

// Charge my_test.txt depuis le serveur local et met le contenu dans #server_test
(function pollPort(){
  const dynamicPort = window.ATOME_LOCAL_HTTP_PORT || window.__ATOME_LOCAL_HTTP_PORT__;
  if(typeof dynamicPort === 'undefined') { return setTimeout(pollPort,100); }
  const span = document.getElementById('server_test');
  // Séquence de recherche pour un fichier texte: racine puis sous-dossier "text" puis README.txt
  const textCandidates = ['my_test.txt','text/my_test.txt','README.txt'];
  function tryNextText(){
    if(!textCandidates.length){
      span.textContent = 'Aucun fichier texte de test trouvé (my_test.txt ou text/my_test.txt). Scan audio...';
      return;
    }
    const name = textCandidates.shift();
    const testTextUrl = 'http://127.0.0.1:' + dynamicPort + '/text/' + name;
    span.textContent = 'requête: ' + testTextUrl + ' (en attente ...)';
    fetch(testTextUrl).then(r=>{
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.text();
    }).then(txt=>{
      span.textContent = txt + '  (source: '+name+')';
    }).catch(()=>{
      tryNextText();
    });
  }
  tryNextText();

  // Lecture directe du fichier ciblé Runaway.m4a dans le dossier audio
  const targetRelative = 'audio/Runaway.m4a';
  const audioURL = 'http://127.0.0.1:' + dynamicPort + '/audio/' + targetRelative.split('/').map(encodeURIComponent).join('/');
  const player = $('audio', {
    id: 'runaway_player',
    attrs: { controls: true, playsinline: true },
    css: { display: 'block', margin: '10px', width: '320px' }
  });
  player.src = audioURL;
  const infoDiv = $('div', { id:'runaway_player_info', text: 'Lecture de: ' + targetRelative, css:{margin:'4px',fontSize:'12px',color:'#ccc'} });
  // Input box (Squirrel) pour afficher/modifier le chemin courant
  const pathInput = $('input', {
    id: 'runaway_player_source',
    attrs: { type: 'text', value: targetRelative, spellcheck: false },
    css: {
      display: 'block',
      margin: '6px 10px',
      width: '320px',
      padding: '6px 8px',
      background: '#101010',
      color: '#eee',
      border: '1px solid #333',
      borderRadius: '4px',
      fontFamily: 'monospace',
      fontSize: '12px'
    },
    on: {
      change: updateAudioSource,
      keydown: e => { if(e.key === 'Enter') updateAudioSource(); }
    }
  });

  // Bouton de validation (Squirrel)
  Button({
    id: 'runaway_player_load_btn',
    onText: 'Load', offText: 'Load',
    onAction: ()=> updateAudioSource(),
    offAction: ()=> updateAudioSource(),
    css: { margin:'4px 10px 10px 10px', width:'70px', height:'26px' }
  });

  function updateAudioSource(){
    let val = pathInput.value.trim();
    if(!val) return;
    // URL absolue ?
    let newURL;
    if(/^[a-z]+:\/\//i.test(val)) {
      newURL = val;
    } else {
      // Normaliser: retirer éventuel préfixe audio/ déjà présent pour éviter doublon
      const rel = val.replace(/^\/+/, '');
      const cleaned = rel.startsWith('audio/') ? rel.slice('audio/'.length) : rel;
      newURL = 'http://127.0.0.1:' + dynamicPort + '/audio/' + cleaned.split('/').map(encodeURIComponent).join('/');
    }
    console.log('[audio] switch ->', newURL, ' (from input:', val, ')');
    player.pause();
    player.src = newURL;
    player.load();
    player.play().catch(()=>{});
    infoDiv.textContent = 'Lecture de: ' + val;
  }
  console.log('[audio] lecture directe Runaway ->', audioURL);
})();


