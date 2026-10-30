import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { plans, config, baseImage, preflight, builderRoot, projectRoot } from '../../platforms/atomeOS/builder/core/recipe.mjs';
import { parseArgs } from '../../platforms/atomeOS/builder/core/cli.mjs';
import { checksumFor, digest, readManifest, verifyManifest, finalize } from '../../platforms/atomeOS/builder/core/artifacts.mjs';
import { validateSourceEntry, prepareSources } from '../../platforms/atomeOS/builder/core/source.mjs';
import { remoteBuild } from '../../platforms/atomeOS/builder/core/remote.mjs';
import { assertSafeDisk, sameDisk, bootPhysicalDisks, copyBytes, hashHandle } from '../../platforms/atomeOS/builder/installer/sbc/flash.mjs';

fs.mkdirSync(path.join(projectRoot, 'temp/aos-tests'), { recursive: true });
const work = fs.mkdtempSync(path.join(projectRoot, 'temp/aos-tests/run-'));
after(() => fs.rmSync(work, { recursive: true }));
const cli = (...args) => spawnSync('/bin/sh', ['scripts/aOS.sh', ...args], { cwd: projectRoot, encoding: 'utf8' });
const hash = value => createHash('sha256').update(value).digest('hex');

test('PC, PINE64, Intel Mac and Apple Silicon Mac coexist, with cumulative modules', () => {
  const { options } = parseArgs(['plan', '--target', 'pc-amd64-uefi,pine64-a64', '--target', 'mac-vm-intel,mac-vm-apple-silicon', '--modules', 'display,audio', '--modules', 'midi']);
  const recipes = plans(options);
  assert.equal(recipes.length, 4);
  for (const recipe of recipes) assert.deepEqual(recipe.modules, ['audio', 'display', 'midi']);
  assert.deepEqual(recipes.map(p => p.target.arch), ['amd64', 'arm64', 'amd64', 'arm64']);
  assert.deepEqual(recipes.map(p => p.formats[0]), ['img', 'img', 'qcow2', 'qcow2']);
  assert.equal(plans({ target: 'all' }).length, Object.keys(config.targets).length);
  assert.equal(recipes[0].builder.sha256, recipes[1].builder.sha256);
});

test('board boot image differs from VM/UEFI base; VM formats never change guest architecture', () => {
  const pine = baseImage(config.targets['pine64-a64'], '15.1-RELEASE');
  assert.match(pine.url, /ISO-IMAGES\/15\.1\/FreeBSD-15\.1-RELEASE-arm64-aarch64-PINE64\.img\.xz$/);
  assert.doesNotMatch(pine.url, /LTS/);
  const recipe = plans({ target: 'mac-vm-apple-silicon', format: 'raw,qcow2,vmdk' })[0];
  assert.match(recipe.base.url, /aarch64\/Latest\/FreeBSD-15\.1-RELEASE-arm64-aarch64-ufs.raw.xz$/);
  assert.throws(() => plans({ target: 'pine64-a64', format: 'vmdk' }), /Unsupported format/);
});

test('bad selections, unknown options and implicit source builds fail', () => {
  for (const args of [['plan', '--target'], ['plan', '--profile', '../private'], ['build', '--yes'], ['flash', '--force'], ['plan', '--modules', 'invented']]) {
    assert.notEqual(cli(...args).status, 0, args.join(' '));
  }
  assert.match(cli('build', '--target', 'pine64-a64').stderr, /source-commit/);
  assert.throws(() => plans({ 'freebsd-version': 'latest' }), /explicit/);
  assert.throws(() => plans({ 'size-gib': 'NaN' }), /size-gib/);
});

