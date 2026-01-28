/**
 * loader
 *
 * Role:
 * - Asset loading utilities with cache and Tauri-aware paths.
 * - Provides SVG rendering helpers for UI.
 */
import { render_svg, sanitizeSVG, fetch_and_render_svg } from './svg_utils.js';

// --- Port persistence (survive refresh) -------------------------------------------------
(function persistLocalPort() {
  if (typeof window === 'undefined') return;
  const k = '__ATOME_LOCAL_HTTP_PORT__';
  // Restore if lost after refresh
  if (!window[k]) {
    try { const saved = localStorage.getItem(k); if (saved) window[k] = parseInt(saved, 10); } catch (_) { }
  }
  // Save if present
  if (window[k]) {
    try { localStorage.setItem(k, String(window[k])); } catch (_) { }
  }
})();

const __dataCache = {};

// Minimal placeholder to avoid ReferenceError if user keeps catch handlers with span
if (typeof window !== 'undefined' && typeof window.span === 'undefined') {
  window.span = { textContent: '' };
}

// (Removed __waitLocalServerReady waiting logic: SVG/data fetch is now immediate on all platforms)

const __inflightData = {};
function dataFetcher(path, opts = {}) {
  const mode = (opts.mode || 'auto').toLowerCase();
  const key = path + '::' + mode + '::' + (opts.preview || '');
  if (__dataCache[key]) return Promise.resolve(__dataCache[key]);
  if (__inflightData[key]) return __inflightData[key];
  if (typeof fetch !== 'function') return Promise.reject(new Error('fetch unavailable'));

  const p = (async () => {
    // Normalize path: remove leading './' or '/', but keep first segment intact
    let cleanPath = (path || '').trim();
    // Remove any leading ./ sequences
    cleanPath = cleanPath.replace(/^(?:\.\/)+/, '');
    // Then strip remaining leading slashes
    cleanPath = cleanPath.replace(/^\/+/, '');
    // Avoid accidental empty segment turning './assets' into '/assets' (handled above)
    if (!cleanPath) throw new Error('Empty path');
    const filename = cleanPath.split('/').pop();
    const ext = (filename.includes('.') ? filename.split('.').pop() : '').toLowerCase();
    const looksSvg = ext === 'svg';
    const hasSpace = cleanPath.includes(' ');
    const port = (typeof window !== 'undefined') ? (window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT) : null;

    const textExt = /^(txt|json|md|svg|xml|csv|log)$/;
    const audioExt = /^(m4a|mp3|wav|ogg|flac|aac)$/;
    const binPreferred = /^(png|jpe?g|gif|webp|avif|bmp|ico|mp4|mov|webm|m4v|woff2?|ttf|otf|pdf)$/;

    const looksText = textExt.test(ext) || /^texts\//.test(cleanPath);
    const looksAudio = audioExt.test(ext);
    const looksBinary = binPreferred.test(ext) || looksAudio; // kept for future branching

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

    const done = v => { __dataCache[key] = v; delete __inflightData[key]; return v; };

    // Helper: detect HTML fallback (index.html returned instead of asset)
    const isHtmlFallback = (txt) => {
      if (!txt) return false; const t = txt.slice(0, 120).toLowerCase(); return t.startsWith('<!doctype html') || t.startsWith('<html');
    };

    // Helper: attempt direct Tauri FS read for svg with space (server often rewrites to index)
    async function tryTauriSvgSpace(fsRelPath) {
      if (!(looksSvg && hasSpace)) return null;
      if (typeof window === 'undefined' || !window.__TAURI__ || !window.__TAURI__.fs) return null;
      const fs = window.__TAURI__.fs;
      // Prefer original path; if starts with assets/ also try src/assets equivalent
      const candidates = [fsRelPath];
      if (/^assets\//.test(fsRelPath) && !/^src\/assets\//.test(fsRelPath)) {
        candidates.unshift('src/' + fsRelPath);
      }
      for (const c of candidates) {
        try {
          const txt = await fs.readTextFile(c).catch(() => null);
          if (txt && /^<svg[\s>]/i.test(txt.trim()) && !isHtmlFallback(txt)) return { txt, path: c };
        } catch (_) { }
      }
      return null;
    }

    // 1) Direct FS read first for svg with space (most robust after refresh)
    const directFs = await tryTauriSvgSpace(cleanPath);
    if (directFs) {
      if (mode === 'preview' || opts.preview) { const max = opts.preview || 120; return done(directFs.txt.slice(0, max)); }
      return done(directFs.txt);
    }
    // Immediate asset try if no port yet
    if (!port) {
      for (const u of assetCandidates) {
        try {
          if (looksText || mode === 'text' || mode === 'preview') {
            const r = await fetch(u); if (!r.ok) continue;
            const txt = await r.text();
            if (looksSvg && isHtmlFallback(txt)) { continue; }
            if (mode === 'preview' || opts.preview) { const max = opts.preview || 120; return done(txt.slice(0, max)); }
            return done(txt);
          }
          if (mode === 'arraybuffer') { const r = await fetch(u); if (!r.ok) continue; return done(await r.arrayBuffer()); }
          if (mode === 'blob') { const r = await fetch(u); if (!r.ok) continue; return done(await r.blob()); }
          const r = await fetch(u); if (!r.ok) continue; return done(u);
        } catch (_) { }
      }
    }

    if (mode === 'url') {
      const out = serverCandidates[0] || assetCandidates[0];
      return done(out);
    }
    for (const u of serverCandidates) {
      try {
        const r = await fetch(u);
        if (!r.ok) continue;
        if (mode === 'arraybuffer') return done(await r.arrayBuffer());
        if (mode === 'blob') return done(await r.blob());
        if (looksText || mode === 'text' || mode === 'preview') {
          const txt = await r.text();
          if (looksSvg && isHtmlFallback(txt)) { continue; }
          if (mode === 'preview' || opts.preview) {
            const max = opts.preview || 120; return done(txt.slice(0, max));
          }
          return done(txt);
        }
        if (looksAudio && mode === 'auto') return done(u); // streaming URL path
        return done(u);
      } catch (_) { }
    }
    for (const u of assetCandidates) {

      try {
        if (looksText || mode === 'text' || mode === 'preview') {

          const r = await fetch(u); if (!r.ok) continue;
          const txt = await r.text();
          if (looksSvg && isHtmlFallback(txt)) { continue; }
          if (mode === 'preview' || opts.preview) { const max = opts.preview || 120; return done(txt.slice(0, max)); }
          return done(txt);
        }
        if (mode === 'arraybuffer') {

          const r = await fetch(u); if (!r.ok) continue; return done(await r.arrayBuffer());
        }
        if (mode === 'blob') {
          const r = await fetch(u); if (!r.ok) continue; return done(await r.blob());
        }
        return done(u);
      } catch (_) { }
    }

    delete __inflightData[key];
    throw new Error('Not found (candidates: ' + [...serverCandidates, ...assetCandidates].join(', ') + ')');
  })();
  __inflightData[key] = p;
  return p;
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

window.dataFetcher = dataFetcher;
window.render_svg = render_svg;
window.fetch_and_render_svg = fetch_and_render_svg;
window.resize = resize;
window.strokeColor = strokeColor;
window.fillColor = fillColor;

export {
  dataFetcher,
  render_svg,
  fetch_and_render_svg,
  resize,
  strokeColor,
  fillColor,
  sanitizeSVG,
};
