/**
 * Bundle mediasoup-client for the visio client (todo/visio_client_2026-09-30.md).
 * Run with: node scripts/bundle-mediasoup-client.js
 *
 * Same shape as bundle-basic-pitch.js: one committed ESM file under
 * atome/src/assets/vendor/, already served on every target (web/Fastify, Tauri/axum,
 * iOS app, AUv3) — zero platform declarations.
 */

import { build } from 'esbuild';
import { cp, mkdir, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const outDir = join(projectRoot, 'atome/src/assets/vendor/mediasoup-client');
const packageRoot = join(projectRoot, 'node_modules/mediasoup-client');

async function bundleMediasoupClient() {
    console.log('📦 Bundling mediasoup-client for the browser...');
    await mkdir(outDir, { recursive: true });
    await build({
        entryPoints: [join(projectRoot, 'scripts/mediasoup-client-entry.js')],
        bundle: true,
        minify: true,
        format: 'esm',
        outfile: join(outDir, 'mediasoup_client.bundle.js'),
        platform: 'browser',
        target: ['es2020'],
        sourcemap: false,
        define: { 'process.env.NODE_ENV': '"production"', 'process.env.DEBUG': 'undefined' }
    });
    await cp(join(packageRoot, 'LICENSE'), join(outDir, 'LICENSE'));
    const { size } = await stat(join(outDir, 'mediasoup_client.bundle.js'));
    console.log(`✅ atome/src/assets/vendor/mediasoup-client/mediasoup_client.bundle.js (${(size / 1024).toFixed(0)} KB)`);
}

bundleMediasoupClient().catch((error) => {
    console.error('❌ Bundle failed:', error);
    process.exit(1);
});
