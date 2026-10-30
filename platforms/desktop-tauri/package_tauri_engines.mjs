#!/usr/bin/env node

import { cp, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep the existing engine source layout, excluding Cargo's derived output.
// Native engines are linked from their crates; no runtime loads their target trees.
export async function packageTauriEngines(projectRoot) {
    const source = path.join(projectRoot, 'atome/engines');
    const output = path.join(projectRoot, 'temp/desktop-tauri-runtime/engines');
    const inputs = [];
    const inspect = async (directory) => {
        inputs.push(directory);
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            if (entry.name === 'target' && entry.isDirectory()) continue;
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) await inspect(absolute);
            else inputs.push(absolute);
        }
    };
    await inspect(source);
    await rm(output, { recursive: true, force: true });
    await mkdir(path.dirname(output), { recursive: true });
    await cp(source, output, {
        recursive: true,
        filter: async (absolute) => path.basename(absolute) !== 'target' || !(await lstat(absolute)).isDirectory()
    });
    return inputs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    for (const input of await packageTauriEngines(projectRoot)) {
        console.log(`cargo:rerun-if-changed=${input}`);
    }
}
