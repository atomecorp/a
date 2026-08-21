import { makeId } from '../shared/scalars.js';
// SVG utilities extracted from loader.js for clarity

// --- SVG sanitizer -----------------------------------------------------------
// Policy: an SVG string coming from anywhere other than the repository's own
// assets is untrusted. `sanitizeSVG` keeps only presentational SVG markup and
// drops every vector that can execute script:
//   - non-whitelisted elements (`script`, `foreignObject`, `handler`, HTML nodes...)
//   - every `on*` event attribute
//   - URI attributes whose scheme is not `#`, `http:`, `https:` or `data:image/`
//   - `<animate>` / `<set>` retargeting a URI attribute (classic href bypass)
// It needs a DOM parser: it is a browser-side guard, and throws instead of
// silently returning the input when no parser is available -- an identity
// sanitizer is worse than none because callers believe they are protected.

const SANITIZE_ALLOWED_TAGS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'metadata', 'style', 'switch', 'a',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textpath', 'tref',
  'marker', 'pattern', 'mask', 'clippath', 'image', 'view',
  'lineargradient', 'radialgradient', 'stop',
  'filter', 'fedropshadow', 'fegaussianblur', 'feoffset', 'feblend', 'fecolormatrix',
  'fecomponenttransfer', 'fecomposite', 'feconvolvematrix', 'fediffuselighting',
  'fedisplacementmap', 'feflood', 'fefunca', 'fefuncb', 'fefuncg', 'fefuncr',
  'feimage', 'femerge', 'femergenode', 'femorphology', 'fespecularlighting',
  'fetile', 'feturbulence', 'fedistantlight', 'fepointlight', 'fespotlight',
  'animate', 'animatemotion', 'animatetransform', 'set', 'mpath'
]);

const SANITIZE_URI_ATTRS = new Set(['href', 'xlink:href', 'src', 'xlink:base', 'action', 'formaction', 'poster']);
const SANITIZE_SAFE_SCHEME = /^(?:https?:|mailto:|tel:|data:image\/(?:png|jpeg|gif|webp|svg\+xml)[;,])/i;
const SANITIZE_ANIMATION_TAGS = new Set(['animate', 'animatemotion', 'animatetransform', 'set']);
// Whitespace and control characters the URL parser ignores: "java\tscript:" is a
// live URL for the browser, so they must be stripped before the scheme test.
const SANITIZE_IGNORED_CHARS = /[\u0000-\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g;

function sanitizeIsSafeUri(value) {
  const cleaned = String(value).replace(SANITIZE_IGNORED_CHARS, '');
  if (cleaned === '') return true;
  if (cleaned.startsWith('#')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned)) return SANITIZE_SAFE_SCHEME.test(cleaned);
  // Scheme-relative (`//host/...`) escapes the document origin; relative paths are fine.
  return !cleaned.startsWith('//');
}

