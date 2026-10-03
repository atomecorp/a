// Bundle the shared HLS decoder into the existing runtime asset package.
import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
const output = 'atome/src/assets/vendor/hls';
await mkdir(output, { recursive: true });
await build({ entryPoints: ['node_modules/hls.js/dist/hls.mjs'], outfile: `${output}/hls.bundle.js`,
    bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022' });
await copyFile('node_modules/hls.js/LICENSE', `${output}/LICENSE`);
