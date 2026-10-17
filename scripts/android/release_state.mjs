import { mkdir, mkdtemp, open, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nextVersionCode } from './play_configuration.mjs';
import { sha256File } from './release_tools.mjs';

export async function withReleaseLock(root, work) {
    const temp = path.join(root, 'temp');
    await mkdir(temp, { recursive: true });
    const file = path.join(temp, 'android-play.lock');
    let handle;
    try { handle = await open(file, 'wx', 0o600); }
    catch (error) {
        if (error.code !== 'EEXIST') throw error;
        throw new Error('Another Android release holds temp/android-play.lock; inspect its PID before removing a stale lock');
    }
    try { await handle.writeFile(`${process.pid}\n`); return await work(); }
    finally { await handle.close(); await rm(file); }
}

export async function releaseInputs(root) {
    const directory = path.join(root, 'platforms/desktop-tauri');
    const source = await readFile(path.join(directory, 'tauri.android.conf.json'), 'utf8');
    const config = JSON.parse(source);
    const desktop = JSON.parse(await readFile(path.join(directory, 'tauri.conf.json'), 'utf8'));
    const productVersion = (await readFile(path.join(root, 'atome/version.txt'), 'utf8')).trim();
    if (!/^\d+(?:\.\d+){1,2}$/.test(productVersion)) throw new Error('atome/version.txt must hold a numeric Android version name');
    // Tauri requires semantic versions; a two-component product version gains .0.
    const versionName = productVersion.split('.').length === 2 ? `${productVersion}.0` : productVersion;
    if (!/^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+$/.test(desktop.identifier) || desktop.identifier.endsWith('.debug')) throw new Error('Invalid canonical Android release identifier');
    nextVersionCode(config.bundle?.android?.versionCode);
    return { source, config, productVersion, versionName, packageName: desktop.identifier, versionCode: config.bundle.android.versionCode };
}

export async function createRelease(root, inputs, remoteCodes, requested) {
    const versionCode = nextVersionCode(inputs.versionCode, remoteCodes, requested);
    const directory = await mkdtemp(path.join(root, 'temp/android-release-'));
    const report = { schemaVersion: 1, id: path.basename(directory), packageName: inputs.packageName, track: 'internal',
        versionName: inputs.versionName, versionCode, status: 'reserved', uploadAttempted: false, commitAttempted: false,
        createdAt: new Date().toISOString(), directory };
    const sourceFile = path.join(root, 'platforms/desktop-tauri/tauri.android.conf.json');
    if (await readFile(sourceFile, 'utf8') !== inputs.source) throw new Error('Android version configuration changed concurrently');
    const updated = structuredClone(inputs.config);
    updated.bundle.android.versionCode = versionCode;
    const pending = path.join(directory, 'android-version-reservation.json');
    await writeFile(pending, JSON.stringify(updated, null, 2) + '\n', { mode: (await stat(sourceFile)).mode & 0o777 });
    // This high-water mark remains consumed even after a failed/uncertain upload.
    await rename(pending, sourceFile);
    await writeFile(path.join(directory, 'tauri-release.json'), JSON.stringify({ version: report.versionName,
        bundle: { android: { versionCode } } }, null, 2) + '\n');
    await writeFile(path.join(directory, 'expected.json'), JSON.stringify({ packageName: report.packageName,
        versionName: report.versionName, versionCode }) + '\n');
    await saveRelease(report);
    return report;
}

export async function saveRelease(report) {
    const pending = path.join(report.directory, 'report.pending.json');
    await writeFile(pending, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    await rename(pending, path.join(report.directory, 'report.json'));
}

export async function readPreparedRelease(file, root, packageName) {
    const real = await realpath(file), temp = await realpath(path.join(root, 'temp'));
    if (!real.startsWith(`${temp}${path.sep}`) || (await stat(real)).size > 128 * 1024) throw new Error('Prepared release report must be under this checkout temp directory');
    const report = JSON.parse(await readFile(real, 'utf8'));
    const directory = path.dirname(real);
    if (report.schemaVersion !== 1 || report.packageName !== packageName || report.track !== 'internal'
        || report.directory !== directory || !report.metadata || report.metadata.artifact !== path.join(directory, 'application.aab')
        || report.metadata.versionCode !== report.versionCode || report.metadata.versionName !== report.versionName
        || report.metadata.packageName !== packageName || !/^[a-f0-9]{64}$/.test(report.metadata.sha256)
        || !Number.isSafeInteger(report.versionCode) || report.versionCode < 1 || report.versionCode > 2100000000
        || !/^\d+(?:\.\d+){1,2}$/.test(report.versionName)
        || typeof report.uploadAttempted !== 'boolean' || typeof report.commitAttempted !== 'boolean') throw new Error('Prepared Android release report is inconsistent');
    if (await realpath(report.metadata.artifact) !== report.metadata.artifact
        || await sha256File(report.metadata.artifact) !== report.metadata.sha256) throw new Error('Prepared AAB changed since validation');
    return report;
}
