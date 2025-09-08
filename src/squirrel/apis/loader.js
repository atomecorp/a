const __dataCache = {};

// Minimal placeholder to avoid ReferenceError if user keeps catch handlers with span
if (typeof window !== 'undefined' && typeof window.span === 'undefined') {
  window.span = { textContent: '' };
}

// --- Local server readiness (single global health probe) ---
let __localServerReady = false;
let __localServerReadyPromise = null;
async function __waitLocalServerReady(){
  if (__localServerReady) return true;
  if (__localServerReadyPromise) return __localServerReadyPromise;
  __localServerReadyPromise = (async () => {
    // Retry /health until OK or fallback after maxAttempts so UI doesn't block forever.
    const maxAttempts = 25; // ~3.7s at 150ms
    for (let attempt=0; attempt < maxAttempts; attempt++) {
      try {
        const port = window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT;
        if (port) {
          try {
            const resp = await fetch(`http://127.0.0.1:${port}/health?ts=${Date.now()}`, { cache: 'no-store' });
            if (resp.ok) { __localServerReady = true; return true; }
          } catch(_) { /* health fetch failed, will retry */ }
        }
      } catch(_) {}
      await new Promise(r => setTimeout(r, 150));
    }
    // Fallback: proceed anyway (asset relative fetch will still work). Mark as ready to avoid future waits.
    __localServerReady = true;
    return false;
  })();
  return __localServerReadyPromise;
}
// -----------------------------------------------------------

async function dataFetcher(path, opts = {}) {
  const mode = (opts.mode || 'auto').toLowerCase(); // auto|text|url|arraybuffer|blob|preview
  const key = path + '::' + mode + '::' + (opts.preview||'');
  if (__dataCache[key]) return __dataCache[key];
  if (typeof fetch !== 'function') throw new Error('fetch indisponible');

  let cleanPath = (path || '').trim().replace(/^\/+/,'').replace(/^[.]+/,'');
  if (!cleanPath) throw new Error('Chemin vide');
  const filename = cleanPath.split('/').pop();
  const ext = (filename.includes('.') ? filename.split('.').pop() : '').toLowerCase();
  // Kick off (non bloquant) readiness probe if not started
  const port = (typeof window !== 'undefined') ? (window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT) : null;
  if (typeof window !== 'undefined' && !__localServerReady && !__localServerReadyPromise) { __waitLocalServerReady(); }

  const textExt = /^(txt|json|md|svg|xml|csv|log)$/;
  const audioExt = /^(m4a|mp3|wav|ogg|flac|aac)$/;
  const binPreferred = /^(png|jpe?g|gif|webp|avif|bmp|ico|mp4|mov|webm|m4v|woff2?|ttf|otf|pdf)$/;

  const looksText = textExt.test(ext) || /^texts\//.test(cleanPath);
  const looksAudio = audioExt.test(ext);
  const looksBinary = binPreferred.test(ext) || looksAudio;

  const serverCandidates = [];
  if (port) {
    serverCandidates.push(`http://127.0.0.1:${port}/file/${encodeURI(cleanPath)}`);
    if (looksText) serverCandidates.push(`http://127.0.0.1:${port}/text/${encodeURI(cleanPath)}`);
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

  // If no port yet (iOS race) try assets immediately; if success we return now.
  if (!port) {
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
        const r = await fetch(u); if (!r.ok) continue; return done(u);
      } catch(_) {}
    }
    // If assets failed, do a short rapid poll for port (<= 900ms) so first icon still precedes second (setTimeout 1000)
    const startPoll = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    while (true) {
      const pNow = window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT;
      if (pNow) {
        // update and build candidates then break to normal flow
        serverCandidates.push(`http://127.0.0.1:${pNow}/file/${encodeURI(cleanPath)}`);
        if (looksText) serverCandidates.push(`http://127.0.0.1:${pNow}/text/${encodeURI(cleanPath)}`);
        if (looksAudio) {
          serverCandidates.push(`http://127.0.0.1:${pNow}/audio/${encodeURIComponent(filename)}`);
          serverCandidates.push(`http://127.0.0.1:${pNow}/audio/${encodeURI(cleanPath)}`);
        }
        break;
      }
      const nowT = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (nowT - startPoll > 900) break;
      await new Promise(r => setTimeout(r, 60));
    }
  }

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


