import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';

export async function digest(file, bytes) {
  const hash = createHash('sha256');
  let length = 0;
  const input = fs.createReadStream(file, bytes === undefined ? {} : { start: 0, end: bytes - 1 });
  for await (const chunk of input) { length += chunk.length; hash.update(chunk); }
  if (bytes !== undefined && length !== bytes) throw new Error('Short read while verifying image');
  return { bytes: length, sha256: hash.digest('hex') };
}

export function checksumFor(text, name) {
  const hashes = text.split(/\r?\n/).flatMap(line => {
    const bsd = /^SHA256 \((.+)\) = ([a-f0-9]{64})$/i.exec(line.trim());
    const gnu = /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line.trim());
    if (bsd && bsd[1] === name) return [bsd[2].toLowerCase()];
    if (gnu && gnu[2] === name) return [gnu[1].toLowerCase()];
    return [];
  });
  if (hashes.length !== 1) throw new Error(`Expected exactly one SHA256 for ${name}`);
  return hashes[0];
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${signal || code})`)));
  });
}

export async function fetchVerified(plan, cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  const archive = path.join(cacheDir, plan.base.name);
  const checksumFile = `${archive}.official-checksums`;
  // Always refresh metadata; a cached file is not evidence of integrity.
  const metadata = `${checksumFile}.${process.pid}.part`;
  await run('fetch', ['-o', metadata, plan.base.checksum_url]);
  const expected = checksumFor(fs.readFileSync(metadata, 'utf8'), plan.base.name);
  fs.renameSync(metadata, checksumFile);
  if (!fs.existsSync(archive)) {
    const partial = `${archive}.${process.pid}.part`;
    await run('fetch', ['-o', partial, plan.base.url]);
    if ((await digest(partial)).sha256 !== expected) throw new Error('Official image SHA256 mismatch');
    fs.renameSync(partial, archive);
  }
  if ((await digest(archive)).sha256 !== expected) throw new Error('Cached official image SHA256 mismatch; cache has not been deleted');
  return { archive, sha256: expected };
}

export function readManifest(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.schema !== 1 || data.product !== 'atome/eVe OS' || !['live', 'installer'].includes(data.mode) || !data.target?.id || !Array.isArray(data.artifacts) || !data.artifacts.length) throw new Error('Invalid AOS manifest');
  const names = new Set();
  for (const item of data.artifacts) {
    if (typeof item.file !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(item.file) || item.file.startsWith('.') || names.has(item.file)
      || !['img', 'raw', 'qcow2', 'vmdk'].includes(item.format) || !['none', 'xz'].includes(item.compression)) throw new Error('Invalid artifact name/format');
    names.add(item.file);
    for (const facts of [item, item.payload]) {
      if (!facts || !/^[a-f0-9]{64}$/.test(facts.sha256) || !Number.isSafeInteger(facts.bytes) || facts.bytes <= 0) throw new Error('Invalid artifact length/hash');
    }
  }
  return data;
}

async function decompressedDigest(file, expectedBytes) {
  const hash = createHash('sha256');
  let bytes = 0;
  const child = spawn('xz', ['-dc', '--', file], { stdio: ['ignore', 'pipe', 'inherit'] });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('xz verification failed')));
  });
  try {
    await Promise.all([completion, (async () => {
      for await (const chunk of child.stdout) {
        bytes += chunk.length;
        if (bytes > expectedBytes) throw new Error('Payload checksum/length mismatch: expanded beyond the declared byte count');
        hash.update(chunk);
      }
    })()]);
  } finally { if (child.exitCode === null) child.kill('SIGTERM'); }
  return { bytes, sha256: hash.digest('hex') };
}

export async function verifyManifest(file, image) {
  const data = readManifest(file);
  const selected = image ? data.artifacts.filter(a => a.file === path.basename(image)) : data.artifacts;
  if (!selected.length) throw new Error('Image is not listed in the manifest');
  for (const artifact of selected) {
    const full = path.resolve(path.dirname(file), artifact.file);
    if (image && path.resolve(image) !== full) throw new Error('Image must be next to its manifest');
    if (!fs.lstatSync(full).isFile()) throw new Error('Artifact must be a regular file, not a symlink');
    const actual = await digest(full);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`Artifact checksum/length mismatch: ${artifact.file}`);
    const payload = artifact.compression === 'xz' ? await decompressedDigest(full, artifact.payload.bytes) : actual;
    if (payload.bytes !== artifact.payload.bytes || payload.sha256 !== artifact.payload.sha256) throw new Error(`Payload checksum/length mismatch: ${artifact.file}`);
  }
  return { manifest: data, artifacts: selected, integrity: 'verified', authenticity: 'unsigned-development-artifact' };
}

export async function finalize(plan, raw, output, installed) {
  fs.mkdirSync(output, { recursive: false, mode: 0o700 });
  const stem = `atome-eVe-${plan.target.id}-${plan.mode}-${plan.profile}-${plan.system.release}`;
  const artifacts = [];
  for (const format of plan.formats) {
    const file = path.join(output, `${stem}.${format}`);
    const compressed = `${file}.xz`;
    let payload;
    if (format === 'raw' || format === 'img') {
      payload = await digest(raw);
      const child = spawn('xz', ['-T1', '-3', '-c', '--', raw], { stdio: ['ignore', 'pipe', 'inherit'] });
      const completion = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve() : reject(new Error('xz compression failed')));
      });
      try {
        await Promise.all([completion, pipeline(child.stdout, fs.createWriteStream(compressed, { flags: 'wx', mode: 0o600 }))]);
      } finally { if (child.exitCode === null) child.kill('SIGTERM'); }
    } else {
      await run('qemu-img', ['convert', '-f', 'raw', '-O', format, raw, file]);
      payload = await digest(file);
      await run('qemu-img', ['compare', '-f', 'raw', '-F', format, raw, file]);
      await run('xz', ['-T1', '-3', '--', file]);
    }
    artifacts.push({ file: path.basename(compressed), format, compression: 'xz', ...await digest(compressed), payload });
  }
  const manifest = { ...plan, output_dir: undefined, created_at: new Date().toISOString(),
    build_host: { platform: os.platform(), architecture: os.arch(), release: os.release(), node: process.version },
    evidence: { ...plan.evidence, build: 'assembled-not-boot-tested' }, installed,
    reproducibility: 'traceable; byte-for-byte rebuild not established; pkg repository is not a frozen snapshot',
    signature: null, artifacts };
  const manifestFile = path.join(output, 'manifest.json');
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), artifacts.map(a => `${a.sha256}  ${a.file}\n`).join(''), { flag: 'wx' });
  await verifyManifest(manifestFile);
  return manifestFile;
}
