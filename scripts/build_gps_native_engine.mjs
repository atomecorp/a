// Package the canonical JavaScript engine for JavaScriptCore; no native copy of its logic.
import { rollup } from 'rollup';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await rollup({ input: path.join(root, 'atome/src/squirrel/gps/navigation_engine.js') });
await bundle.write({ file: path.join(root, 'atome/src/wasm/gps_navigation_engine.js'), format: 'iife', name: 'AtomeGpsEngine' });
await bundle.close();