//svg creator
function render_svg(svgcontent, id = ('svg_' + Math.random().toString(36).slice(2)), parent_id='view', top='0px', left='0px', width='100px', height='100px', color=null, path_color=null) {
  const parent = document.getElementById(parent_id);
  if (!parent) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = svgcontent.trim();
  const svgEl = tmp.querySelector('svg');
  if (!svgEl) return null;
  try { svgEl.id = id + '_svg'; } catch(_) {}
  svgEl.classList.add('__auto_svg');
  svgEl.style.position = 'absolute';
  svgEl.style.top = top; svgEl.style.left = left;
  const targetW = typeof width === 'number' ? width : parseFloat(width) || 200;
  const targetH = typeof height === 'number' ? height : parseFloat(height) || 200;
  svgEl.style.width = targetW + 'px';
  svgEl.style.height = targetH + 'px';
  // Insert first (hidden) so getBBox works for all browsers
  const prevVisibility = svgEl.style.visibility;
  svgEl.style.visibility = 'hidden';
  parent.appendChild(svgEl);
  // Collect shapes & compute bbox (inflated by stroke width/2 so strokes aren't clipped)
  const shapes = svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line');
  const getStrokeWidth = (el) => {
    let sw = el.getAttribute('stroke-width');
    if ((!sw || sw === '0' || sw === '') && typeof window !== 'undefined' && window.getComputedStyle) {
      try { sw = window.getComputedStyle(el).strokeWidth; } catch(_) {}
    }
    sw = parseFloat(sw);
    return Number.isFinite(sw) ? sw : 0;
  };
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  shapes.forEach(node => {
    try {
      const b = node.getBBox();
      if (b && b.width >= 0 && b.height >= 0) {
        const sw = getStrokeWidth(node);
        const pad = sw/2; // stroke extends equally each side
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
  const bboxValid = isFinite(minX)&&isFinite(minY)&&isFinite(maxX)&&isFinite(maxY)&&maxX>minX&&maxY>minY;
  if (bboxValid) {
    const bboxW = maxX-minX, bboxH = maxY-minY;
    const scale = Math.max(targetW / bboxW, targetH / bboxH); // cover
    const tx = (targetW - bboxW*scale)/2 - minX*scale;
    const ty = (targetH - bboxH*scale)/2 - minY*scale;
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns,'g');
    while (svgEl.firstChild) g.appendChild(svgEl.firstChild);
    g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
    svgEl.appendChild(g);
    svgEl.setAttribute('viewBox', `0 0 ${targetW} ${targetH}`);
    svgEl.setAttribute('preserveAspectRatio','none');
  } else {
    // Fallback: keep original coordinate system so large coords remain visible when scaled by CSS
    if (!svgEl.getAttribute('viewBox')) {
      const origW = parseFloat(svgEl.getAttribute('width')) || targetW;
      const origH = parseFloat(svgEl.getAttribute('height')) || targetH;
      svgEl.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
      svgEl.setAttribute('preserveAspectRatio','xMidYMid meet');
    }
  }
  // Colors
  if ((color || path_color) && shapes.length) {
    shapes.forEach(node => {
      if (path_color) node.setAttribute('stroke', path_color);
      if (color) {
        const f = node.getAttribute('fill');
        if (f === null || f.toLowerCase() !== 'none') node.setAttribute('fill', color);
      }
    });
    if (color && !svgEl.getAttribute('fill')) svgEl.setAttribute('fill', color);
    if (path_color && !svgEl.getAttribute('stroke')) svgEl.setAttribute('stroke', path_color);
  }
  svgEl.style.visibility = prevVisibility || 'visible';
  return svgEl.id;
}




function resize(id, newWidth, newHeight, durationSec = 0, easing = 'ease') {
  let el = document.getElementById(id);
  if (!el) return false;
  if (!(el instanceof SVGElement)) {
    el = el.querySelector ? el.querySelector('svg') : null;
  }
  if (!el) return false;

  const w = typeof newWidth === 'number' ? newWidth : parseFloat(newWidth);
  const h = (newHeight == null) ? w : (typeof newHeight === 'number' ? newHeight : parseFloat(newHeight));
  if (!isFinite(w) || !isFinite(h)) return false;

  const ms = Math.max(0, (typeof durationSec === 'number' ? durationSec : parseFloat(durationSec)) * 1000);
  // Special easings using WAAPI for bounce/elastic effects when available
  if (ms && (easing === 'bounce' || easing === 'elastic') && typeof el.animate === 'function') {
    const cs = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(el) : null;
    const currentW = (cs ? parseFloat(cs.width) : 0) || parseFloat(el.getAttribute('width')) || w;
    const currentH = (cs ? parseFloat(cs.height) : 0) || parseFloat(el.getAttribute('height')) || h;

    let keyframes;
    if (easing === 'bounce') {
      keyframes = [
        { offset: 0, width: `${currentW}px`, height: `${currentH}px` },
        { offset: 0.6, width: `${w * 1.10}px`, height: `${h * 1.10}px` },
        { offset: 0.8, width: `${w * 0.94}px`, height: `${h * 0.94}px` },
        { offset: 0.92, width: `${w * 1.03}px`, height: `${h * 1.03}px` },
        { offset: 1, width: `${w}px`, height: `${h}px` },
      ];
    } else { // elastic
      keyframes = [
        { offset: 0, width: `${currentW}px`, height: `${currentH}px` },
        { offset: 0.5, width: `${w * 1.25}px`, height: `${h * 1.25}px` },
        { offset: 0.7, width: `${w * 0.90}px`, height: `${h * 0.90}px` },
        { offset: 0.85, width: `${w * 1.05}px`, height: `${h * 1.05}px` },
        { offset: 1, width: `${w}px`, height: `${h}px` },
      ];
    }

    const anim = el.animate(keyframes, { duration: ms, easing: 'linear', fill: 'forwards' });
    const done = () => {
      el.setAttribute('width', String(w));
      el.setAttribute('height', String(h));
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    };
    try {
      // Some engines support addEventListener on Animation, others use onfinish
      if (typeof anim.addEventListener === 'function') {
        anim.addEventListener('finish', done, { once: true });
      } else {
        anim.onfinish = done;
      }
      setTimeout(done, ms + 50);
    } catch (_) {
      anim.onfinish = done;
      setTimeout(done, ms + 50);
    }
    return true;
  }
  if (!ms) {
    // instant resize
    el.setAttribute('width', String(w));
    el.setAttribute('height', String(h));
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    return true;
  }

  const prevTransition = el.style.transition;
  // Animate CSS width/height; attributes updated at the end to keep them in sync
  el.style.transition = `width ${ms}ms ${easing}, height ${ms}ms ${easing}`;
  // Force reflow to ensure transition takes effect
  void el.offsetWidth; // eslint-disable-line no-unused-expressions

  // Apply target sizes via CSS to animate
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;

  const done = () => {
    // Sync SVG attributes and cleanup transition
    el.setAttribute('width', String(w));
    el.setAttribute('height', String(h));
    el.style.transition = prevTransition || '';
  };

  try {
    el.addEventListener('transitionend', function handler(ev) {
      if (ev.propertyName === 'width' || ev.propertyName === 'height') {
        el.removeEventListener('transitionend', handler);
        done();
      }
    });
    // Safety timeout in case transitionend doesn't fire
    setTimeout(done, ms + 50);
  } catch (_) {
    // Fallback: apply instantly if events not supported
    done();
  }
  return true;
}


function strokeColor(id, color) {
  let el = document.getElementById(id);
  if (!el) return false;
  if (!(el instanceof SVGElement)) {
    el = el.querySelector ? el.querySelector('svg') : null;
  }
  if (!el) return false;
  try {
    const shapes = el.querySelectorAll('path, rect, circle, ellipse, polygon, polyline');
    shapes.forEach(node => {
      node.setAttribute('stroke', color);
    });
    // Optionally set default stroke on root if shapes missing
    if (!el.getAttribute('stroke')) el.setAttribute('stroke', color);
  } catch (_) { return false; }
  return true;
}   


function fillColor(id, color) {     
  let el = document.getElementById(id);
  if (!el) return false;
  if (!(el instanceof SVGElement)) {
    el = el.querySelector ? el.querySelector('svg') : null;
  }
  if (!el) return false;
  try {
    const shapes = el.querySelectorAll('path, rect, circle, ellipse, polygon, polyline');
    shapes.forEach(node => {
      node.setAttribute('fill', color);
    });
    // Optionally set default fill on root if shapes missing
    if (!el.getAttribute('fill')) el.setAttribute('fill', color);
  } catch (_) { return false; }
  return true;
}     


window.render_svg = render_svg;
window.dataFetcher = dataFetcher;
window.resize = resize;
window.strokeColor = strokeColor;
window.fillColor = fillColor;
