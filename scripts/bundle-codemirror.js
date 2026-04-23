/**
 * Bundle CodeMirror for offline use
 * Run with: node scripts/bundle-codemirror.js
 */

import { build } from 'esbuild';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

async function bundleCodeMirror() {
    console.log('📦 Bundling CodeMirror for offline use...');

    try {
        await build({
            entryPoints: [join(projectRoot, 'scripts/codemirror-entry.js')],
            bundle: true,
            minify: true,
            format: 'esm',
            outfile: join(projectRoot, 'src/js/codemirror.bundle.js'),
            external: [],
            platform: 'browser',
            target: ['es2020'],
            sourcemap: true,
            define: {
                'process.env.NODE_ENV': '"production"'
            }
        });

        console.log('✅ CodeMirror bundle created: src/js/codemirror.bundle.js');
    } catch (error) {
        console.error('❌ Bundle failed:', error);
        process.exit(1);
    }
}

bundleCodeMirror();
