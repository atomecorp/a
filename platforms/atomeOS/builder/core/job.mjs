import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { config, preflight, projectRoot } from './recipe.mjs';
import { digest, fetchVerified, finalize } from './artifacts.mjs';
import { prepareSources } from './source.mjs';

async function main() {
  const [file, action, key] = process.argv.slice(2);
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (plan.schema !== 1 || plan.product !== 'atome/eVe OS' || !config.targets[plan.target?.id]) throw new Error('Invalid build plan');
  const work = path.dirname(path.resolve(file));
  if (action === 'field') {
    const value = key.split('.').reduce((object, name) => object?.[name], plan);
    if (value === undefined || value === null) throw new Error(`Missing plan field: ${key}`);
    process.stdout.write(Array.isArray(value) ? value.join(' ') : String(value));
  } else if (action === 'preflight') {
    const check = preflight(plan);
    if (!check.ready) throw new Error(check.issues.join('\n'));
    const space = fs.statfsSync(work);
    const shared = fs.statSync(work).dev === fs.statSync(plan.output_dir).dev;
    // Raw images are compressed directly from work.img; converted formats also
    // need one temporary uncompressed conversion alongside completed archives.
    const converted = plan.formats.some(format => !['img', 'raw'].includes(format));
    const needed = plan.image_bytes * (shared ? 1 + plan.formats.length + Number(converted) : 1) + 3 * 1024 ** 3;
    if (space.bavail * space.bsize < needed) throw new Error(`Need at least ${needed} free bytes for work image, output and compression`);
    if (!shared) {
      const outputSpace = fs.statfsSync(plan.output_dir);
      const outputNeeded = plan.image_bytes * (plan.formats.length + Number(converted)) + 3 * 1024 ** 3;
      if (outputSpace.bavail * outputSpace.bsize < outputNeeded) throw new Error(`Artifact filesystem needs at least ${outputNeeded} free bytes`);
    }
  } else if (action === 'fetch') {
    const result = await fetchVerified(plan, path.resolve(projectRoot, config.builder.cache_dir));
    fs.writeFileSync(path.join(work, 'base.json'), JSON.stringify(result));
    const child = spawn('xz', ['-dc', '--', result.archive], { stdio: ['ignore', 'pipe', 'inherit'] });
    const completion = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error('Base decompression failed')));
    });
    await Promise.all([completion, pipeline(child.stdout, fs.createWriteStream(path.join(work, 'work.img'), { flags: 'wx' }))]);
    const size = fs.statSync(path.join(work, 'work.img')).size;
    if (size > plan.image_bytes) throw new Error('Requested size would shrink the official image');
    fs.truncateSync(path.join(work, 'work.img'), plan.image_bytes);
  } else if (action === 'sources') {
    await prepareSources(plan, work);
  } else if (action === 'installer-metadata') {
    const directory = path.join(work, 'mnt/usr/local/share/aos-installer');
    const file = path.join(directory, 'system.txz');
    const contents = execFileSync('tar', ['-tf', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const count = contents.trim().split('\n').length;
    const used = Number(execFileSync('du', ['-skx', path.join(work, 'mnt')], { encoding: 'utf8' }).split(/\s+/)[0]);
    if (!Number.isSafeInteger(used) || used < 1) throw new Error('Cannot measure the installation payload size');
    const metadata = { schema: 1, product: 'atome/eVe OS installer', target: plan.target.id, arch: plan.target.arch,
      release: plan.system.release, source: plan.source, modules: plan.modules, builder: plan.builder,
      minimum_bytes: Math.max(13 * 1024 ** 3, used * 1024 + 3 * 1024 ** 3), ...await digest(file) };
    fs.writeFileSync(path.join(directory, 'install.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    fs.writeFileSync(path.join(directory, 'MANIFEST'), `system.txz\t${metadata.sha256}\t${count}\tsystem\tatome/eVe\ton\n`);
  } else if (action === 'finalize') {
    const installed = fs.readFileSync(path.join(work, 'installed-packages.txt'), 'utf8').trim().split('\n');
    const base = JSON.parse(fs.readFileSync(path.join(work, 'base.json'), 'utf8'));
    const manifest = await finalize({ ...plan, base: { ...plan.base, sha256: base.sha256 } }, path.join(work, 'work.img'), plan.result_dir,
      { packages: installed, npm: 'package-lock.json; npm ci', build_tools_retained: true });
    fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify({ manifest }));
  } else throw new Error('Unknown build job action');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
