import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sha256File, validateIpa, readPlist } from './signing.mjs';
import { productContents, ledgerContent, writeContents, PROJECT_FILE } from './version-ledger.mjs';
import { atomicJson as save } from './ota-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sources = ['platforms/ios/atome-auv3/atome.xcodeproj/project.pbxproj', 'atome/version.txt', 'eVe/version.txt', 'atome/src/version.json'];
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], ...options });
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

export function configuration() {
    const file = path.join(os.homedir(), '.config/atome/ios-ota.json');
    const local = fs.existsSync(file) ? read(file) : read(path.join(root, 'scripts/ios/ota-target.json'));
    const host = process.env.OTA_SSH_HOST || local.sshHost;
    const origin = process.env.OTA_ORIGIN || local.origin;
    if (!host || !/^[a-zA-Z0-9_.@-]+$/.test(host) || host.startsWith('-')) throw new Error('ota_ssh_host_required');
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
        throw new Error('ota_https_origin_required');
    return { host, origin: url.origin };
}

function ssh(host, action, data) {
    return JSON.parse(run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes', host,
        `node /opt/a/scripts/ios/ota-store.mjs ${quote(action)}`], { input: JSON.stringify(data) }));
}

export function prepare(directory, ipa, oldVersion, oldBuild) {
    const validation = read(path.join(directory, 'validation.json'));
    const report = { schema: 'atome.ios.release.v1', id: randomUUID(), ...validation, ipa: path.resolve(ipa),
        oldVersion, oldBuild, state: 'prepared', sources: Object.fromEntries(sources.map(file => [file, sha256File(path.join(root, file))])) };
    fs.writeFileSync(path.join(directory, '.retain'), 'Pending signed iOS release; released after confirmed publication.\n');
    save(path.join(directory, 'release.json'), report);
    return report;
}

export function check(file) {
    const report = read(file);
    if (report.schema !== 'atome.ios.release.v1' || !/^[a-f0-9-]{36}$/.test(report.id)
        || !/^\d+(\.\d+)+$/.test(report.version) || !/^\d+$/.test(report.build)) throw new Error('invalid_release_report');
    if (sha256File(report.ipa) !== report.sha256) throw new Error('prepared_ipa_changed');
    if (report.state !== 'reconciled') {
        const transaction = fs.existsSync(`${file}.versions`) ? read(`${file}.versions`) : null;
        for (const source of sources) {
            if (sha256File(path.join(root, source)) !== report.sources[source]
                && (!transaction || fs.readFileSync(path.join(root, source), 'utf8') !== transaction[source]))
                throw new Error(`source_changed_since_prepare:${source}`);
        }
    }
    return report;
}

async function publish(file) {
    const report = check(file);
    const { host, origin } = configuration();
    // Every invocation, including retries, verifies the current archive signature.
    const validation = validateIpa(report.ipa, path.dirname(file), report.team);
    if (validation.sha256 !== report.sha256) throw new Error('validation_hash_changed');
    const status = ssh(host, 'status', { id: report.id });
    if (!status.enabledTesters) throw new Error('enroll_a_tester_before_publication');
    const wasReconciled = report.state === 'reconciled';
    if (wasReconciled && status.current?.id !== report.id) throw new Error('reconciled_release_no_longer_current');
    if (status.current?.id !== report.id) {
        const staged = ssh(host, 'stage', { id: report.id });
        run('scp', ['-q', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', report.ipa, `${host}:${staged.ipa}`]);
        const result = ssh(host, 'publish', { report: { ...validation, id: report.id }, origin });
        report.publication = result;
    } else report.publication = status.current;
    report.state = wasReconciled ? 'reconciled' : 'published';
    save(file, report);
    try {
        const response = await fetch(`${origin}/ios/status`, { signal: AbortSignal.timeout(20000) });
        // Read the body as text first: a proxy error page (HTML) must surface its
        // HTTP status instead of an opaque JSON syntax error.
        const body = await response.text();
        const excerpt = body.slice(0, 120).replace(/\s+/g, ' ').trim();
        if (!response.ok) throw new Error(`https_status_http_${response.status}:${excerpt}`);
        let publicStatus;
        try { publicStatus = JSON.parse(body); }
        catch { throw new Error(`https_status_not_json:http_${response.status}:${excerpt}`); }
        if (publicStatus.id !== report.id) throw new Error('https_status_mismatch');
        const candidate = ssh(host, 'probe', {});
        if (candidate.id !== report.id) throw new Error('publication_changed_during_postcheck');
        const plistResponse = await fetch(candidate.manifestUrl, { signal: AbortSignal.timeout(20000) });
        if (!plistResponse.ok) throw new Error('manifest_not_accessible');
        const plist = readPlist(await plistResponse.text());
        const item = plist.items?.[0];
        if (item?.metadata?.['bundle-identifier'] !== 'one.atome.app' || item.metadata['bundle-version'] !== report.build)
            throw new Error('manifest_metadata_mismatch');
        const url = new URL(item.assets?.[0]?.url);
        if (url.origin !== origin || url.pathname !== `/ios/builds/${report.id}/atome.ipa`) throw new Error('manifest_ipa_url_mismatch');
        const ipa = await fetch(url, { headers: { range: 'bytes=0-1' }, signal: AbortSignal.timeout(20000) });
        if (ipa.status !== 206 || Buffer.from(await ipa.arrayBuffer()).toString('ascii') !== 'PK') throw new Error('ipa_not_accessible');
    } catch (error) {
        if (!wasReconciled) {
            try { report.rollback = ssh(host, 'rollback', { id: report.id }); report.state = 'rolled-back'; }
            catch (rollbackError) { report.rollbackError = rollbackError.message; }
            save(file, report);
        }
        throw new Error(`publication_postcheck_failed:${error.message};state=${report.state}`);
    }
    process.stdout.write(`Version: ${report.version}\nBuild: ${report.build}\nPublication: verified\nInstall page: ${origin}/ios/install (personal token required)\n`);
}

function reconcile(file) {
    const report = check(file);
    if (report.state === 'reconciled') return;
    const { host } = configuration();
    const status = ssh(host, 'status', { id: report.id });
    if (status.current?.id !== report.id || status.current.sha256 !== report.sha256) throw new Error('publication_not_confirmed');
    // Transaction stores the exact intended replacement bytes before any source
    // write. On an interrupted reconciliation each source must match old or new.
    const transaction = `${file}.versions`;
    if (!fs.existsSync(transaction)) {
        const contents = { ...productContents(root, report.version),
            [PROJECT_FILE]: ledgerContent(root, report.oldVersion, report.version, report.oldBuild, report.build) };
        save(transaction, contents);
    }
    const contents = read(transaction);
    writeContents(root, contents);
    report.state = 'reconciled'; save(file, report);
    fs.unlinkSync(path.join(path.dirname(file), '.retain'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const [action, ...args] = process.argv.slice(2);
        if (action === 'prepare') prepare(...args);
        else if (action === 'check') check(args[0]);
        else if (action === 'publish') await publish(args[0]);
        else if (action === 'reconcile') reconcile(args[0]);
        else throw new Error('unknown_release_action');
    } catch (error) { process.stderr.write(`Release failed: ${error.message}\n`); process.exitCode = 1; }
}
