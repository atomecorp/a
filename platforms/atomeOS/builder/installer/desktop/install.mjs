// Internal installation belongs to native FreeBSD bsdinstall. No raw disk copier
// or application runtime is duplicated here. This command never runs on macOS.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { digest } from '../../core/artifacts.mjs';

const distDir = '/usr/local/share/aos-installer';
const diskName = /^(?:ada|da|nda|nvd|vtbd|mmcsd)[0-9]+$/;
const text = value => String(value || '').replace(/[\x00-\x1f\x7f]/g, '').trim();
const xmlText = value => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[key]);
const query = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

export function geomTopology(xml) {
  const providers = new Map();
  for (const group of xml.matchAll(/<class id="[^"]+">([\s\S]*?)<\/class>/g)) {
    const className = /<name>([^<]+)<\/name>/.exec(group[1])?.[1];
    for (const item of group[1].matchAll(/<geom id="([^"]+)">([\s\S]*?)<\/geom>/g)) {
      const geom = { id: item[1], className, consumers: [] };
      for (const consumer of item[2].matchAll(/<consumer id="[^"]+">([\s\S]*?)<\/consumer>/g)) {
        const ref = /<provider ref="([^"]+)"\s*\/>/.exec(consumer[1])?.[1];
        if (ref) geom.consumers.push(ref);
      }
      for (const provider of item[2].matchAll(/<provider id="([^"]+)">([\s\S]*?)<\/provider>/g)) {
        const name = /<name>([^<]+)<\/name>/.exec(provider[2])?.[1];
        if (!name) throw new Error('Incomplete GEOM provider metadata');
        const mode = /<mode>([^<]+)<\/mode>/.exec(provider[2])?.[1];
        providers.set(provider[1], { id: provider[1], name: xmlText(name), mode, geom });
      }
    }
  }
  if (!providers.size) throw new Error('Cannot read native disk topology');
  return providers;
}

export function diskAncestors(providers, name, seen = new Set()) {
  const item = [...providers.values()].find(p => p.name === name);
  if (!item || seen.has(item.id)) throw new Error(`Ambiguous active storage provider: ${name}`);
  if (item.geom.className === 'DISK') return new Set([item.name]);
  seen.add(item.id);
  const disks = new Set();
  if (!item.geom.consumers.length) throw new Error('Cannot identify active storage backing disk');
  for (const ref of item.geom.consumers) {
    const parent = providers.get(ref);
    if (!parent) throw new Error('Incomplete active storage ancestry');
    for (const disk of diskAncestors(providers, parent.name, new Set(seen))) disks.add(disk);
  }
  return disks;
}

export function parseDisks(listing, providers) {
  return listing.split(/(?=^Geom name:)/m).filter(block => /^Geom name:/m.test(block)).map(block => {
    const name = /^Geom name:\s*(\S+)/m.exec(block)?.[1];
    const provider = [...providers.values()].find(p => p.name === name && p.geom.className === 'DISK');
    return { name, identity: text(/^\s*ident:\s*(.+)$/m.exec(block)?.[1]),
      description: text(/^\s*descr:\s*(.+)$/m.exec(block)?.[1]),
      bytes: Number(/^\s*Mediasize:\s*(\d+)/m.exec(block)?.[1]),
      connection: provider?.geom.id || '', mode: provider?.mode };
  }).filter(disk => diskName.test(disk.name));
}

export function assertInstallDisk(disk, activeDisks, minimumBytes) {
  if (!disk || !diskName.test(disk.name) || !disk.identity || !disk.description || !disk.connection
    || !Number.isSafeInteger(disk.bytes) || disk.bytes < minimumBytes) throw new Error('Require an identified whole disk with enough capacity');
  if (activeDisks.has(disk.name) || disk.mode !== 'r0w0e0') throw new Error('Refusing an active disk, including the boot/installer support, open pool or swap');
  return disk;
}

function inspectStorage() {
  const topology = geomTopology(query('/sbin/sysctl', ['-b', 'kern.geom.confxml']));
  const disks = parseDisks(query('/sbin/geom', ['disk', 'list']), topology);
  const mounted = query('/sbin/mount', ['-p']).trim().split('\n').map(line => line.split(/\s+/));
  if (!mounted.some(row => row[1] === '/')) throw new Error('Cannot identify the current boot filesystem');
  const active = new Set();
  const protect = raw => {
    const name = raw.replace(/^\/dev\//, '').replace(/\\([0-7]{3})/g, (_, code) => String.fromCharCode(parseInt(code, 8)));
    for (const disk of diskAncestors(topology, name)) active.add(disk);
  };
  for (const [source, , type] of mounted) {
    if (source.startsWith('/dev/')) protect(source);
    else if (type === 'zfs') {
      const pool = source.split('/')[0];
      if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(pool)) throw new Error('Ambiguous active ZFS pool');
      const paths = query('/sbin/zpool', ['status', '-P', pool]).match(/\/dev\/[^\s]+/g);
      if (!paths?.length) throw new Error('Cannot identify active ZFS backing disks');
      for (const device of paths) protect(device);
    } else if (mounted.find(row => row[0] === source)?.[1] === '/') throw new Error('Unsupported boot filesystem protection');
  }
  for (const device of query('/usr/sbin/swapinfo', ['-k']).match(/\/dev\/[^\s]+/g) || []) protect(device);
  if (mounted.some(row => row[1] === '/mnt' || row[1]?.startsWith('/mnt/'))) throw new Error('Installer mount directory is already in use');
  if (fs.existsSync('/mnt') && (!fs.lstatSync('/mnt').isDirectory() || fs.readdirSync('/mnt').length)) throw new Error('Installer mount directory must be an empty real directory');
  return { disks, active };
}

