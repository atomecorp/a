// Single writer for product versions and the shared Xcode release ledger.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PRODUCT_FILES = ['atome/version.txt', 'eVe/version.txt', 'atome/src/version.json'];
export const PROJECT_FILE = 'platforms/ios/atome-auv3/atome.xcodeproj/project.pbxproj';

export function productContents(root, version) {
    if (!/^\d+(\.\d+)+$/.test(version)) throw new Error('invalid_product_version');
    return Object.fromEntries(PRODUCT_FILES.map(file => {
        if (!file.endsWith('.json')) return [file, version];
        const json = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
        json.version = version;
        return [file, JSON.stringify(json, null, 2) + '\n'];
    }));
}

export function ledgerContent(root, oldVersion, version, oldBuild, build, minimumCount = 2) {
    if (![oldVersion, version].every(value => /^\d+(\.\d+)+$/.test(value))
        || ![oldBuild, build].every(value => /^\d+$/.test(value))) throw new Error('invalid_ledger_versions');
    let text = fs.readFileSync(path.join(root, PROJECT_FILE), 'utf8');
    for (const [setting, old, next] of [['MARKETING_VERSION', oldVersion, version], ['CURRENT_PROJECT_VERSION', oldBuild, build]]) {
        const expression = new RegExp(`(\\b${setting} = )${old.replaceAll('.', '\\.')}(?=;)`, 'g');
        if ([...text.matchAll(expression)].length < minimumCount) throw new Error('version_ledger_baseline_mismatch');
        text = text.replace(expression, (_match, prefix) => `${prefix}${next}`);
    }
    return text;
}

export function writeContents(root, contents) {
    for (const [source, text] of Object.entries(contents)) {
        if (![...PRODUCT_FILES, PROJECT_FILE].includes(source)) throw new Error('version_source_not_allowed');
        const destination = path.join(root, source);
        const temporary = path.join(root, 'temp', `ios-version-${randomUUID()}`);
        fs.mkdirSync(path.dirname(temporary), { recursive: true });
        fs.writeFileSync(temporary, text, { mode: fs.statSync(destination).mode });
        const fd = fs.openSync(temporary, 'r');
        try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        fs.renameSync(temporary, destination);
        const parent = fs.openSync(path.dirname(destination), 'r');
        try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
        const [action, ...args] = process.argv.slice(2);
        if (action === 'products') writeContents(root, productContents(root, args[0]));
        else if (action === 'ledger') writeContents(root, { [PROJECT_FILE]: ledgerContent(root, ...args.slice(0, 4), Number(args[4])) });
        else throw new Error('unknown_version_action');
    } catch (error) { process.stderr.write(`Version ledger failed: ${error.message}\n`); process.exitCode = 1; }
}
