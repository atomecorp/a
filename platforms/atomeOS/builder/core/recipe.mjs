import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';

export const builderRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const projectRoot = path.resolve(builderRoot, '../../..');
export const readYaml = (file) => parse(fs.readFileSync(file, 'utf8'), { uniqueKeys: true });
export const config = readYaml(path.join(builderRoot, 'core/config.yml'));
const csv = (value) => String(value).split(',').filter(Boolean);
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

export function builderIdentity() {
  const hash = createHash('sha256');
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (['output', 'work', 'node_modules'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(sh|mjs|yml|rc|conf)$/.test(entry.name) || ['Makefile', 'aOS-install'].includes(entry.name)) {
        if (!entry.isFile()) throw new Error('Builder inputs must be regular files');
        hash.update(path.relative(builderRoot, full)); hash.update('\0'); hash.update(fs.readFileSync(full)); hash.update('\0');
      }
    }
  };
  visit(builderRoot);
  hash.update(fs.readFileSync(path.join(projectRoot, 'scripts/aOS.sh')));
  return { version: config.builder.version, sha256: hash.digest('hex') };
}

export function sourceIdentity(ref = 'HEAD') {
  if (!/^[a-zA-Z0-9_./-]+$/.test(ref) || ref.startsWith('-')) throw new Error('Invalid source commit/ref');
  const commit = git(projectRoot, 'rev-parse', '--verify', `${ref}^{commit}`);
  const entry = git(projectRoot, 'ls-tree', commit, 'eVe');
  const eve = /^160000 commit ([a-f0-9]{40})\teVe$/.exec(entry)?.[1];
  if (!eve) throw new Error('The source commit must pin the eVe submodule');
  git(path.join(projectRoot, 'eVe'), 'cat-file', '-e', `${eve}^{commit}`);
  return { commit, eve, selection: 'committed-files-only' };
}

export function baseImage(target, release) {
  if (!/^\d+\.\d+-RELEASE$/.test(release)) throw new Error('Use an explicit x.y-RELEASE version');
  const version = release.replace('-RELEASE', '');
  const archName = target.arch === 'arm64' ? 'arm64-aarch64' : 'amd64';
  const name = target.base === 'PINE64'
    ? `FreeBSD-${release}-arm64-aarch64-PINE64.img.xz`
    : `FreeBSD-${release}-${archName}-ufs.raw.xz`;
  const dir = target.base === 'PINE64'
    ? `https://download.freebsd.org/releases/ISO-IMAGES/${version}/`
    : `https://download.freebsd.org/releases/VM-IMAGES/${release}/${target.arch === 'arm64' ? 'aarch64' : 'amd64'}/Latest/`;
  const checksums = target.base === 'PINE64' ? `CHECKSUM.SHA256-FreeBSD-${release}-${archName}-PINE64` : 'CHECKSUM.SHA256';
  return { name, url: dir + name, checksum_url: dir + checksums, trust: 'official-https-checksum; upstream-signature-not-verified' };
}

