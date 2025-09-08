
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





////usecase


//svg creator
function create_svg(svgcontent, id = ('svg_' + Math.random().toString(36).slice(2)) , parent_id='view', top = '120px', left = '120px', width = '200px', height = '200px', color = null, path_color = null) {
  const parent = document.getElementById(parent_id);
  

  // Reuse container if present to avoid duplicates
  // let container = document.getElementById('edit-svg-raw');
    // let container = document.getElementById(parent);
    // puts()
  // if (!container) {
  let container = document.createElement('div');
  container.id = id || 'edit-svg-raw';
  // Absolute positioning to respect provided coordinates
  container.style.position = 'absolute';
  container.style.top = top;
  container.style.left = left;
  // Remove inline-block baseline gap issues
  container.style.display = 'block';
  container.style.margin = '0';
  container.style.padding = '0';
  container.style.lineHeight = '0';
  if (parent) parent.appendChild(container);
  // }
  container.innerHTML = svgcontent;

  // Adjust viewBox to fit content if off-canvas
  const svgEl = container.querySelector('svg');
  // ensure the inner <svg> carries the provided id for direct access
  if (svgEl && id) {
    // Avoid duplicating container id on the SVG; use suffix
    try { svgEl.id = id + '_svg'; } catch (_) {}
  }
  if (svgEl && typeof svgEl.querySelector === 'function') {
    // Compute maximum stroke width among common shape elements
    const allShapes = svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline');
    const getStrokeWidth = (el) => {
      let sw = el.getAttribute('stroke-width');
      if (!sw && typeof window !== 'undefined' && window.getComputedStyle) {
        const cs = window.getComputedStyle(el);
        sw = cs && cs.strokeWidth;
      }
      if (typeof sw === 'string') sw = parseFloat(sw);
      return Number.isFinite(sw) ? sw : 0;
    };
    let maxStroke = 0;
    try {
      allShapes.forEach((n) => { const v = getStrokeWidth(n); if (v > maxStroke) maxStroke = v; });
    } catch (_) {}

    const contentNode = svgEl.querySelector('g') || svgEl.querySelector('path') || svgEl;
    if (contentNode && typeof contentNode.getBBox === 'function') {
      const bb = contentNode.getBBox();
      if (bb && isFinite(bb.width) && isFinite(bb.height) && bb.width > 0 && bb.height > 0) {
        const pad = Math.ceil((maxStroke || 0) / 2) + 2; // account for stroke extending outside + small safety
        const x = bb.x - pad;
        const y = bb.y - pad;
        const w = bb.width + pad * 2;
        const h = bb.height + pad * 2;
        svgEl.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }
    }
    // Ensure overflow visibility (mostly for nested <svg>)
    svgEl.style.overflow = 'visible';

  // Apply requested size (numeric extraction once)
  const w = typeof width === 'number' ? width : parseFloat(width) || 200;
  const h = typeof height === 'number' ? height : parseFloat(height) || 200;
  svgEl.setAttribute('width', String(w));
  svgEl.setAttribute('height', String(h));
  svgEl.style.width = `${w}px`;
  svgEl.style.height = `${h}px`;
  // Explicitly size container to eliminate extra vertical space (previous drift 22px vs 16px)
  container.style.width = `${w}px`;
  container.style.height = `${h}px`;

    // Apply colors
    try {
      const shapes = svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline');
      shapes.forEach(node => {
        if (path_color) node.setAttribute('stroke', path_color);
        if (color) {
          const currentFill = node.getAttribute('fill');
          // Only override when fill is not explicitly none, unless we want to force it
          if (currentFill === null || currentFill.toLowerCase() !== 'none') {
            node.setAttribute('fill', color);
          }
        }
      });
      // Optionally set default fill/stroke on root if shapes missing
      if (color && !svgEl.getAttribute('fill')) svgEl.setAttribute('fill', color);
      if (path_color && !svgEl.getAttribute('stroke')) svgEl.setAttribute('stroke', path_color);
    } catch (_) {}
    // Enforce exact visual size based on union bbox of all shapes (contain, preserve aspect)
    try {
      if (!svgEl.__normalizedSize) {
        const shapeNodes = svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline');
        if (shapeNodes.length) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          shapeNodes.forEach(node => {
            try {
              const b = node.getBBox();
              if (b && b.width >= 0 && b.height >= 0) {
                // Include stroke width (getBBox excludes stroke). Use computed style or attribute.
                let sw = node.getAttribute('stroke-width');
                if (!sw && typeof window !== 'undefined' && window.getComputedStyle) {
                  try { sw = window.getComputedStyle(node).strokeWidth; } catch(_){}
                }
                sw = (typeof sw === 'string') ? parseFloat(sw) : sw;
                if (!Number.isFinite(sw)) sw = 0;
                const pad = sw / 2;
                const x0 = b.x - pad;
                const y0 = b.y - pad;
                const x1 = b.x + b.width + pad;
                const y1 = b.y + b.height + pad;
                if (x0 < minX) minX = x0;
                if (y0 < minY) minY = y0;
                if (x1 > maxX) maxX = x1;
                if (y1 > maxY) maxY = y1;
              }
            } catch(_){}
          });
          if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY) && maxX>minX && maxY>minY) {
            const bboxW = maxX - minX;
            const bboxH = maxY - minY;
            const scale = Math.min(w / bboxW, h / bboxH);
            // Centering translation: we apply scale first, then translate in scaled coordinate space
            // Use transform order: scale(s) translate(tx, ty)
            const tx = -minX + (w/scale - bboxW)/2;
            const ty = -minY + (h/scale - bboxH)/2;
            const ns = 'http://www.w3.org/2000/svg';
            const wrapper = document.createElementNS(ns, 'g');
            while (svgEl.firstChild) wrapper.appendChild(svgEl.firstChild);
            wrapper.setAttribute('transform', `scale(${scale}) translate(${tx},${ty})`);
            svgEl.appendChild(wrapper);
            svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
            svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            Object.defineProperty(svgEl, '__normalizedSize', { value: true });
          }
        }
      }
    } catch(_){ /* ignore normalization errors */ }
  }
}



// Player principal (src défini ensuite)
    const audioPlayer = $('audio', {
      id: 'audioPlayer',
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
      }
    });

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
    .then(txt => { create_svg(txt); })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });

  }, 2000   );


      setTimeout(() => {
  // Aperçu (preview) des 120 premiers caractères ou header hex si binaire
  dataFetcher('audios/a.m4a', { mode: 'preview', preview: 120 })
     .then(txt => { span.textContent = '[AUDIO PREVIEW] ' + txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });

  }, 3000   );

  // Nouveau: récupérer l'URL réelle (stream) puis jouer dans la balise audio
  setTimeout(() => {
    dataFetcher('audios/riff.m4a', { mode: 'url' })
      .then(url => {
        const audioEl = grab('audioPlayer');
        if (audioEl) {
          audioEl.src = url;
          // tenter lecture (peut nécessiter interaction utilisateur; fct_to_trig est déclenchée par bouton donc OK)
          const p = audioEl.play();
          if (p && typeof p.catch === 'function') {
            p.catch(e => console.log('lecture refusée:', e.message));
          }
          span.textContent = '[AUDIO PLAY] ' + url.split('/').pop();
        } else {
          span.textContent = 'Audio element introuvable';
        }
      })
      .catch(err => { span.textContent = 'Erreur audio: ' + err.message; });
  }, 3600);
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
