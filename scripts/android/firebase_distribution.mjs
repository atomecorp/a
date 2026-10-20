import { createReadStream } from 'node:fs';
import { copyFile, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayAuthorization } from './play_api.mjs';
import { readServiceAccount } from './play_configuration.mjs';
import { runAndroidOwner } from './play_internal.mjs';
import { createRelease, releaseInputs, saveRelease, withReleaseLock } from './release_state.mjs';
import { sha256File } from './release_tools.mjs';

const API = 'https://firebaseappdistribution.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const GUIDE = 'atome/documentations/android_firebase_distribution.md';

export const FIREBASE_HELP = `Usage: ./scripts/Android_testflight_generator --firebase [OPTIONS]
       ./run.sh apk --firebase [OPTIONS]

Firebase App Distribution: reserve version, build a signed release APK once,
upload it and notify the configured tester groups/addresses by e-mail.
  --dry-run             Print the plan; no build, credentials or network
  --notes <text>        Release notes shown to testers (overrides the config)
  --config <file>       Firebase JSON configuration (default: Private/android-firebase.json)
  -h, --help            Show this help

No Google Play account is involved. Testers install through the e-mailed link
or the Firebase App Tester app. Guide: ${GUIDE}
`;

export function parseFirebaseArguments(args, root, environment = process.env) {
    const result = { dryRun: false, help: false,
        configFile: path.resolve(root, environment.ATOME_FIREBASE_CONFIG || 'Private/android-firebase.json') };
    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (['--firebase', '--play-internal', '--no-install-deps'].includes(argument)) continue;
        if (argument === '--dry-run') { result.dryRun = true; continue; }
        if (argument === '--help' || argument === '-h') { result.help = true; continue; }
        if (argument !== '--config' && argument !== '--notes') throw new Error(`Unsupported Firebase release option: ${argument.split('=')[0]}`);
        const value = args[++index];
        if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
        if (argument === '--config') result.configFile = path.resolve(root, value);
        else result.notes = value;
    }
    return result;
}

export async function readFirebaseConfiguration(file, packageName) {
    let config;
    try { config = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { throw new Error(error.code === 'ENOENT' ? `Firebase configuration missing: ${file}` : 'Firebase configuration is not valid JSON'); }
    const allowed = new Set(['packageName', 'projectNumber', 'appId', 'serviceAccountFile', 'groups', 'testers', 'releaseNotes']);
    if (!config || Array.isArray(config) || Object.keys(config).some(key => !allowed.has(key))) throw new Error('Unknown Firebase configuration field');
    if (config.packageName !== packageName) throw new Error(`Firebase configuration must target ${packageName}`);
    if (!/^\d+$/.test(config.projectNumber || '') || !new RegExp(`^1:${config.projectNumber}:android:[0-9a-f]+$`).test(config.appId || '')) throw new Error('Invalid Firebase projectNumber/appId pair');
    if (typeof config.serviceAccountFile !== 'string' || !path.isAbsolute(config.serviceAccountFile)) throw new Error('serviceAccountFile must be an absolute local path');
    const groups = config.groups ?? [], testers = config.testers ?? [];
    if (!Array.isArray(groups) || groups.some(group => !/^[a-z0-9-]+$/.test(group))) throw new Error('groups must be Firebase group aliases');
    if (!Array.isArray(testers) || testers.some(tester => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tester))) throw new Error('testers must be e-mail addresses');
    if (!groups.length && !testers.length) throw new Error('Configure at least one tester group or address');
    if (config.releaseNotes !== undefined && typeof config.releaseNotes !== 'string') throw new Error('releaseNotes must be text');
    return { ...config, groups, testers };
}

