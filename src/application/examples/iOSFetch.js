


$('span', {
  // pas besoin de 'tag'
  id: 'verif',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'Je suis un SPAN ! 🎯'
});

let __loremTxtCache = null;

async function __loadLoremText() {
  if (__loremTxtCache) return __loremTxtCache;
  if (typeof fetch !== 'function') throw new Error('fetch indisponible');

  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  const looksIOS = /iPad|iPhone|iPod/.test(ua);
  const port = (typeof window !== 'undefined') ? (window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT) : null;

//   if (looksIOS) {
//     // Sur iOS on veut absolument passer par le serveur local (cohérence AUv3 / app)
//     if (!port) throw new Error('Port local non injecté (iOS)');
//     const url = `http://127.0.0.1:${port}/text/lorem.txt`;
//     const r = await fetch(url).catch(e => { throw new Error('Fetch iOS échoué: ' + e.message); });
//     if (!r.ok) throw new Error('HTTP ' + r.status);
//     const txt = await r.text();
//     if (!txt || !txt.length) throw new Error('Réponse vide');
//     __loremTxtCache = txt; return txt;
//   }

//   // Autres plateformes: si port dispo on l'utilise sinon asset
  if (port) {
    const url = `http://127.0.0.1:${port}/text/lorem.txt`;
    try {
      const r = await fetch(url);
      if (r.ok) {
        const txt = await r.text();
        if (txt && txt.length) { __loremTxtCache = txt; return txt; }
      }
    } catch(_) {}
  }

  // Fallback asset
  const r2 = await fetch('assets/texts/lorem.txt').catch(e => { throw new Error('Fetch asset échoué: ' + e.message); });
  if (!r2.ok) throw new Error('Asset HTTP ' + r2.status);
  const txt2 = await r2.text();
  if (!txt2 || !txt2.length) throw new Error('Asset vide');
  __loremTxtCache = txt2; return txt2;
}

function fct_to_trig(state) {
  console.log('trig: ' + state);
  const span = grab('verif');
//   if (!span) return;
  span.style.backgroundColor = state ? '#0f0' : '#f00';
  span.textContent = 'Chargement…';
  __loadLoremText()
    .then(txt => { span.textContent = txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });
}





const toggle = Button({
    onText: 'ON',
    offText: 'OFF',
    onAction: fct_to_trig,
    offAction: fct_to_trig,
    parent: '#view', // parent direct
    onStyle: { backgroundColor: '#28a745', color: 'white' },
    offStyle: { backgroundColor: '#dc3545', color: 'white' },
    css: {
        position: 'absolute',
        width: '50px',
        height: '24px',
        left: '120px',
        top: '120px',
        borderRadius: '6px',
        backgroundColor: 'orange',
        border: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.3s ease',
        border: '3px solid rgba(255,255,255,0.3)',
        boxShadow: '0 2px 4px rgba(255,255,1,1)',
    }
});
