import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', ...options });
// Apple's plutil JSON conversion rejects profile dates/data. Parse the native XML
// with macOS Ruby's standard library, preserving both without third-party code.
export function readPlist(xml) {
    return JSON.parse(run('/usr/bin/ruby', ['-rrexml/document', '-rjson', '-e', `
      def value(node)
        case node.name
        when 'dict' then node.elements.to_a.each_slice(2).to_h { |k,v| [k.text, value(v)] }
        when 'array' then node.elements.map { |v| value(v) }
        when 'true' then true
        when 'false' then false
        when 'integer' then node.text.to_i
        else node.text.to_s
        end
      end
      puts JSON.generate(value(REXML::Document.new(STDIN.read).root.elements[1]))
    `], { input: xml }));
}

export function readProfile(file) {
    return readPlist(run('/usr/bin/security', ['cms', '-D', '-i', file]));
}

export const sha256File = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function validateProfile(profile, { bundle, team, now = Date.now() }) {
    const e = profile.Entitlements;
    if (profile.TeamIdentifier?.[0] !== team || e?.['application-identifier'] !== `${team}.${bundle}`)
        throw new Error('profile_identity_mismatch');
    if (!(Date.parse(profile.ExpirationDate) > now)) throw new Error('profile_expired');
    if (e['get-task-allow'] !== false || !profile.ProvisionedDevices?.length || profile.ProvisionsAllDevices)
        throw new Error('profile_not_adhoc');
    return [...profile.ProvisionedDevices].sort();
}

export function validateIpa(ipa, directory, team) {
    const output = path.join(directory, 'verified-ipa');
    fs.mkdirSync(output, { recursive: true });
    run('/usr/bin/ditto', ['-x', '-k', ipa, output]);
    const payload = path.join(output, 'Payload');
    const apps = fs.readdirSync(payload).filter(name => name.endsWith('.app'));
    if (apps.length !== 1) throw new Error('ipa_requires_one_app');
    const app = path.join(payload, apps[0]);
    const plugins = path.join(app, 'PlugIns');
    const extensions = fs.readdirSync(plugins).filter(name => name.endsWith('.appex'));
    if (extensions.length !== 1) throw new Error('ipa_requires_auv3');
    const products = [app, ...extensions.map(name => path.join(plugins, name))];
    let deviceSet;
    let version;
    let build;
    const certificates = new Set();
    const checks = products.map(product => {
        run('/usr/bin/codesign', ['--verify', '--deep', '--strict', product]);
        const info = readPlist(run('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', path.join(product, 'Info.plist')]));
        const expectedBundle = product === app ? 'one.atome.app' : 'one.atome.app.atome';
        if (info.CFBundleIdentifier !== expectedBundle) throw new Error('bundle_identifier_changed');
        const profile = readProfile(path.join(product, 'embedded.mobileprovision'));
        const devices = validateProfile(profile, { bundle: expectedBundle, team });
        if (deviceSet && JSON.stringify(deviceSet) !== JSON.stringify(devices)) throw new Error('profile_devices_differ');
        deviceSet = devices;
        if (version && (version !== info.CFBundleShortVersionString || build !== info.CFBundleVersion))
            throw new Error('app_extension_versions_differ');
        version = info.CFBundleShortVersionString;
        build = info.CFBundleVersion;
        const signed = readPlist(run('/usr/bin/codesign', ['-d', '--entitlements', ':-', product], { stdio: ['pipe', 'pipe', 'ignore'] }));
        if (signed['application-identifier'] !== `${team}.${expectedBundle}` || signed['get-task-allow'] === true)
            throw new Error('signed_entitlements_invalid');
        for (const [key, value] of Object.entries(signed)) {
            if (key.startsWith('com.apple.security.') && !profile.Entitlements[key]) continue;
            const allowed = profile.Entitlements[key];
            if (allowed === '*') continue;
            if (Array.isArray(value)) {
                if (!Array.isArray(allowed) || value.some(item => !allowed.some(a => a === item || (a.endsWith('*') && item.startsWith(a.slice(0, -1))))))
                    throw new Error(`entitlement_not_provisioned:${key}`);
            } else if (allowed !== value) throw new Error(`entitlement_not_provisioned:${key}`);
        }
        const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../platforms/ios/atome-auv3',
            product === app ? 'application/atomeRelease.entitlements' : 'auv3/auv3Release.entitlements');
        const required = readPlist(fs.readFileSync(source, 'utf8'));
        for (const [key, value] of Object.entries(required)) {
            if ((key.startsWith('com.apple.developer.') || key === 'aps-environment' || key === 'com.apple.security.application-groups')
                && JSON.stringify(signed[key]) !== JSON.stringify(value)) throw new Error(`required_entitlement_changed:${key}`);
        }
        const prefix = path.join(directory, `signer-${checksIndex(product, app)}`);
        run('/usr/bin/codesign', ['-d', `--extract-certificates=${prefix}`, product], { stdio: ['pipe', 'pipe', 'ignore'] });
        const certificate = `${prefix}0`;
        run('/usr/bin/openssl', ['x509', '-inform', 'DER', '-in', certificate, '-checkend', '0', '-noout']);
        const cert = fs.readFileSync(certificate).toString('base64');
        if (!profile.DeveloperCertificates?.some(value => value.replace(/\s/g, '') === cert)) throw new Error('certificate_not_in_profile');
        certificates.add(sha256File(certificate));
        return { bundle: expectedBundle, profile: profile.UUID, expires: profile.ExpirationDate, deviceCount: devices.length };
    });
    if (certificates.size !== 1) throw new Error('app_extension_signers_differ');
    return { team, version, build, signature: 'verified', sha256: sha256File(ipa), size: fs.statSync(ipa).size, products: checks };
}

const checksIndex = (product, app) => product === app ? 'app' : 'extension';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const [action, first, directory, team] = process.argv.slice(2);
        if (action === 'inspect') {
            const root = path.join(os.homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles');
            const profiles = fs.readdirSync(root).filter(name => name.endsWith('.mobileprovision')).map(name => readProfile(path.join(root, name)));
            const matching = profiles.filter(p => p.TeamIdentifier?.[0] === first && p.Entitlements?.['application-identifier']?.includes('one.atome.app'));
            process.stdout.write(JSON.stringify(matching.map(p => ({ name: p.Name, uuid: p.UUID, expires: p.ExpirationDate,
                bundle: p.Entitlements['application-identifier'], development: p.Entitlements['get-task-allow'], devices: p.ProvisionedDevices?.length || 0 })), null, 2) + '\n');
        } else if (action === 'device') {
            const profile = readProfile(first);
            process.stdout.write(JSON.stringify({ included: profile.ProvisionedDevices?.includes(directory) === true, expires: profile.ExpirationDate }) + '\n');
        } else if (action === 'validate') {
            const report = validateIpa(first, directory, team);
            fs.writeFileSync(path.join(directory, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
            process.stdout.write(JSON.stringify(report) + '\n');
        } else throw new Error('unknown_signing_action');
    } catch (error) { process.stderr.write(`Signing validation failed: ${error.message}\n`); process.exitCode = 1; }
}
