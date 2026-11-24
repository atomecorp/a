import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { packageTauriRuntime } from '../../platforms/desktop-tauri/package_tauri_runtime.mjs';

const root = path.resolve(import.meta.dirname, '../..');
await mkdir(path.join(root, 'temp'), { recursive: true });
const fixture = await mkdtemp(path.join(root, 'temp/tauri-engine-payload-'));
const bytes = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const archive = 'assets/voice/vosk/vosk-model-small-fr-0.22.tar.gz';
try {
    const engines = path.join(fixture, 'atome/engines');
    const frontend = path.join(fixture, 'atome/src');
    const staged = path.join(fixture, 'temp/desktop-tauri-runtime');
    for (const [name, contents] of [
        ['engines/audio/core/dsp_core.cpp', 'runtime source'], ['engines/dsp/Cargo.toml', '[package]'],
        ['engines/dsp/src/lib.rs', 'pub fn process() {}'], ['engines/dsp/target/debug/cache', 'derived'],
        ['engines/dsp/tests/contract.rs', 'source test'], ['engines/audio/target', 'a source file named target'],
        ['src/index.html', '<!doctype html>'], ['src/squirrel/voice/native_voice_engine.js', 'export {};'],
        ['src/assets/voice/vosk/metadata.json', '{}'], ['src/assets/voice/vosk/vosk-model-small-fr-0.22/conf/model.conf', 'conf'],
        [`src/${archive}`, 'browser archive']
    ]) {
        await mkdir(path.dirname(path.join(fixture, 'atome', name)), { recursive: true });
        await writeFile(path.join(fixture, 'atome', name), contents);
    }
    const inputs = await packageTauriRuntime(fixture);
    assert(!inputs.some((file) => file.includes('/target/')));
    assert(!inputs.some((file) => file.endsWith('.tar.gz')), 'the browser archive is no build input');
    assert.deepEqual((await readdir(path.join(staged, 'engines/dsp'))).sort(), ['Cargo.toml', 'src', 'tests']);
    assert.deepEqual((await readdir(path.join(staged, 'src/assets/voice/vosk'))).sort(), ['metadata.json', 'vosk-model-small-fr-0.22']);
    for (const [source, output] of [[engines, 'engines'], [frontend, 'src']]) {
        for (const file of inputs.filter(input => input.startsWith(`${source}/`))) {
            const relative = path.relative(source, file);
            if ((await lstat(file)).isFile()) {
                assert.equal(await bytes(path.join(staged, output, relative)), await bytes(file), relative);
            }
            // Cargo reruns the build script when a watched path is newer than its last run: a stage keeps the sources' times.
            assert((await stat(path.join(staged, output, relative))).mtimeMs <= (await stat(file)).mtimeMs, `mtime ${relative}`);
        }
    }
    await rm(path.join(engines, 'dsp/src/lib.rs'));
    await writeFile(path.join(frontend, 'squirrel/voice/native_voice_engine.js'), 'export const edited = true;');
    await packageTauriRuntime(fixture);
    assert.deepEqual(await readdir(path.join(staged, 'engines/dsp/src')), []);
    assert.equal(await readFile(path.join(staged, 'src/squirrel/voice/native_voice_engine.js'), 'utf8'), 'export const edited = true;');
    assert.equal(await readFile(path.join(engines, 'dsp/target/debug/cache'), 'utf8'), 'derived');
    assert.equal(await readFile(path.join(frontend, archive), 'utf8'), 'browser archive', 'the source archive stays for the Web');
    console.log('Tauri payload excludes build output and the browser Vosk archive, preserves source bytes and restages edits.');
} finally {
    await rm(fixture, { recursive: true, force: true });
}
