// Bundle the RFC calendar engine for every existing runtime asset package.
import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
const output = 'atome/src/assets/vendor/ical';
await mkdir(output, { recursive: true });
await build({ entryPoints: ['node_modules/ical.js/dist/ical.js'], outfile: `${output}/ical.bundle.js`,
    bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022' });
await copyFile('node_modules/ical.js/LICENSE', `${output}/LICENSE`);
