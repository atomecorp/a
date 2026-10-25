import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Fastify from 'fastify';
import { initialize, stage, publish, current, hashFile, cleanup, rollback, finalize, enroll, readJson, atomicJson, withStoreLock, probe } from '../../scripts/ios/ota-store.mjs';
import { manifest, DOWNLOAD_TTL_MS, CURRENT_MANIFEST_PATH, issueCapability, verifyCapability, tokenHash } from '../../scripts/ios/ota-contract.mjs';
import { validateProfile, readPlist } from '../../scripts/ios/signing.mjs';
import { registerIosOtaRoutes } from '../../server/http_ios_ota_routes.js';
import { productContents, ledgerContent, writeContents, PROJECT_FILE, PRODUCT_FILES } from '../../scripts/ios/version-ledger.mjs';

const fixtures = [];
function fixture() {
    const root = fs.mkdtempSync(path.resolve('temp/ios-ota-test-'));
    fixtures.push(root); initialize(root); return root;
}
afterEach(() => { for (const root of fixtures.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
async function candidate(root, build = '24', content = 'signed-ipa-fixture') {
    const id = randomUUID(); const { ipa } = stage(id, root); fs.writeFileSync(ipa, content);
    return { id, version: '1.25', build, team: '2W25PVZ57F', signature: 'verified', sha256: await hashFile(ipa), size: fs.statSync(ipa).size,
        products: ['one.atome.app', 'one.atome.app.atome'].map(bundle => ({ bundle, expires: '2030-01-01T00:00:00Z', deviceCount: 9 })) };
}
describe('OTA immutable publication lifecycle', () => {
    it('rejects an interrupted upload without altering the last valid build', async () => {
        const root = fixture(); const first = await candidate(root); await publish(first, 'https://atome.one', root);
        const next = await candidate(root, '25'); fs.writeFileSync(stage(next.id, root).ipa, 'partial');
        await expect(publish(next, 'https://atome.one', root)).rejects.toThrow('integrity');
        expect(current(root).id).toBe(first.id);
    });
    it('rejects concurrent publication, collisions and decreasing builds', async () => {
        const root = fixture(); const first = await candidate(root);
        await withStoreLock(root, async () => { await expect(publish(first, 'https://atome.one', root)).rejects.toThrow('busy'); });
        await publish(first, 'https://atome.one', root);
        await expect(publish({ ...first, sha256: '0'.repeat(64) }, 'https://atome.one', root)).rejects.toThrow('collision');
        await expect(publish(await candidate(root), 'https://atome.one', root)).rejects.toThrow('not_increasing');
    });
    it('keeps one build: the replaced one only until the publication is verified or rolled back', async () => {
        const root = fixture(); const releases = () => fs.readdirSync(path.join(root, 'releases'));
        const first = await candidate(root); await publish(first, 'https://atome.one', root);
        const next = await candidate(root, '25'); await publish(next, 'https://atome.one', root);
        expect(cleanup(root)).toEqual([]);
        await rollback(next.id, root); expect(current(root).id).toBe(first.id);
        expect(releases()).toEqual([first.id]);
        const third = await candidate(root, '26'); await publish(third, 'https://atome.one', root);
        const stale = randomUUID(); fs.writeFileSync(stage(stale, root).ipa, 'abandoned');
        await expect(finalize(first.id, root)).rejects.toThrow('finalize_current_changed');
        expect((await finalize(third.id, root)).removed.sort()).toEqual([first.id, stale].sort());
        expect(releases()).toEqual([third.id]);
        expect(fs.readdirSync(path.join(root, '.incoming'))).toEqual([]);
        expect(fs.existsSync(path.join(root, 'releases', third.id, 'atome.ipa'))).toBe(true);
        const fourth = await candidate(root, '27'); await publish(fourth, 'https://atome.one', root);
        await publish(await candidate(root, '28'), 'https://atome.one', root);
        expect(cleanup(root, new Set([third.id]))).toEqual([]);
        expect(cleanup(root)).toEqual([third.id]);
        expect(releases().length).toBe(2);
    });
    it('rejects symlinks and invalid provisioning before publication', async () => {
        const root = fixture(); const next = await candidate(root); next.products[1].deviceCount = 0;
        await expect(publish(next, 'https://atome.one', root)).rejects.toThrow('provisioning');
        const id = randomUUID(); fs.symlinkSync(root, path.join(root, '.incoming', id));
        expect(() => stage(id, root)).toThrow('symlink');
    });
    it('unpublishes a failed first release and scopes live probes to enrolled testers', async () => {
        const root = fixture(); const first = await candidate(root); await publish(first, 'https://atome.one', root);
        expect(() => probe(root)).toThrow('no_registered_testers');
        enroll('owner', root); expect(probe(root).manifestUrl).toContain(`https://atome.one${CURRENT_MANIFEST_PATH}?cap=`);
        expect(await rollback(first.id, root)).toEqual({ unpublished: true });
        expect(current(root)).toBeNull();
        expect(() => probe(root)).toThrow('no_published_release');
    });
});
describe('OTA access and wire contracts', () => {
    it('generates a parseable Apple plist with escaped HTTPS URLs and build metadata', () => {
        const value = manifest({ id: randomUUID(), version: '1.25', build: '24' }, 'https://atome.one/a?x=1&y=2');
        const parsed = readPlist(value); expect(parsed.items[0].metadata['bundle-version']).toBe('24');
        expect(parsed.items[0].assets[0].url).toBe('https://atome.one/a?x=1&y=2');
        expect(() => manifest({ id: randomUUID(), version: '1.25', build: '24' }, 'http://atome.one/a')).toThrow();
    });
    it('rejects tampered, expired and overlong-lived capabilities', () => {
        const now = Date.now(); const payload = { id: randomUUID(), user: '0'.repeat(64), expires: now + DOWNLOAD_TTL_MS };
        const cap = issueCapability('secret', payload); expect(verifyCapability('secret', cap, now)).toEqual(payload);
        expect(() => verifyCapability('wrong', cap, now)).toThrow();
        expect(() => verifyCapability('secret', cap, payload.expires)).toThrow();
        expect(() => verifyCapability('secret', cap, now - 1)).toThrow();
        const stable = { user: '0'.repeat(64), expires: now + DOWNLOAD_TTL_MS };
        expect(verifyCapability('secret', issueCapability('secret', stable), now)).toEqual(stable);
        expect(() => verifyCapability('secret', issueCapability('secret', { ...stable, id: 'x' }), now)).toThrow();
    });
    it('authorizes a personal link, serves a cookie-free manifest/IPA range, and revokes both', async () => {
        const root = fixture(); const report = await candidate(root); await publish(report, 'https://atome.one', root);
        const { token } = enroll('owner', root); const server = Fastify(); registerIosOtaRoutes(server, { root });
        try {
            expect((await server.inject('/ios/builds/invalid/atome.ipa')).statusCode).toBe(403);
            await withStoreLock(root, async () => {
                expect((await server.inject({ method: 'POST', url: '/ios/session', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(503);
            });
            const session = await server.inject({ method: 'POST', url: '/ios/session', headers: { authorization: `Bearer ${token}` } });
            expect(session.statusCode).toBe(200);
            const install = new URL(session.json().install); const url = new URL(install.searchParams.get('url'));
            expect(url.pathname).toBe(CURRENT_MANIFEST_PATH);
            const plist = await server.inject(url.pathname + url.search); expect(plist.statusCode).toBe(200);
            const ipa = new URL(readPlist(plist.body).items[0].assets[0].url);
            expect(ipa.pathname).toBe(`/ios/builds/${report.id}/atome.ipa`);
            expect((await server.inject(`${CURRENT_MANIFEST_PATH}${ipa.search}`)).statusCode).toBe(403);
            expect((await server.inject(`/ios/builds/${report.id}/atome.ipa${url.search}`)).statusCode).toBe(403);
            const newer = await candidate(root, '25', 'signed-newer'); await publish(newer, 'https://atome.one', root);
            const same = readPlist((await server.inject(url.pathname + url.search)).body).items[0];
            expect(same.metadata['bundle-version']).toBe('25');
            expect(new URL(same.assets[0].url).pathname).toBe(`/ios/builds/${newer.id}/atome.ipa`);
            const ranged = await server.inject({ url: ipa.pathname + ipa.search, headers: { range: 'bytes=0-5' } });
            expect(ranged.statusCode).toBe(206); expect(ranged.body).toBe('signed');
            expect((await server.inject({ url: ipa.pathname + ipa.search, headers: { range: 'bytes=999-' } })).statusCode).toBe(416);
            const config = readJson(path.join(root, 'settings.json')); config.users[tokenHash(token)].enabled = false;
            atomicJson(path.join(root, 'settings.json'), config);
            expect((await server.inject(ipa.pathname + ipa.search)).statusCode).toBe(403);
            expect((await server.inject({ method: 'POST', url: '/ios/session', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(403);
        } finally { await server.close(); }
    });
    it('refuses development, App Store, expired and wrong-identity profiles', () => {
        const profile = { TeamIdentifier: ['TEAM'], Entitlements: { 'application-identifier': 'TEAM.app', 'get-task-allow': false },
            ProvisionedDevices: ['B', 'A'], ExpirationDate: '2030-01-01' };
        expect(validateProfile(profile, { bundle: 'app', team: 'TEAM' })).toEqual(['A', 'B']);
        for (const changed of [{ ExpirationDate: '2000-01-01' }, { ProvisionedDevices: [] }, { ProvisionsAllDevices: true },
            { Entitlements: { ...profile.Entitlements, 'get-task-allow': true } }])
            expect(() => validateProfile({ ...profile, ...changed }, { bundle: 'app', team: 'TEAM' })).toThrow();
    });
    it('keeps TestFlight default and rejects conflicting dry-run/publish arguments before effects', () => {
        expect(execFileSync('bash', ['scripts/XCode_testflight_generator', '--help'], { encoding: 'utf8' })).toContain('--adhoc');
        expect(() => execFileSync('bash', ['scripts/XCode_testflight_generator', '--adhoc', '--dry-run', '--publish', 'no-file'], { stdio: 'pipe' })).toThrow();
        expect(fs.readFileSync('scripts/XCode_testflight_generator', 'utf8')).toContain('CHANNEL="testflight"');
    });
});

describe('shared version ledger and unchanged TestFlight entry', () => {
    function versionFixture() {
        const root = fixture();
        const put = (file, content) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), content); };
        put(PROJECT_FILE, 'MARKETING_VERSION = 1.24; CURRENT_PROJECT_VERSION = 23;\nMARKETING_VERSION = 1.24; CURRENT_PROJECT_VERSION = 23;\nOTHER = keep;');
        for (const file of PRODUCT_FILES) put(file, file.endsWith('.json') ? '{"version":"1.24","unrelated":42}' : '1.24');
        return { root, put };
    }
    it('advances all four sources through one writer without altering unrelated values', () => {
        const { root } = versionFixture();
        const contents = { ...productContents(root, '1.25'), [PROJECT_FILE]: ledgerContent(root, '1.24', '1.25', '23', '24') };
        writeContents(root, contents);
        expect(fs.readFileSync(path.join(root, PROJECT_FILE), 'utf8')).toContain('MARKETING_VERSION = 1.25; CURRENT_PROJECT_VERSION = 24;');
        expect(fs.readFileSync(path.join(root, PROJECT_FILE), 'utf8')).toContain('OTHER = keep;');
        expect(JSON.parse(fs.readFileSync(path.join(root, PRODUCT_FILES[2])))).toEqual({ version: '1.25', unrelated: 42 });
        expect(() => ledgerContent(root, '1.24', '1.25', '23', '24')).toThrow('baseline');
    });
    it('rejects a wrong baseline and invalid version before any ledger write', () => {
        const { root } = versionFixture();
        expect(() => productContents(root, 'invalid')).toThrow();
        expect(() => ledgerContent(root, '1.24', '1.25', '999', '24')).toThrow();
        expect(fs.readFileSync(path.join(root, PRODUCT_FILES[0]), 'utf8')).toBe('1.24');
    });
    it('runs the TestFlight default dry-run with fake Xcode and leaves versions untouched', () => {
        const { root, put } = versionFixture();
        put('scripts/XCode_testflight_generator', fs.readFileSync('scripts/XCode_testflight_generator'));
        fs.cpSync('scripts/ios', path.join(root, 'scripts/ios'), { recursive: true });
        put('bin/xcodebuild', `#!/usr/bin/env bash
if [[ " $* " == *" -version "* ]]; then echo 'Xcode 27.0'; exit; fi
if [[ " $* " == *" -list "* ]]; then echo '{"project":{"schemes":["atome"],"targets":["atome","atomeAudioUnit"]}}'; exit; fi
if [[ " $* " == *" -target atomeAudioUnit "* ]]; then
 echo ' PRODUCT_TYPE = com.apple.product-type.app-extension'; echo ' PRODUCT_BUNDLE_IDENTIFIER = one.atome.app.atome'
else echo ' PRODUCT_TYPE = com.apple.product-type.application'; echo ' PRODUCT_BUNDLE_IDENTIFIER = one.atome.app'; fi
echo ' MARKETING_VERSION = 1.24'; echo ' CURRENT_PROJECT_VERSION = 23'; echo ' DEVELOPMENT_TEAM = 2W25PVZ57F'; echo ' CODE_SIGN_STYLE = Automatic'
`);
        put('bin/xcrun', '#!/usr/bin/env bash\nexit 0\n');
        fs.chmodSync(path.join(root, 'bin/xcodebuild'), 0o755); fs.chmodSync(path.join(root, 'bin/xcrun'), 0o755);
        const output = execFileSync('bash', [path.join(root, 'scripts/XCode_testflight_generator'), '--dry-run'],
            { encoding: 'utf8', env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}` } });
        expect(output).toContain('DRY RUN SUCCESS'); expect(output).toContain('Planned export method: app-store-connect');
        expect(output).toContain('New build: 24');
        expect(fs.readFileSync(path.join(root, PRODUCT_FILES[0]), 'utf8')).toBe('1.24');
        expect(fs.existsSync(path.join(root, 'temp/ios-release.lock'))).toBe(false);
    });
});
