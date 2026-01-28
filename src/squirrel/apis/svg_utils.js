// SVG utilities extracted from loader.js for clarity

// Lightweight sanitizer kept as identity to avoid ReferenceErrors.
export function sanitizeSVG(raw) { return raw; }

// render_svg: inserts an SVG string.
// Extended signature: sizeMode (last param) can be:
//   null / undefined  => fixed size (px)
//   'responsive' or '%' => width/height 100%, follows parent
export function render_svg(svgcontent, id, parent_id = 'view', top = '0px', left = '0px', width = '100px', height = '100px', color = null, path_color = null, sizeMode = null) {
  const parent = document.getElementById(parent_id);
  if (!parent || !svgcontent) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = String(svgcontent).trim();
  const svgEl = tmp.querySelector('svg');
  if (!svgEl) return null;
  const finalId = id && String(id).trim() ? String(id).trim() : 'svg_' + Math.random().toString(36).slice(2);
  try { svgEl.id = finalId; } catch (_) { }
  svgEl.style.position = 'absolute';
  svgEl.style.top = top; svgEl.style.left = left;

  const widthStr = (width != null) ? String(width).trim() : '';
  const heightStr = (height != null) ? String(height).trim() : '';
  const widthIsPercent = /%$/.test(widthStr);
  const heightIsPercent = /%$/.test(heightStr);
  const responsive = (sizeMode === 'responsive' || sizeMode === '%' || widthIsPercent || heightIsPercent);

  const targetW = typeof width === 'number' ? width : parseFloat(width) || 200;
  const targetH = typeof height === 'number' ? height : parseFloat(height) || 200;

  try {
    const existingViewBox = svgEl.getAttribute('viewBox');
    const attrW = parseFloat(svgEl.getAttribute('width')) || null;
    const attrH = parseFloat(svgEl.getAttribute('height')) || null;
    if (!existingViewBox) {
      const vbW = (attrW && attrW > 0) ? attrW : targetW;
      const vbH = (attrH && attrH > 0) ? attrH : targetH;
      svgEl.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
    }
    if (!svgEl.getAttribute('preserveAspectRatio')) {
      svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
    if (responsive) {
      // Responsive mode: width/height 100%, parent controls sizing
      if (svgEl.hasAttribute('width')) svgEl.removeAttribute('width');
      if (svgEl.hasAttribute('height')) svgEl.removeAttribute('height');
      svgEl.style.width = widthIsPercent ? widthStr : '100%';
      svgEl.style.height = heightIsPercent ? heightStr : '100%';
      try { svgEl.dataset.intuitionResponsive = '1'; } catch (_) { }
    } else {
      // Fixed mode: also set attributes for backward compatibility
      try { svgEl.setAttribute('width', String(targetW)); } catch (_) { }
      try { svgEl.setAttribute('height', String(targetH)); } catch (_) { }
      svgEl.style.width = targetW + 'px';
      svgEl.style.height = targetH + 'px';
    }
    svgEl.style.overflow = 'visible';
    svgEl.style.display = 'block';
  } catch (_) { }
  if (color || path_color) {
    const shapes = svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line');
    shapes.forEach(node => {
      if (path_color) {
        try { if (node.style) node.style.stroke = path_color; } catch (_) { }
        node.setAttribute('stroke', path_color);
      }
      if (color) {
        // Inline styles (style="fill:#xxxx") override presentation attributes; force override via style API
        try { if (node.style) node.style.fill = color; } catch (_) { }
        const f = node.getAttribute('fill');
        if (f === null || f.toLowerCase() !== 'none') node.setAttribute('fill', color);
        // Remove gradient/URL fill if we want solid override
        if (/^url\(/i.test(f || '')) node.removeAttribute('fill');
      }
    });
    if (color) {
      try { if (svgEl.style) svgEl.style.fill = color; } catch (_) { }
      if (!svgEl.getAttribute('fill')) svgEl.setAttribute('fill', color);
    }
    if (path_color) {
      try { if (svgEl.style) svgEl.style.stroke = path_color; } catch (_) { }
      if (!svgEl.getAttribute('stroke')) svgEl.setAttribute('stroke', path_color);
    }
  }
  parent.appendChild(svgEl);
  return svgEl.id;
}

// fetch_and_render_svg: convenience wrapper specialized for SVG paths.
// Param order kept for existing calls: (path, id, parent_id, left, top, width, height, fill, stroke)
// Note: render_svg expects (top, left) order, so we swap when forwarding.
export function fetch_and_render_svg(path, id, parent_id = 'view', left = '0px', top = '0px', width = '100px', height = '100px', fill = null, stroke = null, sizeMode = null, fetcher = null) {
  const resolveFetcher = fetcher || (typeof dataFetcher === 'function' ? dataFetcher : null);
  if (!resolveFetcher) {
    return Promise.reject(new Error('dataFetcher unavailable'));
  }
  return resolveFetcher(path, { mode: 'text' })
    .then(svgData => {
      // Remove prior element with same id to avoid duplicates
      const prev = document.getElementById(id);
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
      return render_svg(svgData, id, parent_id, top, left, width, height, fill, stroke, sizeMode);
    })
    .catch(err => { if (typeof span !== 'undefined') span.textContent = 'Erreur: ' + err.message; });
}
