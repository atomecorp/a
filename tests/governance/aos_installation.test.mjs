import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { plans, projectRoot } from '../../platforms/atomeOS/builder/core/recipe.mjs';
import { parseArgs } from '../../platforms/atomeOS/builder/core/cli.mjs';
import { downloadRelease, chooseArtifact } from '../../platforms/atomeOS/builder/core/download.mjs';
import { selectedDevice } from '../../platforms/atomeOS/builder/installer/sbc/flash.mjs';
import { geomTopology, diskAncestors, parseDisks, assertInstallDisk, installScript, installSystem } from '../../platforms/atomeOS/builder/installer/desktop/install.mjs';
import { productionRelease, latestProductionRelease } from '../../platforms/atomeOS/builder/core/releases.mjs';

const work = fs.mkdtempSync(path.join(projectRoot, 'temp/aos-tests/install-'));
after(() => fs.rmSync(work, { recursive: true }));
const bytes = Buffer.alloc(512, 3);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const fixture = () => ({ schema: 1, product: 'atome/eVe OS', mode: 'live', target: { id: 'pc-amd64-uefi', family: 'pc' },
  artifacts: [{ file: 'system.img', format: 'img', compression: 'none', bytes: bytes.length, sha256, payload: { bytes: bytes.length, sha256 } }] });

test('official production version is resolved without a guessed fallback', async () => {
  const html = 'Production Release: <a href="/releases/15.1R/">15.1</a>';
  assert.equal(productionRelease(html), '15.1-RELEASE');
  assert.throws(() => productionRelease('missing release'), /Cannot identify/);
  assert.equal(await latestProductionRelease(async () => new Response(html)), '15.1-RELEASE');
  await assert.rejects(latestProductionRelease(async () => new Response('', { status: 503 })), /503/);
});

test('both PC deployment modes compose without dropping the other target families', () => {
  const recipes = plans({ target: 'pc-amd64-uefi', mode: 'live,installer', modules: 'display,audio,midi' });
  assert.deepEqual(recipes.map(r => r.mode), ['live', 'installer']);
  assert.deepEqual(recipes.map(r => r.image_bytes / 1024 ** 3), [13, 34]);
  assert.ok(recipes.every(r => r.modules.includes('audio') && r.modules.includes('midi')));
  assert.equal(plans({ target: 'all', mode: 'all' }).length, 7);
  assert.throws(() => plans({ target: 'pine64-a64', mode: 'installer' }), /Unsupported mode/);
  assert.throws(() => plans({ target: 'mac-vm-intel', mode: 'installer' }), /Unsupported mode/);
  assert.throws(() => plans({ mode: 'mystery' }), /Use --mode/);
  const args = parseArgs(['build', '--target', 'pc-amd64-uefi', '--mode', 'live', '--mode', 'installer']);
  assert.equal(plans(args.options).length, 2);
});

test('support selection never defaults to the first disk and rejects ambiguous input', () => {
  const disks = [{ device: '/dev/disk7' }, { device: '/dev/disk9' }];
  assert.equal(selectedDevice('2', disks), '/dev/disk9');
  for (const value of ['', '0', '01', '-1', '3', '1.5', 'disk7']) assert.throws(() => selectedDevice(value, disks));
});

test('HTTPS release download verifies the exact artifact before exposing a completed result', async () => {
  const calls = [];
  const root = path.join(work, 'success');
  const result = await downloadRelease('https://downloads.example.test/v1/manifest.json', root,
    { target: 'pc-amd64-uefi', mode: 'live' }, { request: async url => {
      calls.push(String(url));
      return new Response(String(url).endsWith('manifest.json') ? JSON.stringify(fixture()) : bytes);
    } });
  assert.equal(result.integrity, 'verified');
  assert.equal(result.authenticity, 'unsigned-development-artifact');
  assert.deepEqual(fs.readFileSync(result.image), bytes);
  assert.equal(calls[1], 'https://downloads.example.test/v1/system.img');
});

