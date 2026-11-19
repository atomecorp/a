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

// Scan the whole server, not a whitelist of a few composition files: the forbidden
// `/api/auth/*` routes once lived in files a whitelist never looked at, and the guard
// reported "passed" while 21 HTTP business routes were declared in the repository.
const compositionFiles = [
    // atome-server, its local host of Tauri and the iOS app included, then the routes only Tauri adds.
    ...filesUnder('atome/servers/atome-server/src').map((file) => path.relative(ROOT, file)),
    ...filesUnder('platforms/desktop-tauri/src/server').map((file) => path.relative(ROOT, file))
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

// /ws/sync resolves its account on the connection itself (ws_sync/security.rs) and never
// opens the account-wide event scope.
const syncRoute = filesUnder('atome/servers/atome-server/src/ws_sync')
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
if (!syncRoute.includes('resolve_principal') || syncRoute.includes('"account-events"')) {
    failures.push('atome/servers/atome-server/src/ws_sync: ws/sync authentication or scope guard missing');
}

if (failures.length) {
    console.error('WebSocket-only transport guard failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log('WebSocket-only transport guard passed.');
