import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';
const output = new URL('../atome/src/assets/vendor/porcupine/', import.meta.url);
await mkdir(output, { recursive: true });
await build({ stdin: { contents: 'export { PorcupineWorker } from "@picovoice/porcupine-web"; export { WebVoiceProcessor } from "@picovoice/web-voice-processor";',
    resolveDir: process.cwd(), loader: 'js' }, bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2020',
    outfile: new URL('porcupine.bundle.js', output).pathname });
await cp(new URL('../node_modules/@picovoice/web-voice-processor/LICENSE', import.meta.url), new URL('web-voice-processor.LICENSE', output));
await cp(new URL('../node_modules/@picovoice/porcupine-web/package.json', import.meta.url), new URL('porcupine-web.package.json', output));
