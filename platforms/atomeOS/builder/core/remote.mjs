import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { run, verifyManifest } from './artifacts.mjs';

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

export async function remoteBuild(plan, host, root) {
  if (!/^(?:[a-zA-Z0-9_][a-zA-Z0-9_.-]*@)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(host)) throw new Error('Invalid SSH backend name');
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(root) || root.split('/').includes('..')) throw new Error('Use an absolute remote repository path without spaces or parent traversal');
  const jobId = `remote-${randomUUID()}`;
  const remoteOutput = `${root}/temp/aos/output/${jobId}`;
  const args = ['--target', plan.target.id, '--profile', plan.profile, '--modules', plan.modules.join(','),
    '--format', plan.formats.join(','), '--freebsd-version', plan.system.release, '--source-commit', plan.source.commit,
    '--size-gib', String(plan.image_bytes / 1024 ** 3)];
  const invoke = (command, extra = []) => [root + '/scripts/aOS.sh', command, ...args, ...extra].map(quote).join(' ');
  // This reads the remote recipe before any build; no checkout, credentials or host settings are changed.
  const remote = JSON.parse(execFileSync('ssh', ['-oBatchMode=yes', '-oConnectTimeout=10', host, invoke('plan')], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }))[0];
  for (const key of ['source', 'target', 'modules', 'formats', 'packages', 'system', 'builder']) {
    if (JSON.stringify(remote[key]) !== JSON.stringify(plan[key])) throw new Error(`Remote ${key} differs; provision the same builder and source commits before building`);
  }
  await run('ssh', ['-oBatchMode=yes', '-oConnectTimeout=10', host, invoke('build', ['--output', remoteOutput])], { stdio: ['inherit', process.stderr, process.stderr] });
  fs.mkdirSync(plan.output_dir, { recursive: true, mode: 0o700 });
  const local = path.join(plan.output_dir, jobId);
  fs.mkdirSync(local, { mode: 0o700 });
  // The root is validated above; the transfer scope contains only this build's artifacts.
  await run('scp', ['-r', `${host}:${remoteOutput}/.`, local]);
  const manifests = fs.readdirSync(local).filter(name => fs.statSync(path.join(local, name)).isDirectory())
    .map(name => path.join(local, name, 'manifest.json'));
  if (manifests.length !== 1) throw new Error('Expected one completed remote artifact set');
  const verified = await verifyManifest(manifests[0]);
  if (verified.manifest.source.commit !== plan.source.commit || verified.manifest.target.id !== plan.target.id) throw new Error('Retrieved artifact provenance mismatch');
  return { target: plan.target.id, manifest: manifests[0], backend: host, integrity: verified.integrity };
}