export function installScript(disk) {
  if (!diskName.test(disk)) throw new Error('Invalid installation disk');
  return `PARTITIONS="${disk} GPT { auto freebsd-ufs / }"\nDISTRIBUTIONS="system.txz"\nBSDINSTALL_DISTDIR="${distDir}"\n`;
}

export async function installSystem({ device } = {}) {
  if (process.platform !== 'freebsd') throw new Error('Internal install runs only on a booted FreeBSD installer, never on the Mac');
  if (process.getuid() !== 0 || !process.stdin.isTTY) throw new Error('Internal install requires the local root installer console');
  const metadata = JSON.parse(fs.readFileSync(path.join(distDir, 'install.json'), 'utf8'));
  if (metadata.schema !== 1 || metadata.product !== 'atome/eVe OS installer' || !['amd64', 'arm64'].includes(metadata.arch)
    || !['pc-amd64-uefi', 'arm64-uefi'].includes(metadata.target) || !/^\d+\.\d+-RELEASE$/.test(metadata.release)
    || !Number.isSafeInteger(metadata.bytes) || metadata.bytes <= 0
    || !/^[a-f0-9]{64}$/.test(metadata.sha256) || !Number.isSafeInteger(metadata.minimum_bytes) || metadata.minimum_bytes <= 0) throw new Error('Invalid installer payload metadata');
  const hostArch = os.arch() === 'x64' ? 'amd64' : os.arch();
  if (metadata.arch !== hostArch || !os.release().startsWith(metadata.release)) throw new Error('Installer architecture/system version mismatch');
  if (query('/bin/kenv', ['-q', 'machdep.bootmethod']).trim() !== 'UEFI') throw new Error('Only the declared UEFI installation path is supported');
  const payload = path.join(distDir, 'system.txz');
  if (!fs.lstatSync(payload).isFile()) throw new Error('Installer payload must be a regular file');
  const checksum = await digest(payload);
  if (checksum.sha256 !== metadata.sha256 || checksum.bytes !== metadata.bytes) throw new Error('Installer payload integrity check failed');
  let storage = inspectStorage();
  let selected = device?.replace(/^\/dev\//, '');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let identity;
  try {
    if (!selected) {
      const candidates = storage.disks.filter(disk => !storage.active.has(disk.name));
      if (!candidates.length) throw new Error('No unused installation disk found');
      candidates.forEach((disk, index) => process.stdout.write(`${index + 1}. ${disk.name} | ${disk.description} | ${disk.bytes} bytes | ${disk.identity}\n`));
      const answer = await prompt.question('Select the installation disk number (no default): ');
      if (!/^[1-9][0-9]*$/.test(answer) || !candidates[Number(answer) - 1]) throw new Error('No valid installation disk selected');
      selected = candidates[Number(answer) - 1].name;
    }
    identity = assertInstallDisk(storage.disks.find(disk => disk.name === selected), storage.active, metadata.minimum_bytes);
    process.stdout.write('The entire selected disk will be erased. Back up all files you need elsewhere before continuing. Installation is not an in-place upgrade.\n');
    if (await prompt.question('Type BACKUP READY to confirm no needed data remains on this disk: ') !== 'BACKUP READY') throw new Error('Backup/data confirmation cancelled');
    const phrase = `INSTALL ${identity.name} ${identity.identity} ${identity.bytes}`;
    process.stdout.write(`Unsigned development system. Type exactly: ${phrase}\n`);
    if (await prompt.question('> ') !== phrase) throw new Error('Disk erasure confirmation cancelled');
  } finally { prompt.close(); }
  storage = inspectStorage();
  const current = assertInstallDisk(storage.disks.find(disk => disk.name === selected), storage.active, metadata.minimum_bytes);
  if (JSON.stringify(identity) !== JSON.stringify(current)) throw new Error('Installation disk identity changed; cancelled');
  const job = fs.mkdtempSync('/tmp/aos-install-');
  const script = path.join(job, 'install.conf');
  fs.writeFileSync(script, installScript(selected), { mode: 0o600 });
  // bsdinstall owns partitioning, extraction, EFI boot configuration and cleanup.
  // Failures never retry on another disk or reboot automatically.
  execFileSync('/usr/sbin/bsdinstall', ['script', script], { stdio: 'inherit', env: {
    PATH: '/sbin:/bin:/usr/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin', TERM: process.env.TERM || 'xterm', HOME: '/root',
    TMPDIR: job, BSDINSTALL_CHROOT: '/mnt', BSDINSTALL_TMPETC: path.join(job, 'etc'), BSDINSTALL_LOG: path.join(job, 'install.log')
  } });
  return { disk: selected, installation: 'completed-not-boot-tested', reboot: 'manual', log_directory: job };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const valid = !args.length || (args.length === 2 && args[0] === '--device');
  if (!valid) { process.stderr.write('Use aOS-install [--device ada0]\n'); process.exitCode = 1; }
  else installSystem({ device: args[1] }).then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
