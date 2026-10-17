import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundletoolRunner, runTool, sha256File } from './release_tools.mjs';
import { verifyNativePayload } from './native_artifacts.mjs';
import { verifyBundleSignature } from './release_signing.mjs';

export function manifestMetadata(xml) {
    const tag = name => {
        const matches = [...xml.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'g'))];
        if (matches.length !== 1) throw new Error(`AAB manifest must contain one ${name}`);
        return matches[0][1];
    };
    const attribute = (source, name) => source.match(new RegExp(`(?:^|\\s)${name}="([^"<>]*)"`))?.[1];
    const root = tag('manifest'), sdk = tag('uses-sdk'), application = tag('application');
    const result = { packageName: attribute(root, 'package'), versionCode: Number(attribute(root, 'android:versionCode')),
        versionName: attribute(root, 'android:versionName'), minSdk: Number(attribute(sdk, 'android:minSdkVersion')),
        targetSdk: Number(attribute(sdk, 'android:targetSdkVersion')), debuggable: attribute(application, 'android:debuggable') === 'true' };
    if (!/^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+$/.test(result.packageName)
        || !Number.isSafeInteger(result.versionCode) || result.versionCode < 1 || result.versionCode > 2100000000
        || !/^\d+(?:\.\d+){1,2}$/.test(result.versionName) || !Number.isInteger(result.minSdk) || !Number.isInteger(result.targetSdk)) {
        throw new Error('AAB manifest has invalid release identity/version/SDK fields');
    }
    if (result.debuggable || result.packageName.endsWith('.debug')) throw new Error('A debug bundle cannot be distributed through this release lane');
    if (result.minSdk !== 29 || result.targetSdk < 36) throw new Error('AAB SDK contract requires minSdk 29 and targetSdk >= 36');
    return result;
}

/** Validate the actual bundle with the AGP-owned official tool and JDK signer. */
export async function verifyReleaseBundle({ root, artifact, directory, expected = {}, environment = process.env,
    run = runTool, getBundletool = bundletoolRunner, verifySignature = verifyBundleSignature }) {
    const bundletool = await getBundletool(root, environment, run);
    await bundletool(['validate', `--bundle=${artifact}`]);
    const manifest = manifestMetadata(await bundletool(['dump', 'manifest', `--bundle=${artifact}`, '--module=base']));
    for (const key of ['packageName', 'versionCode', 'versionName']) {
        if (expected[key] !== undefined && expected[key] !== manifest[key]) throw new Error(`AAB ${key} differs from the release plan`);
    }
    const config = await bundletool(['dump', 'config', `--bundle=${artifact}`]);
    if (!/PAGE_ALIGNMENT_16K/.test(config)) throw new Error('AAB native ZIP alignment must be PAGE_ALIGNMENT_16K');
    const entries = (await run('unzip', ['-Z1', artifact])).trim().split(/\r?\n/);
    if (!entries.includes('BundleConfig.pb') || !entries.includes('base/manifest/AndroidManifest.xml')) throw new Error('Invalid AAB structure');
    const signature = await verifySignature({ artifact, directory, expectedFingerprint: expected.certificateSha256, environment, run });
    const abis = await verifyNativePayload({ artifact, entries, directory, environment, run, requireArm64: true });
    return { ...manifest, ...signature, abis, bundleValidation: 'verified', nativeLink: 'verified', pageAlignment: 16384,
        artifact: path.resolve(artifact), bytes: (await stat(artifact)).size, sha256: await sha256File(artifact) };
}

async function main() {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const artifact = process.argv[2];
    if (!artifact?.endsWith('.aab')) throw new Error('Release validator requires an exact AAB path');
    const temp = path.join(root, 'temp');
    await mkdir(temp, { recursive: true });
    const directory = await mkdtemp(path.join(temp, 'android-bundle-check-'));
    try {
        const expected = process.env.ATOME_ANDROID_RELEASE_PLAN
            ? JSON.parse(await readFile(process.env.ATOME_ANDROID_RELEASE_PLAN, 'utf8')) : {};
        const result = await verifyReleaseBundle({ root, artifact, directory, expected });
        if (process.env.ATOME_ANDROID_BUILD_REPORT) await writeFile(process.env.ATOME_ANDROID_BUILD_REPORT, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
        process.stdout.write(`[apk] AAB verified: ${result.packageName} ${result.versionName} (${result.versionCode}), ${result.abis.join(', ')}\n`);
        process.stdout.write(`[apk] Upload certificate SHA-256: ${result.certificateSha256}\n`);
    } finally { await rm(directory, { recursive: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { process.stderr.write(`[apk] AAB validation failed: ${error.message}\n`); process.exitCode = 1; });
}
