import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { packageTauriEngines } from '../../platforms/desktop-tauri/package_tauri_engines.mjs';

const root = path.resolve(import.meta.dirname, '../..');
await mkdir(path.join(root, 'temp'), { recursive: true });
const fixture = await mkdtemp(path.join(root, 'temp/tauri-engine-payload-'));
const bytes = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
try {
    const source = path.join(fixture, 'atome/engines');
    const output = path.join(fixture, 'temp/desktop-tauri-runtime/engines');
    for (const [name, contents] of [
        ['audio/core/dsp_core.cpp', 'runtime source'], ['dsp/Cargo.toml', '[package]'],
        ['dsp/src/lib.rs', 'pub fn process() {}'], ['dsp/target/debug/cache', 'derived'],
        ['dsp/tests/contract.rs', 'source test'], ['audio/target', 'a source file named target']
    ]) {
        await mkdir(path.dirname(path.join(source, name)), { recursive: true });
        await writeFile(path.join(source, name), contents);
    }
    const inputs = await packageTauriEngines(fixture);
    assert(!inputs.some((file) => file.includes('/target/')));
    assert.deepEqual((await readdir(path.join(output, 'dsp'))).sort(), ['Cargo.toml', 'src', 'tests']);
    for (const file of inputs) {
        const relative = path.relative(source, file);
        if ((await lstat(file)).isFile()) {
            assert.equal(await bytes(path.join(output, relative)), await bytes(file), relative);
        }
    }
    await rm(path.join(source, 'dsp/src/lib.rs'));
    await packageTauriEngines(fixture);
    assert.deepEqual(await readdir(path.join(output, 'dsp/src')), []);
    assert.equal(await readFile(path.join(source, 'dsp/target/debug/cache'), 'utf8'), 'derived');
    console.log('Tauri payload excludes build output, preserves source bytes and removes stale staged files.');
} finally {
    await rm(fixture, { recursive: true, force: true });
}
