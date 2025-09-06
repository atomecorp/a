function create_svg(svgcontent, top = '0px', left = '0px', width = '200px', height = '200px', color = null, path_color = null, id , parent_id) {
  const parent = document.getElementById(parent_id);
  

  // Reuse container if present to avoid duplicates
  // let container = document.getElementById('edit-svg-raw');
    // let container = document.getElementById(parent);
    // puts()
  // if (!container) {
  let container = document.createElement('div');
    container.id = id || 'edit-svg-raw';
    container.style.display = 'inline-block';
    container.style.marginLeft = '0px';
    container.style.marginTop = '0px';
   // Use absolute so top/left are interpreted exactly as requested coordinates
   container.style.position = 'absolute';
    container.style.top = top;
    container.style.left = left;
    // container.style.width = width + 'px';
    // container.style.height = height + 'px';
    // container.style.border = '1px solid blue';
    if (parent)
    parent.appendChild(container);
  // }
  container.innerHTML = svgcontent;

  // Adjust viewBox to fit content if off-canvas
  const svgEl = container.querySelector('svg');
  // ensure the inner <svg> carries the provided id for direct access
  if (svgEl && id) {
    try { svgEl.id = id; } catch (_) {}
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

    // Apply requested size
    const w = typeof width === 'number' ? width : parseFloat(width) || 200;
    const h = typeof height === 'number' ? height : parseFloat(height) || 200;
    svgEl.setAttribute('width', String(w));
    svgEl.setAttribute('height', String(h));
    svgEl.style.width = `${w}px`;
    svgEl.style.height = `${h}px`;

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



function get_file_content(pathArg) {
  return new Promise((resolve, reject) => {
    if (typeof pathArg !== 'string') {
      const err = new Error('path must be a string');
      reject(err);
      return;
    }

    const resolveWith = (text) => resolve(text);

    // Try fetch first (browser/runtime)
  if (typeof fetch === 'function') {
      fetch(pathArg)
        .then(resp => {
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.text();
        })
        .then(text => resolveWith(text))
        .catch(err => {
          // fallback to fs when available (only if globalThis.require exists)
          if (typeof globalThis !== 'undefined' && typeof globalThis.require === 'function') {
            try {
              const fs = globalThis.require('fs');
              const path = globalThis.require('path');
              const isAbs = path.isAbsolute(pathArg);
              const filePath = isAbs
                ? pathArg
                : (typeof __dirname !== 'undefined' ? path.join(__dirname, pathArg) : pathArg);
              const content = fs.readFileSync(filePath, 'utf8');
              resolveWith(content);
            } catch (e) { reject(e); }
          } else { reject(err); }
        });
      return;
    }

    // If fetch not available but Node-style require is
    if (typeof globalThis !== 'undefined' && typeof globalThis.require === 'function') {
      try {
        const fs = globalThis.require('fs');
        const path = globalThis.require('path');
        const isAbs = path.isAbsolute(pathArg);
        const filePath = isAbs
          ? pathArg
          : (typeof __dirname !== 'undefined' ? path.join(__dirname, pathArg) : pathArg);
        const content = fs.readFileSync(filePath, 'utf8');
        resolveWith(content);
      } catch (e) { reject(e); }
      return;
    }

    reject(new Error('No fetch() or require() available to load file'));
  });
}



function fetch_and_render_svg(path, left= '0px', top= '0px', width = '200px', height = '200px', color = 'lightgray', path_color = 'lightgray', id=null, parent_id='view') {

get_file_content(path).then(svgcontent => {
  try {
  create_svg(svgcontent, top, left, width, height, color, path_color, id, parent_id);
  } catch (e) {
    console.error('failed to render fetched svg', e);
  }
})


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


window.fetch_and_render_svg = fetch_and_render_svg;

window.resize = resize;
window.strokeColor = strokeColor;
window.fillColor = fillColor;
