/**
 * Bundle Basic Pitch (+ TensorFlow.js + @tonejs/midi) for offline use.
 * Run with: node scripts/bundle-basic-pitch.js
 *
 * Same shape as bundle-codemirror.js, and for the same reason: the result is a
 * single committed ESM file that eVe imports by a relative URL, so it needs no
 * import map, no Fastify prefix, no axum nest_service and no Swift rewrite. The
 * model is copied next to it — `atome/` is already served on all four targets
 * (web/Fastify, Tauri/axum, iOS app and AUv3), so this is the one asset location
 * that costs zero platform declarations.
 */

import { build } from 'esbuild';
import { cp, mkdir, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const outDir = join(projectRoot, 'atome/src/assets/vendor/basic-pitch');
const packageRoot = join(projectRoot, 'node_modules/@spotify/basic-pitch');

const reportSize = async (label, path) => {
    const { size } = await stat(path);
    console.log(`   ${label}: ${(size / 1024).toFixed(0)} KB`);
};

async function bundleBasicPitch() {
    console.log('📦 Bundling Basic Pitch for offline use...');

    await mkdir(join(outDir, 'model'), { recursive: true });

    await build({
        entryPoints: [join(projectRoot, 'scripts/basic-pitch-entry.js')],
        bundle: true,
        minify: true,
        format: 'esm',
        outfile: join(outDir, 'basic_pitch.bundle.js'),
        external: [],
        platform: 'browser',
        target: ['es2020'],
        sourcemap: false,
        define: {
            'process.env.NODE_ENV': '"production"'
        }
    });

    // The model ships inside the npm package (917 KB total), so nothing is ever
    // downloaded at runtime. Copying it out of node_modules is what makes the
    // offline guarantee structural rather than a promise.
    await cp(join(packageRoot, 'model'), join(outDir, 'model'), { recursive: true });
    await cp(join(packageRoot, 'LICENSE'), join(outDir, 'LICENSE'));

    console.log('✅ Basic Pitch bundle created: atome/src/assets/vendor/basic-pitch/');
    await reportSize('basic_pitch.bundle.js', join(outDir, 'basic_pitch.bundle.js'));
    await reportSize('model/model.json     ', join(outDir, 'model/model.json'));
    await reportSize('model/group1-shard1of1.bin', join(outDir, 'model/group1-shard1of1.bin'));
}

bundleBasicPitch().catch((error) => {
    console.error('❌ Bundle failed:', error);
    process.exit(1);
});