test('host and runtime boundaries block rather than claim support; headless modules stay selected', () => {
  const recipe = plans({ target: 'pine64-a64', modules: 'audio,midi', offline: true })[0];
  assert.deepEqual(recipe.modules, ['audio', 'midi']);
  const check = preflight(recipe, 'darwin', 'arm64');
  assert.equal(check.ready, false);
  assert.match(check.issues.join(' '), /native FreeBSD/);
  assert.match(check.issues.join(' '), /Autonomous audio\/MIDI/);
  assert.match(check.issues.join(' '), /Offline assembly/);
  if (process.platform !== 'freebsd') {
    const result = cli('build', '--target', 'pc-amd64-uefi,pine64-a64', '--source-commit', 'HEAD', '--freebsd-version', '15.1-RELEASE');
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).length, 2);
    assert.ok(JSON.parse(result.stdout).every(r => r.status === 'blocked-or-failed'));
  }
});

test('official checksum parsing is exact, with no absent or duplicate entry accepted', () => {
  const sha = 'a'.repeat(64);
  assert.equal(checksumFor(`SHA256 (base.img.xz) = ${sha}\n`, 'base.img.xz'), sha);
  assert.equal(checksumFor(`${sha} *base.img.xz\n`, 'base.img.xz'), sha);
  assert.throws(() => checksumFor(`${sha} other.img.xz`, 'base.img.xz'));
  assert.throws(() => checksumFor(`${sha} base.img.xz\n${sha} base.img.xz`, 'base.img.xz'));
});

test('SSH dispatch rejects option injection and unsafe repository paths before any connection', async () => {
  for (const host of ['-evil@host', 'host;id', 'user@host/other', 'host$(id)']) {
    await assert.rejects(remoteBuild({}, host, '/safe/repo'), /Invalid SSH/);
  }
  for (const root of ['/safe/../private', '/path with spaces', '/safe;id', 'relative/repo']) {
    await assert.rejects(remoteBuild({}, 'builder', root), /absolute remote/);
  }
});

