import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { config, preflight, projectRoot } from './recipe.mjs';
import { fetchVerified, finalize } from './artifacts.mjs';
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
    const needed = plan.image_bytes * (shared ? plan.formats.length + 2 : 2) + 3 * 1024 ** 3;
    if (space.bavail * space.bsize < needed) throw new Error(`Need at least ${needed} free bytes for work image, output and compression`);
    if (!shared) {
      const outputSpace = fs.statfsSync(plan.output_dir);
      const outputNeeded = plan.image_bytes * plan.formats.length + 3 * 1024 ** 3;
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
