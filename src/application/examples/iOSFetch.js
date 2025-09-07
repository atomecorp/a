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

async function dataFetcher(path, opts = {}) {
  const mode = (opts.mode || 'auto').toLowerCase(); // auto|text|url|arraybuffer|blob|preview
  const key = path + '::' + mode + '::' + (opts.preview||'');
  if (__dataCache[key]) return __dataCache[key];
  if (typeof fetch !== 'function') throw new Error('fetch indisponible');

  let cleanPath = (path || '').trim().replace(/^\/+/,'').replace(/^[.]+/,'');
  if (!cleanPath) throw new Error('Chemin vide');
  const filename = cleanPath.split('/').pop();
  const ext = (filename.includes('.') ? filename.split('.').pop() : '').toLowerCase();
  const port = (typeof window !== 'undefined') ? (window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT) : null;

  const textExt = /^(txt|json|md|svg|xml|csv|log)$/;
  const audioExt = /^(m4a|mp3|wav|ogg|flac|aac)$/;
  const binPreferred = /^(png|jpe?g|gif|webp|avif|bmp|ico|mp4|mov|webm|m4v|woff2?|ttf|otf|pdf)$/;

  const looksText = textExt.test(ext) || /^texts\//.test(cleanPath);
  const looksAudio = audioExt.test(ext);
  const looksBinary = binPreferred.test(ext) || looksAudio;

  const serverCandidates = [];
  if (port) {
    // unified endpoint first
    serverCandidates.push(`http://127.0.0.1:${port}/file/${encodeURI(cleanPath)}`);
    if (looksText) {
      serverCandidates.push(`http://127.0.0.1:${port}/text/${encodeURI(cleanPath)}`);
    }
    if (looksAudio) {
      serverCandidates.push(`http://127.0.0.1:${port}/audio/${encodeURIComponent(filename)}`);
      serverCandidates.push(`http://127.0.0.1:${port}/audio/${encodeURI(cleanPath)}`);
    }
  }

  let assetPath = cleanPath;
  if (!/^(assets|src\/assets)\//.test(assetPath)) assetPath = 'assets/' + assetPath;
  const assetCandidates = [assetPath];
  const altAsset = assetPath.replace(/^assets\//, 'src/assets/');
  if (altAsset !== assetPath) assetCandidates.push(altAsset);

  if (mode === 'url') {
    const out = serverCandidates[0] || assetCandidates[0];
    __dataCache[key] = out; return out;
  }
  const done = v => { __dataCache[key] = v; return v; };

  for (const u of serverCandidates) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      if (mode === 'arraybuffer') return done(await r.arrayBuffer());
      if (mode === 'blob') return done(await r.blob());
      if (looksText || mode === 'text' || mode === 'preview') {
        const txt = await r.text();
        if (mode === 'preview' || opts.preview) {
          const max = opts.preview || 120; return done(txt.slice(0,max));
        }
        return done(txt);
      }
      if (looksAudio && mode === 'auto') return done(u); // streaming URL
      return done(u); // generic binary
    } catch(_) {}
  }

  for (const u of assetCandidates) {
    try {
      if (looksText || mode === 'text' || mode === 'preview') {
        const r = await fetch(u); if (!r.ok) continue;
        const txt = await r.text();
        if (mode === 'preview' || opts.preview) { const max = opts.preview || 120; return done(txt.slice(0,max)); }
        return done(txt);
      }
      if (mode === 'arraybuffer') { const r = await fetch(u); if (!r.ok) continue; return done(await r.arrayBuffer()); }
      if (mode === 'blob') { const r = await fetch(u); if (!r.ok) continue; return done(await r.blob()); }
      return done(u);
    } catch(_) {}
  }

  throw new Error('Introuvable (candidats: ' + [...serverCandidates, ...assetCandidates].join(', ') + ')');
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
  dataFetcher('images/logos/arp.svg')
    .then(txt => { span.textContent = txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });

  }, 1000   );

      setTimeout(() => {
  dataFetcher('images/logos/atome.svg')
    .then(txt => { span.textContent = txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });

  }, 2000   );


      setTimeout(() => {
  // Aperçu (preview) des 120 premiers caractères ou header hex si binaire
  dataFetcher('audios/a.m4a', { mode: 'preview', preview: 120 })
     .then(txt => { span.textContent = '[AUDIO PREVIEW] ' + txt; })
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
