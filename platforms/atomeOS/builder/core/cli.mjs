import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, builderRoot, projectRoot, plans, preflight } from './recipe.mjs';
import { run, verifyManifest } from './artifacts.mjs';
import { listDevices, flash } from '../installer/sbc/flash.mjs';
import { remoteBuild } from './remote.mjs';
import { downloadRelease, chooseArtifact } from './download.mjs';
import { installSystem } from '../installer/desktop/install.mjs';
import { latestProductionRelease } from './releases.mjs';

const help = `atome/eVe OS builder (development recipes; no target certified)
Usage: ./scripts/aOS.sh <command> [options]
Commands:
  list                 List targets, profiles and composable modules
  plan                 Print the complete build recipe without changing files
  preflight            Check the current FreeBSD backend without installing anything
  build                Assemble on FreeBSD, or dispatch to explicit SSH backends
  download             Download an explicit HTTPS release manifest and verified image
  prepare              Build/download/select an image, then select and flash a support
  install              On a booted installer: explicitly select and install to a disk
  verify               Verify archive and decompressed payload hashes
  devices              List external physical media on macOS (read-only)
  flash                Confirm, write, read back and eject an external USB/SD support
Build/plan options:
  --target <id,...>     Repeatable; all expands every declared target
  --profile <name>      desktop (default), minimal, audio, dev
  --mode <id,...>       live (default), installer, live,installer, or all per target
  --modules <id,...>    Repeatable and cumulative: display,audio,midi
                       An explicit list replaces profile module defaults; empty = service only
  --format <id,...>     img/raw/qcow2/vmdk, subject to the target's formats
  --freebsd-version <x.y-RELEASE>  Explicit version; build otherwise resolves official production release
  --source-commit <ref> Required for build; exports committed sources and pinned eVe only
  --size-gib <n>        Image capacity; never shrink the official image
  --output <dir>       Artifact root (default temp/aos/output)
  --backend <arch=host> Repeat for amd64 and arm64 SSH backends (no credential changes)
  --remote-root <path> Existing repository on SSH backend; same builder required
  --offline            Refused until complete pkg/npm offline closure is validated
Verify/flash options:
  --manifest <file>    Required manifest.json
  --manifest-url <url> Explicit public HTTPS release manifest (no implicit latest URL)
  --image <file>       Select one listed artifact; required for flash
  --device <diskN>     Optional for flash/prepare; omitted = interactive support list
                       install uses a FreeBSD disk name and confirms its identity
No automatic first-disk selection, publication or Git writes. Formatting is part of
writing the complete disk image; no separate destructive pre-format is needed.
`;

const allowed = {
  list: [], plan: ['target', 'profile', 'modules', 'format', 'freebsd-version', 'source-commit', 'size-gib', 'output', 'offline'],
  preflight: ['target', 'profile', 'modules', 'format', 'freebsd-version', 'source-commit', 'size-gib', 'output', 'offline'],
  build: ['target', 'profile', 'modules', 'format', 'freebsd-version', 'source-commit', 'size-gib', 'output', 'offline', 'backend', 'remote-root'],
  download: ['manifest-url', 'target', 'mode', 'format', 'image', 'output'],
  verify: ['manifest', 'image'], devices: [], flash: ['manifest', 'image', 'device'], install: ['device']
};
for (const command of ['plan', 'preflight', 'build']) allowed[command].push('mode');
allowed.prepare = [...allowed.build, 'manifest', 'manifest-url', 'image', 'device'];

export function parseArgs(argv) {
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') return { command: 'help', options: {} };
  const [command, ...args] = argv;
  if (!allowed[command]) throw new Error(`Unknown command: ${command}`);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') return { command: 'help', options: {} };
    const key = args[i].replace(/^--/, '');
    if (!args[i].startsWith('--') || !allowed[command].includes(key)) throw new Error(`Unknown option: ${args[i]}`);
    const value = key === 'offline' ? true : args[++i];
    if (value === undefined || (typeof value === 'string' && value.startsWith('--'))) throw new Error(`Missing value: --${key}`);
    if (options[key] !== undefined) {
      if (['target', 'modules', 'format', 'mode'].includes(key)) options[key] += `,${value}`;
      else if (key === 'backend') options[key].push(value);
      else throw new Error(`Repeated option: --${key}`);
    } else options[key] = key === 'backend' ? [value] : value;
  }
  return { command, options };
}

