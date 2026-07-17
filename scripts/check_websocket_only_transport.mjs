import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EXTENSIONS = new Set(['.js', '.mjs', '.rs', '.swift']);
const SKIP_DIRS = new Set(['node_modules', 'vendor', 'target', 'temp', '.git', 'dist']);
const CLIENT_ROOTS = ['eVe', 'atome/src', 'atome/security'];
const FORBIDDEN_BUSINESS_PATH = /\/api\/(?:auth|atome|events|state_current|snapshots|sharing|sync)(?:\/|['"`?])/;
const FORBIDDEN_HTTP_CALL = /\b(?:fetch|apiRequest)\s*\([^;\n]*\/api\/(?:auth|atome|events|state_current|snapshots|sharing|sync)/;

function filesUnder(relativeRoot) {
    const result = [];
    const visit = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(fullPath);
            else if (EXTENSIONS.has(path.extname(entry.name))) result.push(fullPath);
        }
    };
    visit(path.join(ROOT, relativeRoot));
    return result;
}

const failures = [];
for (const root of CLIENT_ROOTS) {
    for (const file of filesUnder(root)) {
        const source = fs.readFileSync(file, 'utf8');
        if (FORBIDDEN_HTTP_CALL.test(source)) {
            failures.push(`${path.relative(ROOT, file)}: client HTTP business call`);
        }
    }
}

const compositionFiles = [
    'server/server.js',
    'platforms/desktop-tauri/src/server/mod.rs',
    'platforms/desktop-tauri/src/server/local_atome.rs',
    'platforms/ios/atome-auv3/Common/LocalHTTPServer.swift'
];
for (const relativePath of compositionFiles) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    if (FORBIDDEN_BUSINESS_PATH.test(source)) {
        failures.push(`${relativePath}: HTTP business route or transport remains`);
    }
    if (source.includes('/__tauri_remote/')) {
        failures.push(`${relativePath}: legacy HTTP remote-control route remains`);
    }
    if (source.includes('api-request')) {
        failures.push(`${relativePath}: generic HTTP-over-WebSocket tunnel remains`);
    }
}

const syncRoute = fs.readFileSync(path.join(ROOT, 'server/server.js'), 'utf8');
if (!syncRoute.includes('authenticateWsSyncRequest') || syncRoute.includes('"account-events"')) {
    failures.push('server/server.js: ws/sync authentication or scope guard missing');
}

if (failures.length) {
    console.error('WebSocket-only transport guard failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log('WebSocket-only transport guard passed.');
