import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { projectRoot } from './recipe.mjs';

const sourcePaths = ['atome/src', 'server', 'database', 'package.json', 'package-lock.json', 'scripts/fix_node_modules.sh'];
const evePaths = ['eVe.js', 'version.txt', 'core', 'default', 'default_data', 'default_values', 'domains', 'elements', 'i18n', 'intuition', 'shared', 'user', 'voice'];
export function validateSourceEntry(mode, name) {
  if (mode !== '100644' && mode !== '100755') throw new Error(`Non-regular payload entry refused: ${name}`);
  if (/(^|\/)(private|Private|node_modules|database_storage|uploads|\.git)(\/|$)|(^|\/)\.env($|\.)|\.(pem|key|p12|pfx|db|sqlite|sqlite3)$/i.test(name)) {
    throw new Error(`Sensitive payload path refused: ${name}`);
  }
}

async function archive(dir, ref, output, paths) {
  const listing = execFileSync('git', ['-C', dir, 'ls-tree', '-rz', ref, '--', ...paths], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  for (const entry of listing.split('\0').filter(Boolean)) {
    const match = /^(\d+) blob [a-f0-9]+\t(.+)$/s.exec(entry);
    if (!match) throw new Error('Unexpected source tree entry');
    validateSourceEntry(match[1], match[2]);
  }
  const child = spawn('git', ['-C', dir, 'archive', '--format=tar', ref, '--', ...paths], { stdio: ['ignore', 'pipe', 'inherit'] });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Source archive failed')));
  });
  await Promise.all([completion, pipeline(child.stdout, fs.createWriteStream(output, { flags: 'wx', mode: 0o600 }))]);
}

export async function prepareSources(plan, workDir) {
  await archive(projectRoot, plan.source.commit, path.join(workDir, 'framework.tar'), sourcePaths);
  await archive(path.join(projectRoot, 'eVe'), plan.source.eve, path.join(workDir, 'eve.tar'), evePaths);
  return { source: plan.source, excluded: ['uncommitted files', 'private/', 'credentials', 'user data', 'Git metadata', 'host node_modules'] };
}
