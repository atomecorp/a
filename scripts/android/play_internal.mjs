import { spawn } from 'node:child_process';
import { copyFile, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDE, nextVersionCode, parseReleaseArguments, readPlayConfiguration, readServiceAccount, uploadRequirements } from './play_configuration.mjs';
import { createPlayClient } from './play_api.mjs';
import { publishRelease, remoteVersionCodes } from './play_release.mjs';
import { createRelease, readPreparedRelease, releaseInputs, saveRelease, withReleaseLock } from './release_state.mjs';
import { sha256File } from './release_tools.mjs';

export const RELEASE_HELP = `Usage: ./scripts/Android_testflight_generator [OPTIONS]
       ./run.sh apk --play-internal [OPTIONS]

Google Play internal testing: preflight, reserve version, build, validate, upload.
  --dry-run             Print the local plan; no writes, build, credentials or network
  --doctor              Check local prerequisites and list missing Google configuration
  --prepare             Build and verify a signed AAB for the first Console upload;
                        never contact Google or publish
  --publish <report>    Verify and publish/resume that exact prepared release
  --config <file>       Play JSON configuration (default: Private/android-play.json)
  --version-code <n>    Reserve a code greater than the local/remote high-water marks
  -h, --help            Show this help

Without --prepare, an explicit invocation builds and publishes to internal only.
Credentials are read from a private local service-account file, never from chat.
The initial Console upload and Play App Signing must be completed first.
No toolchain is bootstrapped, key generated, or production track modified.
Only Android's build code is incremented; atome/eVe product versions are read.
Guide: ${GUIDE}
Example configuration: scripts/android/play.config.example.json
Without a Play account: --firebase (Firebase App Distribution), see --firebase --help.
`;

export function runAndroidOwner(root, args, environment = process.env) {
    return new Promise((resolve, reject) => {
        const child = spawn('bash', [path.join(root, 'scripts/android/apk.sh'), ...args],
            { cwd: root, env: { ...environment, SQUIRREL_APK_SKIP_LICENSES: '1' }, stdio: 'inherit' });
        child.on('error', () => reject(new Error('Cannot start the canonical Android build owner')));
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`Android build/verification failed (exit ${code})`)));
    });
}

async function requireSigningFiles(environment) {
    for (const file of ['squirrel-release.jks', 'keystore.properties']) {
        try { if (!(await stat(path.join(environment.HOME, '.atome/android', file))).isFile()) throw new Error('not a file'); }
        catch { throw new Error('The existing Android release keystore and properties are required; no replacement key will be generated'); }
    }
}

async function buildOrVerify(root, report, config, verifyOnly, runOwner, baseEnvironment) {
    const expected = { packageName: report.packageName, versionName: report.versionName, versionCode: report.versionCode,
        ...(config?.uploadCertificateSha256 ? { certificateSha256: config.uploadCertificateSha256 } : {}) };
    const plan = path.join(report.directory, 'expected.json'), buildReport = path.join(report.directory, 'bundle-verification.json');
    await writeFile(plan, JSON.stringify(expected) + '\n');
    const environment = { ...baseEnvironment, ATOME_ANDROID_RELEASE_PLAN: plan, ATOME_ANDROID_BUILD_REPORT: buildReport,
        ATOME_ANDROID_RELEASE_CONFIG: path.join(report.directory, 'tauri-release.json') };
    report.status = verifyOnly ? 'revalidating' : 'building-and-validating';
    await saveRelease(report);
    await runOwner(root, verifyOnly ? ['--verify-aab', report.metadata.artifact, '--no-install-deps']
        : ['--prod', '--aab', '--no-install-deps'], environment);
    const metadata = JSON.parse(await readFile(buildReport, 'utf8'));
    if (metadata.packageName !== report.packageName || metadata.versionCode !== report.versionCode
        || metadata.versionName !== report.versionName || metadata.signature !== 'verified'
        || metadata.bundleValidation !== 'verified' || metadata.nativeLink !== 'verified'
        || config?.uploadCertificateSha256 && metadata.certificateSha256 !== config.uploadCertificateSha256) throw new Error('Canonical AAB verification report does not match the release plan');
    if (verifyOnly && metadata.sha256 !== report.metadata.sha256) throw new Error('Prepared AAB changed during verification');
    const immutable = path.join(report.directory, 'application.aab');
    if (!verifyOnly) await copyFile(metadata.artifact, immutable);
    if (await sha256File(immutable) !== metadata.sha256) throw new Error('AAB copy differs from the verified build');
    report.metadata = { ...metadata, artifact: immutable };
    if (!verifyOnly) report.status = 'prepared';
    await saveRelease(report);
}

