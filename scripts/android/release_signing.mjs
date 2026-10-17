import { readFile, stat, writeFile } from 'node:fs/promises';
import { X509Certificate, randomBytes } from 'node:crypto';
import path from 'node:path';
import { runTool } from './release_tools.mjs';

/** Java properties subset used by the canonical signing file, including Java escapes. */
export function signingProperties(text) {
    const properties = {};
    const unescape = value => value.replace(/\\u([0-9a-fA-F]{4})|\\(.)/g, (_, hex, char) =>
        hex ? String.fromCharCode(parseInt(hex, 16)) : ({ t: '\t', n: '\n', r: '\r', f: '\f' }[char] ?? char));
    for (const line of text.replace(/\\\r?\n\s*/g, '').split(/\r?\n/)) {
        if (/^\s*(?:[#!]|$)/.test(line)) continue;
        const match = line.match(/^\s*([A-Za-z]+)\s*[=:]\s*(.*)$/);
        if (!match || Object.hasOwn(properties, match[1])) throw new Error('Invalid or duplicate signing property');
        properties[match[1]] = unescape(match[2]);
    }
    for (const key of ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']) {
        if (!properties[key]) throw new Error(`Signing configuration is missing ${key}`);
    }
    if (!path.isAbsolute(properties.storeFile)) throw new Error('The signing storeFile must be an absolute path');
    return properties;
}

export function normalizeFingerprint(value) {
    const fingerprint = String(value).replace(/:/g, '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Upload certificate SHA-256 must contain 64 hexadecimal digits');
    return fingerprint;
}

export async function verifyBundleSignature({ artifact, directory, expectedFingerprint, environment = process.env, run = runTool }) {
    if (!environment.JAVA_HOME) throw new Error('JAVA_HOME is required for AAB signature validation');
    const propertiesFile = path.join(environment.HOME, '.atome/android/keystore.properties');
    const info = await stat(propertiesFile);
    if (info.mode & 0o077) throw new Error('Signing properties must be private (chmod 600)');
    const properties = signingProperties(await readFile(propertiesFile, 'utf8'));
    if ((await stat(properties.storeFile)).mode & 0o077) throw new Error('Release keystore must be private (chmod 600)');
    const keytool = path.join(environment.JAVA_HOME, 'bin/keytool');
    const certificateFile = path.join(directory, 'upload-certificate.pem');
    const env = { ...environment, ATOME_SIGNING_STORE_PASSWORD: properties.storePassword,
        ATOME_VERIFY_STORE_PASSWORD: randomBytes(24).toString('hex') };
    const pem = await run(keytool, ['-exportcert', '-rfc', '-keystore', properties.storeFile,
        '-storepass:env', 'ATOME_SIGNING_STORE_PASSWORD', '-alias', properties.keyAlias], { env });
    let certificate;
    try { certificate = new X509Certificate(pem); } catch { throw new Error('Cannot read the configured upload certificate'); }
    const fingerprint = normalizeFingerprint(certificate.fingerprint256);
    if (expectedFingerprint && fingerprint !== normalizeFingerprint(expectedFingerprint)) throw new Error('Upload certificate differs from the Google Play configuration');
    if (Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) <= Date.now()) throw new Error('Upload certificate is outside its validity period');
    await writeFile(certificateFile, pem, { mode: 0o600 });
    const truststore = path.join(directory, 'upload-certificate.p12');
    await run(keytool, ['-importcert', '-noprompt', '-storetype', 'PKCS12', '-keystore', truststore,
        '-storepass:env', 'ATOME_VERIFY_STORE_PASSWORD', '-alias', 'upload', '-file', certificateFile], { env });
    // Trust exactly the existing upload certificate. Strict verification rejects unsigned
    // entries and signatures by another key, while allowing our private certificate authority.
    await run(path.join(environment.JAVA_HOME, 'bin/jarsigner'), ['-J-Duser.language=en', '-verify', '-strict',
        '-keystore', truststore, '-storepass:env', 'ATOME_VERIFY_STORE_PASSWORD', artifact, 'upload'], { env });
    return { certificateSha256: fingerprint, certificateValidUntil: certificate.validTo, signature: 'verified' };
}