function sanitizeElement(element) {
  const localName = String(element.localName || element.nodeName || '').toLowerCase();
  if (!SANITIZE_ALLOWED_TAGS.has(localName)) {
    element.remove();
    return;
  }
  for (const attribute of Array.from(element.attributes || [])) {
    const name = String(attribute.name || '').toLowerCase();
    const value = String(attribute.value == null ? '' : attribute.value);
    if (name.startsWith('on')) { element.removeAttribute(attribute.name); continue; }
    if (SANITIZE_URI_ATTRS.has(name) && !sanitizeIsSafeUri(value)) { element.removeAttribute(attribute.name); continue; }
    // CSS payloads such as `background:url(javascript:...)` carried by style/attrs.
    if (/url\s*\(/i.test(value) && /(?:javascript|vbscript)\s*:/i.test(value.replace(SANITIZE_IGNORED_CHARS, ''))) {
      element.removeAttribute(attribute.name);
    }
  }
  if (SANITIZE_ANIMATION_TAGS.has(localName)) {
    const target = String(element.getAttribute('attributeName') || '').toLowerCase();
    if (SANITIZE_URI_ATTRS.has(target)) { element.remove(); return; }
  }
  if (localName === 'use') {
    // `use` pulling from another document is an inclusion/exfiltration vector:
    // restrict it to same-document fragments.
    for (const name of ['href', 'xlink:href']) {
      const value = element.getAttribute(name);
      if (value != null && !String(value).trim().startsWith('#')) element.removeAttribute(name);
    }
  }
  for (const child of Array.from(element.children || [])) sanitizeElement(child);
}

export function sanitizeSVG(raw) {
  if (raw == null) return '';
  const source = String(raw);
  if (source.trim() === '') return '';
  const ParserCtor = (typeof DOMParser !== 'undefined' && DOMParser)
    || (typeof window !== 'undefined' && window.DOMParser)
    || null;
  if (!ParserCtor) {
    throw new Error('sanitizeSVG requires a DOM environment (DOMParser); refusing to return unsanitized markup');
  }
  const parsed = new ParserCtor().parseFromString(`<div>${source}</div>`, 'text/html');
  const host = parsed.body && parsed.body.firstElementChild;
  if (!host) return '';
  for (const child of Array.from(host.children)) sanitizeElement(child);
  return host.innerHTML;
}

// render_svg: inserts an SVG string.
// Extended signature: sizeMode (last param) can be:
//   null / undefined  => fixed size (px)
//   'responsive' or '%' => width/height 100%, follows parent
export function render_svg(svgcontent, id, parent_id = 'view', top = '0px', left = '0px', width = '100px', height = '100px', color = null, path_color = null, sizeMode = null) {
  const parent = document.getElementById(parent_id);
  if (!parent || !svgcontent) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = sanitizeSVG(String(svgcontent).trim());
  const svgEl = tmp.querySelector('svg');
  if (!svgEl) return null;
  const finalId = id && String(id).trim() ? String(id).trim() : makeId('svg');
  svgEl.id = finalId;
  svgEl.style.position = 'absolute';
  svgEl.style.top = top; svgEl.style.left = left;

  const widthStr = (width != null) ? String(width).trim() : '';
  const heightStr = (height != null) ? String(height).trim() : '';
  const widthIsPercent = /%$/.test(widthStr);
  const heightIsPercent = /%$/.test(heightStr);
  const responsive = (sizeMode === 'responsive' || sizeMode === '%' || widthIsPercent || heightIsPercent);

  const parsedW = typeof width === 'number' ? width : parseFloat(width);
  const parsedH = typeof height === 'number' ? height : parseFloat(height);
  const targetW = Number.isFinite(parsedW) ? parsedW : 200;
  const targetH = Number.isFinite(parsedH) ? parsedH : 200;

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
    if (svgEl.hasAttribute('width')) svgEl.removeAttribute('width');
    if (svgEl.hasAttribute('height')) svgEl.removeAttribute('height');
    svgEl.style.width = widthIsPercent ? widthStr : '100%';
    svgEl.style.height = heightIsPercent ? heightStr : '100%';
    svgEl.dataset.intuitionResponsive = '1';
  } else {
    svgEl.setAttribute('width', String(targetW));
    svgEl.setAttribute('height', String(targetH));
    svgEl.style.width = targetW + 'px';
    svgEl.style.height = targetH + 'px';
  }
  svgEl.style.overflow = 'visible';
  svgEl.style.display = 'block';

  if (color || path_color) {
    const shapes = svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line');
    shapes.forEach(node => {
      if (path_color) {
        if (node.style) node.style.stroke = path_color;
        node.setAttribute('stroke', path_color);
      }
      if (color) {
        if (node.style) node.style.fill = color;
        const f = node.getAttribute('fill');
        if (f === null || f.toLowerCase() !== 'none') node.setAttribute('fill', color);
        if (/^url\(/i.test(f || '')) node.removeAttribute('fill');
      }
    });
    if (color) {
      if (svgEl.style) svgEl.style.fill = color;
      if (!svgEl.getAttribute('fill')) svgEl.setAttribute('fill', color);
    }
    if (path_color) {
      if (svgEl.style) svgEl.style.stroke = path_color;
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
      const prev = document.getElementById(id);
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
      return render_svg(svgData, id, parent_id, top, left, width, height, fill, stroke, sizeMode);
    });
}
