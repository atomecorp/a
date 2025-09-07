


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

const __dataCache = {};

async function dataFetcher(path) {
  const key = path;
  if (__dataCache[key]) return __dataCache[key];
  if (typeof fetch !== 'function') throw new Error('fetch indisponible');

  // Nettoyage chemin (pour URL serveur)
  let cleanPath = (path || '').trim().replace(/^\/+/, '').replace(/^[.]+/, '');
  if (!cleanPath) throw new Error('Chemin vide');
  const filename = cleanPath.split('/').pop();
  const port = (typeof window !== 'undefined') ? (window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT) : null;

  // Textish => tentative serveur iOS/AUv3
  const isTextish = /\.(txt|json|md|svg)$/i.test(filename) || /^texts\//.test(cleanPath);
  if (port && isTextish) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/text/${encodeURI(cleanPath)}`);
      if (r.ok) {
        const txt = await r.text();
        if (txt && txt.length) { __dataCache[key] = txt; return txt; }
      }
    } catch(_) { /* ignore */ }
  }

  // Normalisation: si l'appelant n'a pas mis assets/ ou src/assets/, on préfixe automatiquement assets/
  if (!/^(assets|src\/assets)\//.test(cleanPath)) {
    cleanPath = 'assets/' + cleanPath;
  }

  // Liste minimale de fallback (éviter explosion): chemin direct + variante src/assets/
  const variants = [cleanPath];
  const alt = cleanPath.replace(/^assets\//, 'src/assets/');
  if (alt !== cleanPath) variants.push(alt);

  for (const url of variants) {
    try {
      const r2 = await fetch(url);
      if (r2.ok) {
        const txt2 = await r2.text();
        if (txt2 && txt2.length) { __dataCache[key] = txt2; return txt2; }
      }
    } catch(_) { /* ignore */ }
  }

  throw new Error('Introuvable: ' + variants.join(' | '));
}

function fct_to_trig(state) {
  console.log('trig: ' + state);
  const span = grab('verif');
//   if (!span) return;
  span.style.backgroundColor = state ? 'rgba(26, 61, 26, 1)' : '#f00';
  span.textContent = 'Chargement…';
  dataFetcher('texts/lorem.txt')
    .then(txt => { span.textContent = txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });


      setTimeout(() => {
  dataFetcher('audios/a.txt')
     .then(txt => { span.textContent = txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });

  }, 1000   );

      setTimeout(() => {
  dataFetcher('images/logos/arp.svg')
    .then(txt => { span.textContent = txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });

  }, 2000   );

      setTimeout(() => {
  dataFetcher('images/logos/atome.svg')
    .then(txt => { span.textContent = txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });

  }, 3000   );


  
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
