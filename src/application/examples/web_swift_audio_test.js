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

// Lien direct (port fixe 60406) pour tester accès brut au fichier depuis WebView
$('a', {
  id: 'direct_alive_link_60406',
  attrs: { href: 'http://127.0.0.1:60406/audio/Alive.m4a' },
  text: 'Lien direct Alive.m4a (port 60406)',
  css: { display: 'block', margin: '10px', fontSize: '14px', color: '#0af', textDecoration: 'underline' }
});

// Charge my_test.txt depuis le serveur local et met le contenu dans #server_test
(function pollPort(){
  if(typeof window.__ATOME_LOCAL_HTTP_PORT__ === 'undefined') { return setTimeout(pollPort,100); }
  const span = document.getElementById('server_test');
  const url = 'http://127.0.0.1:' + window.__ATOME_LOCAL_HTTP_PORT__ + '/text/my_test.txt';
  span.textContent = 'requête: ' + url;
  fetch(url).then(r=>{
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.text();
  }).then(txt=>{
    span.textContent = txt;
  }).catch(e=>{
    span.textContent = 'erreur: '+e.message;
  });

  // Ajout audio minimal (lecture manuelle après chargement OK)
  const audioURL = 'http://127.0.0.1:' + window.__ATOME_LOCAL_HTTP_PORT__ + '/audio/Alive.m4a';
  const a = $('audio', {
    id: 'alive_http_player',
    attrs: { controls: true, playsinline: true },
    css: { display: 'block', margin: '10px', width: '320px' }
  });
  a.src = audioURL;
  console.log('[audio] element ajouté src=', audioURL);
})();
