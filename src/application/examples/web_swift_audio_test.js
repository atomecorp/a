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

// Lien direct (port dynamique) pour tester accès brut au fichier depuis WebView
(function setupDynamicDirectLink(){
  function applyLink(){
    const port = window.ATOME_LOCAL_HTTP_PORT || window.__ATOME_LOCAL_HTTP_PORT__;
    if(!port){ return setTimeout(applyLink,100); }
    let a = document.getElementById('direct_audio_link_dynamic');
    if(!a){
      a = $('a', {
        id: 'direct_audio_link_dynamic',
        attrs: { href: '#'},
        text: 'Audio direct (scan en cours ...)',
        css: { display: 'block', margin: '10px', fontSize: '14px', color: '#0af', textDecoration: 'underline', opacity:0.5 }
      });
    }
  }
  applyLink();
})();

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

  // Ajout audio minimal (lecture manuelle après chargement OK)
  // On récupère l'arbre pour trouver un .m4a présent (ex: Recordings/GhostBox.m4a)
  fetch('http://127.0.0.1:' + dynamicPort + '/tree')
    .then(r=>r.json())
    .then(treeData => {
      function findFirstM4A(node, prefix=""){
        const path = prefix ? prefix + '/' + node.name : node.name;
        if(!node.isDirectory && node.name.toLowerCase().endsWith('.m4a')) { return path; }
        if(node.children){
          for(const c of node.children){
            const found = findFirstM4A(c, path);
            if(found) return found;
          }
        }
        return null;
      }
      const rootNode = treeData.tree;
      const found = findFirstM4A(rootNode) || findFirstM4A(rootNode, '');
      if(!found){
        console.warn('Aucun fichier .m4a trouvé dans /tree');
        $('div', { text: '⚠️ Aucun fichier .m4a trouvé dans Documents', css:{color:'#f66',margin:'10px'} });
        const link = document.getElementById('direct_audio_link_dynamic');
        if(link){ link.textContent='Aucun audio trouvé'; link.style.opacity=0.5; link.removeAttribute('href'); }
        return;
      }
      // Le root.name est normalement "Documents"; on enlève ce préfixe si présent
      let relative = found;
      if(relative.startsWith('Documents/')) { relative = relative.substring('Documents/'.length); }
      const audioURL = 'http://127.0.0.1:' + dynamicPort + '/audio/' + encodeURI(relative);
      const a = $('audio', {
        id: 'alive_http_player',
        attrs: { controls: true, playsinline: true },
        css: { display: 'block', margin: '10px', width: '320px' }
      });
      a.src = audioURL;
      $('div', { text: 'Lecture de: ' + relative, css:{margin:'4px',fontSize:'12px',color:'#ccc'} });
      console.log('[audio] element ajouté src=', audioURL);
      const link = document.getElementById('direct_audio_link_dynamic');
      if(link){
        link.textContent = 'Lien direct '+relative;
        link.href = audioURL;
        link.style.opacity = 1;
      }
    })
    .catch(err=>{
      console.error('Erreur /tree', err);
      $('div', { text: 'Erreur chargement /tree: '+err.message, css:{color:'#f66',margin:'10px'} });
    });
})();