export function createFirebaseClient({ authorize, request = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
    async function send(method, url, { json, file } = {}) {
        const headers = { authorization: `Bearer ${await authorize()}` };
        let body;
        if (file) {
            Object.assign(headers, { 'content-type': 'application/octet-stream', 'content-length': String((await stat(file)).size),
                'x-goog-upload-protocol': 'raw', 'x-goog-upload-file-name': path.basename(file) });
            body = createReadStream(file);
        } else if (json !== undefined) {
            headers['content-type'] = 'application/json';
            body = JSON.stringify(json);
        }
        let response;
        try { response = await request(url, { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(file ? 900000 : 30000), ...(file ? { duplex: 'half' } : {}) }); }
        catch { throw new Error(`Firebase ${method} request failed (network)`); }
        const text = await response.text();
        if (!response.ok) {
            let detail = '';
            try { detail = JSON.parse(text).error?.message || ''; } catch { /* non-JSON error body */ }
            throw new Error(`Firebase ${method} ${new URL(url).pathname.split('/').pop()} failed (${response.status})${detail ? `: ${detail}` : ''}`);
        }
        return text ? JSON.parse(text) : {};
    }
    return {
        async upload(appName, file) {
            let operation = await send('POST', `${API}/upload/v1/${appName}/releases:upload`, { file });
            // Processing an upload is asynchronous; the operation reports the created release.
            for (let attempt = 0; !operation.done; attempt++) {
                if (attempt >= 120) throw new Error('Firebase is still processing the upload; check the console');
                await sleep(5000);
                operation = await send('GET', `${API}/v1/${operation.name}`);
            }
            if (operation.error) throw new Error(`Firebase rejected the APK: ${operation.error.message || operation.error.code}`);
            return operation.response;
        },
        setNotes: (release, text) => send('PATCH', `${API}/v1/${release}?updateMask=release_notes.text`, { json: { name: release, releaseNotes: { text } } }),
        distribute: (release, groupAliases, testerEmails) => send('POST', `${API}/v1/${release}:distribute`, { json: { groupAliases, testerEmails } })
    };
}

async function findReleaseApk(root) {
    const base = path.join(root, 'platforms/desktop-tauri/gen/android/app/build/outputs/apk');
    const found = [];
    for (const flavor of await readdir(base)) {
        const directory = path.join(base, flavor, 'release');
        try { for (const name of await readdir(directory)) if (name.endsWith('.apk')) found.push(path.join(directory, name)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (found.length !== 1) throw new Error(`Expected one release APK, found ${found.length}`);
    return found[0];
}

export async function runFirebaseRelease({ root, args, environment = process.env, runOwner = runAndroidOwner,
    request = fetch, log = value => process.stdout.write(`${value}\n`) }) {
    const options = parseFirebaseArguments(args, root, environment);
    if (options.help) { log(FIREBASE_HELP); return; }
    const inputs = await releaseInputs(root);
    const config = await readFirebaseConfiguration(options.configFile, inputs.packageName);
    const notes = options.notes ?? config.releaseNotes ?? '';
    log(`Android / Firebase App Distribution\nPackage: ${inputs.packageName}\nVersion name: ${inputs.versionName}\nNext build code: ${inputs.versionCode + 1}\nApp: ${config.appId}\nGroups: ${config.groups.join(', ') || '-'}\nTesters: ${config.testers.length}`);
    if (options.dryRun) {
        await runOwner(root, ['--prod', '--dry-run', '--no-install-deps'], environment);
        log('No version changed. No build, upload, credentials read or Google request.');
        return;
    }
    const account = await readServiceAccount(config.serviceAccountFile, root);
    const client = createFirebaseClient({ authorize: createPlayAuthorization({ account, scope: SCOPE, request }), request });
    return withReleaseLock(root, async () => {
        const report = await createRelease(root, inputs, []);
        report.distribution = 'firebase';
        log(`Reserved Android build ${report.versionCode}; report: ${path.join(report.directory, 'report.json')}`);
        try {
            report.status = 'building';
            await saveRelease(report);
            await runOwner(root, ['--prod', '--no-install-deps'], { ...environment,
                ATOME_ANDROID_RELEASE_CONFIG: path.join(report.directory, 'tauri-release.json') });
            const artifact = path.join(report.directory, 'application.apk');
            await copyFile(await findReleaseApk(root), artifact);
            report.metadata = { artifact, sha256: await sha256File(artifact) };
            report.status = 'uploading';
            await saveRelease(report);
            const created = await client.upload(`projects/${config.projectNumber}/apps/${config.appId}`, artifact);
            const release = created.release;
            if (!release?.name) throw new Error('Firebase upload returned no release');
            if (String(release.buildVersion) !== String(report.versionCode)) throw new Error(`Firebase read build ${release.buildVersion}, expected ${report.versionCode}`);
            report.firebase = { release: release.name, result: created.result, consoleUri: release.firebaseConsoleUri };
            if (notes.trim()) await client.setNotes(release.name, notes.trim());
            await client.distribute(release.name, config.groups, config.testers);
            report.status = 'distributed';
            await saveRelease(report);
            log(`\nFIREBASE APP DISTRIBUTION CONFIRMED\nVersion: ${release.displayVersion} (${release.buildVersion})\nAPK SHA-256: ${report.metadata.sha256}\nConsole: ${release.firebaseConsoleUri}\nTesters were notified by e-mail.`);
            return report;
        } catch (error) {
            report.lastFailure = { at: new Date().toISOString(), step: report.status, message: error.message };
            await saveRelease(report);
            log(`Release stopped at ${report.status}. Version ${report.versionCode} remains reserved.`);
            throw error;
        }
    });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runFirebaseRelease({ root, args: process.argv.slice(2) }).catch(error => { process.stderr.write(`\nFAILED\nReason: ${error.message}\n`); process.exitCode = 1; });
}
