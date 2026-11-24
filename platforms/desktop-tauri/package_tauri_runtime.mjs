#!/usr/bin/env node

import { constants, cp, lstat, mkdir, readdir, rm, stat, utimes } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The trees the released desktop bundle carries (tauri.conf.json `bundle.resources`), staged under
// temp/desktop-tauri-runtime with their source layout. A debug build serves the live repository
// (src/lib.rs#live_repo_src_dir), so only a release reads these copies.
const STAGED_TREES = Object.freeze([
    // Native engines are linked from their crates; no runtime loads their Cargo target trees.
    { source: 'atome/engines', output: 'engines', skip: (relative, isDirectory) => isDirectory && path.basename(relative) === 'target' },
    // The browser's copy of the Vosk model: vosk-browser loads archives (squirrel/voice/browser_voice_engine.js);
    // the desktop app recognizes through the native voice engine, which reads the unpacked model.
    { source: 'atome/src', output: 'src', skip: relative => relative === 'assets/voice/vosk/vosk-model-small-fr-0.22.tar.gz' }
]);

const stageTree = async (projectRoot, { source, output, skip }) => {
    const from = path.join(projectRoot, source);
    const to = path.join(projectRoot, 'temp/desktop-tauri-runtime', output);
    const inputs = [];
    const inspect = async (directory) => {
        inputs.push(directory);
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            if (skip(path.relative(from, absolute), entry.isDirectory())) continue;
            if (entry.isDirectory()) await inspect(absolute);
            else inputs.push(absolute);
        }
    };
    await inspect(from);
    await rm(to, { recursive: true, force: true });
    await mkdir(path.dirname(to), { recursive: true });
    // Copy-on-write clones where the volume has them (APFS), so a stage costs no second copy of the bytes.
    await cp(from, to, {
        recursive: true,
        mode: constants.COPYFILE_FICLONE,
        filter: async absolute => !skip(path.relative(from, absolute), (await lstat(absolute)).isDirectory())
    });
    // tauri-build watches the staged roots and Cargo reruns this script when one is newer than its last run:
    // each staged path takes its source's time, floored to the millisecond so it is never the newer one.
    for (const input of inputs) {
        const { atimeMs, mtimeMs } = await stat(input);
        await utimes(path.join(to, path.relative(from, input)), Math.floor(atimeMs) / 1000, Math.floor(mtimeMs) / 1000);
    }
    return inputs;
};

export async function packageTauriRuntime(projectRoot) {
    const inputs = [];
    for (const tree of STAGED_TREES) inputs.push(...await stageTree(projectRoot, tree));
    return inputs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    for (const input of await packageTauriRuntime(projectRoot)) {
        console.log(`cargo:rerun-if-changed=${input}`);
    }
}
