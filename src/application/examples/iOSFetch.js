


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
  const cleanPath = (path || '').trim().replace(/^\/+/, '');
  const filename = cleanPath.split('/').pop();
  const port = (typeof window !== 'undefined') ? (window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT) : null;

  // 1. Serveur local si port dispo
  if (port) {
    // On n'utilise /text/<filename> que pour les chemins textuels (dossier texts/ ou extension .txt/.json)
    const isTextish = /\.(txt|json|md)$/i.test(filename) || /^texts\//.test(cleanPath);
    if (isTextish) {
      const encodedPath = encodeURI(cleanPath); // conserve sous-dossiers
      const serverURL = `http://127.0.0.1:${port}/text/${encodedPath}`;
      try {
        const r = await fetch(serverURL);
        if (r.ok) {
          const txt = await r.text();
          if (txt && txt.length) { __dataCache[key] = txt; return txt; }
        }
      } catch(_) {}
    }
  }

  // 2. Fallback asset: conserver l'arborescence demandée dans assets/
  // Exemples d'entrées acceptées: 'texts/lorem.txt', 'icons/app/logo.svg', 'assets/texts/lorem.txt'
  const sanitized = cleanPath.replace(/^[.\\/]+/, '');
  const assetCandidatesSet = new Set();
  if (sanitized.startsWith('assets/')) assetCandidatesSet.add(sanitized);
  assetCandidatesSet.add('assets/' + sanitized);
  // On tente d'abord l'arborescence exacte; puis fallback vers le fichier seul si échec
  assetCandidatesSet.add('assets/' + filename);
  const assetCandidates = Array.from(assetCandidatesSet);

  for (const assetURL of assetCandidates) {
    try {
      const r2 = await fetch(assetURL);
      if (r2.ok) {
        const txt2 = await r2.text();
        if (txt2 && txt2.length) { __dataCache[key] = txt2; return txt2; }
      }
    } catch(_) {}
  }

  throw new Error('Asset introuvable (candidats: ' + assetCandidates.join(', ') + ')');
}

function fct_to_trig(state) {
  console.log('trig: ' + state);
  const span = grab('verif');
//   if (!span) return;
  span.style.backgroundColor = state ? '#0f0' : '#f00';
  span.textContent = 'Chargement…';
//   dataFetcher('texts/lorem.txt')
  dataFetcher('texts/lorem.txt')
    .then(txt => { span.textContent = txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });


      setTimeout(() => {
//   dataFetcher('texts/lorem.txt')
  dataFetcher('audios/testing.txt')
    .then(txt => { span.textContent = txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });


  }, 1000   );


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