test('source export refuses secrets, state and symlinks; keeps only committed sources', async () => {
  for (const name of ['private/key.txt', 'server/.env', 'nested/private/file', 'a/key.pem', 'database_storage/a.db']) {
    assert.throws(() => validateSourceEntry('100644', name), /Sensitive/);
  }
  assert.throws(() => validateSourceEntry('120000', 'public-link'), /Non-regular/);
  validateSourceEntry('100644', 'server/server.js');
  const target = path.join(work, 'sources'); fs.mkdirSync(target);
  await prepareSources(plans({ target: 'pc-amd64-uefi' })[0], target);
  const entries = execFileSync('tar', ['-tf', path.join(target, 'framework.tar')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.match(entries, /server\/server.js/);
  assert.doesNotMatch(entries, /(^|\n)(private\/|\.git\/|database_storage\/|node_modules\/)/);
  const eveEntries = execFileSync('tar', ['-tf', path.join(target, 'eve.tar')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.match(eveEntries, /domains\//);
});

test('artifact finalization verifies compressed and decompressed hashes separately', async () => {
  const raw = path.join(work, 'base.img'); const bytes = Buffer.alloc(1024, 3); fs.writeFileSync(raw, bytes);
  const plan = plans({ target: 'pc-amd64-uefi', modules: '' })[0];
  const output = path.join(work, 'artifacts');
  const manifest = await finalize(plan, raw, output, { packages: [] });
  const result = await verifyManifest(manifest);
  const artifact = result.artifacts[0];
  assert.equal(artifact.payload.bytes, bytes.length);
  assert.equal(artifact.payload.sha256, hash(bytes));
  assert.notEqual(artifact.sha256, artifact.payload.sha256);
  assert.equal(result.manifest.evidence.production, false);
  assert.equal(result.manifest.evidence.vm, 'not-tested');
  const data = readManifest(manifest);
  data.artifacts[0].payload.bytes++;
  fs.writeFileSync(manifest, JSON.stringify(data));
  await assert.rejects(verifyManifest(manifest), /Payload checksum\/length/);
  data.artifacts[0].file = '../private/key'; fs.writeFileSync(manifest, JSON.stringify(data));
  assert.throws(() => readManifest(manifest), /Invalid artifact/);
});

test('corruption and short readback cannot pass integrity verification', async () => {
  const file = path.join(work, 'short.img'); fs.writeFileSync(file, Buffer.alloc(512));
  await assert.rejects(digest(file, 1024), /Short read/);
  const handle = await fs.promises.open(file, 'r');
  try { await assert.rejects(hashHandle(handle, 1024), /Short readback/); } finally { await handle.close(); }
});

const diskInfo = { DeviceIdentifier: 'disk7', DeviceNode: '/dev/disk7', WholeDisk: true, Internal: false, VirtualOrPhysical: 'Physical',
  Writable: true, Ejectable: true, BusProtocol: 'USB', TotalSize: 16 * 1024 ** 3, MediaName: 'Test USB', DeviceTreePath: 'usb/test', DeviceBlockSize: 512 };
const registry = { 'BSD Name': 'disk7', IORegistryEntryID: 12345, Whole: true };
test('flash refuses internal, ambiguous, partial, virtual and undersized supports', () => {
  const safe = assertSafeDisk(diskInfo, registry, 13 * 1024 ** 3);
  sameDisk(safe, assertSafeDisk({ ...diskInfo }, { ...registry }));
  for (const diff of [{ Internal: true }, { WholeDisk: false }, { VirtualOrPhysical: 'Virtual' }, { DeviceIdentifier: 'disk7s1' },
    { Writable: false }, { TotalSize: 512 }, { Ejectable: false }, { MountPoint: '/' }, { BusProtocol: 'Unknown' }]) {
    assert.throws(() => assertSafeDisk({ ...diskInfo, ...diff }, registry, 1024));
  }
  assert.throws(() => assertSafeDisk(diskInfo, null), /Refusing disk/);
  assert.throws(() => sameDisk(safe, assertSafeDisk(diskInfo, { ...registry, IORegistryEntryID: 54321 })), /identity changed/);
});

test('APFS snapshots resolve physical boot stores, including external boot disks', () => {
  const root = { DeviceIdentifier: 'disk3s5s1', ParentWholeDisk: 'disk3', FilesystemType: 'apfs' };
  const apfs = { Containers: [{ ContainerReference: 'disk3', PhysicalStores: [{ DeviceIdentifier: 'disk7s2' }] }] };
  assert.equal(bootPhysicalDisks(root, apfs).has('disk7'), true);
  assert.throws(() => bootPhysicalDisks(root, { Containers: [] }), /boot container/);
  assert.throws(() => bootPhysicalDisks({}, {}), /boot disk identity/);
});

test('write handles partial writes, aborts and verifies only the declared payload bytes', async () => {
  const input = path.join(work, 'input.img'), output = path.join(work, 'support.img');
  fs.writeFileSync(input, Buffer.alloc(1024, 5)); fs.writeFileSync(output, Buffer.alloc(2048, 9));
  const source = await fs.promises.open(input, 'r'), target = await fs.promises.open(output, 'r+');
  try {
    const partial = { write: (buffer, offset, length, position) => target.write(buffer, offset, Math.min(length, 128), position) };
    await copyBytes(source, partial, 1024);
    assert.equal(await hashHandle(target, 1024), hash(Buffer.alloc(1024, 5)));
    assert.deepEqual(fs.readFileSync(output).subarray(1024), Buffer.alloc(1024, 9));
    const controller = new AbortController(); controller.abort(new Error('interrupted'));
    await assert.rejects(copyBytes(source, partial, 1024, { signal: controller.signal }), /interrupted/);
    await assert.rejects(copyBytes(source, { write: async () => ({ bytesWritten: 0 }) }, 1024), /Short media write/);
  } finally { await source.close(); await target.close(); }
});

test('all builder shell files parse; no obsolete updater or alternate generator remains', () => {
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(sh|rc)$/.test(entry.name)) assert.equal(spawnSync('/bin/sh', ['-n', full]).status, 0, full);
    }
  };
  visit(builderRoot);
  assert.equal(fs.existsSync(path.join(builderRoot, 'overlays/services/atome_updater.sh')), false);
  assert.equal(fs.existsSync(path.join(builderRoot, 'core/lib/yaml.sh')), false);
});
