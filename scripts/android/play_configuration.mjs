import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { normalizeFingerprint } from './release_signing.mjs';

export const PLAY_TRACK = 'internal';
export const MAX_VERSION_CODE = 2100000000;
export const GUIDE = 'atome/documentations/android_play_internal_distribution.md';

/** @returns {{dryRun:boolean,doctor:boolean,prepare:boolean,help:boolean,configFile:string,publish?:string,versionCode?:number}} */
export function parseReleaseArguments(args, root, environment = process.env) {
    const result = { dryRun: false, doctor: false, prepare: false, help: false,
        configFile: path.resolve(root, environment.ATOME_PLAY_CONFIG || 'Private/android-play.json') };
    const values = { '--config': 'configFile', '--publish': 'publish', '--version-code': 'versionCode' };
    const seen = new Set();
    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (['--play-internal', '--prod', '--aab', '--no-install-deps', '--yes'].includes(argument)) continue;
        const flags = { '--dry-run': 'dryRun', '--doctor': 'doctor', '--prepare': 'prepare', '--help': 'help', '-h': 'help' };
        if (flags[argument]) { result[flags[argument]] = true; continue; }
        if (!values[argument]) throw new Error(`Unsupported Android release option: ${argument.split('=')[0]}`);
        if (seen.has(argument)) throw new Error(`Repeated release option: ${argument}`);
        seen.add(argument);
        const value = args[++index];
        if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
        result[values[argument]] = argument === '--version-code' ? Number(value) : path.resolve(root, value);
    }
    if (result.versionCode !== undefined && (!Number.isSafeInteger(result.versionCode) || result.versionCode < 1
        || result.versionCode > MAX_VERSION_CODE)) throw new Error('Invalid Android version code');
    if (result.prepare && result.publish) throw new Error('--prepare cannot be combined with --publish');
    if (result.publish && result.versionCode !== undefined) throw new Error('--publish preserves the prepared version code');
    return result;
}

export async function readPlayConfiguration(file, packageName) {
    let source;
    try { source = await readFile(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Cannot read the Android Play configuration'); }
    let config;
    try { config = JSON.parse(source); } catch { throw new Error('Android Play configuration is not valid JSON'); }
    const allowed = new Set(['packageName', 'track', 'serviceAccountFile', 'uploadCertificateSha256', 'initialUploadComplete', 'testerOptInUrl', 'releaseNotes']);
    if (!config || Array.isArray(config) || Object.keys(config).some(key => !allowed.has(key))) throw new Error('Unknown Android Play configuration field');
    if (config.packageName !== packageName || config.track !== PLAY_TRACK) throw new Error('Play configuration must match the existing release package and internal track');
    if (config.serviceAccountFile && (typeof config.serviceAccountFile !== 'string' || !path.isAbsolute(config.serviceAccountFile))) throw new Error('serviceAccountFile must be an absolute local path');
    if (config.uploadCertificateSha256) config.uploadCertificateSha256 = normalizeFingerprint(config.uploadCertificateSha256);
    if (config.initialUploadComplete !== true && config.initialUploadComplete !== false) throw new Error('initialUploadComplete must be a boolean');
    if (config.testerOptInUrl && config.testerOptInUrl !== `https://play.google.com/apps/testing/${packageName}`) throw new Error('Unexpected tester opt-in URL');
    if (config.releaseNotes !== undefined && (!Array.isArray(config.releaseNotes) || config.releaseNotes.length > 20
        || config.releaseNotes.some(note => !note || Object.keys(note).some(key => !['language', 'text'].includes(key))
            || typeof note.language !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(note.language)
            || typeof note.text !== 'string' || !note.text.trim() || [...note.text].length > 500))) throw new Error('Invalid localized Play release notes');
    return config;
}

export function uploadRequirements(config) {
    if (!config) return ['Play configuration file'];
    return [!config.serviceAccountFile && 'serviceAccountFile', !config.uploadCertificateSha256 && 'uploadCertificateSha256',
        config.initialUploadComplete !== true && 'first Console upload and Play App Signing'].filter(Boolean);
}

export async function readServiceAccount(file, root) {
    let content;
    try {
        const resolved = await realpath(file), info = await stat(resolved);
        if (!info.isFile() || info.mode & 0o077) throw new Error('permissions');
        // Provider keys are runtime inputs, never source files. The already ignored Private
        // directory is supported for local setup; a path outside the checkout is preferred.
        const relative = path.relative(await realpath(root), resolved);
        if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
            && !/^Private\//.test(relative)) throw new Error('location');
        content = JSON.parse(await readFile(resolved, 'utf8'));
    } catch { throw new Error('Service account file must be readable, private (chmod 600), and outside source directories'); }
    if (content.type !== 'service_account' || content.token_uri !== 'https://oauth2.googleapis.com/token'
        || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(content.client_email)
        || typeof content.private_key !== 'string') throw new Error('Invalid Google service account credentials');
    return { client_email: content.client_email, private_key: content.private_key };
}

export function nextVersionCode(current, remoteCodes = [], requested) {
    const codes = [current, ...remoteCodes].map(Number);
    if (codes.some(code => !Number.isSafeInteger(code) || code < 1 || code > MAX_VERSION_CODE)) throw new Error('Invalid local or remote version code');
    const highest = Math.max(...codes);
    const next = requested === undefined ? highest + 1 : requested;
    if (!Number.isSafeInteger(next) || next <= highest || next > MAX_VERSION_CODE) throw new Error('Version code must exceed every local and Google Play code');
    return next;
}