test('release download refuses corruption, unsafe transport and target/mode mismatch', async () => {
  for (const url of ['http://example.test/manifest.json', 'https://user:password@example.test/manifest.json']) {
    await assert.rejects(downloadRelease(url, path.join(work, 'unsafe')), /HTTPS/);
  }
  await assert.rejects(downloadRelease('https://example.test/manifest.json', path.join(work, 'redirect'), {}, {
    request: async () => new Response(null, { status: 302, headers: { location: 'http://example.test/manifest.json' } })
  }), /HTTPS/);
  const root = path.join(work, 'corrupt');
  await assert.rejects(downloadRelease('https://example.test/manifest.json', root, {}, {
    request: async url => new Response(String(url).endsWith('manifest.json') ? JSON.stringify(fixture()) : Buffer.alloc(512, 8))
  }), /checksum/);
  assert.deepEqual(fs.readdirSync(root), []);
  assert.throws(() => chooseArtifact(fixture(), { target: 'pine64-a64' }), /target/);
  assert.throws(() => chooseArtifact(fixture(), { mode: 'installer' }), /mode/);
  assert.throws(() => chooseArtifact({ artifacts: [...fixture().artifacts, { ...fixture().artifacts[0], file: 'other.img' }] }), /exactly one/);
});

const topologyXml = `<mesh>
<class id="c1"><name>DISK</name>
<geom id="g1"><name>da0</name><provider id="p1"><name>da0</name><mode>r1w1e0</mode></provider></geom>
<geom id="g2"><name>ada0</name><provider id="p2"><name>ada0</name><mode>r0w0e0</mode></provider></geom>
</class>
<class id="c2"><name>PART</name><geom id="g3"><name>da0</name><consumer id="c3"><provider ref="p1"/></consumer><provider id="p3"><name>da0p2</name><mode>r1w1e0</mode></provider></geom></class>
<class id="c4"><name>LABEL</name><geom id="g4"><name>ufs/rootfs</name><consumer id="c5"><provider ref="p3"/></consumer><provider id="p4"><name>ufs/rootfs</name><mode>r1w1e0</mode></provider></geom></class>
</mesh>`;
const listing = `Geom name: da0
   ident: USB-123
   descr: Installer USB
Providers:
1. Name: da0
   Mediasize: 36507222016 (34G)
Geom name: ada0
   ident: SSD-456
   descr: Internal SSD
Providers:
1. Name: ada0
   Mediasize: 137438953472 (128G)
`;

test('native storage protection resolves root labels to the boot support and refuses open disks', () => {
  const topology = geomTopology(topologyXml);
  const active = diskAncestors(topology, 'ufs/rootfs');
  assert.deepEqual([...active], ['da0']);
  const disks = parseDisks(listing, topology);
  assert.equal(assertInstallDisk(disks[1], active, 13 * 1024 ** 3).name, 'ada0');
  assert.throws(() => assertInstallDisk(disks[0], active, 512), /active disk/);
  assert.throws(() => assertInstallDisk({ ...disks[1], mode: 'r1w0e0' }, active, 512), /active disk/);
  assert.throws(() => assertInstallDisk({ ...disks[1], identity: '' }, active, 512), /identified/);
  assert.throws(() => assertInstallDisk(disks[1], active, 2 ** 50), /capacity/);
  assert.throws(() => diskAncestors(topology, 'unknown'), /Ambiguous/);
  assert.throws(() => geomTopology('<mesh/>'), /topology/);
});

test('native install uses bsdinstall with one explicit disk and never acts on the Mac', async () => {
  assert.match(installScript('ada0'), /^PARTITIONS="ada0 GPT/);
  assert.match(installScript('ada0'), /DISTRIBUTIONS="system.txz"/);
  assert.throws(() => installScript('ada0; reboot'), /Invalid/);
  assert.throws(() => installScript('ada0p2'), /Invalid/);
  if (process.platform !== 'freebsd') await assert.rejects(installSystem({ device: 'ada0' }), /never on the Mac/);
});

test('prepare cannot write media noninteractively, and download requires an explicit release source', () => {
  const run = (...args) => spawnSync('/bin/sh', ['scripts/aOS.sh', ...args], { cwd: projectRoot, encoding: 'utf8' });
  assert.match(run('prepare', '--target', 'pine64-a64').stderr, /interactive terminal|macOS/);
  assert.match(run('download').stderr, /manifest-url/);
  assert.equal(run('install', '--device', 'ada0').status, 1);
});
