import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, builderRoot, projectRoot, plans, preflight } from './recipe.mjs';
import { run, verifyManifest } from './artifacts.mjs';
import { listDevices, flash } from '../installer/sbc/flash.mjs';
import { remoteBuild } from './remote.mjs';

const help = `atome/eVe OS builder (development recipes; no target certified)
Usage: ./scripts/aOS.sh <command> [options]
Commands:
  list                 List targets, profiles and composable modules
  plan                 Print the complete build recipe without changing files
  preflight            Check the current FreeBSD backend without installing anything
  build                Assemble on FreeBSD, or dispatch to explicit SSH backends
  verify               Verify archive and decompressed payload hashes
  devices              List external physical media on macOS (read-only)
  flash                Confirm, write, read back and eject an external USB/SD support
Build/plan options:
  --target <id,...>     Repeatable; all expands every declared target
  --profile <name>      desktop (default), minimal, audio, dev
  --modules <id,...>    Repeatable and cumulative: display,audio,midi
                       An explicit list replaces profile module defaults; empty = service only
  --format <id,...>     img/raw/qcow2/vmdk, subject to the target's formats
  --freebsd-version <x.y-RELEASE>  Explicit version (default from config)
  --source-commit <ref> Required for build; exports committed sources and pinned eVe only
  --size-gib <n>        Image capacity; never shrink the official image
  --output <dir>       Artifact root (default temp/aos/output)
  --backend <arch=host> Repeat for amd64 and arm64 SSH backends (no credential changes)
  --remote-root <path> Existing repository on SSH backend; same builder required
  --offline            Refused until complete pkg/npm offline closure is validated
Verify/flash options:
  --manifest <file>    Required manifest.json
  --image <file>       Select one listed artifact; required for flash
  --device <diskN>     Explicit external whole disk; flash always asks its identity
No automatic flash, installation, package installation on this host, publication or Git writes.
`;

const allowed = {
  list: [], plan: ['target', 'profile', 'modules', 'format', 'freebsd-version', 'source-commit', 'size-gib', 'output', 'offline'],
  preflight: ['target', 'profile', 'modules', 'format', 'freebsd-version', 'source-commit', 'size-gib', 'output', 'offline'],
  build: ['target', 'profile', 'modules', 'format', 'freebsd-version', 'source-commit', 'size-gib', 'output', 'offline', 'backend', 'remote-root'],
  verify: ['manifest', 'image'], devices: [], flash: ['manifest', 'image', 'device']
};

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
      if (['target', 'modules', 'format'].includes(key)) options[key] += `,${value}`;
      else if (key === 'backend') options[key].push(value);
      else throw new Error(`Repeated option: --${key}`);
    } else options[key] = key === 'backend' ? [value] : value;
  }
  return { command, options };
}

async function build(options) {
  if (!options['source-commit']) throw new Error('Build requires --source-commit; local modifications are never silently packaged or discarded');
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
      results.push({ target: plan.target.id, ...JSON.parse(fs.readFileSync(path.join(work, 'result.json'), 'utf8')) });
    } catch (error) {
      results.push({ target: plan.target.id, status: 'blocked-or-failed', reason: error.message });
      process.exitCode = 1;
    }
  }
  return results;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === 'help') { process.stdout.write(help); return; }
  let result;
  if (command === 'list') result = { targets: config.targets, modules: config.modules, profiles: ['desktop', 'minimal', 'audio', 'dev'], evidence: 'recipes-only; no boot or peripheral validation' };
  else if (command === 'plan') result = plans(options);
  else if (command === 'preflight') {
    result = plans(options).map(plan => preflight(plan));
    if (result.some(check => !check.ready)) process.exitCode = 1;
  } else if (command === 'build') result = await build(options);
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
