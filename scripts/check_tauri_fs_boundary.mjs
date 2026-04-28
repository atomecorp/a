import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const resolvePath = (relativePath) => path.join(rootDir, relativePath);
const readText = (relativePath) => fs.readFileSync(resolvePath(relativePath), 'utf8');

const forbiddenByFile = [
    {
        path: 'src/index.html',
        patterns: [/tauri-plugin-fs\/api-iife\.js/]
    },
    {
        path: 'src/squirrel/apis/loader.js',
        patterns: [/__TAURI__(?:\?\.|\.)fs/, /readTextFile/, /plugin:fs/]
    },
    {
        path: 'dist/squirrel.js',
        patterns: [/__TAURI__(?:\?\.|\.)fs/, /readTextFile/, /plugin:fs/]
    },
    {
        path: 'dist/squirrel.min.js',
        patterns: [/__TAURI__(?:\?\.|\.)fs/, /readTextFile/, /plugin:fs/]
    },
    {
        path: 'src/application/eVe/intuition/tools/audio_engine_debug_runtime.js',
        optional: true,
        patterns: [/__TAURI__(?:\?\.|\.)fs/, /resolveFsApi/, /tauri_fs_unavailable/]
    },
    {
        path: 'src-tauri/Cargo.toml',
        patterns: [/tauri-plugin-fs/]
    },
    {
        path: 'src-tauri/Cargo.lock',
        patterns: [/name = "tauri-plugin-fs"/]
    },
    {
        path: 'src-tauri/src/main.rs',
        patterns: [/tauri_plugin_fs/]
    },
    {
        path: 'src-tauri/src/lib.rs',
        patterns: [/tauri_plugin_fs/]
    },
    {
        path: 'src-tauri/capabilities/default.json',
        patterns: [/"fs:default"/, /"fs:read-all"/, /"fs:write-all"/]
    },
    {
        path: 'src-tauri/gen/schemas/desktop-schema.json',
        patterns: [/"fs:default"/, /"fs:read-all"/, /"fs:write-all"/]
    },
    {
        path: 'src-tauri/gen/schemas/macOS-schema.json',
        patterns: [/"fs:default"/, /"fs:read-all"/, /"fs:write-all"/]
    },
    {
        path: 'src-tauri/gen/schemas/iOS-schema.json',
        patterns: [/"fs:default"/, /"fs:read-all"/, /"fs:write-all"/]
    },
    {
        path: 'src-tauri/gen/schemas/mobile-schema.json',
        patterns: [/"fs:default"/, /"fs:read-all"/, /"fs:write-all"/]
    }
];

for (const entry of forbiddenByFile) {
    if (entry.optional && !fs.existsSync(resolvePath(entry.path))) {
        continue;
    }
    const content = readText(entry.path);
    for (const pattern of entry.patterns) {
        assert.equal(
            pattern.test(content),
            false,
            `${entry.path} must not contain ${pattern}`
        );
    }
}

assert.equal(
    fs.existsSync(path.join(rootDir, 'src/tauri-plugin-fs/api-iife.js')),
    false,
    'frontend Tauri FS IIFE shim must not exist'
);

console.log('check_tauri_fs_boundary: PASS');
