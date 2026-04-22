#!/usr/bin/env node
/*
  SVG 128x128 Fitter (CommonJS, no deps)
  --------------------------------------
  • Forces width/height to 128
  • Sets viewBox to 0 0 128 128
  • Computes a wrapper <g transform="..."> to scale & center original content
    based on the original viewBox (or inferred from numeric width/height).
  • Works even for wide banners like viewBox="0 0 492 110".
*/
const fs = require('fs');
const path = require('path');

function extractViewBox(s) {
  const m = s.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (!m) return null;
  const parts = m[1].trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(n => !isFinite(n))) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

function extractNumericAttr(s, name) {
  const re = new RegExp(name + '\\s*=\\s*"([^"]+)"', 'i');
  const m = s.match(re);
  if (!m) return null;
  const v = m[1].trim();
  const num = parseFloat(v);
  return Number.isFinite(num) ? num : null;
}

function ensureNamespaces(tag) {
  if (!/xmlns\s*=/.test(tag)) tag = tag.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!/xmlns:xlink\s*=/.test(tag)) tag = tag.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  return tag;
}

function sanitize128Fit(svgText) {
  let s = String(svgText)
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '');

  // Split start tag, inner, end tag
  const startIdx = s.indexOf('<svg');
  const gtIdx = s.indexOf('>', startIdx);
  const endIdx = s.lastIndexOf('</svg>');
  if (startIdx === -1 || gtIdx === -1 || endIdx === -1) throw new Error('Invalid SVG');
  let startTag = s.slice(startIdx, gtIdx + 1);
  const inner = s.slice(gtIdx + 1, endIdx);
  const endTag = s.slice(endIdx);

  startTag = ensureNamespaces(startTag);

  // Determine original viewBox
  let vb = extractViewBox(startTag);
  if (!vb) {
    const w = extractNumericAttr(startTag, 'width');
    const h = extractNumericAttr(startTag, 'height');
    if (w && h) {
      vb = { x: 0, y: 0, w, h };
    } else {
      // As a last resort, assume 128x128
      vb = { x: 0, y: 0, w: 128, h: 128 };
    }
  }

  const target = 128;
  const sFactor = target / Math.max(vb.w, vb.h);
  const tx = (target - vb.w * sFactor) / 2;
  const ty = (target - vb.h * sFactor) / 2;

  function fmt(n) { return Number(n.toFixed(6)).toString(); }

  // Build new startTag attributes: strip width/height/viewBox/preserveAspectRatio, then add ours
  startTag = startTag
    .replace(/\s+width\s*=\s*"[^"]*"/ig, '')
    .replace(/\s+height\s*=\s*"[^"]*"/ig, '')
    .replace(/\s+viewBox\s*=\s*"[^"]*"/ig, '')
    .replace(/\s+preserveAspectRatio\s*=\s*"[^"]*"/ig, '');

  // Add consistent attributes
  startTag = startTag.replace('<svg', `<svg width="128" height="128" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"`);

  // Clean noisy top-level attrs
  startTag = startTag
    .replace(/\s+xmlns:serif="[^"]*"/ig, '')
    .replace(/\s+serif:id="[^"]*"/ig, '')
    .replace(/\s+xml:space="[^"]*"/ig, '');

  // Wrap inner with transform to fit/center from original viewBox
  const transform = `translate(${fmt(tx)}, ${fmt(ty)}) scale(${fmt(sFactor)}) translate(${-vb.x}, ${-vb.y})`;
  const wrappedInner = `<g transform="${transform}">\n${inner}\n</g>`;

  return `${startTag}${wrappedInner}${endTag}`;
}

function processFile(file) {
  try {
    const data = fs.readFileSync(file, 'utf8');
    const out = sanitize128Fit(data);
    fs.writeFileSync(file, out, 'utf8');
    console.log('✔ 128×128 fit', file);
  } catch (e) {
    console.error('✖ Error', file, e.message);
  }
}

function walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.svg')) processFile(full);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node sanitize-svgs-128fit.cjs dir1 dir2 ...');
    process.exit(1);
  }
  for (const dir of args) walkDir(path.resolve(dir));
}

module.exports = { sanitize128Fit };
