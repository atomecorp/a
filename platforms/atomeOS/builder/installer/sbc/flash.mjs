import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { pipeline } from 'node:stream/promises';
import { readManifest, verifyManifest } from '../../core/artifacts.mjs';

function plist(command, args) {
  const xml = execFileSync(command, args, { maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: xml, encoding: 'utf8' }));
}

function mediaEntry(tree, id) {
  for (const node of tree) {
    if (node['BSD Name'] === id) return node;
    const found = mediaEntry(node.IORegistryEntryChildren || [], id);
    if (found) return found;
  }
  return null;
}

export function assertSafeDisk(info, registry, requiredBytes = 0) {
  if (!/^disk\d+$/.test(info.DeviceIdentifier) || info.DeviceNode !== `/dev/${info.DeviceIdentifier}` || info.Whole !== true
    || info.Internal !== false || info.VirtualOrPhysical !== 'Physical' || info.Writable !== true
    || info.Ejectable !== true || !['USB', 'Secure Digital'].includes(info.BusProtocol)
    || !Number.isSafeInteger(info.TotalSize) || info.TotalSize < requiredBytes
    || !info.MediaName || !registry?.IORegistryEntryID || registry['BSD Name'] !== info.DeviceIdentifier) {
    throw new Error('Refusing disk: require an identified writable external physical USB/SD whole disk with sufficient capacity');
  }
  if (info.MountPoint === '/' || info.OSInternalMedia === true || info.ReadOnlyMedia === true) throw new Error('System/sensitive disk refused');
  return { device: info.DeviceNode, id: info.DeviceIdentifier, name: info.MediaName, bytes: info.TotalSize,
    registry: String(registry.IORegistryEntryID), tree: info.DeviceTreePath || '', bus: info.BusProtocol,
    block_size: info.DeviceBlockSize };
}

export function sameDisk(expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Disk identity changed; write cancelled');
}

export function bootPhysicalDisks(root, apfs) {
  const result = new Set();
  if (/^disk\d+$/.test(root.ParentWholeDisk)) result.add(root.ParentWholeDisk);
  const container = (apfs.Containers || []).find(item =>
    root.APFSContainerReference === item.ContainerReference || root.ParentWholeDisk === item.ContainerReference
    || root.DeviceIdentifier?.startsWith(`${item.ContainerReference}s`));
  if (container) {
    if (!container.PhysicalStores?.length) throw new Error('Cannot identify boot container physical stores');
    for (const store of container.PhysicalStores) {
      const match = /^(disk\d+)(?:s\d+)+$/.exec(store.DeviceIdentifier);
      if (!match) throw new Error('Ambiguous boot physical store');
      result.add(match[1]);
    }
  } else if (root.APFSContainerReference || /apfs/i.test(root.FilesystemType || root.FileSystemPersonality || '')) {
    throw new Error('Cannot establish the boot container physical identity');
  }
  if (!result.size) throw new Error('Cannot establish boot disk identity');
  return result;
}

export function inspectDisk(id, requiredBytes = 0) {
  if (!/^disk\d+$/.test(id)) throw new Error('Use a whole disk identifier, for example disk7');
  const info = plist('diskutil', ['info', '-plist', `/dev/${id}`]);
  const registry = mediaEntry(plist('ioreg', ['-a', '-r', '-c', 'IOMedia']), id);
  const safe = assertSafeDisk(info, registry, requiredBytes);
  const root = plist('diskutil', ['info', '-plist', '/']);
  const boot = bootPhysicalDisks(root, plist('diskutil', ['apfs', 'list', '-plist']));
  if (boot.has(id)) throw new Error('Boot disk refused');
  return safe;
}

export function listDevices() {
  if (process.platform !== 'darwin') throw new Error('Device discovery is macOS-only');
  const list = plist('diskutil', ['list', '-plist', 'external', 'physical']);
  return (list.AllDisksAndPartitions || []).map(disk => {
    const info = plist('diskutil', ['info', '-plist', `/dev/${disk.DeviceIdentifier}`]);
    return { device: info.DeviceNode, name: info.MediaName, bytes: info.TotalSize, internal: info.Internal,
      volumes: (disk.Partitions || []).map(p => ({ name: p.VolumeName || null, device: p.DeviceIdentifier, bytes: p.Size })) };
  });
}

export async function copyBytes(source, destination, bytes, { signal, progress = () => {} } = {}) {
  const buffer = Buffer.alloc(3 * 1024 * 1024);
  let position = 0;
  while (position < bytes) {
    signal?.throwIfAborted();
    const wanted = Math.min(buffer.length, bytes - position);
    const { bytesRead } = await source.read(buffer, 0, wanted, position);
    if (bytesRead !== wanted) throw new Error('Short image read; media may be partially written');
    let written = 0;
    while (written < bytesRead) {
      signal?.throwIfAborted();
      const result = await destination.write(buffer, written, bytesRead - written, position + written);
      if (!result.bytesWritten) throw new Error('Short media write');
      written += result.bytesWritten;
    }
    position += bytesRead;
    progress(position, bytes);
  }
}

