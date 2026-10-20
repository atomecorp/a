// Vendor pdf.js (Apache-2.0) for the book reader: the published legacy ESM builds
// (main + worker) and the data pdf.js loads by URL — standard fonts, CMaps and the
// image decoders (OpenJPEG, JBIG2, QCMS) — copied unchanged under atome/, which is
// served on every target, so a PDF opens offline. Run: node scripts/bundle-pdfjs.js
import { cp, mkdir, copyFile, rm } from 'node:fs/promises';
const source = 'node_modules/pdfjs-dist';
const output = 'atome/src/assets/vendor/pdfjs';
await rm(output, { recursive: true, force: true });
await mkdir(`${output}/wasm`, { recursive: true });
await copyFile(`${source}/legacy/build/pdf.min.mjs`, `${output}/pdf.bundle.js`);
await copyFile(`${source}/legacy/build/pdf.worker.min.mjs`, `${output}/pdf.worker.bundle.js`);
await copyFile(`${source}/LICENSE`, `${output}/LICENSE`);
await cp(`${source}/standard_fonts`, `${output}/standard_fonts`, { recursive: true });
await cp(`${source}/cmaps`, `${output}/cmaps`, { recursive: true });
for (const file of ['openjpeg.wasm', 'jbig2.wasm', 'qcms_bg.wasm', 'LICENSE_OPENJPEG', 'LICENSE_PDFJS_OPENJPEG', 'LICENSE_JBIG2',
    'LICENSE_PDFJS_JBIG2', 'LICENSE_QCMS', 'LICENSE_PDFJS_QCMS']) await copyFile(`${source}/wasm/${file}`, `${output}/wasm/${file}`);
