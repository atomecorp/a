// Package the canonical JavaScript engine for JavaScriptCore; no native copy of its logic.
// The output is written only when its bytes change: it lies in atome/src, which the desktop build
// watches (platforms/desktop-tauri/package_tauri_runtime.mjs), so an unchanged rewrite would rebuild the app.
import { rollup } from 'rollup';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'atome/src/wasm/gps_navigation_engine.js');
const bundle = await rollup({ input: path.join(root, 'atome/src/squirrel/gps/navigation_engine.js') });
const { output: [chunk] } = await bundle.generate({ format: 'iife', name: 'AtomeGpsEngine' });
await bundle.close();
const current = await readFile(output, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
});
if (current !== chunk.code) await writeFile(output, chunk.code);
