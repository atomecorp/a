import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validId, tokenHash, manifest, issueCapability, DOWNLOAD_TTL_MS } from './ota-contract.mjs';

export const OTA_ROOT = process.env.ATOME_OTA_ROOT || '/var/lib/atome/ios-ota';
export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function atomicJson(file, data) {
    const pending = `${file}.${randomBytes(8).toString('hex')}.pending`;
    const fd = fs.openSync(pending, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(pending, file);
    const parent = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
}

export function initialize(root = OTA_ROOT) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    for (const folder of ['.incoming', 'releases']) fs.mkdirSync(path.join(root, folder), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(path.join(root, 'settings.json'))) atomicJson(path.join(root, 'settings.json'), { secret: randomBytes(48).toString('base64url'), users: {} });
}

export function storePath(root, folder, id) {
    if (!validId(id) || !['.incoming', 'releases'].includes(folder)) throw new Error('invalid_release_path');
    const target = path.join(root, folder, id);
    for (const file of [root, path.join(root, folder), target]) {
        if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('ota_symlink_forbidden');
    }
    return target;
}

export function current(root = OTA_ROOT) {
    const file = path.join(root, 'current.json');
    return fs.existsSync(file) ? readJson(file) : null;
}

export async function hashFile(file) {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

export async function withStoreLock(root, callback) {
    const lock = path.join(root, '.publish-lock');
    try { fs.mkdirSync(lock); } catch (error) {
        if (error.code === 'EEXIST') throw new Error('ota_publication_busy');
        throw error;
    }
    try { return await callback(); } finally { fs.rmdirSync(lock); }
}

export function stage(id, root = OTA_ROOT) {
    const directory = storePath(root, '.incoming', id);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    return { ipa: path.join(directory, 'atome.ipa') };
}

export async function publish(report, origin, root = OTA_ROOT) {
    if (!validId(report?.id) || report.team !== '2W25PVZ57F' || report.signature !== 'verified'
        || !/^[a-f0-9]{64}$/.test(report.sha256) || !Number.isSafeInteger(report.size) || report.size < 1
        || report.products?.length !== 2) throw new Error('invalid_publication_report');
    const expected = ['one.atome.app', 'one.atome.app.atome'];
    if (report.products.some((p, index) => p.bundle !== expected[index] || !(Date.parse(p.expires) > Date.now()) || p.deviceCount < 1))
        throw new Error('invalid_provisioning_report');
    const originUrl = new URL(origin);
    if (originUrl.protocol !== 'https:' || originUrl.origin !== origin) throw new Error('invalid_ota_origin');
    return withStoreLock(root, async () => {
        const previous = current(root);
        if (previous?.id === report.id) {
            if (previous.sha256 !== report.sha256) throw new Error('release_id_collision');
            return previous;
        }
        if (previous && Number(report.build) <= Number(previous.build)) throw new Error('build_number_not_increasing');
        const source = storePath(root, '.incoming', report.id);
        const target = storePath(root, 'releases', report.id);
        const ipa = path.join(source, 'atome.ipa');
        if (!fs.lstatSync(ipa).isFile() || fs.lstatSync(ipa).isSymbolicLink()
            || fs.statSync(ipa).size !== report.size || await hashFile(ipa) !== report.sha256) throw new Error('uploaded_ipa_integrity_failed');
        // Unsigned template is private; downloadable manifests receive a scoped
        // IPA capability at request time and cannot accidentally expose an IPA.
        fs.writeFileSync(path.join(source, 'manifest.plist'), manifest(report, `${origin}/ios/builds/${report.id}/atome.ipa`), { mode: 0o600 });
        const receipt = { ...report, origin, publishedAt: Date.now() };
        atomicJson(path.join(source, 'release.json'), receipt);
        if (fs.existsSync(target)) {
            if (readJson(path.join(target, 'release.json')).sha256 !== report.sha256) throw new Error('release_id_collision');
        } else fs.renameSync(source, target);
        // previous.json keeps the replaced build only until finalize/rollback:
        // the store holds one build, two while a publication is being verified.
        atomicJson(path.join(root, 'previous.json'), previous);
        atomicJson(path.join(root, 'current.json'), receipt);
        return receipt;
    });
}

export async function rollback(id, root = OTA_ROOT) {
    return withStoreLock(root, async () => {
        if (current(root)?.id !== id) throw new Error('rollback_current_changed');
        const previous = readJson(path.join(root, 'previous.json'));
        if (previous) {
            const file = path.join(storePath(root, 'releases', previous.id), 'atome.ipa');
            if (await hashFile(file) !== previous.sha256) throw new Error('previous_release_integrity_failed');
        }
        atomicJson(path.join(root, 'current.json'), previous);
        atomicJson(path.join(root, 'previous.json'), null);
        fs.rmSync(storePath(root, 'releases', id), { recursive: true, force: true });
        return previous || { unpublished: true };
    });
}

// Confirms a verified publication: the replaced build and every stale upload go.
export async function finalize(id, root = OTA_ROOT) {
    return withStoreLock(root, async () => {
        if (current(root)?.id !== id) throw new Error('finalize_current_changed');
        atomicJson(path.join(root, 'previous.json'), null);
        const removed = cleanup(root);
        for (const staged of fs.readdirSync(path.join(root, '.incoming'))) {
            if (!validId(staged)) continue;
            fs.rmSync(storePath(root, '.incoming', staged), { recursive: true });
            removed.push(staged);
        }
        return { current: id, removed };
    });
}

export function cleanup(root = OTA_ROOT, active = new Set(), now = Date.now()) {
    const previousFile = path.join(root, 'previous.json');
    const previous = fs.existsSync(previousFile) ? readJson(previousFile) : null;
    const keep = new Set([current(root)?.id, previous?.id, ...active]);
    const removed = [];
    for (const folder of ['releases', '.incoming']) for (const id of fs.readdirSync(path.join(root, folder))) {
        if (!validId(id) || keep.has(id)) continue;
        const directory = storePath(root, folder, id);
        // An upload may still be in progress; a release outside `keep` is never served.
        const expired = folder === 'releases' || fs.statSync(directory).mtimeMs + 24 * 60 * 60 * 1000 < now;
        if (expired) { fs.rmSync(directory, { recursive: true }); removed.push(id); }
    }
    return removed;
}

export function enroll(label, root = OTA_ROOT) {
    if (typeof label !== 'string' || !label.trim() || label.length > 100) throw new Error('invalid_tester_label');
    const settingsPath = path.join(root, 'settings.json');
    const settings = readJson(settingsPath);
    const token = randomBytes(32).toString('base64url');
    settings.users[tokenHash(token)] = { label, enabled: true, createdAt: Date.now() };
    atomicJson(settingsPath, settings);
    return { token, label };
}

export function probe(root = OTA_ROOT) {
    const report = current(root);
    if (!report) throw new Error('no_published_release');
    const settings = readJson(path.join(root, 'settings.json'));
    const user = Object.keys(settings.users).find(hash => settings.users[hash].enabled);
    if (!user) throw new Error('no_registered_testers');
    const cap = issueCapability(settings.secret, { id: report.id, user, expires: Date.now() + DOWNLOAD_TTL_MS });
    return { id: report.id, manifestUrl: `${report.origin}/ios/builds/${report.id}/manifest.plist?cap=${cap}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        let input = ''; for await (const part of process.stdin) input += part;
        if (input.length > 65536) throw new Error('ota_input_too_large');
        const data = JSON.parse(input || '{}');
        const action = process.argv[2];
        let result;
        if (action === 'init') { initialize(); result = { initialized: true }; }
        else if (action === 'stage') result = stage(data.id);
        else if (action === 'publish') result = await publish(data.report, data.origin);
        else if (action === 'rollback') result = await rollback(data.id);
        else if (action === 'status') result = { current: current(), enabledTesters: Object.values(readJson(path.join(OTA_ROOT, 'settings.json')).users).filter(user => user.enabled).length };
        else if (action === 'probe') result = probe();
        else if (action === 'enroll') result = await withStoreLock(OTA_ROOT, () => enroll(data.label));
        else if (action === 'revoke') result = await withStoreLock(OTA_ROOT, () => {
            const file = path.join(OTA_ROOT, 'settings.json'); const settings = readJson(file);
            if (!settings.users[data.hash]) throw new Error('tester_not_found');
            settings.users[data.hash].enabled = false; atomicJson(file, settings); return { revoked: true };
        });
        else throw new Error('unknown_ota_action');
        process.stdout.write(JSON.stringify(result) + '\n');
    } catch (error) { process.stderr.write(`OTA store failed: ${error.message}\n`); process.exitCode = 1; }
}