export async function hashHandle(handle, bytes, signal) {
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(3 * 1024 * 1024);
  let position = 0;
  while (position < bytes) {
    signal?.throwIfAborted();
    const result = await handle.read(buffer, 0, Math.min(buffer.length, bytes - position), position);
    if (!result.bytesRead) throw new Error('Short readback');
    hash.update(buffer.subarray(0, result.bytesRead));
    position += result.bytesRead;
  }
  return hash.digest('hex');
}

async function stagePayload(image, artifact, staging) {
  const raw = path.join(staging, 'payload.img');
  if (artifact.compression === 'xz') {
    const child = spawn('xz', ['-dc', '--', image], { stdio: ['ignore', 'pipe', 'inherit'] });
    const completed = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error('Image decompression failed')));
    });
    await Promise.all([completed, pipeline(child.stdout, fs.createWriteStream(raw, { flags: 'wx', mode: 0o600 }))]);
  } else fs.copyFileSync(image, raw, fs.constants.COPYFILE_EXCL);
  return fs.promises.open(raw, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
}

export async function flash({ manifest, image, device, stagingRoot }) {
  if (process.platform !== 'darwin') throw new Error('Flash is macOS-only');
  if (!process.stdin.isTTY) throw new Error('Flash requires an interactive terminal and an identity-specific confirmation');
  if (process.getuid() !== 0) throw new Error('Run the explicit flash command with sudo; no disk has been changed');
  const data = readManifest(manifest);
  if (!image || !device) throw new Error('--image and --device are required');
  const id = device.replace(/^\/dev\//, '');
  const artifact = data.artifacts.find(a => a.file === path.basename(image));
  if (!artifact || !['img', 'raw'].includes(artifact.format) || data.target.family === 'vm') throw new Error('Flash requires an external-boot raw/img artifact, not a VM disk');
  const bytes = artifact.payload.bytes;
  if (bytes % 512 !== 0) throw new Error('Payload length must be aligned to disk sectors');
  const identity = inspectDisk(id, bytes);
  await verifyManifest(manifest, image);
  fs.mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
  const space = fs.statfsSync(stagingRoot);
  if (space.bavail * space.bsize < bytes + 1024 ** 3) throw new Error('Insufficient space to stage the verified image');
  const staging = fs.mkdtempSync(path.join(stagingRoot, 'flash-'));
  const abort = new AbortController();
  const interrupt = () => abort.abort(new Error('Flash interrupted; the support must be reflashed'));
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  let source, disk;
  try {
    source = await stagePayload(path.resolve(image), artifact, staging);
    if ((await source.stat()).size !== bytes || await hashHandle(source, bytes, abort.signal) !== artifact.payload.sha256) throw new Error('Staged payload mismatch');
    const phrase = `ERASE ${identity.device} ${identity.bytes} ${identity.registry}`;
    process.stdout.write(`${JSON.stringify({ disk: identity, target: data.target, payload: artifact.payload }, null, 2)}\nUnsigned development image. All content on this support will be erased.\nType exactly: ${phrase}\n`);
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    let answer;
    try { answer = await prompt.question('> ', { signal: abort.signal }); } finally { prompt.close(); }
    if (answer !== phrase) throw new Error('Confirmation did not match; nothing written');
    abort.signal.throwIfAborted();
    sameDisk(identity, inspectDisk(id, bytes));
    execFileSync('diskutil', ['unmountDisk', identity.device], { stdio: 'inherit' });
    sameDisk(identity, inspectDisk(id, bytes));
    disk = await fs.promises.open(`/dev/r${id}`, fs.constants.O_RDWR);
    if (!(await disk.stat()).isCharacterDevice()) throw new Error('Raw disk is not a character device');
    sameDisk(identity, inspectDisk(id, bytes));
    let last = -1;
    await copyBytes(source, disk, bytes, { signal: abort.signal, progress(done, total) {
      const percent = Math.floor(done * 100 / total);
      if (percent !== last) { process.stderr.write(`\rWriting ${percent}%`); last = percent; }
    } });
    await disk.sync();
    execFileSync('sync', []);
    process.stderr.write('\nVerifying every written payload byte...\n');
    if (await hashHandle(disk, bytes, abort.signal) !== artifact.payload.sha256) throw new Error('Media readback mismatch; reflash required');
    await disk.close(); disk = undefined;
    sameDisk(identity, inspectDisk(id, bytes));
    execFileSync('diskutil', ['eject', identity.device], { stdio: 'inherit' });
    return { written_and_verified_bytes: bytes, sha256: artifact.payload.sha256, target: data.target.id, ejected: true };
  } finally {
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    if (disk) await disk.close();
    if (source) await source.close();
    fs.rmSync(staging, { recursive: true });
  }
}
