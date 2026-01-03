#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function parseArgs(argv) {
    const args = { projectRoot: null, dryRun: false };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--projectRoot' || a === '--project-root') {
            args.projectRoot = argv[i + 1] || null;
            i += 1;
        } else if (a === '--dry-run') {
            args.dryRun = true;
        }
    }
    return args;
}

function safeReadJson(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function exists(targetPath) {
    try {
        fs.accessSync(targetPath);
        return true;
    } catch {
        return false;
    }
}

function rmrf(targetPath, dryRun) {
    if (!exists(targetPath)) return { ok: false, skipped: true };
    if (dryRun) return { ok: true, dryRun: true };
    fs.rmSync(targetPath, { recursive: true, force: true });
    return { ok: true };
}

function variantsForIdentifier(identifier) {
    const base = String(identifier || '').trim();
    if (!base) return [];
    return [
        base,
        `${base}.dev`,
        `${base}.debug`,
        `${base}.development`,
        `${base}.beta`
    ];
}

function normalizeName(name) {
    return String(name || '').trim();
}

function getTauriAppInfo(projectRoot) {
    const defaults = { identifier: 'com.squirrel.desktop', productName: 'squirrel' };
    if (!projectRoot) return defaults;
    const confPath = path.join(projectRoot, 'src-tauri', 'tauri.conf.json');
    const conf = safeReadJson(confPath);
    if (!conf) return defaults;
    return {
        identifier: conf.identifier || defaults.identifier,
        productName: conf.productName || defaults.productName
    };
}

function expandHome(p) {
    if (p.startsWith('~' + path.sep) || p === '~') {
        return path.join(os.homedir(), p.slice(1));
    }
    return p;
}

function listChildren(baseDir) {
    try {
        return fs.readdirSync(baseDir, { withFileTypes: true }).map((d) => ({
            name: d.name,
            isDirectory: d.isDirectory(),
            fullPath: path.join(baseDir, d.name)
        }));
    } catch {
        return [];
    }
}

function removeMatchesBySubstring({ baseDirs, needles, dryRun }) {
    const removed = [];
    for (const base of baseDirs) {
        const baseDir = expandHome(base);
        if (!exists(baseDir)) continue;
        const children = listChildren(baseDir);
        for (const child of children) {
            const hay = child.name.toLowerCase();
            const match = needles.some((n) => n && hay.includes(n.toLowerCase()));
            if (!match) continue;
            const res = rmrf(child.fullPath, dryRun);
            removed.push({ path: child.fullPath, ...res });
        }
    }
    return removed;
}

function purgeMacOS({ identifier, productName, dryRun }) {
    const idVariants = variantsForIdentifier(identifier);
    const removed = [];

    const macTargetsForId = (id) => [
        `~/Library/WebKit/${id}`,
        `~/Library/Containers/${id}`,
        `~/Library/Application Support/${id}`,
        `~/Library/Caches/${id}`,
        `~/Library/HTTPStorages/${id}`,
        `~/Library/HTTPStorages/${id}.binarycookies`,
        `~/Library/Preferences/${id}.plist`,
        `~/Library/Saved Application State/${id}.savedState`
    ];

    for (const id of idVariants) {
        for (const target of macTargetsForId(id)) {
            const targetPath = expandHome(target);
            const res = rmrf(targetPath, dryRun);
            if (!res.skipped) removed.push({ path: targetPath, ...res });
        }
    }

    const appNeedles = [normalizeName(productName)].filter(Boolean);
    removed.push(...removeMatchesBySubstring({
        baseDirs: ['~/Library/WebKit', '~/Library/HTTPStorages', '~/Library/Caches'],
        needles: appNeedles,
        dryRun
    }));

    return removed;
}

function purgeLinux({ identifier, productName, dryRun }) {
    const idVariants = variantsForIdentifier(identifier);
    const removed = [];

    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    const xdgCache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');

    const names = [normalizeName(productName), ...idVariants].filter(Boolean);

    // Remove app data dirs (best-effort). Tauri/Wry typically keeps WebView storage under app data/cache.
    for (const base of [xdgConfig, xdgData, xdgCache]) {
        for (const name of names) {
            const target = path.join(base, name);
            const res = rmrf(target, dryRun);
            if (!res.skipped) removed.push({ path: target, ...res });
        }
    }

    // Extra cleanup by substring (handles variations).
    removed.push(...removeMatchesBySubstring({
        baseDirs: [xdgConfig, xdgData, xdgCache],
        needles: [normalizeName(productName)],
        dryRun
    }));

    return removed;
}

function main() {
    const { projectRoot, dryRun } = parseArgs(process.argv.slice(2));
    const { identifier, productName } = getTauriAppInfo(projectRoot);

    const platform = process.platform;
    console.log(`WebView storage purge (platform=${platform}, dryRun=${dryRun})`);
    console.log(`App identifier: ${identifier}`);
    console.log(`App productName: ${productName}`);

    let removed = [];
    if (platform === 'darwin') {
        removed = purgeMacOS({ identifier, productName, dryRun });
    } else if (platform === 'linux') {
        removed = purgeLinux({ identifier, productName, dryRun });
    } else {
        console.log(`Unsupported platform for purge: ${platform}`);
        process.exitCode = 0;
        return;
    }

    const removedCount = removed.filter((r) => r.ok && !r.skipped).length;
    const skippedCount = removed.filter((r) => r.skipped).length;

    for (const entry of removed) {
        if (entry.skipped) continue;
        if (entry.dryRun) {
            console.log(`DRY RUN: would remove ${entry.path}`);
        } else {
            console.log(`Removed: ${entry.path}`);
        }
    }

    console.log(`Done. removed=${removedCount} skipped=${skippedCount}`);
}

main();