export function plans(options = {}) {
  const names = [...new Set(csv(options.target || 'pc-amd64-uefi,pine64-a64,mac-vm-intel,mac-vm-apple-silicon'))];
  const targets = names.includes('all') ? Object.keys(config.targets) : names;
  if (names.includes('all') && names.length !== 1) throw new Error('Use all alone or list explicit targets');
  const profile = options.profile || 'desktop';
  if (!/^[a-z][a-z0-9_-]*$/.test(profile)) throw new Error('Invalid profile');
  const profileFile = path.join(builderRoot, 'profiles', `${profile}.yml`);
  if (!fs.existsSync(profileFile)) throw new Error(`Unknown profile: ${profile}`);
  const preset = readYaml(profileFile);
  const modules = [...new Set(options.modules === undefined ? preset.modules : csv(options.modules))].sort();
  for (const name of modules) if (!config.modules[name]) throw new Error(`Unknown module: ${name}`);
  const release = options['freebsd-version'] || config.builder.freebsd;
  const modes = [...new Set(csv(options.mode || 'live'))];
  if (!modes.length || modes.some(mode => !['live', 'installer', 'all'].includes(mode)) || (modes.includes('all') && modes.length !== 1)) throw new Error('Use --mode live, installer, live,installer or all');
  const source = sourceIdentity(options['source-commit']);
  const builder = builderIdentity();
  return targets.flatMap(id => {
    const target = config.targets[id];
    if (!target) throw new Error(`Unknown target: ${id}`);
    const selectedModes = modes.includes('all') ? target.modes : modes;
    if (selectedModes.some(mode => !target.modes.includes(mode))) throw new Error(`Unsupported mode for ${id}; supported: ${target.modes.join(',')}`);
    return selectedModes.map(mode => {
    const size = Number(options['size-gib'] || (mode === 'installer' ? 34 : config.builder.image_size_gib));
    if (!Number.isSafeInteger(size) || size < 1 || size > 1024) throw new Error('Invalid --size-gib (1..1024)');
    const formats = options.format ? csv(options.format) : [target.default_format];
    if (!formats.length || formats.some(f => !target.formats.includes(f))) throw new Error(`Unsupported format for ${id}`);
    const stacks = [...new Set([...preset.stacks, ...modules.flatMap(m => config.modules[m].stacks)])];
    const packages = [...new Set([...stacks.flatMap(stack => {
      const definition = readYaml(path.join(builderRoot, 'packages', `${stack}.yml`));
      if (definition.stack?.name !== stack || !Array.isArray(definition.stack.pkg)) throw new Error(`Invalid stack: ${stack}`);
      return definition.stack.pkg;
    }), ...(preset.extras || [])])].sort();
    if (packages.some(p => !/^[a-zA-Z0-9_+.-]+$/.test(p))) throw new Error('Invalid package name');
    return { schema: 1, product: 'atome/eVe OS', mode, builder, target: { id, ...target }, profile, modules, stacks, packages,
      system: { release, kernel: 'official GENERIC; no driver pruning' }, base: baseImage(target, release),
      formats: [...new Set(formats)], image_bytes: size * 1024 ** 3,
      output_dir: path.resolve(projectRoot, options.output || config.builder.output_dir),
      source, offline: !!options.offline,
      evidence: { build: 'not-run', vm: 'not-tested', physical: 'not-tested', production: false },
      limitations: [target.note, ...modules.map(m => config.modules[m].note), 'WebSDL not found in inspected sources; not packaged.',
        'No signature chain, automatic updater or automatic rollback is established; native installer execution is unvalidated.'] };
    });
  });
}

export function preflight(plan, platform = os.platform(), arch = os.arch()) {
  const issues = [];
  const nativeArch = arch === 'x64' ? 'amd64' : arch === 'arm64' ? 'arm64' : arch;
  if (platform !== 'freebsd') issues.push('Build requires a native FreeBSD host/guest. macOS controls builds and flashes media; it cannot chroot FreeBSD.');
  if (nativeArch !== plan.target.arch) issues.push(`Use a FreeBSD ${plan.target.arch} backend; cross-architecture execution has not been validated.`);
  if (platform === 'freebsd') {
    if (process.getuid() !== 0) issues.push('Native image assembly requires root on the dedicated FreeBSD backend.');
    for (const cmd of ['mdconfig', 'gpart', 'growfs', 'fsck_ufs', 'mount', 'umount', 'chroot', 'tar', 'xz', 'fetch', 'pkg', ...(plan.mode === 'installer' ? ['bsdinstall', 'geom', 'swapinfo'] : [])]) {
      const result = spawnSync('/bin/sh', ['-c', 'command -v "$1"', 'aos', cmd], { encoding: 'utf8' });
      if (result.status !== 0) issues.push(`Missing backend command: ${cmd}`);
    }
    if (plan.formats.some(f => f === 'qcow2' || f === 'vmdk') && spawnSync('qemu-img', ['--version']).status !== 0) issues.push('qemu-img is required for the requested VM formats.');
    const release = os.release();
    if (!release.startsWith(plan.system.release)) issues.push(`Use a ${plan.system.release} backend (observed ${release}).`);
  }
  if (!plan.modules.includes('display') && (plan.modules.includes('audio') || plan.modules.includes('midi'))) {
    issues.push('Autonomous audio/MIDI requires a verified FreeBSD native runtime; existing browser/Tauri contracts do not establish it. No substitute engine will be installed.');
  }
  if (plan.offline) issues.push('Offline assembly is not validated for pkg/npm dependencies; no offline build will be attempted.');
  return { target: plan.target.id, ready: issues.length === 0, issues, host: { platform, arch } };
}