async function build(options) {
  if (!options['source-commit']) throw new Error('Build requires --source-commit; local modifications are never silently packaged or discarded');
  if (!options['freebsd-version'] && !options.offline) options = { ...options, 'freebsd-version': await latestProductionRelease() };
  const recipes = plans(options);
  const backends = new Map();
  for (const item of options.backend || []) {
    const match = /^(amd64|arm64)=(.+)$/.exec(item);
    if (!match || backends.has(match[1])) throw new Error('Use one --backend arch=host per architecture');
    backends.set(match[1], match[2]);
  }
  if (backends.size && !options['remote-root']) throw new Error('--remote-root is required with SSH backends');
  const results = [];
  for (const plan of recipes) {
    try {
      const host = backends.get(plan.target.arch);
      if (host) { results.push(await remoteBuild(plan, host, options['remote-root'])); continue; }
      const check = preflight(plan);
      if (!check.ready) throw new Error(check.issues.join('\n'));
      const root = path.resolve(projectRoot, config.builder.work_dir);
      fs.mkdirSync(root, { recursive: true, mode: 0o700 });
      const work = fs.mkdtempSync(path.join(root, 'build-'));
      fs.writeFileSync(path.join(work, '.retain'), 'AOS owned build; retain evidence until explicitly removed.\n');
      fs.mkdirSync(plan.output_dir, { recursive: true, mode: 0o700 });
      plan.result_dir = path.join(plan.output_dir, `${plan.target.id}-${randomUUID()}`);
      const planFile = path.join(work, 'plan.json');
      fs.writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      await run('/bin/sh', [path.join(builderRoot, 'core/build.sh'), planFile], { stdio: ['inherit', process.stderr, process.stderr] });
      results.push({ target: plan.target.id, mode: plan.mode, ...JSON.parse(fs.readFileSync(path.join(work, 'result.json'), 'utf8')) });
    } catch (error) {
      results.push({ target: plan.target.id, mode: plan.mode, status: 'blocked-or-failed', reason: error.message });
      process.exitCode = 1;
    }
  }
  return results;
}

async function prepare(options) {
  if (process.platform !== 'darwin') throw new Error('Prepare writes macOS external media; use build on a native FreeBSD backend');
  if (!process.stdin.isTTY) throw new Error('Prepare requires an interactive terminal for disk selection and confirmation');
  const sources = [options.manifest, options['manifest-url'], options['source-commit']].filter(Boolean);
  if (sources.length !== 1) throw new Error('Choose exactly one image source: --manifest, --manifest-url or --source-commit for a build');
  let manifest = options.manifest, image = options.image;
  if (options['manifest-url']) {
    process.stderr.write('Downloading and verifying the requested release...\n');
    ({ manifest, image } = await downloadRelease(options['manifest-url'], path.resolve(projectRoot, options.output || 'temp/aos/releases'), options));
  } else if (options['source-commit']) {
    if (plans(options).length !== 1) throw new Error('Prepare needs one target and one mode; build can produce a whole matrix');
    process.stderr.write('Building the selected image on its FreeBSD backend...\n');
    const [result] = await build(options);
    if (!result.manifest) throw new Error(result.reason);
    manifest = result.manifest;
  }
  if (!manifest) throw new Error('No completed manifest available');
  const verified = await verifyManifest(path.resolve(manifest), image);
  const artifact = chooseArtifact(verified.manifest, options);
  image = path.resolve(path.dirname(manifest), artifact.file);
  if (!['img', 'raw'].includes(artifact.format) || verified.manifest.target.family === 'vm') throw new Error('Prepare requires an external-boot image; VM disks are imported into the hypervisor');
  process.stderr.write('Image verified. External support selection and erasure confirmation follow.\n');
  if (process.getuid() !== 0) {
    const args = ['/bin/sh', path.join(projectRoot, 'scripts/aOS.sh'), 'flash', '--manifest', path.resolve(manifest), '--image', image];
    if (options.device) args.push('--device', options.device);
    await run('sudo', args);
    return { manifest, image, flash: 'completed-by-elevated-flash-command' };
  }
  return flash({ manifest: path.resolve(manifest), image, device: options.device, stagingRoot: path.join(projectRoot, 'temp/aos') });
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === 'help') { process.stdout.write(help); return; }
  let result;
  if (command === 'list') result = { targets: config.targets, modes: ['live', 'installer'], modules: config.modules, profiles: ['desktop', 'minimal', 'audio', 'dev'], evidence: 'recipes-only; no boot or peripheral validation' };
  else if (command === 'plan') result = plans(options);
  else if (command === 'preflight') {
    result = plans(options).map(plan => preflight(plan));
    if (result.some(check => !check.ready)) process.exitCode = 1;
  } else if (command === 'build') result = await build(options);
  else if (command === 'prepare') result = await prepare(options);
  else if (command === 'install') result = await installSystem(options);
  else if (command === 'download') {
    if (!options['manifest-url']) throw new Error('--manifest-url is required; no atome OS release URL is assumed');
    result = await downloadRelease(options['manifest-url'], path.resolve(projectRoot, options.output || 'temp/aos/releases'), options);
  }
  else if (command === 'devices') result = listDevices();
  else {
    if (!options.manifest) throw new Error('--manifest is required');
    if (command === 'verify') result = await verifyManifest(path.resolve(options.manifest), options.image);
    else result = await flash({ ...options, stagingRoot: path.join(projectRoot, 'temp/aos') });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`AOS: ${error.message}\n`); process.exitCode = 1; });
}