export async function runRelease({ root, args, environment = process.env, runOwner = runAndroidOwner,
    makeClient = createPlayClient, log = value => process.stdout.write(`${value}\n`) }) {
    const options = parseReleaseArguments(args, root, environment);
    if (options.help) { log(RELEASE_HELP); return; }
    const inputs = await releaseInputs(root);
    const config = await readPlayConfiguration(options.configFile, inputs.packageName);
    const missing = uploadRequirements(config);
    if (config?.serviceAccountFile && (options.doctor || options.dryRun)) {
        try {
            const info = await stat(config.serviceAccountFile);
            if (!info.isFile() || info.mode & 0o077) missing.push('private service-account file (chmod 600)');
        } catch { missing.push('readable service-account file'); }
    }
    log(`Android / Google Play internal testing\nPackage: ${inputs.packageName}\natome version: ${inputs.productVersion}\nAndroid version name: ${inputs.versionName}\nLocal version-code high-water mark: ${inputs.versionCode}`);
    if (options.dryRun || options.doctor) {
        if (options.publish) {
            const prepared = await readPreparedRelease(options.publish, root, inputs.packageName);
            log(`Prepared version: ${prepared.versionName} (${prepared.versionCode})\nAAB SHA-256: ${prepared.metadata.sha256}`);
        } else {
            log(`Proposed local build code: ${nextVersionCode(inputs.versionCode, [], options.versionCode)} (Google inventory is checked only during live publication)`);
        }
        await requireSigningFiles(environment);
        await runOwner(root, [options.doctor ? '--doctor' : '--prod', ...(options.doctor ? [] : ['--aab']), '--dry-run', '--no-install-deps'], environment);
        log(`Play configuration: ${missing.length ? `required: ${missing.join(', ')}` : 'present; account access is not checked offline'}`);
        log(`Plan: ${options.prepare ? 'prepare a signed bundle for Console' : options.publish ? 'revalidate and publish the named report' : 'reserve a higher local/remote version, build once, validate and publish'}\nTrack: internal\nGuide: ${GUIDE}`);
        log('No version changed. No build, upload, credentials read or Google request.');
        if (options.doctor && missing.length) throw new Error('Google configuration is incomplete; local toolchain inspection completed');
        return;
    }
    await requireSigningFiles(environment);
    if (!options.prepare && missing.length) throw new Error(`Google setup required: ${missing.join(', ')}. Use --prepare for the first signed bundle; see ${GUIDE}`);
    const account = options.prepare ? null : await readServiceAccount(config.serviceAccountFile, root);
    // Validate installed tooling before reserving a code or opening a Google edit.
    await runOwner(root, ['--doctor', '--dry-run', '--no-install-deps'], environment);
    return withReleaseLock(root, async () => {
        let report, client, pendingEdit;
        try {
            if (account) client = makeClient({ packageName: inputs.packageName, account });
            if (options.publish) {
                report = await readPreparedRelease(options.publish, root, inputs.packageName);
                await buildOrVerify(root, report, config, true, runOwner, environment);
            } else {
                let codes = [];
                if (client) {
                    pendingEdit = await client.createEdit();
                    const state = await client.state(pendingEdit.id);
                    if (!state.tracks.some(track => track.track === 'internal')) throw new Error('Create the internal testing track and complete the first Console upload');
                    codes = remoteVersionCodes(state);
                }
                // Re-read under the lock so parallel invocations cannot reserve the same code.
                report = await createRelease(root, await releaseInputs(root), codes, options.versionCode);
                if (pendingEdit) { report.editId = pendingEdit.id; await saveRelease(report); }
                log(`Reserved Android build ${report.versionCode}; report: ${path.join(report.directory, 'report.json')}`);
                await buildOrVerify(root, report, config, false, runOwner, environment);
            }
            if (client) await publishRelease({ client, report, save: saveRelease, releaseNotes: config.releaseNotes });
            log(`\n${options.prepare ? 'PREPARED — NOT UPLOADED' : 'GOOGLE PLAY INTERNAL COMMIT CONFIRMED'}\nVersion: ${report.versionName} (${report.versionCode})\nAAB: ${report.metadata.artifact}\nSHA-256: ${report.metadata.sha256}\nUpload certificate SHA-256: ${report.metadata.certificateSha256}\nReport: ${path.join(report.directory, 'report.json')}`);
            log(options.prepare ? `Upload this AAB once in Play Console, configure the account, then use this generator for subsequent releases.\nGuide: ${GUIDE}`
                : `Tester installation/update remains to be verified on a real phone.${config.testerOptInUrl ? `\nTester opt-in: ${config.testerOptInUrl}` : '\nCopy the tester opt-in link from Play Console.'}`);
            return report;
        } catch (error) {
            if (report) {
                report.lastFailure = { at: new Date().toISOString(), step: report.status, message: error.message, uncertain: Boolean(error.uncertain) };
                await saveRelease(report);
                log(`Release stopped at ${report.status}. Version ${report.versionCode} remains reserved.\nReport: ${path.join(report.directory, 'report.json')}`);
            }
            if (pendingEdit && !report?.uploadAttempted) {
                try { await client.deleteEdit(pendingEdit.id); }
                catch { log('Temporary Google edit cleanup could not be confirmed; inspect Play Console.'); }
            }
            throw error;
        }
    });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runRelease({ root, args: process.argv.slice(2) }).catch(error => { process.stderr.write(`\nFAILED\nReason: ${error.message}\n`); process.exitCode = 1; });
}
